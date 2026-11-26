import { useParams, useSearchParams } from 'react-router-dom';
import SessionWorkspace from '../features/session/SessionWorkspace';
import ReactSessionWorkspace from '../features/session/ReactSessionWorkspace';
import { useAuthUser } from '../features/auth/useAuthUser';
import { useSessionAccess } from '../features/session/useSessionAccess';
import AccessDenied from '../features/session/AccessDenied';
import { isSessionType, type SessionType } from '../features/session/sessionType';
import NotFound from './NotFound';

export default function SessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  // `?type=` is only ever a hint for a session that doesn't exist in
  // Postgres yet -- useSessionAccess ignores it in favor of the persisted
  // row's session_type once one exists. An absent or unrecognized value
  // defaults to 'web', the original (and only, pre-React-mode) session type.
  const typeHint: SessionType = rawType && isSessionType(rawType) ? rawType : 'web';
  // `?private=` is only a hint too -- for a session that doesn't exist yet,
  // used by the workspace components to pre-select the privacy toggle when
  // first creating the room. '1'/'0' map to true/false; anything else
  // (including absent) means "no hint," not "public."
  const rawPrivate = searchParams.get('private');
  const privacyHint: boolean | null = rawPrivate === '1' ? true : rawPrivate === '0' ? false : null;
  // Called unconditionally, before the `!sessionId` guard below, so these
  // hook calls can never be skipped on some renders and not others (Rules of
  // Hooks). `sessionId` is always defined once this route actually matches
  // (`/code/:sessionId`), so the `sessionId ?? ''` placeholder here is never
  // real input to useSessionAccess -- the guard immediately below still
  // short-circuits to <NotFound /> before this hook's result is ever used.
  const { userId, isAnonymous, loading: authLoading } = useAuthUser();
  const access = useSessionAccess(sessionId ?? '', typeHint, userId);
  if (!sessionId) return <NotFound />;
  if (authLoading || access.status === 'loading') return null;
  if (access.status === 'denied') return <AccessDenied />;
  const sessionType = access.sessionType;
  return sessionType === 'react' ? (
    <ReactSessionWorkspace
      sessionId={sessionId}
      userId={userId}
      isAnonymous={isAnonymous}
      privacyHint={privacyHint}
    />
  ) : (
    <SessionWorkspace
      sessionId={sessionId}
      userId={userId}
      isAnonymous={isAnonymous}
      privacyHint={privacyHint}
    />
  );
}
