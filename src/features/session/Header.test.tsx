import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Header from './Header';
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
    tabs: DEFAULT_TABS,
    toggleTab: () => {},
    users: [],
    currentUserId: null,
    name: '',
    onNameChange: () => {},
    onRun: () => {},
    html: '',
    css: '',
    js: '',
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

    expect(screen.getByRole('button', { name: /users in this session/i })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
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

test('Alt+1-5 still toggles the matching pane after the redesign', () => {
  const toggleTab = vi.fn();
  renderHeader({ toggleTab });

  fireEvent.keyDown(window, { code: 'Digit1', altKey: true });
  fireEvent.keyDown(window, { code: 'Digit3', altKey: true });
  fireEvent.keyDown(window, { code: 'Digit5', altKey: true });

  expect(toggleTab.mock.calls.map(([key]) => key)).toEqual(['html', 'js', 'output']);
});

test('shows a toast naming the exported file', async () => {
  renderHeader({ html: '<p>hi</p>' });

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

test('opens the theme drawer from the header theme button', async () => {
  renderHeader();

  await userEvent.click(screen.getByRole('button', { name: /^theme:/i }));

  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
