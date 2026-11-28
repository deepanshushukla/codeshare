import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  supabase,
  emitAuthStateChange,
  mockConfig,
  resetSupabaseMock,
  from,
} from './supabaseMock';

beforeEach(() => {
  resetSupabaseMock();
});

describe('supabaseMock auth/rpc/list extensions', () => {
  test('onAuthStateChange replays the current session immediately, then future emits', () => {
    mockConfig.authSession = { user: { id: 'u1', email: 'a@b.com', is_anonymous: false } };
    const events: string[] = [];
    supabase.auth.onAuthStateChange((event) => events.push(event));
    expect(events).toEqual(['INITIAL_SESSION']);

    emitAuthStateChange('SIGNED_OUT', null);
    expect(events).toEqual(['INITIAL_SESSION', 'SIGNED_OUT']);
  });

  test('onAuthStateChange subscription.unsubscribe stops future emits', () => {
    const callback = vi.fn();
    const { data } = supabase.auth.onAuthStateChange(callback);
    data.subscription.unsubscribe();
    callback.mockClear();
    emitAuthStateChange('SIGNED_IN', { user: { id: 'u2', email: null, is_anonymous: false } });
    expect(callback).not.toHaveBeenCalled();
  });

  test('rpc resolves configured data and error', async () => {
    mockConfig.rpcData = [{ exists_: true, is_private: true, owner_id: 'u1', session_type: 'web' }];
    const { data, error } = await supabase.rpc('session_visibility', { p_id: 'room1' });
    expect(error).toBe(null);
    expect(data).toEqual([{ exists_: true, is_private: true, owner_id: 'u1', session_type: 'web' }]);
  });

  test('from().select().eq().order() resolves the configured list', async () => {
    mockConfig.sessionList = [{ id: 'room1', title: 'Untitled Web Room' }];
    const { data, error } = await from('sessions').select('id, title').eq('owner_id', 'u1').order('updated_at', { ascending: false });
    expect(error).toBe(null);
    expect(data).toEqual([{ id: 'room1', title: 'Untitled Web Room' }]);
  });
});
