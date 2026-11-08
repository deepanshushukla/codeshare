import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
import TabBar from './TabBar';
import { ThemeProvider } from '../theme/ThemeProvider';
import { DEFAULT_TABS } from './useTabsQueryParam';
import type { PresenceUser } from './usePresence';

// file-saver reaches for URL.createObjectURL / a real download, neither of
// which exists in jsdom -- the point of the export tests here is the
// onExported -> showToast wiring, not the download itself.
const saveAs = vi.fn();
vi.mock('file-saver', () => ({ saveAs: (...args: unknown[]) => saveAs(...args) }));

const realMatchMedia = window.matchMedia;

// Drives useBreakpoint() (and, harmlessly, ThemeProvider's reduced-motion
// query) off a single predicate, so a test can say "this is a wide viewport"
// without hand-rolling a MediaQueryList.
function mockMatchMedia(matchesFor: (query: string) => boolean) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: matchesFor(query),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  ) as unknown as typeof window.matchMedia;
}

function setWide(isWide: boolean) {
  mockMatchMedia((query) => (query.includes('min-width: 1100px') ? isWide : false));
}

type HeaderProps = Parameters<typeof Header>[0];

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = {
    roomId: 'abcd-1234',
    tabBar: <TabBar tabs={DEFAULT_TABS} toggleTab={() => {}} />,
    users: [],
    currentUserId: null,
    name: '',
    onNameChange: () => {},
    onRun: () => {},
    exportContent: { html: '', css: '', js: '' },
    ...overrides,
  };
  return render(
    <MemoryRouter initialEntries={['/code/abcd-1234']}>
      <ThemeProvider>
        <Header {...props} />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

const USERS: PresenceUser[] = [
  { userId: 'me', name: 'Ava', status: 'online' },
  { userId: 'them', name: 'Kenji', status: 'online' },
];

beforeEach(() => {
  saveAs.mockClear();
  setWide(false);
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
  vi.useRealTimers();
});

test('the logo links home', () => {
  renderHeader();
  expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
});

test('copies the room link and shows a toast', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  renderHeader({ roomId: 'abcd-1234' });

  fireEvent.click(screen.getByTitle(/copy room link/i));

  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('abcd-1234'));
  // A real, working route into this app -- not the handoff's cosmetic "/r/".
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/code/abcd-1234'));
  expect(await screen.findByText(/room link copied/i)).toBeInTheDocument();
});

test('tells the user when copying the room link failed instead of claiming success', async () => {
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockRejectedValue(new Error('denied')),
    },
  });
  renderHeader();

  fireEvent.click(screen.getByTitle(/copy room link/i));

  expect(await screen.findByText(/couldn't copy/i)).toBeInTheDocument();
  expect(screen.queryByText(/room link copied/i)).not.toBeInTheDocument();
});

test.each([
  // Below 760px SessionWorkspace renders the ~76px MobileTabBar along the
  // bottom edge; at the desktop 28px offset the toast paints over its middle
  // segments, so it has to be lifted clear of it.
  { label: 'clears the mobile bottom tab bar', isMobile: true, bottom: '96px' },
  { label: 'sits just above the desktop status bar', isMobile: false, bottom: '28px' },
])('the toast $label', async ({ isMobile, bottom }) => {
  mockMatchMedia((query) => (query.includes('max-width: 759px') ? isMobile : false));
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  renderHeader();

  fireEvent.click(screen.getByTitle(/copy room link/i));

  // Toast positions itself with an inline `bottom`, so the rendered style is
  // the honest assertion -- Header picking the right offset is the behavior.
  const toast = (await screen.findByText(/room link copied/i)).parentElement;
  expect(toast).toHaveStyle({ bottom });
});

