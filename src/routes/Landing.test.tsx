import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { RoomTransitionProvider } from '../features/transition/RoomTransitionProvider';
import RoomTransitionOverlay from '../features/transition/RoomTransitionOverlay';
import Landing from './Landing';
// Vitest leaves CSS Modules unprocessed by default, so this proxy returns each
// key as its own class name -- the same value Landing renders into className,
// which makes it safe to query the DOM with.
import styles from './Landing.module.scss';

// Extracts the full declaration block for `selector` (e.g. ".riseSpan") from
// a CSS/SCSS source string, counting braces so nested rules (like
// `&:nth-child(1) { ... }`) don't truncate the match early.
function extractRuleBlock(css: string, selector: string): string {
  const headerIndex = css.indexOf(`${selector} {`);
  if (headerIndex === -1) {
    throw new Error(`selector ${selector} not found in CSS source`);
  }
  const braceStart = css.indexOf('{', headerIndex);
  let depth = 0;
  let i = braceStart;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(braceStart, i + 1);
}

// The brief's test examples render Landing under a bare MemoryRouter, but:
// - ThemeButton/ThemeDrawer call useTheme() and throw without a ThemeProvider
//   ancestor -- every other test exercising them (ThemeButton.test.tsx,
//   ThemeDrawer.test.tsx) wraps in one, so this does too.
// - Landing's CTA/N-shortcut now call useRoomTransition(), which throws
//   without a RoomTransitionProvider ancestor (same as App.tsx's real tree).
//   RoomTransitionOverlay is rendered alongside Landing (a sibling, matching
//   App.tsx) so the "/r/{id}" overlay text actually appears when a
//   transition starts.
function renderLanding() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <RoomTransitionProvider>
          <Landing />
          <RoomTransitionOverlay />
        </RoomTransitionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

