import { useCallback, useEffect, useState } from 'react';
import { fetchSessionAccess } from '../../lib/supabase';
import type { SessionType } from './sessionType';

export type SessionAccessState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; sessionType: SessionType; isOwner: boolean; isPrivate: boolean };

export function useSessionAccess(
  sessionId: string,
  typeHint: SessionType,
  currentUserId: string | null,
): SessionAccessState & { recheck: () => void } {
  const [state, setState] = useState<SessionAccessState>({ status: 'loading' });
  // Bumped by recheck() to re-run the lookup -- e.g. when the owner makes the
  // room private while this visitor has it open.
  const [checkCount, setCheckCount] = useState(0);
  const recheck = useCallback(() => setCheckCount((n) => n + 1), []);

  useEffect(() => {
    // A changed sessionId/typeHint/currentUserId means the access decision we
    // are currently reporting belongs to the *previous* inputs. Go back to
    // "we don't know yet" until the new read resolves, instead of serving a
    // stale ready/denied verdict -- same discipline as useSessionType.ts and
    // useSession.ts.
    setState({ status: 'loading' });

    if (currentUserId === null) {
      // No identity yet -- there is nothing to check ownership against.
      // This is a no-op (not an error): stay loading until identity arrives,
      // at which point this effect reruns.
      return;
    }

    let active = true;

    async function loadAccess() {
      const access = await fetchSessionAccess(sessionId);

      if (!active) return;

      if (!access) {
        // Mirrors useSessionType's existing error discipline: a transient
        // RPC failure must not be treated as positive information (e.g. "the
        // room doesn't exist" or "access is granted"). No retry here by
        // design -- stay loading for this attempt; a reload re-runs the read.
        console.error('codeshare: checking session access failed');
        return;
      }

      if (!access.exists) {
        // Confirmed no row and no error -- positive information, so the hint
        // decides, exactly like useSessionType's create-branch.
        setState({ status: 'ready', sessionType: typeHint, isOwner: false, isPrivate: false });
        return;
      }

      const isOwner = access.ownerId === currentUserId;

      if (access.isPrivate && !isOwner) {
        setState({ status: 'denied' });
        return;
      }

      setState({ status: 'ready', sessionType: access.sessionType ?? typeHint, isOwner, isPrivate: access.isPrivate });
    }

    loadAccess();

    return () => {
      active = false;
    };
  }, [sessionId, typeHint, currentUserId, checkCount]);

  return { ...state, recheck };
}
