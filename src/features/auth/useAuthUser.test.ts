import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthUser } from './useAuthUser';
import { emitAuthStateChange, mockConfig, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('useAuthUser', () => {
  test('starts loading, then resolves to the anonymous session ensureAnonymousSession produces', async () => {
    mockConfig.signInUserId = 'anon-1';
    const { result } = renderHook(() => useAuthUser());
    expect(result.current.loading).toBe(true);

    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.userId).toBe('anon-1');
    expect(result.current.isAnonymous).toBe(true);
    expect(result.current.email).toBe(null);
  });

  test('reflects a real login after onAuthStateChange fires SIGNED_IN with a non-anonymous session', async () => {
    const { result } = renderHook(() => useAuthUser());
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });

    await waitFor(() => expect(result.current.userId).toBe('real-1'));
    expect(result.current.isAnonymous).toBe(false);
    expect(result.current.email).toBe('a@b.com');
  });

  test('reports authFailed when ensureAnonymousSession rejects', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockConfig.signInError = new Error('anon sign-in disabled');
    const { result } = renderHook(() => useAuthUser());

    await waitFor(() => expect(result.current.authFailed).toBe(true));
    consoleError.mockRestore();
  });
});