// Task 9 added a second "Create New Room" link (the bottom CTA block), so
// every query below takes [0] to keep targeting the hero CTA specifically --
// otherwise getByRole throws on the now-ambiguous match.
test('the Create New Room link points at /code/<id>', () => {
  renderLanding();
  const link = screen.getAllByRole('link', { name: /^create new room$/i })[0];
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('renders the theme button and opens the theme drawer', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(screen.getByRole('heading', { name: /theme/i })).toBeInTheDocument(); // drawer title
});

test('keeps the CTA a real link to the new room', () => {
  renderLanding();
  const link = screen.getAllByRole('link', { name: /^create new room$/i })[0];
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('a plain click starts the transition instead of navigating immediately', () => {
  renderLanding();
  fireEvent.click(screen.getAllByRole('link', { name: /^create new room$/i })[0]);
  expect(screen.getByText(/\/r\//)).toBeInTheDocument(); // overlay now showing /r/{id}
});

test('a ctrl-click is left alone (native new-tab behavior, no preventDefault)', () => {
  renderLanding();
  const link = screen.getAllByRole('link', { name: /^create new room$/i })[0];
  const event = createEvent.click(link, { ctrlKey: true });
  const prevented = !fireEvent(link, event);
  expect(prevented).toBe(false);
});

test('pressing N starts the transition', () => {
  renderLanding();
  fireEvent.keyDown(window, { key: 'n' });
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});

test('the header "New Room" pill runs the same animated transition as the other two CTAs', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('link', { name: /^new room$/i }));
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});

test('pressing N closes the theme drawer instead of abandoning it mid-transition', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(screen.getByRole('heading', { name: /theme/i })).toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'n' });
  expect(screen.getByText(/\/r\//)).toBeInTheDocument(); // transition started
  expect(screen.queryByRole('heading', { name: /theme/i })).not.toBeInTheDocument();
});

test('Ctrl+N / Cmd+N are left alone (native "new window" shortcut, not our transition)', () => {
  renderLanding();
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
  expect(screen.queryByText(/\/r\//)).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'N', metaKey: true });
  expect(screen.queryByText(/\/r\//)).not.toBeInTheDocument();
});

// The "one-shot entrance animations must NOT wire --play" allowlist that used
// to live here (hand-listing .riseSpan/.highlight/.eyebrow/.heroSubtitle/
// .heroActions) is superseded by src/styles/reducedMotion.test.ts, which
// enforces the same invariant by reading every *.module.scss in src/ off disk
// -- so a new animation in a stylesheet nobody remembered to add to a list is
// still covered. The continuous-animation half below is NOT covered there
// (that test deliberately does not mandate --play on looping animations), so
// it stays.
test('continuous/looping decorative animations still respect --play (prefers-reduced-motion)', () => {
  // Unlike the one-shot entrance animations above, these loop forever and
  // every frame is a visually sane resting state, so pausing mid-cycle via
  // --play is the correct (and harmless) behavior for them.
  const scssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Landing.module.scss');
  const css = readFileSync(scssPath, 'utf8');

  expect(extractRuleBlock(css, '.tickerTrack')).toContain('animation-play-state: var(--play);');

  // `.eyebrowDotPing` also appears earlier as part of a combined selector
  // (`.eyebrowDotCore,\n.eyebrowDotPing { position: ...; background: ...; }`)
  // that holds no animation at all -- extractRuleBlock's indexOf would grab
  // that one instead of the standalone rule below it that actually declares
  // the ping animation, so this checks the specific standalone block by
  // pattern instead of by selector lookup.
  //
  // `global(ping)`, not a bare `ping`: `ping` is declared in the global
  // src/styles/motion.scss, and CSS Modules rewrites an unwrapped
  // animation-name token to this file's hashed local scope, where no matching
  // @keyframes exists -- so the animation silently never runs. See
  // scripts/verify-animations.mjs, which proves the match in the built CSS.
  expect(css).toMatch(
    /\.eyebrowDotPing\s*\{\s*animation: global\(ping\)[^}]*animation-play-state: var\(--play\);\s*\}/,
  );
});

test('.page refuses to be flex-shrunk by #root, so overflow:hidden children keep their content height', () => {
  // #root (globals.scss) is `height: 100%` inside a flex column -- intended
  // for the Room workspace, which must fit exactly one viewport. Without
  // flex-shrink: 0 here, #root's flexbox math compresses this taller-than-
  // viewport page down to exactly 100vh, and within that squeeze, flexbox
  // resolves an `overflow: hidden` child's automatic minimum height to 0
  // (instead of its content size) -- so .ticker alone collapsed to ~0px while
  // its overflow-visible siblings refused to shrink. This is what made the
  // ticker marquee disappear even though its own CSS was correct in isolation.
  const scssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Landing.module.scss');
  const css = readFileSync(scssPath, 'utf8');
  expect(extractRuleBlock(css, '.page')).toContain('flex-shrink: 0;');
});

test('renders the ticker words twice (seamless marquee loop), each followed by a diamond separator', () => {
  const { container } = renderLanding();
  // Two back-to-back copies of the six-word list is what makes @keyframes
  // marquee's -50% translate loop seamlessly.
  expect(screen.getAllByText('JavaScript').length).toBe(2);
  const items = container.querySelectorAll(`.${styles.tickerItem}`);
  expect(items.length).toBe(12);
  // Every item gets a trailing diamond -- including the last of each half, so
  // the looping seam reads the same as every other gap.
  expect(container.querySelectorAll(`.${styles.tickerDiamond}`).length).toBe(12);
});

test('renders each feature with its index and tag', () => {
  renderLanding();
  expect(screen.getByText('01')).toBeInTheDocument();
  expect(screen.getByText('pair')).toBeInTheDocument();
  expect(screen.getByText('Remote pair programming')).toBeInTheDocument();
});

test('the bottom CTA is also a real link, and the footer shows the 2026 copyright', () => {
  renderLanding();
  const links = screen.getAllByRole('link', { name: /create new room/i });
  expect(links.length).toBe(2); // hero CTA + bottom CTA
  expect(screen.getByText('© 2026 CodeShare')).toBeInTheDocument();
});
