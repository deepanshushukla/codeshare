import { useEffect, useState } from 'react';
import { ensureAnonymousSession, supabase } from '../../lib/supabase';

export type AuthUser = {
  userId: string | null;
  email: string | null;
  isAnonymous: boolean;
  loading: boolean;
  authFailed: boolean;
};

const INITIAL_STATE: AuthUser = {
  userId: null,
  email: null,
  isAnonymous: true,
  loading: true,
  authFailed: false,
};

/**
 * Single source of truth app-wide for "is this visitor logged in for real,
 * or just anonymously signed in." Wraps `supabase.auth.onAuthStateChange`
 * (which fires synchronously on subscribe with the current session, mirroring
 * the SDK's `INITIAL_SESSION` event) and `ensureAnonymousSession()`, which
 * guarantees a session exists at all (anonymous if nothing else).
 *
 * These two are intentionally independent: `loading` flips to `false` as
 * soon as `onAuthStateChange` reports a confirmed session (anonymous or
 * not), or as soon as `ensureAnonymousSession()` rejects -- whichever
 * happens first. It does *not* flip false on the no-session replay that
 * `onAuthStateChange` fires synchronously on subscribe, since that fires
 * before `ensureAnonymousSession()` has had any chance to establish one.
 * `ensureAnonymousSession()` itself exists only to create a session when
 * none exists, and to surface `authFailed` if that's not possible (e.g.
 * anonymous sign-ins disabled on the project).
 */
export function useAuthUser(): AuthUser {
  const [state, setState] = useState<AuthUser>(INITIAL_STATE);

  useEffect(() => {
    let active = true;

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState((previous) => ({
        ...previous,
        userId: session?.user.id ?? null,
        email: session?.user.email ?? null,
        isAnonymous: session?.user.is_anonymous ?? true,
        // Only a confirmed session (even an anonymous one) resolves loading.
        // The replay this listener gets synchronously on subscribe (mirroring
        // the SDK's `INITIAL_SESSION` event) fires with `session: null`
        // before `ensureAnonymousSession()` has had a chance to establish
        // one -- treating that as "resolved" would flash `loading: false`
        // for a visitor who, a tick later, turns out to have a session after
        // all. `ensureAnonymousSession()` rejecting is the other way loading
        // resolves, handled below.
        loading: session ? false : previous.loading,
      }));
    });

    ensureAnonymousSession().catch((error: unknown) => {
      // Without this, a project with anonymous sign-ins disabled leaves
      // `userId` null forever with no hint to the user that anything is
      // wrong -- see the matching catch in SessionWorkspace/
      // ReactSessionWorkspace, which this hook will eventually replace.
      console.error('codeshare: anonymous sign-in failed', error);
      if (active) setState((previous) => ({ ...previous, authFailed: true, loading: false }));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return state;
}
