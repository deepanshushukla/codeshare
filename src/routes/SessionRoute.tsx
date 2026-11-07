import { useParams, useSearchParams } from 'react-router-dom';
import SessionWorkspace from '../features/session/SessionWorkspace';
import ReactSessionWorkspace from '../features/session/ReactSessionWorkspace';
import { useSessionType } from '../features/session/useSessionType';
import { isSessionType, type SessionType } from '../features/session/sessionType';
import NotFound from './NotFound';

export default function SessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  // `?type=` is only ever a hint for a session that doesn't exist in
  // Postgres yet -- useSessionType ignores it in favor of the persisted
  // row's session_type once one exists. An absent or unrecognized value
  // defaults to 'web', the original (and only, pre-React-mode) session type.
  const typeHint: SessionType = rawType && isSessionType(rawType) ? rawType : 'web';
  // Called unconditionally, before the `!sessionId` guard below, so this
  // hook call can never be skipped on some renders and not others (Rules of
  // Hooks). `sessionId` is always defined once this route actually matches
  // (`/code/:sessionId`), so the `sessionId ?? ''` placeholder here is never
  // real input to useSessionType -- the guard immediately below still
  // short-circuits to <NotFound /> before this hook's result is ever used.
  const { sessionType, loading } = useSessionType(sessionId ?? '', typeHint);
  if (!sessionId) return <NotFound />;
  if (loading || !sessionType) return null;
  return sessionType === 'react' ? (
    <ReactSessionWorkspace sessionId={sessionId} />
  ) : (
    <SessionWorkspace sessionId={sessionId} />
  );
}
