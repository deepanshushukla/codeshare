import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const upsert = vi.fn().mockResolvedValue({ error: null });
const singleSelect = vi.fn();
const channelOn = vi.fn().mockReturnThis();
const channelSubscribe = vi.fn().mockReturnThis();
const channelSend = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: singleSelect }) }),
      upsert,
    }),
    channel: () => ({ on: channelOn, subscribe: channelSubscribe, send: channelSend }),
  },
}));

beforeEach(() => {
  upsert.mockClear();
  singleSelect.mockReset();
  channelSend.mockClear();
});

describe('useSession', () => {
  test('creates a blank row when the session does not exist yet', async () => {
    singleSelect.mockResolvedValue({ data: null, error: null });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('new-room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-room' }));
  });

  test('loads existing content instead of resetting it when the session already exists', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'existing-room', html: '<p>hi</p>', css: 'p{}', js: 'console.log(1)' },
      error: null,
    });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('existing-room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('<p>hi</p>');
    expect(result.current.css).toBe('p{}');
    expect(result.current.js).toBe('console.log(1)');
    // The existing-row path must not re-create/overwrite the row with blanks.
    expect(upsert).not.toHaveBeenCalled();
  });

  test('does not blank an existing row when the initial read errors transiently', async () => {
    singleSelect.mockResolvedValue({ data: null, error: new Error('network blip') });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('flaky-room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    // A failed read must never be treated as "no row yet" -- that would upsert
    // blanks over a session that may well already have content in Postgres.
    expect(upsert).not.toHaveBeenCalled();
  });

  test('updating one field does not change the in-memory value of another field', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'room', html: '<p>a</p>', css: 'body{}', js: '1' },
      error: null,
    });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateField('css', 'body{color:red}'));
    expect(result.current.html).toBe('<p>a</p>');
    expect(result.current.js).toBe('1');
    expect(result.current.css).toBe('body{color:red}');
  });

  test('rapid edits to different fields are both persisted, not clobbered by a shared debounce timer', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'room2', html: '<p>a</p>', css: 'body{}', js: '1' },
      error: null,
    });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('room2', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    upsert.mockClear();

    vi.useFakeTimers();
    try {
      // Edit html, then css, before either debounce window has elapsed. If both
      // fields shared a single debounce timer, the html write would be cancelled
      // and silently dropped when the css write re-armed the timer.
      act(() => {
        result.current.updateField('html', '<p>b</p>');
        result.current.updateField('css', 'body{color:red}');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'room2', html: '<p>b</p>' }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'room2', css: 'body{color:red}' }));
  });

  test('broadcasts an edit to the realtime channel so other clients can apply it', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'room3', html: '', css: '', js: '' },
      error: null,
    });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('room3', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateField('js', 'console.log(2)'));

    expect(channelSend).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'edit',
        payload: expect.objectContaining({ field: 'js', value: 'console.log(2)', userId: 'user-1' }),
      }),
    );
  });

  test('ignores a broadcast edit that echoes back its own userId', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'room4', html: '<p>a</p>', css: '', js: '' },
      error: null,
    });
    let broadcastHandler: ((msg: { payload: { field: string; value: string; userId: string } }) => void) | undefined;
    channelOn.mockImplementation((_type: string, _filter: unknown, handler: typeof broadcastHandler) => {
      broadcastHandler = handler;
      return { on: channelOn, subscribe: channelSubscribe, send: channelSend };
    });

    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('room4', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => broadcastHandler?.({ payload: { field: 'html', value: '<p>own echo</p>', userId: 'user-1' } }));
    expect(result.current.html).toBe('<p>a</p>');

    act(() => broadcastHandler?.({ payload: { field: 'html', value: '<p>from-other</p>', userId: 'user-2' } }));
    expect(result.current.html).toBe('<p>from-other</p>');
  });
});
