import { vi } from 'vitest';
import { isSessionType } from '../features/session/sessionType';

// A stand-in for `src/lib/supabase.ts` that models the parts of
// `@supabase/supabase-js` whose *real* behaviour this app depends on. Use it
// with:
//
//   vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));
//
// and import the control surface (`mockConfig`, `soleChannel`, `upsert`, ...)
// directly in the test.
//
// Two behaviours here are deliberate reproductions of the SDK, because
// per-test ad-hoc mocks that got them wrong hid a session-breaking bug:
//
//  1. `channel(topic)` DEDUPES BY TOPIC. `RealtimeClient.channel()` looks for
//     an existing channel with the same topic and returns it, ignoring the
//     `params` of the second call -- so two hooks that each "create" the
//     session channel get the same object, and the second one's
//     `config.presence.key` is silently dropped.
//  2. `channel.on('presence'|'postgres_changes', ...)` THROWS once the channel
//     is joining/joined. `RealtimeChannel.on()` checks that explicitly and
//     throws `cannot add \`presence\` callbacks for <topic> after
//     \`subscribe()\`.` -- an uncaught throw inside a useEffect, which blanks
//     the page.
//
// Keep both in place: they are the regression guard for C1.

export type MockSessionRow = { id: string; html: string; css: string; js: string };
export type MockPresenceMeta = { name: string; status: string };
export type MockChannelParams = { config?: { presence?: { key?: string }; broadcast?: unknown; private?: boolean } };
export type MockAuthSession = { user: { id: string; email: string | null; is_anonymous: boolean } } | null;

type MockBinding = {
  type: string;
  filter: { event?: string };
  callback: (arg: { payload?: unknown } | undefined) => void;
};

const PRESENCE_LIKE_BINDINGS = ['presence', 'postgres_changes'];

export class MockRealtimeChannel {
  topic: string;
  params: MockChannelParams;
  bindings: MockBinding[] = [];
  /** True from the moment subscribe() is called (the SDK's joining/joined state). */
  joined = false;
  subscribeCallbacks: ((status: string) => void)[] = [];
  /** What presenceState() returns; track() writes into it under the configured key. */
  presence: Record<string, MockPresenceMeta[]> = {};

  constructor(topic: string, params: MockChannelParams) {
    this.topic = topic;
    this.params = params;
  }

  on = vi.fn(
    (type: string, filter: { event?: string }, callback: MockBinding['callback']): MockRealtimeChannel => {
      if (this.joined && PRESENCE_LIKE_BINDINGS.includes(type)) {
        throw new Error(`cannot add \`${type}\` callbacks for ${this.topic} after \`subscribe()\`.`);
      }
      this.bindings.push({ type, filter, callback });
      return this;
    },
  );

  subscribe = vi.fn((callback?: (status: string) => void): MockRealtimeChannel => {
    this.joined = true;
    if (callback) this.subscribeCallbacks.push(callback);
    this.emitStatus('SUBSCRIBED');
    return this;
  });

  send = vi.fn((_message: { type: string; event: string; payload: unknown }) => 'ok');

  track = vi.fn(async (meta: MockPresenceMeta) => {
    const key = this.params.config?.presence?.key ?? '__no_presence_key__';
    this.presence[key] = [meta];
    return 'ok';
  });

  untrack = vi.fn(async () => 'ok');

  unsubscribe = vi.fn(async () => {
    this.joined = false;
    return 'ok';
  });

  presenceState = vi.fn(() => this.presence);

  /* ---- test helpers (not part of the SDK surface) ---- */

  bindingsOfType(type: string): MockBinding[] {
    return this.bindings.filter((binding) => binding.type === type);
  }

  emitBroadcast(event: string, payload: unknown): void {
    for (const binding of this.bindings) {
      if (binding.type === 'broadcast' && binding.filter.event === event) binding.callback({ payload });
    }
  }

  emitPresenceSync(): void {
    for (const binding of this.bindings) {
      if (binding.type === 'presence' && binding.filter.event === 'sync') binding.callback(undefined);
    }
  }

  emitStatus(status: string): void {
    for (const callback of this.subscribeCallbacks) callback(status);
  }
}

const DEFAULT_CONFIG = {
  sessionRow: null as MockSessionRow | null,
  selectError: null as { message: string } | null,
  upsertResult: { error: null } as { error: { message: string } | null },
  // `.update(...).eq(...).select(...)` result. RLS makes a disallowed update
  // match zero rows *without* an error, hence `data` is part of the contract.
  updateResult: { data: [{ id: 'room1' }], error: null } as { data: unknown[] | null; error: { message: string } | null },
  signInUserId: 'user-1',
  signInError: null as Error | null,
  authSession: null as MockAuthSession,
  rpcData: [{ exists_: false, is_private: false, owner_id: null, session_type: null }] as unknown[] | null,
  rpcError: null as { message: string } | null,
  sessionList: [] as unknown[],
  listError: null as { message: string } | null,
};

/** Mutate this to steer the mock from a test. */
export const mockConfig = { ...DEFAULT_CONFIG };

export const maybeSingle = vi.fn(async () => ({
  data: mockConfig.sessionRow,
  error: mockConfig.selectError,
}));

export const upsert = vi.fn(async (_row: Record<string, unknown>) => mockConfig.upsertResult);

