import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSessionAccess } from './useSessionAccess';
import { mockConfig, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('useSessionAccess', () => {
  test('stays loading until currentUserId is available', () => {
    const { result } = renderHook(() => useSessionAccess('room1', 'web', null));
    expect(result.current).toEqual({ status: 'loading' });
  });

  test('ready with typeHint when the room does not exist yet', async () => {
    mockConfig.rpcData = [{ exists_: false, is_private: false, owner_id: null, session_type: null }];
    const { result } = renderHook(() => useSessionAccess('new-room', 'react', 'u1'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', sessionType: 'react', isOwner: false });
  });

  test('ready with the row session_type and isOwner true when the room is private and owned by the caller', async () => {
    mockConfig.rpcData = [{ exists_: true, is_private: true, owner_id: 'u1', session_type: 'web' }];
    const { result } = renderHook(() => useSessionAccess('room1', 'react', 'u1'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', sessionType: 'web', isOwner: true });
  });

  test('denied when the room is private and owned by someone else', async () => {
    mockConfig.rpcData = [{ exists_: true, is_private: true, owner_id: 'someone-else', session_type: 'web' }];
    const { result } = renderHook(() => useSessionAccess('room1', 'web', 'u1'));
    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  test('ready (not denied) when the room is public, regardless of owner', async () => {
    mockConfig.rpcData = [{ exists_: true, is_private: false, owner_id: 'someone-else', session_type: 'web' }];
    const { result } = renderHook(() => useSessionAccess('room1', 'web', 'u1'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toEqual({ status: 'ready', sessionType: 'web', isOwner: false });
  });

  test('stays loading when fetchSessionAccess fails (rpc error)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConfig.rpcError = { message: 'network unreachable' };
    const { result } = renderHook(() => useSessionAccess('room1', 'web', 'u1'));
    await waitFor(() => expect(consoleError).toHaveBeenCalled());
    expect(result.current).toEqual({ status: 'loading' });
    consoleError.mockRestore();
  });
});
