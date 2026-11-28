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

// Shared defaults, extended (not redefined) by the privacy/account tests
// below -- isPrivate/isOwner/onTogglePrivacy default to the "nothing new to
// see" shape (not the owner, not private) so every pre-existing test in this
// file keeps rendering exactly what it did before those props existed.
const baseProps: HeaderProps = {
  roomId: 'abcd-1234',
  tabBar: <TabBar tabs={DEFAULT_TABS} toggleTab={() => {}} />,
  users: [],
  currentUserId: null,
  name: '',
  onNameChange: () => {},
  onRun: () => {},
  exportContent: { html: '', css: '', js: '' },
  isPrivate: false,
  isOwner: false,
  isAnonymous: false,
  onTogglePrivacy: () => {},
  onMakePrivate: () => {},
};

function buildTree(overrides: Partial<HeaderProps> = {}) {
  const props: HeaderProps = { ...baseProps, ...overrides };
  return (
    <MemoryRouter initialEntries={['/code/abcd-1234']}>
      <ThemeProvider>
        <Header {...props} />
      </ThemeProvider>
    </MemoryRouter>
  );
}

function renderHeader(overrides: Partial<HeaderProps> = {}) {
  return render(buildTree(overrides));
}

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: /^menu$/i }));
  return screen.findByRole('menu');
}

async function pick(item: RegExp) {
  await openMenu();
  await userEvent.click(await screen.findByRole('menuitem', { name: item }));
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

  await pick(/copy room link/i);

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

  await pick(/copy room link/i);

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

  await pick(/copy room link/i);

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

    await pick(/start react app/i);

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('?type=react'), '_blank');
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining(`${window.location.origin}/code/`), '_blank');
    // Never the current tab/session.
    expect(window.location.pathname).toBe(pathBefore);
  });

  test('in a React room, offers "Start a new JS App" and opens a new Web session (no ?type=react) in a new tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    renderHeader({ exportContent: { sessionType: 'react', appJsx: '', componentsJsx: '', reactCss: '' } });

    await pick(/start a new js app/i);

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url, target] = openSpy.mock.calls[0];
    expect(url as string).not.toContain('?type=react');
    expect(target).toBe('_blank');
  });
});