describe('presence trigger', () => {
  test('shows an overlapping avatar per present user at wide widths, with the current user styled distinctly', () => {
    setWide(true);
    renderHeader({ users: USERS, currentUserId: 'me', name: 'Ava' });

    expect(screen.getByText('AV')).toBeInTheDocument();
    expect(screen.getByText('KE')).toBeInTheDocument();
    // The current user takes the live theme accent; everyone else gets a
    // hashed color from avatarColorFor().
    expect(screen.getByText('AV')).toHaveStyle({ background: 'var(--acc)' });
    expect(screen.getByText('KE')).not.toHaveStyle({ background: 'var(--acc)' });
  });

  test('falls back to the compact users-count trigger below 1100px', () => {
    setWide(false);
    renderHeader({ users: [{ userId: 'a', name: 'A', status: 'online' }] });

    const trigger = screen.getByRole('button', { name: /users in this session/i });
    expect(trigger).toBeInTheDocument();
    // Scoped to the trigger: the pane tabs carry Alt+N badges that also render
    // a bare "1".
    expect(within(trigger).getByText('1')).toBeInTheDocument();
    expect(screen.queryByText('A')).not.toBeInTheDocument();
  });

  test('caps the stack and keeps default-named users distinguishable', () => {
    setWide(true);
    renderHeader({
      users: [
        { userId: 'a', name: 'User_ab12', status: 'online' },
        { userId: 'b', name: 'User_cd34', status: 'online' },
        { userId: 'c', name: 'Mei Chen', status: 'online' },
        { userId: 'd', name: 'Kenji', status: 'online' },
        { userId: 'e', name: 'Sam', status: 'online' },
        { userId: 'f', name: 'Zoe', status: 'online' },
      ],
      currentUserId: 'a',
      name: 'User_ab12',
    });

    // `User_ab12`/`User_cd34` would both read "US" on a naive first-two-chars
    // rule -- the whole room is default-named until someone renames.
    expect(screen.getByText('UA')).toBeInTheDocument();
    expect(screen.getByText('UC')).toBeInTheDocument();
    expect(screen.getByText('MC')).toBeInTheDocument();
    expect(screen.getByText('KE')).toBeInTheDocument();
    // Beyond four avatars the rest collapse into a +N chip (all six are still
    // listed in the dropdown).
    expect(screen.queryByText('SA')).not.toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  test.each([
    ['wide avatar stack', true],
    ['compact fallback', false],
  ])('renaming yourself works from the %s trigger', async (_label, isWide) => {
    setWide(isWide);
    const onNameChange = vi.fn();
    renderHeader({ users: USERS, currentUserId: 'me', name: 'Ava', onNameChange });

    await userEvent.click(screen.getByRole('button', { name: /users in this session/i }));

    const input = await screen.findByLabelText(/display name \(yours\)/i);
    fireEvent.change(input, { target: { value: 'Avax' } });
    expect(onNameChange).toHaveBeenCalledWith('Avax');
  });
});

test('renders whatever is passed as tabBar', () => {
  renderHeader({ tabBar: <div data-testid="custom-tab-bar" /> });
  expect(screen.getByTestId('custom-tab-bar')).toBeInTheDocument();
});

describe('new session control', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('in a Web room, offers "Start React App" and opens a new React session in a new tab without navigating the current one', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    // MemoryRouter never touches the browser's real history/location (see
    // useTabsQueryParam.test.ts), so the honest way to prove "the current tab
    // didn't navigate" here is that jsdom's own window.location is untouched
    // by the click -- not a particular path, which this render never sets.
    const pathBefore = window.location.pathname;
    renderHeader({ exportContent: { html: '', css: '', js: '' } });

    await userEvent.click(screen.getByRole('button', { name: /start react app/i }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('?type=react'), '_blank');
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining(`${window.location.origin}/code/`), '_blank');
    // Never the current tab/session.
    expect(window.location.pathname).toBe(pathBefore);
  });

  test('in a React room, offers "Start a new JS App" and opens a new Web session (no ?type=react) in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderHeader({ exportContent: { sessionType: 'react', appJsx: '', componentsJsx: '', reactCss: '' } });

    await userEvent.click(screen.getByRole('button', { name: /start a new js app/i }));

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(url as string).not.toContain('?type=react');
    expect(target).toBe('_blank');
  });
});

test('shows a toast naming the exported file', async () => {
  renderHeader({ exportContent: { html: '<p>hi</p>', css: '', js: '' } });

  await userEvent.click(screen.getByRole('button', { name: /export/i }));
  await userEvent.click(await screen.findByText('HTML file'));

  await waitFor(() => expect(saveAs).toHaveBeenCalled());
  const toast = await screen.findByText(/^Exported CodeShare_.*\.html$/);
  expect(toast).toBeInTheDocument();
});

test('runs the code and flashes the Run button', () => {
  const onRun = vi.fn();
  const { container } = renderHeader({ onRun });

  expect(container.querySelector('[data-run-flash]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^run$/i }));

  expect(onRun).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-run-flash]')).not.toBeNull();
});

test('Ctrl+Enter runs and flashes too, not just the click', () => {
  const onRun = vi.fn();
  const { container } = renderHeader({ onRun });

  fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });

  expect(onRun).toHaveBeenCalledTimes(1);
  // The keyboard is the more frequent path; without this it fired silently.
  expect(container.querySelector('[data-run-flash]')).not.toBeNull();
});

