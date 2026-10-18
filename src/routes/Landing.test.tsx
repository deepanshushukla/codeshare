import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { RoomTransitionProvider } from '../features/transition/RoomTransitionProvider';
import RoomTransitionOverlay from '../features/transition/RoomTransitionOverlay';
import Landing from './Landing';

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

test('the Create New Room link points at /code/<id>', () => {
  renderLanding();
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('renders the theme button and opens the theme drawer', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(screen.getByRole('heading', { name: /theme/i })).toBeInTheDocument(); // drawer title
});

test('keeps the CTA a real link to the new room', () => {
  renderLanding();
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('a plain click starts the transition instead of navigating immediately', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('link', { name: /^create new room$/i }));
  expect(screen.getByText(/\/r\//)).toBeInTheDocument(); // overlay now showing /r/{id}
});

test('a ctrl-click is left alone (native new-tab behavior, no preventDefault)', () => {
  renderLanding();
  const link = screen.getByRole('link', { name: /^create new room$/i });
  const event = createEvent.click(link, { ctrlKey: true });
  const prevented = !fireEvent(link, event);
  expect(prevented).toBe(false);
});

test('pressing N starts the transition', () => {
  renderLanding();
  fireEvent.keyDown(window, { key: 'n' });
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});

test('Ctrl+N / Cmd+N are left alone (native "new window" shortcut, not our transition)', () => {
  renderLanding();
  fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
  expect(screen.queryByText(/\/r\//)).not.toBeInTheDocument();
  fireEvent.keyDown(window, { key: 'N', metaKey: true });
  expect(screen.queryByText(/\/r\//)).not.toBeInTheDocument();
});

test('rise-in and mark-sweep animations respect --play (prefers-reduced-motion)', () => {
  const scssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'Landing.module.scss');
  const css = readFileSync(scssPath, 'utf8');

  for (const selector of ['.riseSpan', '.highlight', '.eyebrow', '.heroSubtitle', '.heroActions']) {
    expect(extractRuleBlock(css, selector)).toContain('animation-play-state: var(--play);');
  }
});

test('renders the ticker words', () => {
  renderLanding();
  expect(screen.getAllByText('JavaScript').length).toBeGreaterThan(0);
});

test('renders each feature with its index and tag', () => {
  renderLanding();
  expect(screen.getByText('01')).toBeInTheDocument();
  expect(screen.getByText('pair')).toBeInTheDocument();
  expect(screen.getByText('Remote pair programming')).toBeInTheDocument();
});
