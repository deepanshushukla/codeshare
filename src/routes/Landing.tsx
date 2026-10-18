import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
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
import ThemeButton from '../features/theme/ThemeButton';
import ThemeDrawer from '../features/theme/ThemeDrawer';
import { useRoomTransition } from '../features/transition/RoomTransitionProvider';
import OrbitVisual from './Landing/OrbitVisual';
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

export default function Landing() {
  const newRoomId = useMemo(() => generateSessionId(), []);
  const roomHref = `/code/${newRoomId}`;
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { start } = useRoomTransition();

  function enterRoom() {
    start(newRoomId, () => navigate(roomHref));
  }

  function handleCreateClick(event: MouseEvent<HTMLAnchorElement>) {
    // Anything other than a plain, unmodified left click (middle-click,
    // ctrl/cmd/shift/alt-click) is a request for the browser's native
    // anchor behavior (new tab, new window, etc.) -- leave it alone.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    enterRoom();
  }

  // "N" is the keyboard shortcut for "Create New Room" (handoff's "or press
  // N" hint). Guarded against INPUT/TEXTAREA focus so typing into a form
  // field elsewhere on the page can't accidentally trigger it -- there are
  // no such fields on Home today, but the guard costs nothing and matches
  // the handoff's own behavior.
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key !== 'n' && event.key !== 'N') {
        return;
      }
      // Cmd+N (Mac "new browser window") / Ctrl+N (Windows "new window") must
      // not also fire our in-app shortcut -- matches the design handoff's own
      // keydown handler exactly (`!e.metaKey && !e.ctrlKey`).
      if (event.ctrlKey || event.metaKey) {
        return;
      }
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        return;
      }
      enterRoom();
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [newRoomId, navigate, roomHref, start]);

  return (
    <div className={styles.page}>
      <div className={styles.gridBackground} aria-hidden="true" />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.brand}>
            <span className={styles.brandBracket}>{'{'}</span>
            CodeShare
            <span className={styles.brandBracket}>{'}'}</span>
          </span>

          <ThemeButton variant="pill" onOpenDrawer={() => setThemeDrawerOpen(true)} />

          <Link to={roomHref} className={styles.headerCta}>
            <Plus size={14} />
            New Room
          </Link>
        </div>
      </header>

      <ThemeDrawer open={themeDrawerOpen} onClose={() => setThemeDrawerOpen(false)} />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <span className={styles.eyebrowDot}>
              <span className={styles.eyebrowDotCore} />
              <span className={styles.eyebrowDotPing} />
            </span>
            FREE &middot; NO SIGN-UP REQUIRED
          </p>
          <h1>
            <span className={styles.riseSpan}>Share code in</span>{' '}
            <span className={styles.riseSpan}>
              <span className={styles.highlight}>real-time</span>
            </span>{' '}
            <span className={styles.riseSpan}>with CodeShare</span>
          </h1>
          <p className={styles.heroSubtitle}>
            Open a workspace, send the link, and start collaborating on HTML, CSS and
            JavaScript together — live, in the browser.
          </p>
          <div className={styles.heroActions}>
            <Link to={roomHref} className={styles.ctaButton} onClick={handleCreateClick}>
              Create New Room
              <span className={styles.ctaIcon}>
                <ArrowRight size={20} />
              </span>
            </Link>
            <span className={styles.kbdHint}>
              or press <span className={styles.kbdKey}>N</span>
            </span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-hidden="true">
          <OrbitVisual room={newRoomId} />
        </div>
      </section>

      <div className={styles.ticker}>
        <div className={styles.tickerTrack}>
          {[
            'HTML',
            'CSS',
            'JavaScript',
            'Console',
            'Output',
            'One link',
            'HTML',
            'CSS',
            'JavaScript',
            'Console',
            'Output',
            'One link',
          ].map((word, index) => (
            <span key={index} className={styles.tickerItem}>
              {word}
              {index < 11 && <span className={styles.tickerDiamond} />}
            </span>
          ))}
        </div>
      </div>

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
