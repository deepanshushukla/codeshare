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
  if (!sessionId) return <NotFound />;
  const { sessionType, loading } = useSessionType(sessionId, typeHint);
  if (loading || !sessionType) return null;
  return sessionType === 'react' ? (
    <ReactSessionWorkspace sessionId={sessionId} />
  ) : (
    <SessionWorkspace sessionId={sessionId} />
  );
}
