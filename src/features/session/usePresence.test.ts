import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

let presenceState: Record<string, { name: string; status: string }[]> = {};
let syncHandler: (() => void) | undefined;
const track = vi.fn().mockResolvedValue('ok');
const unsubscribe = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on: (_type: string, _config: { event: string }, cb: () => void) => {
        syncHandler = cb;
      },
      subscribe: (statusCb?: (status: string) => void) => statusCb?.('SUBSCRIBED'),
      track,
      presenceState: () => presenceState,
      unsubscribe,
    }),
  },
}));

beforeEach(() => {
  presenceState = {};
  syncHandler = undefined;
  track.mockClear();
});

describe('usePresence', () => {
  test('tracks the local user on mount', async () => {
    const { usePresence } = await import('./usePresence');
    renderHook(() => usePresence('room', 'user-1'));
    await waitFor(() => expect(track).toHaveBeenCalledWith(expect.objectContaining({ status: 'online' })));
  });

  test('a presence leave event removes that user from the list', async () => {
    const { usePresence } = await import('./usePresence');
    const { result } = renderHook(() => usePresence('room', 'user-1'));
    presenceState = { 'user-2': [{ name: 'User_abc', status: 'online' }] };
    act(() => syncHandler?.());
    await waitFor(() => expect(result.current.users.map((u) => u.userId)).toContain('user-2'));

    presenceState = {};
    act(() => syncHandler?.());
    await waitFor(() => expect(result.current.users.map((u) => u.userId)).not.toContain('user-2'));
  });
});
