import { createClient } from '@supabase/supabase-js';
import { isSessionType } from '../features/session/sessionType';
import type { SessionType } from '../features/session/sessionType';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function ensureAnonymousSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    return existing.session.user.id;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return data.session.user.id;
}

async function isAnonymousSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session?.user.is_anonymous);
}

// Every visitor already has an anonymous session (ensureAnonymousSession), and
// rooms they create are owned by that anonymous user id. Signing up therefore
// *converts* the anonymous user in place -- updateUser keeps the same id, so
// they keep owning those rooms and can make them private -- rather than
// signUp(), which would mint a brand-new user and orphan them. Supabase sends
// that verification as an email change (template: email_change), so the code
// is verified with type 'email_change'. The session stays anonymous until the
// code is verified, so both calls agree on which path is in use.
export async function signUpWithEmail(email: string, password: string): Promise<{ error: Error | null }> {
  if (await isAnonymousSession()) {
    const { error } = await supabase.auth.updateUser({ email, password });
    return { error };
  }
  const { error } = await supabase.auth.signUp({ email, password });
  return { error };
}

export async function verifySignupOtp(email: string, token: string): Promise<{ error: Error | null }> {
  const type = (await isAnonymousSession()) ? 'email_change' : 'signup';
  const { error } = await supabase.auth.verifyOtp({ email, token, type });
  return { error };
}

export async function loginWithPassword(email: string, password: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error };
}

export async function requestPasswordReset(email: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  return { error };
}

export async function verifyPasswordResetOtp(email: string, token: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'recovery' });
  return { error };
}

export async function setNewPassword(password: string): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.updateUser({ password });
  return { error };
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export type SessionAccess = {
  exists: boolean;
  isPrivate: boolean;
  ownerId: string | null;
  sessionType: SessionType | null;
};

export async function fetchSessionAccess(sessionId: string): Promise<SessionAccess | null> {
  const { data, error } = await supabase.rpc('session_visibility', { p_id: sessionId });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0];
  const sessionType = isSessionType(row.session_type) ? row.session_type : null;

  return {
    exists: row.exists_ ?? false,
    isPrivate: row.is_private ?? false,
    ownerId: row.owner_id ?? null,
    sessionType,
  };
}