test('shows a toast naming the exported file', async () => {
  renderHeader({ exportContent: { html: '<p>hi</p>', css: '', js: '' } });

  await pick(/html file/i);

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

describe('room menu', () => {
  function setMobile(isMobile: boolean) {
    mockMatchMedia((query) => (query.includes('max-width: 759px') ? isMobile : false));
  }

  test.each([
    ['desktop', false],
    ['mobile', true],
  ])('on %s, secondary actions live only in the menu; Run and presence stay in the bar', async (_label, isMobile) => {
    setMobile(isMobile);
    renderHeader();
    expect(screen.queryByRole('button', { name: /^export$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^theme/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start react app/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle(/copy room link/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^run/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /users in this session/i })).toBeInTheDocument();

    const menu = await openMenu();
    for (const name of [/copy room link/i, /theme/i, /html file/i, /zip file/i, /start react app/i]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
  });

  test('on mobile the header carries no pane tabs (the bottom bar has them)', () => {
    setMobile(true);
    renderHeader({ tabBar: <div data-testid="custom-tab-bar" /> });
    expect(screen.queryByTestId('custom-tab-bar')).not.toBeInTheDocument();
  });

  test('Theme opens the theme drawer and closes the menu', async () => {
    renderHeader();
    await pick(/theme/i);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /theme/i })).not.toBeInTheDocument();
  });

  test('Escape closes the menu', async () => {
    renderHeader();
    await openMenu();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  test('hides the account section until auth has resolved, so nobody sees a flash of "Log in"', async () => {
    renderHeader();
    const menu = await openMenu();
    expect(within(menu).queryByRole('menuitem', { name: /log in/i })).not.toBeInTheDocument();
  });
});

describe('owner-only privacy switch', () => {
  test('only the owner gets the switch', () => {
    const { rerender } = renderHeader({ isPrivate: true, isOwner: false });
    expect(screen.queryByRole('switch', { name: /private room/i })).not.toBeInTheDocument();

    rerender(buildTree({ isPrivate: true, isOwner: true }));
    expect(screen.getByRole('switch', { name: /private room/i })).toBeChecked();
  });

  test('shows the current state as text, not just as a colour', () => {
    const { rerender } = renderHeader({ isOwner: true, isPrivate: false });
    expect(screen.getByRole('switch', { name: /private room/i })).toHaveTextContent('Public');
    rerender(buildTree({ isOwner: true, isPrivate: true }));
    expect(screen.getByRole('switch', { name: /private room/i })).toHaveTextContent('Private');
  });

  test('clicking it calls onTogglePrivacy', async () => {
    const onTogglePrivacy = vi.fn();
    renderHeader({ isPrivate: true, isOwner: true, onTogglePrivacy });
    await userEvent.click(screen.getByRole('switch', { name: /private room/i }));
    expect(onTogglePrivacy).toHaveBeenCalledOnce();
  });
});

describe('anonymous visitors', () => {
  test('the anonymous creator of a room gets the switch, and it opens signup instead of toggling', async () => {
    const onTogglePrivacy = vi.fn();
    renderHeader({ isOwner: true, isAnonymous: true, onTogglePrivacy });
    await userEvent.click(screen.getByRole('switch', { name: /private room/i }));
    expect(await screen.findByRole('heading', { name: /sign up/i })).toBeInTheDocument();
    expect(onTogglePrivacy).not.toHaveBeenCalled();
  });

  test('an anonymous visitor who did not create the room gets no switch', () => {
    renderHeader({ isOwner: false, isAnonymous: true });
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});

describe('private-mode nudge', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('slides in for the owner of a public room, pointing at the privacy control', async () => {
    renderHeader({ isOwner: true, isAnonymous: true });
    const nudge = await screen.findByRole('dialog', { name: /private mode/i }, { timeout: 3000 });
    expect(nudge).toHaveTextContent(/only you can open it/i);
  });

  test('"Got it" dismisses it for good (remembered in this browser)', async () => {
    const { unmount } = renderHeader({ isOwner: true, isAnonymous: false });
    await screen.findByRole('dialog', { name: /private mode/i }, { timeout: 3000 });
    await userEvent.click(screen.getByRole('button', { name: /got it/i }));
    expect(screen.queryByRole('dialog', { name: /private mode/i })).not.toBeInTheDocument();
    unmount();
    renderHeader({ isOwner: true, isAnonymous: false });
    await new Promise((r) => setTimeout(r, 1600));
    expect(screen.queryByRole('dialog', { name: /private mode/i })).not.toBeInTheDocument();
  });

  test('using the privacy switch also counts as seen', async () => {
    renderHeader({ isOwner: true, isAnonymous: false, onTogglePrivacy: vi.fn() });
    await screen.findByRole('dialog', { name: /private mode/i }, { timeout: 3000 });
    await userEvent.click(screen.getByRole('switch', { name: /private room/i }));
    expect(screen.queryByRole('dialog', { name: /private mode/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('codeshare.privateModeNudgeSeen')).toBe('1');
  });

  test('is not shown to someone who does not own the room, or when the room is already private', async () => {
    const { rerender } = renderHeader({ isOwner: false, isAnonymous: true });
    await new Promise((r) => setTimeout(r, 1600));
    expect(screen.queryByRole('dialog', { name: /private mode/i })).not.toBeInTheDocument();
    rerender(buildTree({ isOwner: true, isAnonymous: false, isPrivate: true }));
    await new Promise((r) => setTimeout(r, 1600));
    expect(screen.queryByRole('dialog', { name: /private mode/i })).not.toBeInTheDocument();
  });
});
