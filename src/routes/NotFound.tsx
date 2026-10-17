import { Link } from 'react-router-dom';
import styles from './NotFound.module.scss';

export default function NotFound() {
  return (
    <div className={styles.page}>
      <h1>404</h1>
      <p>Sorry, the page you visited does not exist.</p>
      <Link to="/" className={styles.link}>
        Create New Session
      </Link>
    </div>
  );
}
