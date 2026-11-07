import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ReactSessionWorkspace from './ReactSessionWorkspace';
import { ThemeProvider } from '../theme/ThemeProvider';
import { getChannels, mockConfig, resetSupabaseMock, soleChannel } from '../../test/supabaseMock';

// Same shared mock as SessionWorkspace.test.tsx -- see src/test/supabaseMock.ts
// for why the dedupe-by-topic and presence-after-subscribe-throws behaviours
// are reproduced rather than stubbed away.
vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

// Captures the exact props Header forwards into ExportMenu, so the
// snake_case->camelCase rename at the ReactSessionWorkspace/Header boundary
// can be asserted directly. Driving this through a real click on Header's
// Radix dropdown (as Header.test.tsx does in isolation) is not reliable
// inside the full workspace tree: react-resizable-panels' Group installs its
// own document-level pointerdown listener for drag detection that -- per the
// jsdom-hit-testing quirk already documented in SessionWorkspace.test.tsx --
// interferes with Radix's own open/close pointer handling here, so neither
// fireEvent.click nor userEvent.click reliably opens the menu in this tree.
// Mocking the leaf component sidesteps that environment limitation entirely
// while still verifying the real prop contract.
let capturedExportProps: unknown;
vi.mock('./ExportMenu', () => ({
  default: (props: unknown) => {
    capturedExportProps = props;
    return null;
  },
}));

const realMatchMedia = window.matchMedia;

// Same helper shape as SessionWorkspace.test.tsx / Header.test.tsx.
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

// A blank-but-already-existing React row, so content starts predictably
// empty instead of racing the create-branch's non-empty starter content
// (STARTER_CONTENT_REACT in useSession.ts) against the test's own typing.
// Assigned through a separate `const` (rather than inline) so TS's
// excess-property check -- which only fires on object literals assigned
// directly -- doesn't complain about the extra react-only fields beyond
// MockSessionRow's {id,html,css,js}; see useSession.test.ts for the same
// pattern.
const BLANK_REACT_ROW = {
  id: 'abc',
  html: '',
  css: '',
  js: '',
  session_type: 'react',
  app_jsx: '',
  components_jsx: '',
  react_css: '',
};

beforeEach(() => {
  resetSupabaseMock();
  capturedExportProps = undefined;
  mockConfig.sessionRow = BLANK_REACT_ROW;
});

afterEach(() => {
  window.matchMedia = realMatchMedia;
});

// Same reasoning as SessionWorkspace.test.tsx: the mobile bottom bar and the
// (CSS-hidden-on-mobile) desktop tab row in the Header both expose buttons
// named App/Components/CSS/Console/Output, so mobile assertions must be
// scoped to the bottom bar's landmark.
function mobileTabBar() {
  return within(screen.getByRole('navigation', { name: 'Panes' }));
}

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/code/abc']}>
      <ThemeProvider>
        <ReactSessionWorkspace sessionId="abc" />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

test('typing in the Components.jsx editor calls updateField with the new value', async () => {
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  // Default tabs are appJsx + console; open componentsJsx via Alt+2 (REACT_TAB_KEYS order).
  fireEvent.keyDown(window, { code: 'Digit2', altKey: true });
  const editor = await waitFor(() => screen.getByLabelText('Components editor'));
  // Focus directly, skip userEvent's click-to-focus step -- same jsdom/
  // react-resizable-panels hit-testing issue documented in
  // SessionWorkspace.test.tsx's analogous test.
  editor.focus();
  await userEvent.type(editor, 'x', { skipClick: true });
  expect(editor).toHaveValue('x');
});

test('subscribes to exactly one realtime channel for the session', async () => {
  renderWorkspace();
  await waitFor(() => expect(getChannels()).toHaveLength(1));
  const channel = soleChannel();
  expect(channel.topic).toBe('session:abc');
  expect(channel.subscribe).toHaveBeenCalledTimes(1);
  expect(channel.bindingsOfType('broadcast')).toHaveLength(1);
  expect(channel.bindingsOfType('presence')).toHaveLength(1);
});

test('keeps the sandboxed output iframe mounted in the default appJsx+console layout, so Run and the REPL work', async () => {
  renderWorkspace();
  const iframe = await waitFor(() => screen.getByTitle<HTMLIFrameElement>('Output'));
  expect(screen.queryByRole('button', { name: 'Output' })).toBeInTheDocument();

  fireEvent.load(iframe);
  const frameWindow = iframe.contentWindow;
  expect(frameWindow).not.toBeNull();
  const postMessage = vi.spyOn(frameWindow as Window, 'postMessage');

  const input = screen.getByLabelText('Console input');
  input.focus();
  await userEvent.type(input, 'alert(1){Enter}', { skipClick: true });

  expect(postMessage).toHaveBeenCalledWith({ type: 'repl', code: 'alert(1)' }, '*');
});

