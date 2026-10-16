import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { generateSessionId } from '../lib/randomId';
import styles from './Landing.module.scss';

const HELPFUL_POINTS = [
  'Remote pair programming',
  'Interviews, programming tests',
  'Share your code in real time',
  'Download all your code in zip and HTML format',
  'Online study groups, seminars, workshops, meetups',
  'Troubleshooting, support',
];

export default function Landing() {
  const newRoomId = useMemo(() => generateSessionId(), []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.title}>CodeShare</span>
        <Link to={`/code/${newRoomId}`} className={styles.ctaLink}>+ Create New Room</Link>
      </header>
      <section className={styles.hero}>
        <h1>Share code in real-time with CodeShare</h1>
        <p>Share a workspace with other developers and collaborate on code live.</p>
        <Link to={`/code/${newRoomId}`} className={styles.ctaButton}>Create New Room</Link>
      </section>
      <section className={styles.points}>
        <h2>Let&rsquo;s code together</h2>
        <ul>
          {HELPFUL_POINTS.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </section>
    </div>
  );
}
