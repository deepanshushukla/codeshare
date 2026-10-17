import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSession } from './useSession';
import { useSessionChannel } from './useSessionChannel';
import { mockConfig, resetSupabaseMock, soleChannel, upsert } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

// Renders useSession on top of the real useSessionChannel, the way
// SessionWorkspace does, against the shared Supabase mock -- so these tests
// exercise the actual channel wiring instead of a bespoke channel stub.
function renderSession(sessionId: string, userId: string | null = 'user-1') {
  return renderHook(() => {
    const { channel, status } = useSessionChannel(sessionId, userId);
    return useSession(sessionId, userId, channel, status);
  });
}

describe('useSession', () => {
  test('creates a blank row when the session does not exist yet', async () => {
    mockConfig.sessionRow = null;
    const { result } = renderSession('new-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-room' }));
  });

  test('loads existing content instead of resetting it when the session already exists', async () => {
    mockConfig.sessionRow = { id: 'existing-room', html: '<p>hi</p>', css: 'p{}', js: 'console.log(1)' };
    const { result } = renderSession('existing-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('<p>hi</p>');
    expect(result.current.css).toBe('p{}');
    expect(result.current.js).toBe('console.log(1)');
    // The existing-row path must not re-create/overwrite the row with blanks.
    expect(upsert).not.toHaveBeenCalled();
  });

  test('does not blank an existing row when the initial read errors transiently', async () => {
    mockConfig.sessionRow = null;
    mockConfig.selectError = { message: 'network blip' };
    const { result } = renderSession('flaky-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    // A failed read must never be treated as "no row yet" -- that would upsert
    // blanks over a session that may well already have content in Postgres.
    expect(upsert).not.toHaveBeenCalled();
  });

  test('updating one field does not change the in-memory value of another field', async () => {
    mockConfig.sessionRow = { id: 'room', html: '<p>a</p>', css: 'body{}', js: '1' };
    const { result } = renderSession('room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateField('css', 'body{color:red}'));
    expect(result.current.html).toBe('<p>a</p>');
    expect(result.current.js).toBe('1');
    expect(result.current.css).toBe('body{color:red}');
  });

  test('rapid edits to different fields are both persisted, not clobbered by a shared debounce timer', async () => {
    mockConfig.sessionRow = { id: 'room2', html: '<p>a</p>', css: 'body{}', js: '1' };
    const { result } = renderSession('room2');
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
    mockConfig.sessionRow = { id: 'room3', html: '', css: '', js: '' };
    const { result } = renderSession('room3');
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.updateField('js', 'console.log(2)'));

    expect(soleChannel().send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'edit',
        payload: expect.objectContaining({ field: 'js', value: 'console.log(2)', userId: 'user-1' }),
      }),
    );
  });

  test('ignores a broadcast edit that echoes back its own userId', async () => {
    mockConfig.sessionRow = { id: 'room4', html: '<p>a</p>', css: '', js: '' };
    const { result } = renderSession('room4');
    await waitFor(() => expect(result.current.loading).toBe(false));
    const channel = soleChannel();

    act(() => channel.emitBroadcast('edit', { field: 'html', value: '<p>own echo</p>', userId: 'user-1' }));
    expect(result.current.html).toBe('<p>a</p>');

    act(() => channel.emitBroadcast('edit', { field: 'html', value: '<p>from-other</p>', userId: 'user-2' }));
    expect(result.current.html).toBe('<p>from-other</p>');
  });

  test('reports connected once the shared channel is subscribed and writes succeed', async () => {
    mockConfig.sessionRow = { id: 'room5', html: '', css: '', js: '' };
    const { result } = renderSession('room5');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));
  });

  test('surfaces a rejected debounced write instead of swallowing it', async () => {
    mockConfig.sessionRow = { id: 'room6', html: '', css: '', js: '' };
    const { result } = renderSession('room6');
    await waitFor(() => expect(result.current.connectionStatus).toBe('connected'));

    // e.g. an RLS denial or the html/css/js char_length(...) < 200000 check.
    mockConfig.upsertResult = { error: { message: 'new row violates check constraint' } };
    vi.useFakeTimers();
    try {
      act(() => result.current.updateField('html', 'x'.repeat(10)));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }

    expect(result.current.connectionStatus).toBe('write-failed');

    // ...and a later successful write clears it again.
    mockConfig.upsertResult = { error: null };
    vi.useFakeTimers();
    try {
      act(() => result.current.updateField('html', 'y'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    } finally {
      vi.useRealTimers();
    }
    expect(result.current.connectionStatus).toBe('connected');
  });

  test('surfaces a rejected create-the-row write on first load', async () => {
    mockConfig.sessionRow = null;
    mockConfig.upsertResult = { error: { message: 'permission denied for table sessions' } };
    const { result } = renderSession('denied-room');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.connectionStatus).toBe('write-failed');
  });
});
