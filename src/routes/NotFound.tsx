import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div>
      <h1>404</h1>
      <p>Sorry, the page you visited does not exist.</p>
      <Link to="/">Create New Session</Link>
    </div>
  );
}
