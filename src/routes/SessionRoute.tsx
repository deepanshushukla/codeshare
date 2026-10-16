import { useParams } from 'react-router-dom';
import SessionWorkspace from '../features/session/SessionWorkspace';
import NotFound from './NotFound';

export default function SessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <NotFound />;
  return <SessionWorkspace sessionId={sessionId} />;
}
