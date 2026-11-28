import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccessDenied from './AccessDenied';
import { emitAuthStateChange, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

// AccessDenied renders a react-router <Link> (matching NotFound.tsx's
// convention -- see NotFound.tsx -- so a click on "Back to home" is an
// instant client-side history swap in production, not a full page reload),
// so every render here needs a Router context, same as Header.test.tsx's
// renderHeader() wrapping in <MemoryRouter>.
function renderAccessDenied() {
  return render(
    <MemoryRouter>
      <AccessDenied />
    </MemoryRouter>,
  );
}

describe('AccessDenied', () => {
  test('shows the private-room message', () => {
    renderAccessDenied();
    expect(screen.getByText(/this room is private/i)).toBeInTheDocument();
  });

  test('offers a login prompt for an anonymous visitor', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    renderAccessDenied();
    expect(await screen.findByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('does not offer a login prompt for a different logged-in user', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-2', email: 'x@y.com', is_anonymous: false } });
    renderAccessDenied();
    await screen.findByText(/this room is private/i);
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  test('clicking Log in opens the auth modal', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    renderAccessDenied();
    await userEvent.click(await screen.findByRole('button', { name: /log in/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
