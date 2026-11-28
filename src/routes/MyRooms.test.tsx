import { describe, expect, test, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyRooms from './MyRooms';
import { emitAuthStateChange, from, mockConfig, resetSupabaseMock, update } from '../test/supabaseMock';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('MyRooms', () => {
  test('logged out (anonymous): prompts to log in instead of querying', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText(/log in to see your rooms/i)).toBeInTheDocument();
    expect(from).not.toHaveBeenCalled();
  });

  test('logged in: lists the owned rooms with their titles', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [
      { id: 'room1', title: 'My Todo App', is_private: true, session_type: 'react', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' },
      { id: 'room2', title: '', is_private: false, session_type: 'web', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' },
    ];
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText('My Todo App')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my todo app/i })).toHaveAttribute('href', '/code/room1');
    // An empty title falls back to a type-specific placeholder.
    expect(screen.getByRole('link', { name: /untitled web room/i })).toHaveAttribute('href', '/code/room2');
  });

  test('logged in: shows an empty state when there are no rooms', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [];
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText(/no rooms yet/i)).toBeInTheDocument();
  });

  test('logged in: a failed query shows an error instead of the empty state', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.listError = { message: 'boom' } as never;
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText(/couldn.t load your rooms/i)).toBeInTheDocument();
    expect(screen.queryByText(/no rooms yet/i)).not.toBeInTheDocument();
  });

  test('logged in: the Private switch makes a public room private', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [
      { id: 'room1', title: 'Demo', is_private: false, session_type: 'web', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' },
    ];
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    const toggle = await screen.findByRole('switch', { name: /private: demo/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(update).toHaveBeenCalledWith({ is_private: true });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
  });

  test('logged in: a refused privacy update rolls the switch back', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [
      { id: 'room1', title: 'Demo', is_private: false, session_type: 'web', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' },
    ];
    mockConfig.updateResult = { data: [], error: null };
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    const toggle = await screen.findByRole('switch', { name: /private: demo/i });
    fireEvent.click(toggle);
    expect(await screen.findByText(/couldn.t make .demo. private/i)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
