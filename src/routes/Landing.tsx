import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import {
  Users,
  ClipboardCheck,
  Share2,
  Download,
  GraduationCap,
  LifeBuoy,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { generateSessionId } from '../lib/randomId';
import styles from './Landing.module.scss';

const FEATURES = [
  {
    icon: Users,
    title: 'Remote pair programming',
    description: 'Work through a problem together in the same editor, in real time.',
  },
  {
    icon: ClipboardCheck,
    title: 'Interviews & tests',
    description: 'A clean, distraction-free room for live coding interviews.',
  },
  {
    icon: Share2,
    title: 'Share instantly',
    description: 'Send a link — no account, no install, no setup for your collaborators.',
  },
  {
    icon: Download,
    title: 'Export your work',
    description: 'Download the finished code as a standalone HTML file or a zip.',
  },
  {
    icon: GraduationCap,
    title: 'Study groups & workshops',
    description: 'Run a seminar, meetup, or study session with everyone coding along.',
  },
  {
    icon: LifeBuoy,
    title: 'Troubleshooting & support',
    description: 'Look over someone’s shoulder and fix it together, from anywhere.',
  },
];

const MOCK_JS_LINES = [
  { indent: 0, text: 'function greet(name) {' },
  { indent: 1, text: "console.log(`Hello, ${name}!`);" },
  { indent: 0, text: '}' },
  { indent: 0, text: '' },
  { indent: 0, text: "greet('world');" },
];

export default function Landing() {
  const newRoomId = useMemo(() => generateSessionId(), []);
  const roomHref = `/code/${newRoomId}`;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <span className={styles.logoMark} aria-hidden="true" />
          CodeShare
        </span>
        <Link to={roomHref} className={styles.headerCta}>
          <Plus size={14} />
          New Room
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Free &middot; No sign-up required</p>
          <h1>Share code in real-time with CodeShare</h1>
          <p className={styles.heroSubtitle}>
            Open a workspace, send the link, and start collaborating on HTML, CSS and
            JavaScript together — live, in the browser.
          </p>
          <div className={styles.heroActions}>
            <Link to={roomHref} className={styles.ctaButton}>
              Create New Room
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.mockWindow}>
            <div className={styles.mockTitleBar}>
              <span className={styles.mockDot} data-variant="red" />
              <span className={styles.mockDot} data-variant="yellow" />
              <span className={styles.mockDot} data-variant="green" />
              <span className={styles.mockTabs}>
                <span className={styles.mockTabActive}>JS</span>
                <span>Console</span>
              </span>
            </div>
            <div className={styles.mockBody}>
              {MOCK_JS_LINES.map((line, index) => (
                <div
                  key={index}
                  className={styles.mockLine}
                  style={{ paddingLeft: `${line.indent * 1.25}rem` }}
                >
                  {line.text || ' '}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.features}>
        <h2>Let&rsquo;s code together</h2>
        <div className={styles.featureGrid}>
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div className={styles.featureCard} key={title}>
              <div className={styles.featureIcon}>
                <Icon size={18} />
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <span>CodeShare — share code in real time.</span>
      </footer>
    </div>
  );
}
