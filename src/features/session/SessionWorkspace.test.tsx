import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SessionWorkspace from './SessionWorkspace';
import { ThemeProvider } from '../theme/ThemeProvider';
import { getChannels, mockConfig, resetSupabaseMock, soleChannel } from '../../test/supabaseMock';

// Shared mock, which reproduces the two SDK behaviours the old bespoke stubs
// got wrong: channel() dedupes by topic, and a presence binding added after
// subscribe() throws. See src/test/supabaseMock.ts.
vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

const realMatchMedia = window.matchMedia;

// Drives useBreakpoint() off a single predicate (same helper shape as
// Header.test.tsx). Everything else that consults matchMedia here
// (ThemeProvider's reduced-motion/color-scheme queries) answers false, which
// is the inert default.
function setMobile(isMobile: boolean) {
  window.matchMedia = vi.fn(
    (query: string) =>
      ({
        matches: query.includes('max-width: 759px') ? isMobile : false,
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

// Same as setMobile(), but keeps the created MediaQueryLists so a test can
// flip the viewport *after* mount and actually fire useBreakpoint()'s change
// listener -- which is what a real window resize across 760px does.
function setMobileResizable(initial: boolean) {
  const lists: { media: string; matches: boolean; listeners: (() => void)[] }[] = [];
  let mobile = initial;
  window.matchMedia = vi.fn((query: string) => {
    const list = {
      media: query,
      matches: query.includes('max-width: 759px') ? mobile : false,
      listeners: [] as (() => void)[],
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => list.listeners.push(listener),
      removeEventListener: (_type: string, listener: () => void) => {
        list.listeners = list.listeners.filter((l) => l !== listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
    lists.push(list);
    return list as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;

  return (next: boolean) => {
    mobile = next;
    for (const list of lists) {
      if (!list.media.includes('max-width: 759px')) continue;
      list.matches = next;
      list.listeners.slice().forEach((listener) => listener());
    }
  };
}

beforeEach(() => {
  resetSupabaseMock();
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

// The mobile bottom tab bar and the (CSS-hidden-on-mobile, but still
// rendered) desktop tab row in the Header both expose buttons named
// HTML/CSS/JS/Console/Output, so mobile assertions must be scoped to the
// bottom bar's landmark rather than using a bare screen query.
function mobileTabBar() {
  return within(screen.getByRole('navigation', { name: 'Panes' }));
}

// ThemeProvider is required, not decorative: the redesigned Header renders
// ThemeButton/ThemeDrawer, and useTheme() throws outside a provider (App.tsx
// wraps every route in one).
function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/code/abc']}>
      <ThemeProvider>
        <SessionWorkspace sessionId="abc" />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

test('typing in the JS editor calls updateField with the new value', async () => {
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  const editor = screen.getByLabelText('JS editor');
  // Focus directly and skip userEvent's own click-to-focus step: with the
  // Console panel's Separator now also present by default (Task 9), a real
  // click lands on react-resizable-panels' Group-level pointerdown listener,
  // which does its own hit-testing via getBoundingClientRect() to decide
  // whether the click is near a resize separator. jsdom has no real layout,
  // so every element reports a degenerate (0,0,0,0) rect, which makes that
  // hit-test treat any click inside the Group as hitting the separator and
  // steals focus there instead of the editor. Focusing programmatically
  // avoids dispatching the pointer events that trigger this jsdom-only
  // ambiguity; it does not change what's being verified (that typing drives
  // onChange/updateField).
  editor.focus();
  await userEvent.type(editor, 'x', { skipClick: true });
  // This jest-dom version's toHaveValue() compares with strict equality and
  // does not support asymmetric matchers (e.g. expect.stringContaining), so
  // assert the exact value instead -- the mocked session starts with an
  // empty js field, so after typing 'x' the controlled value is just 'x'.
  expect(editor).toHaveValue('x');
});

test('subscribes to exactly one realtime channel for the session', async () => {
  renderWorkspace();
  await waitFor(() => expect(getChannels()).toHaveLength(1));
  const channel = soleChannel();
  expect(channel.topic).toBe('session:abc');
  expect(channel.subscribe).toHaveBeenCalledTimes(1);
  // Both concerns live on the one channel; reaching this line also proves the
  // presence binding was registered before subscribe() (the mock throws
  // otherwise, exactly like the real SDK).
  expect(channel.bindingsOfType('broadcast')).toHaveLength(1);
  expect(channel.bindingsOfType('presence')).toHaveLength(1);
});

test('keeps the sandboxed output iframe mounted in the default js+console layout, so Run and the REPL work', async () => {
  renderWorkspace();
  // Default tabs are js + console, Output off -- the Output pane is not shown,
  // but the iframe that actually executes code must still exist, or Run and
  // the Console REPL are silent no-ops (which is what they used to be).
  const iframe = await waitFor(() => screen.getByTitle<HTMLIFrameElement>('Output'));
  expect(screen.queryByRole('button', { name: 'Output' })).toBeInTheDocument();

  // jsdom does not load srcdoc content, so fire the load event the browser
  // would fire; the point under test is the onLoad -> iframeWindowRef -> REPL
  // wiring, not jsdom's iframe loading.
  fireEvent.load(iframe);
  const frameWindow = iframe.contentWindow;
  expect(frameWindow).not.toBeNull();
  const postMessage = vi.spyOn(frameWindow as Window, 'postMessage');

  const input = screen.getByLabelText('Console input');
  // skipClick + manual focus for the same jsdom/react-resizable-panels reason
  // documented in the editor test above.
  input.focus();
  await userEvent.type(input, 'alert(1){Enter}', { skipClick: true });

  expect(postMessage).toHaveBeenCalledWith({ type: 'repl', code: 'alert(1)' }, '*');
});

test('Alt+1 toggles the HTML pane via the real toggleTab wired through Header', async () => {
  renderWorkspace();
  // Default tabs are js + console; html starts closed.
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  expect(screen.queryByLabelText('HTML editor')).not.toBeInTheDocument();

  fireEvent.keyDown(window, { code: 'Digit1', altKey: true });

  await waitFor(() => expect(screen.getByLabelText('HTML editor')).toBeInTheDocument());
});

test('desktop renders the multi-pane layout and no mobile tab bar', async () => {
  setMobile(false);
  renderWorkspace();
  // Default tabs are js + console: both panes are visible at once, which is
  // the whole point of the desktop layout.
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Panes' })).not.toBeInTheDocument();
});

test('mobile renders only the pane matching mobileTab, plus a 5-segment tab bar', async () => {
  setMobile(true);
  renderWorkspace();
  // mobileTab defaults to 'js' -- one pane, not the desktop js+console pair.
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  expect(screen.queryByLabelText('HTML editor')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('CSS editor')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Console input')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();

  expect(mobileTabBar().getAllByRole('button')).toHaveLength(5);
  for (const label of ['HTML', 'CSS', 'JS', 'Console', 'Output']) {
    expect(mobileTabBar().getByRole('button', { name: label })).toBeInTheDocument();
  }
});

test('mobile tab bar switches which single pane is visible', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());

  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Console' }));
  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByLabelText('JS editor')).not.toBeInTheDocument();

  fireEvent.click(mobileTabBar().getByRole('button', { name: 'HTML' }));
  expect(screen.getByLabelText('HTML editor')).toBeInTheDocument();
  expect(screen.queryByLabelText('Console input')).not.toBeInTheDocument();
});

test('mobile Run switches to Output every time it is pressed, not just the first', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());

  // OutputPane's reload button only exists in the *visible* Output pane --
  // the off-screen mount renders the bare OutputFrame with no chrome -- so it
  // is the marker for "Output is the pane on screen".
  //
  // Three presses, each from a different editor tab: a "switch only once"
  // implementation (a one-shot ref/effect guard) fails on the second pass.
  // The companion stale-closure failure mode -- handleRun reading a
  // `mobileTab` captured at creation time -- is what the Console test below
  // catches, since a stale 'js' would wrongly switch away from Console.
  for (const from of ['JS', 'CSS', 'HTML'] as const) {
    fireEvent.click(mobileTabBar().getByRole('button', { name: from }));
    expect(screen.getByLabelText(`${from} editor`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByTitle('Output')).toBeInTheDocument();
    expect(screen.queryByLabelText(`${from} editor`)).not.toBeInTheDocument();
  }
});

test('mobile Run from the Console pane stays on Console (it is not an editor tab)', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Console' }));

  fireEvent.click(screen.getByRole('button', { name: 'Run' }));

  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
});

test('mobile keeps the sandboxed iframe mounted off-screen while Console is the visible pane', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Console' }));

  // Console is the one visible pane, so Output is not on screen -- but the
  // iframe that executes code has to exist anyway, or the REPL is a silent
  // no-op (the bug the desktop off-screen mount already guards against).
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
  expect(iframe.closest('[aria-hidden="true"]')).not.toBeNull();

  fireEvent.load(iframe);
  const frameWindow = iframe.contentWindow;
  expect(frameWindow).not.toBeNull();
  const postMessage = vi.spyOn(frameWindow as Window, 'postMessage');

  const input = screen.getByLabelText('Console input');
  input.focus();
  await userEvent.type(input, 'alert(1){Enter}', { skipClick: true });

  expect(postMessage).toHaveBeenCalledWith({ type: 'repl', code: 'alert(1)' }, '*');
});

test('resizing from mobile up to desktop restores the untouched multi-pane layout', async () => {
  const resize = setMobileResizable(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  // Move off the default mobile pane first, to prove `mobileTab` does not
  // leak into the desktop layout.
  fireEvent.click(mobileTabBar().getByRole('button', { name: 'HTML' }));
  expect(screen.queryByLabelText('JS editor')).not.toBeInTheDocument();

  await act(async () => {
    resize(false);
  });

  // `tabs` was never written to while mobile, so the desktop layout comes
  // back as js + console -- not as the single HTML pane mobile was showing.
  expect(screen.getByLabelText('JS editor')).toBeInTheDocument();
  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByLabelText('HTML editor')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Panes' })).not.toBeInTheDocument();
});

test('surfaces a failed anonymous sign-in instead of silently staying signed out', async () => {
  mockConfig.signInError = new Error('anonymous sign-in failed: Anonymous sign-ins are disabled');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    renderWorkspace();
    expect(await screen.findByRole('status')).toHaveTextContent(/Couldn't sign in/);
    expect(consoleError).toHaveBeenCalled();
    // No identity means no channel at all -- which is exactly why the user
    // needs to be told rather than left with a silently dead page.
    expect(getChannels()).toHaveLength(0);
  } finally {
    consoleError.mockRestore();
  }
});
