import { describe, expect, test, vi, beforeEach } from 'vitest';

const signInAnonymously = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'uid-123' } } }, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { signInAnonymously, getSession },
  }),
}));

beforeEach(() => {
  signInAnonymously.mockClear();
  getSession.mockClear();
});

describe('ensureAnonymousSession', () => {
  test('signs in anonymously when there is no existing session', async () => {
    const { ensureAnonymousSession } = await import('./supabase');
    const uid = await ensureAnonymousSession();
    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(uid).toBe('uid-123');
  });
});