export const update = vi.fn((_row: Record<string, unknown>) => ({
  eq: (_column: string, _value: unknown) => ({
    select: async (_columns?: string) => mockConfig.updateResult,
  }),
}));

// Auth state change listeners
const authListeners: ((event: string, session: MockAuthSession) => void)[] = [];

export function emitAuthStateChange(event: string, session: MockAuthSession): void {
  mockConfig.authSession = session;
  for (const listener of authListeners) {
    listener(event, session);
  }
}

// Auth-related vi.fn() exports
// Typed `Promise<{ error: { message: string } | null }>` (not bare `null`,
// which `() => ({ error: null })` would otherwise infer) so a consuming
// test's `mockResolvedValueOnce({ error: { message: '...' } })` -- the
// AuthModal error-path tests' whole mechanism for simulating a failed
// auth call -- type-checks under `tsc -b`.
export const signUpWithEmail = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
export const verifySignupOtp = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
export const loginWithPassword = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
export const requestPasswordReset = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
export const verifyPasswordResetOtp = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
export const setNewPassword = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({ error: null }));
export const logout = vi.fn(async () => undefined);

export const from = vi.fn((_table: string) => ({
  select: (_columns?: string) => ({
    eq: (_column: string, _value: unknown) => ({
      maybeSingle,
      order: (_col: string, _opts?: { ascending?: boolean }) => ({
        data: mockConfig.sessionList,
        error: mockConfig.listError,
      }),
    }),
  }),
  upsert,
  update,
}));

const channels = new Map<string, MockRealtimeChannel>();

export const channel = vi.fn((topic: string, params: MockChannelParams = { config: {} }) => {
  const existing = channels.get(topic);
  // Dedupe by topic, params of this call ignored -- exactly what the SDK does.
  if (existing) return existing;
  const created = new MockRealtimeChannel(topic, params);
  channels.set(topic, created);
  return created;
});

export const removeChannel = vi.fn((target: MockRealtimeChannel) => {
  // Drop it from the registry synchronously: the point of removeChannel (vs a
  // bare unsubscribe) is that channel() stops handing this object back out.
  channels.delete(target.topic);
  return target.unsubscribe();
});

export const rpc = vi.fn(async (_fn: string, _args: unknown) => ({
  data: mockConfig.rpcData,
  error: mockConfig.rpcError,
}));

// Mirrors `fetchSessionAccess` in `src/lib/supabase.ts`: a thin parse of the
// `session_visibility` RPC response, driven by the same `rpc`/`mockConfig`
// surface above so tests steer it via `mockConfig.rpcData`/`rpcError` exactly
// like they steer the real function's underlying `supabase.rpc` call.
export const fetchSessionAccess = vi.fn(async (sessionId: string) => {
  const { data, error } = await rpc('session_visibility', { p_id: sessionId });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return null;
  }

  const row = data[0] as Record<string, unknown>;
  const rawSessionType = row.session_type;
  const sessionType = typeof rawSessionType === 'string' && isSessionType(rawSessionType) ? rawSessionType : null;

  return {
    exists: (row.exists_ as boolean | undefined) ?? false,
    isPrivate: (row.is_private as boolean | undefined) ?? false,
    ownerId: (row.owner_id as string | null | undefined) ?? null,
    sessionType,
  };
});

export const supabase = {
  from,
  channel,
  removeChannel,
  rpc,
  auth: {
    onAuthStateChange: vi.fn((callback: (event: string, session: MockAuthSession) => void) => {
      authListeners.push(callback);
      // Immediately invoke with current session
      callback('INITIAL_SESSION', mockConfig.authSession);
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(() => {
              const index = authListeners.indexOf(callback);
              if (index > -1) authListeners.splice(index, 1);
            }),
          },
        },
      };
    }),
  },
};

export const ensureAnonymousSession = vi.fn(async () => {
  if (mockConfig.signInError) throw mockConfig.signInError;
  return mockConfig.signInUserId;
});

/** Every channel currently live on the mock client. */
export function getChannels(): MockRealtimeChannel[] {
  return [...channels.values()];
}

/**
 * The session's single channel, asserting there is exactly one. Fails loudly
 * if something starts creating a second channel per session again.
 */
export function soleChannel(): MockRealtimeChannel {
  if (channels.size !== 1) {
    throw new Error(`expected exactly 1 realtime channel, found ${channels.size}: [${[...channels.keys()].join(', ')}]`);
  }
  return [...channels.values()][0];
}

export function resetSupabaseMock(): void {
  channels.clear();
  authListeners.length = 0;
  Object.assign(mockConfig, DEFAULT_CONFIG, {
    upsertResult: { error: null },
    updateResult: { data: [{ id: 'room1' }], error: null },
  });
  maybeSingle.mockClear();
  upsert.mockClear();
  update.mockClear();
  from.mockClear();
  channel.mockClear();
  removeChannel.mockClear();
  ensureAnonymousSession.mockClear();
  rpc.mockClear();
  fetchSessionAccess.mockClear();
  signUpWithEmail.mockClear();
  verifySignupOtp.mockClear();
  loginWithPassword.mockClear();
  requestPasswordReset.mockClear();
  verifyPasswordResetOtp.mockClear();
  setNewPassword.mockClear();
  logout.mockClear();
}
