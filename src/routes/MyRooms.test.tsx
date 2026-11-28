import { describe, expect, test, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import MyRooms from './MyRooms';
import { emitAuthStateChange, from, mockConfig, resetSupabaseMock, update } from '../test/supabaseMock';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));

function LocationProbe() {
  const location = useLocation();
  const roomName = (location.state as { roomName?: string } | null)?.roomName ?? '';
  return (
    <p data-testid="location" data-room-name={roomName}>
      {location.pathname + location.search}
    </p>
  );
}

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
    // An empty title falls back to a numbered, type-specific name.
    expect(screen.getByRole('link', { name: 'Web Room 1' })).toHaveAttribute('href', '/code/room2');
  });

  test('logged in: rooms with generic titles are numbered per type, oldest first', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [
      { id: 'w2', title: 'Welcome to CodeShare 👋', is_private: false, session_type: 'web', created_at: '2026-11-03T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' },
      { id: 'r1', title: 'Welcome to CodeShare 👋', is_private: false, session_type: 'react', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' },
      { id: 'w1', title: 'Untitled Web Room', is_private: false, session_type: 'web', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-18T00:00:00Z' },
      { id: 'chosen', title: 'Welcome to CodeShare 👋', name: 'Picked Name', is_private: false, session_type: 'web', created_at: '2026-11-04T00:00:00Z', updated_at: '2026-11-21T00:00:00Z' },
      { id: 'named', title: 'Snake Game', is_private: false, session_type: 'web', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-17T00:00:00Z' },
    ];
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByRole('link', { name: 'Web Room 1' })).toHaveAttribute('href', '/code/w1');
    expect(screen.getByRole('link', { name: 'Web Room 2' })).toHaveAttribute('href', '/code/w2');
    expect(screen.getByRole('link', { name: 'React Room 1' })).toHaveAttribute('href', '/code/r1');
    expect(screen.getByRole('link', { name: 'Snake Game' })).toHaveAttribute('href', '/code/named');
    // A name chosen at creation wins, and doesn't take a number.
    expect(screen.getByRole('link', { name: 'Picked Name' })).toHaveAttribute('href', '/code/chosen');
  });

  function renderWithRoutes() {
    return render(
      <MemoryRouter initialEntries={['/my-rooms']}>
        <Routes>
          <Route path="/my-rooms" element={<MyRooms />} />
          <Route path="/code/:id" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  async function openNewRoom() {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [];
    renderWithRoutes();
    await screen.findByText(/no rooms yet/i);
    fireEvent.click(screen.getAllByRole('button', { name: /new room/i })[0]);
    return screen.findByRole('dialog', { name: /new room/i });
  }

  test('New room: skipping the name creates a web room straight in the editor', async () => {
    await openNewRoom();
    fireEvent.click(screen.getByRole('button', { name: /skip & create/i }));
    const probe = await screen.findByTestId('location');
    expect(probe.textContent).toMatch(/^\/code\/[^?]+\?private=0$/);
    expect(probe).toHaveAttribute('data-room-name', '');
  });

  test('New room: a typed name and React go along, the name via router state', async () => {
    await openNewRoom();
    const input = screen.getByRole('textbox', { name: /name/i });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Snake game' } });
    fireEvent.click(screen.getByRole('radio', { name: /react/i }));
    fireEvent.submit(input.closest('form')!);
    const probe = await screen.findByTestId('location');
    expect(probe.textContent).toMatch(/^\/code\/[^?]+\?type=react&private=0$/);
    expect(probe).toHaveAttribute('data-room-name', 'Snake game');
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
