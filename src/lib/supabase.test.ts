import { describe, expect, test, vi, beforeEach } from 'vitest';

const signInAnonymously = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'uid-123' } } }, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null } });
const signUp = vi.fn().mockResolvedValue({ error: null });
const verifyOtp = vi.fn().mockResolvedValue({ error: null });
const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
const updateUser = vi.fn().mockResolvedValue({ error: null });
const signOut = vi.fn().mockResolvedValue({ error: null });
const rpc = vi.fn().mockResolvedValue({ data: [{ exists_: true, is_private: true, owner_id: 'u1', session_type: 'react' }], error: null });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { signInAnonymously, getSession, signUp, verifyOtp, signInWithPassword, resetPasswordForEmail, updateUser, signOut },
    rpc,
  }),
}));

beforeEach(() => {
  signInAnonymously.mockClear();
  getSession.mockClear();
  signUp.mockClear();
  verifyOtp.mockClear();
  signInWithPassword.mockClear();
  resetPasswordForEmail.mockClear();
  updateUser.mockClear();
  signOut.mockClear();
  rpc.mockClear();
});

describe('ensureAnonymousSession', () => {
  test('signs in anonymously when there is no existing session', async () => {
    const { ensureAnonymousSession } = await import('./supabase');
    const uid = await ensureAnonymousSession();
    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(uid).toBe('uid-123');
  });
});

describe('auth wrappers', () => {
  test('signUpWithEmail calls supabase.auth.signUp with email/password', async () => {
    const { signUpWithEmail } = await import('./supabase');
    await signUpWithEmail('a@b.com', 'secret123');
    expect(signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
  });

  test('verifySignupOtp calls verifyOtp with type "signup"', async () => {
    const { verifySignupOtp } = await import('./supabase');
    await verifySignupOtp('a@b.com', '123456');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'signup' });
  });

  test('signUpWithEmail converts an anonymous session in place (same user id) instead of creating a new user', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    const { signUpWithEmail } = await import('./supabase');
    await signUpWithEmail('a@b.com', 'secret123');
    expect(updateUser).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
    expect(signUp).not.toHaveBeenCalled();
  });

  test('verifySignupOtp verifies an anonymous conversion as an email change', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    const { verifySignupOtp } = await import('./supabase');
    await verifySignupOtp('a@b.com', '123456');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'email_change' });
  });

  test('loginWithPassword calls signInWithPassword', async () => {
    const { loginWithPassword } = await import('./supabase');
    await loginWithPassword('a@b.com', 'secret123');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
    // Not anonymous beforehand, so there is nothing to hand over.
    expect(rpc).not.toHaveBeenCalled();
  });

  test('loginWithPassword from an anonymous session moves its rooms to the account and announces it', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    rpc
      .mockResolvedValueOnce({ data: 'claim-token', error: null })
      .mockResolvedValueOnce({ data: ['room1', 'room2'], error: null });
    const heard = vi.fn();
    window.addEventListener('codeshare:rooms-claimed', heard);
    const { loginWithPassword } = await import('./supabase');

    const result = await loginWithPassword('a@b.com', 'secret123', { makePrivateRoomId: 'room1' });

    window.removeEventListener('codeshare:rooms-claimed', heard);
    // The claim is minted while still anonymous, and redeemed only after login.
    expect(rpc.mock.calls[0]).toEqual(['create_room_claim']);
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]);
    expect(rpc).toHaveBeenLastCalledWith('claim_anonymous_rooms', { p_token: 'claim-token', p_make_private: 'room1' });
    expect(result).toEqual({ error: null, claimedRoomIds: ['room1', 'room2'] });
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ roomIds: ['room1', 'room2'] });
  });

  test('a failed login does not redeem the claim', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    rpc.mockResolvedValueOnce({ data: 'claim-token', error: null });
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const { loginWithPassword } = await import('./supabase');

    const result = await loginWithPassword('a@b.com', 'wrong');

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.error).toEqual({ message: 'Invalid login credentials' });
  });

  test('a failed handover never fails the login itself', async () => {
    getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'anon-1', is_anonymous: true } } } });
    rpc
      .mockResolvedValueOnce({ data: 'claim-token', error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { loginWithPassword } = await import('./supabase');

    expect(await loginWithPassword('a@b.com', 'secret123')).toEqual({ error: null, claimedRoomIds: [] });
  });

  test('requestPasswordReset calls resetPasswordForEmail', async () => {
    const { requestPasswordReset } = await import('./supabase');
    await requestPasswordReset('a@b.com');
    expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.com');
  });

  test('verifyPasswordResetOtp calls verifyOtp with type "recovery"', async () => {
    const { verifyPasswordResetOtp } = await import('./supabase');
    await verifyPasswordResetOtp('a@b.com', '654321');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '654321', type: 'recovery' });
  });

  test('setNewPassword calls updateUser', async () => {
    const { setNewPassword } = await import('./supabase');
    await setNewPassword('newpassword123');
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword123' });
  });

  test('logout calls signOut', async () => {
    const { logout } = await import('./supabase');
    await logout();
    expect(signOut).toHaveBeenCalledOnce();
  });

  test('fetchSessionAccess returns the parsed row on success', async () => {
    const { fetchSessionAccess } = await import('./supabase');
    const result = await fetchSessionAccess('room1');
    expect(rpc).toHaveBeenCalledWith('session_visibility', { p_id: 'room1' });
    expect(result).toEqual({ exists: true, isPrivate: true, ownerId: 'u1', sessionType: 'react' });
  });

  test('fetchSessionAccess returns null on an rpc error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { fetchSessionAccess } = await import('./supabase');
    expect(await fetchSessionAccess('room1')).toBe(null);
  });

  test('fetchSessionAccess returns the non-existent shape (not null) when the room genuinely does not exist', async () => {
    rpc.mockResolvedValueOnce({ data: [{ exists_: false, is_private: false, owner_id: null, session_type: null }], error: null });
    const { fetchSessionAccess } = await import('./supabase');
    const result = await fetchSessionAccess('no-such-room');
    expect(result).toEqual({ exists: false, isPrivate: false, ownerId: null, sessionType: null });
  });
});
