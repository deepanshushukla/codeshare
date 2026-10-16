import { createClient } from '@supabase/supabase-js';

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
