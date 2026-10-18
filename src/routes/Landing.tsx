import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { generateSessionId } from '../lib/randomId';
import ThemeButton from '../features/theme/ThemeButton';
import ThemeDrawer from '../features/theme/ThemeDrawer';
import { useRoomTransition } from '../features/transition/RoomTransitionProvider';
import OrbitVisual from './Landing/OrbitVisual';
import styles from './Landing.module.scss';

const FEATURES = [
  {
    n: '01',
    title: 'Remote pair programming',
    description: 'Work through a problem together in the same editor, in real time.',
    tag: 'pair',
  },
  {
    n: '02',
    title: 'Interviews & tests',
    description: 'A clean, distraction-free room for live coding interviews.',
    tag: 'hire',
  },
  {
    n: '03',
    title: 'Share instantly',
    description: 'Send a link — no account, no install, no setup for your collaborators.',
    tag: 'link',
  },
  {
    n: '04',
    title: 'Export your work',
    description: 'Download the finished code as a standalone HTML file or a zip.',
    tag: 'save',
  },
  {
    n: '05',
    title: 'Study groups & workshops',
    description: 'Run a seminar, meetup, or study session with everyone coding along.',
    tag: 'learn',
  },
  {
    n: '06',
    title: 'Troubleshooting & support',
    description: 'Look over someone’s shoulder and fix it together, from anywhere.',
    tag: 'fix',
  },
];

// The ticker is rendered as this list twice back-to-back so @keyframes
// marquee's -50% translate loops seamlessly. Every item -- including the last
// of each half, i.e. the looping seam -- gets a trailing diamond separator.
const TICKER_WORDS = ['HTML', 'CSS', 'JavaScript', 'Console', 'Output', 'One link'];

export default function Landing() {
  const newRoomId = useMemo(() => generateSessionId(), []);
  const roomHref = `/code/${newRoomId}`;
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  const navigate = useNavigate();
  const { start } = useRoomTransition();

  function enterRoom() {
    // Close the theme drawer first if it happens to be open -- the "N"
    // shortcut can fire while it is, and leaving it mounted mid-transition
    // would abandon it half-open over the iris wipe. Matches the design
    // handoff's own newRoom(), which sets `themeOpen: false`.
    setThemeDrawerOpen(false);
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

          <Link to={roomHref} className={styles.headerCta} onClick={handleCreateClick}>
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
          {[...TICKER_WORDS, ...TICKER_WORDS].map((word, index) => (
            <span key={index} className={styles.tickerItem}>
              {word}
              <span className={styles.tickerDiamond} />
            </span>
          ))}
        </div>
      </div>

      <section className={styles.features}>
        <div className={styles.featuresHeader}>
          <h2>Let&rsquo;s code together</h2>
          <span className={styles.featuresCount}>06 use cases</span>
        </div>
        <div className={styles.featureGrid}>
          {FEATURES.map(({ n, title, description, tag }) => (
            <div className={styles.featureCard} key={title}>
              <div className={styles.featureCardTop}>
                <span className={styles.featureIndex}>{n}</span>
                <span className={styles.featureTag}>{tag}</span>
              </div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.ctaSection}>
        <Link to={roomHref} className={styles.ctaBlock} onClick={handleCreateClick}>
          <span className={styles.ctaBlockInner}>
            <span className={styles.ctaBlockText}>Create New Room</span>
            <span className={styles.ctaBlockIcon} aria-hidden="true">
              <ArrowRight size={28} />
            </span>
          </span>
        </Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>{'{CodeShare}'}</span>
          <span>© 2026 CodeShare</span>
        </div>
      </footer>
    </div>
  );
}
