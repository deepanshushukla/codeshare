import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionRoute from './SessionRoute';
import { mockConfig, resetSupabaseMock } from '../test/supabaseMock';

// SessionRoute's only job is to resolve identity + access, then pick a
// workspace -- it is not responsible for anything SessionWorkspace or
// ReactSessionWorkspace do internally (those have their own, much heavier
// test suites requiring a Supabase mock and a matchMedia stub). Mocking both
// workspace components down to a single recognizable marker keeps this file
// a routing/branching test, not an integration test of the workspaces.
//
// Unlike this file's previous version (wired to the now-deleted session-type
// hook), useAuthUser and useSessionAccess are NOT mocked here -- they run for real against the
// mocked `../lib/supabase` module below, driven by `mockConfig.authSession`
// (identity) and `mockConfig.rpcData` (access), exactly like
// useAuthUser.test.ts and useSessionAccess.test.ts drive them individually.
vi.mock('../lib/supabase', () => import('../test/supabaseMock'));
vi.mock('../features/session/SessionWorkspace', () => ({
  default: ({ sessionId, nameHint }: { sessionId: string; nameHint?: string | null }) => (
    <div data-testid="web-workspace" data-name-hint={nameHint ?? ''}>index.html ({sessionId})</div>
  ),
}));
vi.mock('../features/session/ReactSessionWorkspace', () => ({
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="react-workspace">App.jsx ({sessionId})</div>
  ),
}));

beforeEach(() => {
  resetSupabaseMock();
  // Give onAuthStateChange's synchronous INITIAL_SESSION replay an
  // already-confirmed session, so useAuthUser resolves to `loading: false`
  // within the same synchronous render() instead of requiring every test to
  // call emitAuthStateChange first -- this file is about routing/branching,
  // not about auth resolution timing (useAuthUser.test.ts owns that). `u1`
  // matches the currentUserId convention useSessionAccess.test.ts uses.
  mockConfig.authSession = { user: { id: 'u1', email: null, is_anonymous: true } };
});

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[state === undefined ? path : { pathname: path, state }]}>
      <Routes>
        <Route path="/code/:sessionId" element={<SessionRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('renders SessionWorkspace when the resolved type is web', async () => {
  mockConfig.rpcData = [{ exists_: false, is_private: false, owner_id: null, session_type: null }];
  renderAt('/code/abc');
  expect(await screen.findByTestId('web-workspace')).toBeInTheDocument();
  expect(screen.queryByTestId('react-workspace')).not.toBeInTheDocument();
});

test('renders ReactSessionWorkspace when the resolved type is react', async () => {
  mockConfig.rpcData = [{ exists_: true, is_private: false, owner_id: null, session_type: 'react' }];
  renderAt('/code/abc');
  expect(await screen.findByTestId('react-workspace')).toBeInTheDocument();
  expect(screen.queryByTestId('web-workspace')).not.toBeInTheDocument();
});

test('renders nothing (not either workspace, not AccessDenied) while access is loading', () => {
  mockConfig.rpcData = [{ exists_: false, is_private: false, owner_id: null, session_type: null }];
  renderAt('/code/abc');
  // Deliberately synchronous, no `await`/`findBy*` -- useSessionAccess's
  // fetch is async, so right after render() returns, its effect has started
  // but not yet resolved (see useSessionAccess.ts's `status: 'loading'`
  // reset at the top of every run).
  expect(screen.queryByTestId('web-workspace')).not.toBeInTheDocument();
  expect(screen.queryByTestId('react-workspace')).not.toBeInTheDocument();
  expect(screen.queryByText(/this room is private/i)).not.toBeInTheDocument();
});

test('reads the type hint from a ?type=react query param for a not-yet-existing session', async () => {
  mockConfig.rpcData = [{ exists_: false, is_private: false, owner_id: null, session_type: null }];
  renderAt('/code/newid?type=react');
  expect(await screen.findByTestId('react-workspace')).toBeInTheDocument();
  expect(screen.queryByTestId('web-workspace')).not.toBeInTheDocument();
});

test('renders AccessDenied when useSessionAccess reports denied', async () => {
  mockConfig.rpcData = [{ exists_: true, is_private: true, owner_id: 'someone-else', session_type: 'web' }];
  render(
    <MemoryRouter initialEntries={['/code/room1']}>
      <Routes>
        <Route path="/code/:sessionId" element={<SessionRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByText(/this room is private/i)).toBeInTheDocument();
});

test('renders the normal workspace once access resolves to ready', async () => {
  mockConfig.rpcData = [{ exists_: true, is_private: false, owner_id: null, session_type: 'web' }];
  render(
    <MemoryRouter initialEntries={['/code/room1']}>
      <Routes>
        <Route path="/code/:sessionId" element={<SessionRoute />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    await screen
      .findByText(/this room is private/i)
      .catch(() => null),
  ).toBeNull();
  expect(screen.getByTestId('web-workspace')).toBeInTheDocument();
});

test('passes a room name from router state to the workspace as a creation hint', async () => {
  renderAt('/code/new1', { roomName: ' Snake game ' });
  expect(await screen.findByTestId('web-workspace')).toHaveAttribute('data-name-hint', 'Snake game');
});