describe('pane tabs in the header', () => {
  test('carry an Alt+N badge without it leaking into the accessible name', () => {
    renderHeader();

    // The badge digit is decoration for the shortcut Header owns; the button
    // must still be addressable as "Output", not "5 Output" (which is what
    // SessionWorkspace's own tests, and any screen-reader user, rely on).
    const output = screen.getByRole('button', { name: 'Output' });
    expect(output).toHaveAttribute('aria-keyshortcuts', 'Alt+5');
    expect(output).toHaveTextContent('5');
  });

  // jsdom loads no CSS and computes no layout, so the actual overflow
  // behavior below cannot be exercised here -- this asserts the declaration
  // that makes it correct, in the same source-text style as
  // src/styles/reducedMotion.test.ts.
  test('the tab row stays scrollable to its left end when the header is narrow', () => {
    const scss = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'Header.module.scss'),
      'utf8',
    );
    const center = scss.slice(scss.indexOf('.center {'), scss.indexOf('.actions {'));

    // `justify-content: center` would split the *negative* free space of an
    // overflowing row across both sides, and no scroll gesture can reach a
    // negative scrollLeft -- the HTML/CSS/JS tabs would be clipped away for
    // good. Auto margins on the row collapse to 0 instead.
    expect(center).toContain('justify-content: flex-start;');
    expect(center).not.toContain('justify-content: center;');
    expect(center).toContain('margin-inline: auto;');
  });

  test('.center stays the header flex spacer below 760px; only its contents hide', () => {
    const scss = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'Header.module.scss'),
      'utf8',
    );
    const center = scss.slice(scss.indexOf('.center {'), scss.indexOf('.actions {'));
    // `.center` is the header's ONLY `flex: 1` child -- `.logo`, `.roomChip`
    // and `.actions` are all `flex: none`. `display: none` on the element
    // itself (what this used to do) removed the sole flexible spacer, bunching
    // every control against the left edge with dead space to the right of Run.
    // The tab row inside it is what must hide at that width, not the box.
    expect(center).toContain('flex: 1;');

    const narrow = center.slice(center.indexOf('@media (max-width: 759px)'));
    expect(narrow).toContain('display: none;');
    // The hide must live inside the `> *` child block, which starts before the
    // media query -- i.e. the media query is nested in the child rule, not a
    // direct child of `.center`.
    expect(center.indexOf('> *')).toBeLessThan(center.indexOf('@media (max-width: 759px)'));
  });

});

// Below 760px, Theme/Users/Export/New-session collapse into a single "More"
// button (MoreMenu in Header.tsx) -- the header has no overflow/wrap
// handling, so logo + room-link chip + five ~36px controls genuinely don't
// fit a common ~375-390px phone width in one horizontal row. Unlike the
// `.center` tab-row test above, `isMobile` is a real `useBreakpoint()`
// value this file already mocks via `matchMedia` (not pure CSS), so this
// IS reproducible here -- a genuine conditional-render test, not a
// source-text pin.
describe('mobile "More" menu (<760px)', () => {
  function setMobile(isMobile: boolean) {
    mockMatchMedia((query) => (query.includes('max-width: 759px') ? isMobile : false));
  }

  test('at desktop width, Theme/Users/Export/New-session render directly and there is no More button', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /^more$/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^theme:/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start react app/i })).toBeInTheDocument();
  });

  test('at mobile width, Theme/Users/Export/New-session are not directly in the header -- only the More button is', () => {
    setMobile(true);
    renderHeader();
    expect(screen.getByRole('button', { name: /^more$/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^theme:/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^export$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start react app/i })).not.toBeInTheDocument();
    // Run stays a direct, always-reachable primary action, not folded in.
    expect(screen.getByRole('button', { name: /^run/i })).toBeInTheDocument();
  });

  test('opening More reveals Theme/Users/Export/New-session; selecting Theme opens the drawer and closes the panel', async () => {
    setMobile(true);
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: /^more$/i }));
    expect(screen.getByRole('menuitem', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^export$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start react app/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('menuitem', { name: /theme/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // The panel closed along with picking Theme, not left open underneath the drawer.
    expect(screen.queryByRole('menuitem', { name: /theme/i })).not.toBeInTheDocument();
  });

  test('clicking outside the open panel closes it', async () => {
    setMobile(true);
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: /^more$/i }));
    expect(screen.getByRole('menuitem', { name: /theme/i })).toBeInTheDocument();

    await userEvent.click(document.body);
    expect(screen.queryByRole('menuitem', { name: /theme/i })).not.toBeInTheDocument();
  });

  test('pressing Escape closes the open panel', async () => {
    setMobile(true);
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: /^more$/i }));
    expect(screen.getByRole('menuitem', { name: /theme/i })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menuitem', { name: /theme/i })).not.toBeInTheDocument();
  });
});

test('opens the theme drawer from the header theme button', async () => {
  renderHeader();

  await userEvent.click(screen.getByRole('button', { name: /^theme:/i }));

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