test("Alt+2 toggles the Components.jsx pane via useReactTabsQueryParam's own keydown listener", async () => {
  renderWorkspace();
  // Default tabs are appJsx + console; componentsJsx starts closed.
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  expect(screen.queryByLabelText('Components editor')).not.toBeInTheDocument();

  fireEvent.keyDown(window, { code: 'Digit2', altKey: true });

  await waitFor(() => expect(screen.getByLabelText('Components editor')).toBeInTheDocument());
});

test('desktop renders the multi-pane layout and no mobile tab bar', async () => {
  setMobile(false);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Panes' })).not.toBeInTheDocument();
});

test('mobile renders only the pane matching mobileTab, plus a 5-segment tab bar', async () => {
  setMobile(true);
  renderWorkspace();
  // mobileTab defaults to 'appJsx' -- one pane, not the desktop appJsx+console pair.
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  expect(screen.queryByLabelText('Components editor')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('CSS editor')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Console input')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();

  expect(mobileTabBar().getAllByRole('button')).toHaveLength(5);
  for (const label of ['App', 'Components', 'CSS', 'Console', 'Output']) {
    expect(mobileTabBar().getByRole('button', { name: label })).toBeInTheDocument();
  }
});

test('mobile tab bar switches which single pane is visible', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());

  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Console' }));
  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByLabelText('App editor')).not.toBeInTheDocument();

  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Components' }));
  expect(screen.getByLabelText('Components editor')).toBeInTheDocument();
  expect(screen.queryByLabelText('Console input')).not.toBeInTheDocument();
});

test('mobile Run switches to Output every time it is pressed, not just the first', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());

  // Three presses, each from a different editor tab, mirroring the Web-mode
  // regression guard: a "switch only once" implementation fails on the second pass.
  for (const from of ['App', 'Components', 'CSS'] as const) {
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
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Console' }));

  fireEvent.click(screen.getByRole('button', { name: 'Run' }));

  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reload' })).not.toBeInTheDocument();
});

test('mobile keeps the sandboxed iframe mounted off-screen while Console is the visible pane', async () => {
  setMobile(true);
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Console' }));

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
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());
  fireEvent.click(mobileTabBar().getByRole('button', { name: 'Components' }));
  expect(screen.queryByLabelText('App editor')).not.toBeInTheDocument();

  await act(async () => {
    resize(false);
  });

  // `tabs` was never written to while mobile, so the desktop layout comes
  // back as appJsx + console -- not as the single Components pane mobile was showing.
  expect(screen.getByLabelText('App editor')).toBeInTheDocument();
  expect(screen.getByLabelText('Console input')).toBeInTheDocument();
  expect(screen.queryByLabelText('Components editor')).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Panes' })).not.toBeInTheDocument();
});

test('surfaces a failed anonymous sign-in instead of silently staying signed out', async () => {
  mockConfig.signInError = new Error('anonymous sign-in failed: Anonymous sign-ins are disabled');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    renderWorkspace();
    expect(await screen.findByRole('status')).toHaveTextContent(/Couldn't sign in/);
    expect(consoleError).toHaveBeenCalled();
    expect(getChannels()).toHaveLength(0);
  } finally {
    consoleError.mockRestore();
  }
});

test('Header receives exportContent in React-mode camelCase shape, not the useSession snake_case fields', async () => {
  renderWorkspace();
  await waitFor(() => expect(screen.getByLabelText('App editor')).toBeInTheDocument());

  // useSession's content fields are snake_case (app_jsx/components_jsx/
  // react_css); ExportMenu's props are camelCase (appJsx/componentsJsx/
  // reactCss) plus a sessionType discriminant. A missed rename produces
  // `undefined` for every field with no compile error -- so assert the
  // actual shape ExportMenu (mocked above) received, field by field.
  await waitFor(() =>
    expect(capturedExportProps).toMatchObject({
      sessionType: 'react',
      appJsx: '',
      componentsJsx: '',
      reactCss: '',
    }),
  );
  expect(capturedExportProps).not.toHaveProperty('app_jsx');
  expect(capturedExportProps).not.toHaveProperty('html');
});
