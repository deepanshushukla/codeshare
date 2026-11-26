import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccessDenied from './AccessDenied';
import { emitAuthStateChange, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('AccessDenied', () => {
  test('shows the private-room message', () => {
    render(<AccessDenied />);
    expect(screen.getByText(/this room is private/i)).toBeInTheDocument();
  });

  test('offers a login prompt for an anonymous visitor', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    render(<AccessDenied />);
    expect(await screen.findByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('does not offer a login prompt for a different logged-in user', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-2', email: 'x@y.com', is_anonymous: false } });
    render(<AccessDenied />);
    await screen.findByText(/this room is private/i);
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  test('clicking Log in opens the auth modal', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    render(<AccessDenied />);
    await userEvent.click(await screen.findByRole('button', { name: /log in/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
