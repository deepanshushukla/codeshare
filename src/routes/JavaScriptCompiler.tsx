import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { generateSessionId } from '../lib/randomId';
import { useRoomTransition } from '../features/transition/RoomTransitionProvider';
import PageSeo from '../lib/seo';
import styles from './MarketingPage.module.scss';

const FAQ = [
  {
    q: 'Is this a real JavaScript compiler or interpreter?',
    a: 'Your code runs in an actual browser JavaScript engine inside a sandboxed iframe — not a simplified subset. Modern syntax, console methods, timers, and DOM APIs all behave exactly as they would in any browser.',
  },
  {
    q: 'Do I need to install anything or sign up?',
    a: 'No. Open a room and start typing — there’s no account, no download, and nothing to configure.',
  },
  {
    q: 'Can other people see my code and output live?',
    a: 'Yes. Share the room URL and anyone who opens it sees your edits, the console, and the live output update in real time.',
  },
  {
    q: 'Can I write HTML and CSS too, not just JavaScript?',
    a: 'Every room includes HTML, CSS, and JavaScript tabs alongside a live Output preview and a Console tab for logged output and errors.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'CodeShare — Online JavaScript Compiler',
  url: 'https://codeshare.in/javascript-compiler',
  description:
    'Run JavaScript instantly in your browser with a free online compiler. Write, execute, and share JavaScript code in real time.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function JavaScriptCompiler() {
  const newRoomId = useMemo(() => generateSessionId(), []);
  const roomHref = `/code/${newRoomId}`;
  const navigate = useNavigate();
  const { start } = useRoomTransition();

  function handleRunClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    start(newRoomId, () => navigate(roomHref));
  }

  return (
    <div className={styles.page}>
      <PageSeo
        title="Online JavaScript Compiler & Live Code Editor | CodeShare"
        description="Run JavaScript instantly in your browser with a free online compiler. Write, execute, and share JavaScript code in real time — no installs, no sign-up."
        path="/javascript-compiler"
        jsonLd={JSON_LD}
      />

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand}>
            <span className={styles.brandBracket}>{'{'}</span>
            CodeShare
            <span className={styles.brandBracket}>{'}'}</span>
          </Link>
          <Link to="/" className={styles.backLink}>
            ← Home
          </Link>
        </div>
      </header>

      <section className={styles.hero}>
        <h1>Online JavaScript Compiler</h1>
        <p className={styles.heroSubtitle}>
          Write JavaScript, see the console output instantly, and share the running code with a single link — no
          installs, no sign-up, no setup.
        </p>
        <Link to={roomHref} className={styles.ctaButton} onClick={handleRunClick}>
          Run JavaScript Now
          <span className={styles.ctaIcon}>
            <ArrowRight size={18} />
          </span>
        </Link>
      </section>

      <section className={styles.content}>
        <p>
          Every CodeShare room is a real browser JavaScript environment, not a stripped-down sandbox. Open a room
          and you get HTML, CSS, and JavaScript editors side by side with a live Output preview and a Console tab
          that captures <code>console.log</code>, warnings, and errors as you type.
        </p>
        <p>
          Because it&rsquo;s built for real-time code sharing, a room isn&rsquo;t just your own scratchpad — send
          the link to anyone and they see the same code, the same console, and the same output update live as you
          work. It&rsquo;s the same workspace, whether you&rsquo;re debugging alone or pairing with someone else.
        </p>
      </section>

      <section className={styles.faq}>
        <h2>Frequently asked questions</h2>
        {FAQ.map(({ q, a }) => (
          <details className={styles.faqItem} key={q}>
            <summary className={styles.faqQuestion}>{q}</summary>
            <p className={styles.faqAnswer}>{a}</p>
          </details>
        ))}
      </section>

      <p className={styles.crossLink}>
        Need JSX and hooks instead? Try the <Link to="/react-playground">React playground</Link>.
      </p>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>{'{CodeShare}'}</span>
          <span>© 2026 CodeShare</span>
        </div>
      </footer>
    </div>
  );
}
