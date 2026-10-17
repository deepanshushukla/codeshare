import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SessionWorkspace from './SessionWorkspace';
import { getChannels, mockConfig, resetSupabaseMock, soleChannel } from '../../test/supabaseMock';

// Shared mock, which reproduces the two SDK behaviours the old bespoke stubs
// got wrong: channel() dedupes by topic, and a presence binding added after
// subscribe() throws. See src/test/supabaseMock.ts.
vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/code/abc']}>
      <SessionWorkspace sessionId="abc" />
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
