import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSessionType } from './useSessionType';
import type { SessionType } from './sessionType';
import { maybeSingle, mockConfig, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('useSessionType', () => {
  test("resolves to the row's session_type when a row exists, ignoring typeHint", async () => {
    mockConfig.sessionRow = {
      id: 'room1',
      html: '',
      css: '',
      js: '',
      session_type: 'react',
    } as any;
    const { result } = renderHook(() => useSessionType('room1', 'web'));

    expect(result.current.loading).toBe(true);
    expect(result.current.sessionType).toBe(null);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionType).toBe('react');
  });

  test('falls back to typeHint when no row exists yet', async () => {
    mockConfig.sessionRow = null;
    const { result } = renderHook(() => useSessionType('new-room', 'react'));

    expect(result.current.loading).toBe(true);
    expect(result.current.sessionType).toBe(null);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionType).toBe('react');
  });

  test('starts in a loading state', () => {
    // Mock a select that never resolves
    maybeSingle.mockImplementationOnce(async () => {
      return new Promise(() => {}); // Never resolves
    });

    const { result } = renderHook(() => useSessionType('room-hang', 'web'));

    expect(result.current.loading).toBe(true);
    expect(result.current.sessionType).toBe(null);
  });

  test('stays loading on a transient read error instead of resolving to typeHint', async () => {
    // A failed read makes `data` falsy exactly like "no row exists" does.
    // Resolving to typeHint here would let a momentary network/RLS failure
    // decide the session's type (and, via useSession's create-branch,
    // persist that guess), so the hook must report "still don't know".
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConfig.sessionRow = null;
    mockConfig.selectError = { message: 'network unreachable' };

    const { result } = renderHook(() => useSessionType('room-err', 'react'));

    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current.loading).toBe(true);
    expect(result.current.sessionType).toBe(null);

    consoleError.mockRestore();
  });

  test('goes back to loading when sessionId changes, before the new read resolves', async () => {
    mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', session_type: 'react' } as any;
    const { result, rerender } = renderHook(({ id }) => useSessionType(id, 'web'), {
      initialProps: { id: 'room1' },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionType).toBe('react');

    // The next read hangs, so nothing can resolve it: the hook must say "we
    // don't know yet" rather than keep serving room1's type for room2.
    maybeSingle.mockImplementationOnce(async () => {
      return new Promise(() => {}); // Never resolves
    });
    rerender({ id: 'room2' });

    expect(result.current.loading).toBe(true);
    expect(result.current.sessionType).toBe(null);
  });

  test('goes back to loading when typeHint changes, before the new read resolves', async () => {
    mockConfig.sessionRow = null;
    const initialProps: { hint: SessionType } = { hint: 'web' };
    const { result, rerender } = renderHook(({ hint }: { hint: SessionType }) => useSessionType('room1', hint), {
      initialProps,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sessionType).toBe('web');

    maybeSingle.mockImplementationOnce(async () => {
      return new Promise(() => {}); // Never resolves
    });
    rerender({ hint: 'react' });

    expect(result.current.loading).toBe(true);
    expect(result.current.sessionType).toBe(null);
  });
});
