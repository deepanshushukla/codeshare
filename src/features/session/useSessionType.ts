import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isSessionType, type SessionType } from './sessionType';

export function useSessionType(
  sessionId: string,
  typeHint: SessionType,
): { sessionType: SessionType | null; loading: boolean } {
  const [sessionType, setSessionType] = useState<SessionType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // A changed sessionId/typeHint means the type we are currently reporting
    // belongs to the *previous* input. Go back to "we don't know yet" until
    // the new read resolves, instead of serving a stale `sessionType` with
    // `loading: false` -- SessionRoute would otherwise mount the wrong
    // workspace for the new session for a frame or more. Same discipline as
    // useSession.ts, which resets its content when sessionId changes.
    setLoading(true);
    setSessionType(null);

    async function loadSessionType() {
      const { data, error } = await supabase
        .from('sessions')
        .select('session_type')
        .eq('id', sessionId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        // On a transient read error `data` is also falsy -- don't treat that
        // as "no row exists" and resolve to `typeHint`. Doing so would let a
        // momentary network/RLS failure decide the session's type, and (via
        // useSession's create-branch) persist that guess as the row's real
        // session_type: a React room silently becoming a Web one. There is no
        // retry here by design, so we simply stay in `loading: true` for this
        // attempt; SessionRoute renders nothing rather than the wrong
        // workspace, and a reload re-runs the read.
        console.error('codeshare: reading the session type failed', error);
        return;
      }

      if (data && isSessionType(data.session_type)) {
        setSessionType(data.session_type);
      } else {
        // Confirmed no row (or a row whose session_type is missing/invalid)
        // and no error -- positive information, so the hint decides.
        setSessionType(typeHint);
      }
      setLoading(false);
    }

    loadSessionType();

    return () => {
      active = false;
    };
  }, [sessionId, typeHint]);

  return { sessionType, loading };
}
