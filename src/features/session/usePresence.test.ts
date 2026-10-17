import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePresence } from './usePresence';
import { useSessionChannel } from './useSessionChannel';
import { resetSupabaseMock, soleChannel } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

// usePresence no longer creates its own channel (that was C1: the SDK deduped
// the topic and then threw on the late presence binding). It takes the one
// useSessionChannel owns, so these tests compose the two the way
// SessionWorkspace does.
function renderPresence(userId: string | null = 'user-1') {
  return renderHook(() => {
    const { channel } = useSessionChannel('room', userId);
    return usePresence(userId, channel);
  });
}

describe('usePresence', () => {
  test('tracks the local user on mount', async () => {
    renderPresence();
    await waitFor(() =>
      expect(soleChannel().track).toHaveBeenCalledWith(expect.objectContaining({ status: 'online' })),
    );
  });

  test('a presence leave event removes that user from the list', async () => {
    const { result } = renderPresence();
    await waitFor(() => expect(soleChannel().track).toHaveBeenCalled());
    const channel = soleChannel();

    channel.presence = { 'user-2': [{ name: 'User_abc', status: 'online' }] };
    act(() => channel.emitPresenceSync());
    await waitFor(() => expect(result.current.users.map((u) => u.userId)).toContain('user-2'));

    channel.presence = {};
    act(() => channel.emitPresenceSync());
    await waitFor(() => expect(result.current.users.map((u) => u.userId)).not.toContain('user-2'));
  });

  test('a visibilitychange after setName re-tracks the custom name, not the default', async () => {
    const { result } = renderPresence();
    await waitFor(() =>
      expect(soleChannel().track).toHaveBeenCalledWith(expect.objectContaining({ status: 'online' })),
    );

    act(() => result.current.setName('Alice'));
    soleChannel().track.mockClear();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => document.dispatchEvent(new Event('visibilitychange')));

    expect(soleChannel().track).toHaveBeenCalledWith({ name: 'Alice', status: 'away' });

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  test('does nothing (and creates no channel) until a userId exists', () => {
    const { result } = renderPresence(null);
    expect(result.current.users).toEqual([]);
    expect(() => soleChannel()).toThrow(/expected exactly 1 realtime channel, found 0/);
  });
});
