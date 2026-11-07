import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SessionRoute from './SessionRoute';
import { useSessionType } from '../features/session/useSessionType';

// SessionRoute's only job is to resolve a session's type and pick a
// workspace -- it is not responsible for anything SessionWorkspace or
// ReactSessionWorkspace do internally (those have their own, much heavier
// test suites requiring a Supabase mock and a matchMedia stub). Mocking both
// workspace components down to a single recognizable marker keeps this file
// a routing/branching test, not an integration test of the workspaces.
vi.mock('../features/session/useSessionType');
vi.mock('../features/session/SessionWorkspace', () => ({
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="web-workspace">index.html ({sessionId})</div>
  ),
}));
vi.mock('../features/session/ReactSessionWorkspace', () => ({
  default: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="react-workspace">App.jsx ({sessionId})</div>
  ),
}));

const mockedUseSessionType = vi.mocked(useSessionType);

// Without this, test 4's `toHaveBeenCalledWith` assertion would see every
// prior test's calls too (vi.mock's module-level mock persists call history
// across tests in the same file) -- harmless today since the last call
// always happens to be the one each test cares about, but a reorder or an
// added call-count assertion would silently start reading stale calls.
beforeEach(() => {
  vi.clearAllMocks();
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/code/:sessionId" element={<SessionRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('renders SessionWorkspace when the resolved type is web', () => {
  mockedUseSessionType.mockReturnValue({ sessionType: 'web', loading: false });
  renderAt('/code/abc');
  expect(screen.getByTestId('web-workspace')).toBeInTheDocument();
  expect(screen.queryByTestId('react-workspace')).not.toBeInTheDocument();
});

test('renders ReactSessionWorkspace when the resolved type is react', () => {
  mockedUseSessionType.mockReturnValue({ sessionType: 'react', loading: false });
  renderAt('/code/abc');
  expect(screen.getByTestId('react-workspace')).toBeInTheDocument();
  expect(screen.queryByTestId('web-workspace')).not.toBeInTheDocument();
});

test('renders nothing (not NotFound, not either workspace) while loading', () => {
  mockedUseSessionType.mockReturnValue({ sessionType: null, loading: true });
  renderAt('/code/abc');
  expect(screen.queryByTestId('web-workspace')).not.toBeInTheDocument();
  expect(screen.queryByTestId('react-workspace')).not.toBeInTheDocument();
  expect(screen.queryByText('404')).not.toBeInTheDocument();
});

test('reads the type hint from a ?type=react query param for a not-yet-existing session', () => {
  mockedUseSessionType.mockReturnValue({ sessionType: 'react', loading: false });
  renderAt('/code/newid?type=react');
  expect(mockedUseSessionType).toHaveBeenCalledWith('newid', 'react');
});
