import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccountMenu from './AccountMenu';
import { emitAuthStateChange, logout, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

function renderMenu() {
  return render(<MemoryRouter><AccountMenu /></MemoryRouter>);
}

describe('AccountMenu', () => {
  test('logged out (anonymous): shows a Log in trigger that opens AuthModal', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /log in/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('logged in: shows the account email and a menu with My Rooms and Log out', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'me@example.com', is_anonymous: false } });
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /me@example.com/i }));
    expect(screen.getByRole('menuitem', { name: /my rooms/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  test('logged in: clicking Log out calls logout()', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'me@example.com', is_anonymous: false } });
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /me@example.com/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
