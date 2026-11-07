import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSessionType } from './useSessionType';
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
});
