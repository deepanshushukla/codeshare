import { Link, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { generateSessionId } from '../lib/randomId';
import { useRoomTransition } from '../features/transition/RoomTransitionProvider';
import PageSeo from '../lib/seo';
import styles from './MarketingPage.module.scss';

const FAQ = [
  {
    q: 'Does this support JSX and hooks?',
    a: 'Yes. Write components exactly as you would in a normal React project — JSX, useState, useEffect, and the rest of the hooks API all work.',
  },
  {
    q: 'Do I need to set up a build tool or install React?',
    a: 'No. Switch a room to React mode and your JSX compiles and renders in the browser immediately — there’s no bundler step to configure.',
  },
  {
    q: 'Can I collaborate with someone else live?',
    a: 'Yes. Share the room link and your edits, and the live component preview, sync for everyone viewing the room in real time.',
  },
  {
    q: 'Is this good for interviews or teaching React?',
    a: 'It’s built for exactly that — pair programming, technical interviews, and workshops where everyone needs to see the same running code without anyone installing anything.',
  },
];

const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'CodeShare — React Playground',
  url: 'https://codeshare.in/react-playground',
  description:
    'A free online React playground. Write JSX and hooks, see a live component preview, and share a link to collaborate on React code in real time.',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

export default function ReactPlayground() {
  const newRoomId = useMemo(() => generateSessionId(), []);
  const roomHref = `/code/${newRoomId}?type=react`;
  const navigate = useNavigate();
  const { start } = useRoomTransition();

  function handleOpenClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    start(newRoomId, () => navigate(roomHref));
  }

  return (
    <div className={styles.page}>
      <PageSeo
        title="React Playground — Write, Run & Share React Code Online | CodeShare"
        description="A free online React playground. Write JSX and hooks, see a live component preview, and share a link to collaborate on React code in real time — no build step."
        path="/react-playground"
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
        <h1>React Playground</h1>
        <p className={styles.heroSubtitle}>
          Write real React components — JSX, hooks, state — and watch them render live. Share the link and build
          together, with no build step to set up.
        </p>
        <Link to={roomHref} className={styles.ctaButton} onClick={handleOpenClick}>
          Open React Playground
          <span className={styles.ctaIcon}>
            <ArrowRight size={18} />
          </span>
        </Link>
      </section>

      <section className={styles.content}>
        <p>
          React mode compiles your JSX right in the browser, so there&rsquo;s no bundler, no <code>npm install</code>
          , and no project to set up. Write a component, use hooks like you normally would, and see it render live
          in the Output pane as you type.
        </p>
        <p>
          It&rsquo;s the same real-time room as every other CodeShare session — share the link and anyone who opens
          it sees your edits and the live preview update together, which makes it a solid fit for pairing on a
          component, running a React interview, or teaching hooks in a workshop.
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
        Just need plain JavaScript? Try the <Link to="/javascript-compiler">online JavaScript compiler</Link>.
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
