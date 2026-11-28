# Private Rooms, Accounts & Room History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a logged-in Supabase Auth user create rooms that only they can read/write, flip any room they own between private/public, see a list of rooms they own with auto-generated titles, and give anonymous visitors today's fully-public behavior unless they ask to go private (which prompts sign-up/login).

**Architecture:** A new migration adds `owner_id`/`is_private`/`title` to `sessions` and rewrites RLS to gate reads/writes on them, plus a `security definer` function (`session_visibility`) that lets any client check a room's existence/privacy/type without ever reading its content. A shared `useAuthUser` hook (wrapping `onAuthStateChange`) replaces the duplicated anonymous-sign-in bootstrap in both workspace components and backs a new `AccountMenu`/`AuthModal` auth UI. `SessionRoute` gates rendering on a new `useSessionAccess` hook (calling `session_visibility`) before mounting a workspace, replacing `useSessionType`. Titles are generated client-side from the room's own code by a pure function, recomputed only when structural fields change.

**Tech Stack:** Vite + React 19 + TypeScript + Supabase (Postgres + Auth + Realtime) + Radix UI (`@radix-ui/react-dialog`, already a dependency) + Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-23-codeshare-private-rooms-design.md`

## Global Constraints

- Login is email + password only — no OAuth, no magic links (spec: Approaches).
- Signup verification and password reset both use Supabase OTP **codes** (`verifyOtp`), not confirmation/recovery links — one consistent "enter email, then enter the code" pattern (spec: Approaches, Decided design).
- A private room's content must never be readable by anyone but its owner, through any path — this is the one thing in this change that must have no holes (spec: Anti-goals).
- Anonymous Supabase sessions (`is_anonymous: true` in the JWT) can never own a private room, enforced in RLS itself, not just the UI (spec: RLS rewrite).
- Room titles are generated entirely from the room's own code, client-side, with no AI/LLM call and no manual rename UI (spec: Non-goals, Decided design — title generation).
- `session_users` stays untouched — still reserved, still unused (spec: RLS rewrite).
- Flipping a room private does not forcibly disconnect anyone already viewing it; RLS blocks only *new* reads/writes (spec: Public/Private toggle — my call).

## Review Focus

- An anonymous visitor (never signed up) opens a private room's URL directly — must see the access-denied screen with a login prompt, never a blank editor or an infinite loading state.
- A room is created with completely empty starter content before any typing happens — title generation must fall back to a fixed placeholder, never an empty string or a thrown error.
- A logged-in user opens a room they own that was created back when they were anonymous (`owner_id` is `null` from that earlier visit) — the private/public toggle pill must not appear, since `null !== currentUserId`.
- An expired or mistyped OTP code is submitted during signup verification or password reset — the modal must show a clear error and let the user retry, not hang or silently close.
- A write that violates the new RLS policy (e.g., a stale client attempting to flip someone else's room private) must surface as the existing `write-failed` connection-banner state, not a swallowed error.

---

## Task 1: Extend the Supabase test mock

**Files:**
- Modify: `src/test/supabaseMock.ts`
- Test: `src/test/supabaseMock.test.ts` (new)

**Interfaces:**
- Consumes: nothing (foundational infra task).
- Produces, for every later task's tests to import from `../../test/supabaseMock`:
  - `mockConfig.authSession: MockAuthSession` (`{ user: { id: string; email: string | null; is_anonymous: boolean } } | null`), default `null`.
  - `emitAuthStateChange(event: string, session: MockAuthSession): void` — updates `mockConfig.authSession` and replays it to every registered `onAuthStateChange` listener.
  - `supabase.auth.onAuthStateChange(callback)` — registers `callback`, immediately invokes it once with `('INITIAL_SESSION', mockConfig.authSession)`, and returns `{ data: { subscription: { unsubscribe: vi.fn() } } }`.
  - Top-level `vi.fn()` exports mirroring new `lib/supabase.ts` wrappers (Task 3), each resolving `{ error: null }` by default: `signUpWithEmail`, `verifySignupOtp`, `loginWithPassword`, `requestPasswordReset`, `verifyPasswordResetOtp`, `setNewPassword`, `logout` (resolves `undefined`).
  - `mockConfig.rpcData: unknown[] | null` (default `[{ exists_: false, is_private: false, owner_id: null, session_type: null }]`) and `mockConfig.rpcError: { message: string } | null` (default `null`); `supabase.rpc = vi.fn(async (_fn, _args) => ({ data: mockConfig.rpcData, error: mockConfig.rpcError }))`.
  - `from(table).select(cols).eq(col, val)` additionally returns an `order(col, opts)` method resolving `{ data: mockConfig.sessionList, error: mockConfig.listError }`; add `mockConfig.sessionList: unknown[]` (default `[]`) and `mockConfig.listError: { message: string } | null` (default `null`). The existing `.maybeSingle()` sibling on the same `eq()` result is untouched.
  - `resetSupabaseMock()` additionally clears all of the above (listener list, new `vi.fn()`s, `authSession`/`rpcData`/`rpcError`/`sessionList`/`listError` back to defaults).

- [ ] **Step 1: Write the failing test**

```ts
// src/test/supabaseMock.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/supabaseMock.test.ts`
Expected: FAIL — `supabase.auth` is undefined, `supabase.rpc` is undefined, `.eq(...)` has no `.order`, `emitAuthStateChange` is not exported.

- [ ] **Step 3: Implement the mock extensions in `src/test/supabaseMock.ts`**

Add the pieces listed in Interfaces above. Keep every existing export (`from`, `upsert`, `maybeSingle`, `channel`, `removeChannel`, `ensureAnonymousSession`, `soleChannel`, `getChannels`) working exactly as before — this is additive only. Extend `DEFAULT_CONFIG` with the new `mockConfig` fields, extend `supabase` with an `auth` object and an `rpc` function, and extend `resetSupabaseMock()` to clear the new listener array and `vi.fn()`s.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/supabaseMock.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full existing suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — every pre-existing test still passes unchanged, since this task only added exports.

- [ ] **Step 6: Commit**

```bash
git add src/test/supabaseMock.ts src/test/supabaseMock.test.ts
git commit -m "test: extend supabase mock with auth, rpc, and list-query support"
```

---

## Task 2: Migration — schema, RLS, and the visibility function

**Files:**
- Create: `supabase/migrations/0003_private_rooms.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `sessions.owner_id uuid`, `sessions.is_private boolean not null default false`, `sessions.title text not null default ''`; RLS policies described below; a callable `session_visibility(p_id text) returns table(exists_ bool, is_private bool, owner_id uuid, session_type text)` function. Every later task that touches Postgres (Tasks 3, 7, 9, 14) depends on this shape existing.

- [ ] **Step 1: Write the migration**

```sql
alter table sessions
  add column owner_id uuid references auth.users(id) on delete set null,
  add column is_private boolean not null default false,
  add column title text not null default '';

drop policy "anyone authenticated can read sessions" on sessions;
drop policy "anyone authenticated can insert sessions" on sessions;
drop policy "anyone authenticated can update sessions" on sessions;

create policy "read public or own sessions"
  on sessions for select
  using (not is_private or owner_id = auth.uid());

create policy "insert sessions, private only when truly owned"
  on sessions for insert
  with check (
    auth.role() = 'authenticated'
    and (
      not is_private
      or (owner_id = auth.uid()
          and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
    )
  );

create policy "update own or public sessions"
  on sessions for update
  using (not is_private or owner_id = auth.uid())
  with check (
    not is_private
    or (owner_id = auth.uid()
        and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );

create or replace function session_visibility(p_id text)
returns table (exists_ bool, is_private bool, owner_id uuid, session_type text)
language sql security definer as $$
  select true, is_private, owner_id, session_type from sessions where id = p_id
  union all
  select false, false, null, null where not exists (select 1 from sessions where id = p_id)
  limit 1;
$$;

grant execute on function session_visibility(text) to authenticated;
```

- [ ] **Step 2: Apply it locally and verify it runs clean**

Run: `npx supabase db reset`
Expected: migration `0003_private_rooms.sql` applies with no errors (output lists it alongside `0001_init.sql`/`0002_react_mode.sql`).

- [ ] **Step 3: Verify the policies and function exist**

Run: `npx supabase db diff --local` (or open Studio's Table Editor → `sessions` → Policies tab)
Expected: `sessions` has exactly 3 select/insert/update policies named as above (the three old "anyone authenticated..." policies are gone), and `session_visibility` appears under Database → Functions.

- [ ] **Step 4: Manually confirm the anonymous-owner block**

In the local SQL editor, run as an anonymous session (or via `psql` setting `role authenticated; set request.jwt.claims = '{"sub":"<anon-uuid>","role":"authenticated","is_anonymous":true}';`):

```sql
insert into sessions (id, is_private, owner_id) values ('test-anon-private', true, '<anon-uuid>');
```

Expected: rejected by RLS (`new row violates row-level security policy`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_private_rooms.sql
git commit -m "feat: add owner_id/is_private/title to sessions with RLS and a visibility check"
```

---

## Task 2b: Secure the Realtime Broadcast channel for private rooms

**Added during execution, not in the original plan.** Task 2's security review found a gap in the plan itself, not in Task 2's own code: `sessions` RLS controls who can read/write a room's row in Postgres, but every session's live edits also travel over a Realtime Broadcast channel (`session:<roomId>`, created in `useSessionChannel.ts`) that has no authorization of its own. Anyone holding the app's anon key — logged in or not — can `supabase.channel('session:<any-id>', ...).subscribe()` directly and receive every `edit` broadcast for that room, including a private one, regardless of what the `sessions` table policies say. This is exactly the anti-goal the whole feature exists to avoid, so it gets fixed now rather than parked.

**Files:**
- Create: `supabase/migrations/0004_realtime_private_channels.sql`
- Modify: `src/features/session/useSessionChannel.ts`
- Modify: `src/features/session/useSessionChannel.test.ts`

**Interfaces:**
- Consumes: `sessions.is_private`/`owner_id` (Task 2, already landed).
- Produces: nothing a later task's interface depends on — this is a self-contained security fix to an existing mechanism, not a new one. (It does not change what Task 12's "no live-kick on demote" scoping call already accepted: this task stops a *new* subscriber without access from ever joining a private room's channel; it says nothing about someone already connected before a demote, which is unchanged.)

- [ ] **Step 1: Write the migration**

Supabase's Realtime "private channels" feature authorizes Broadcast/Presence through RLS policies on `realtime.messages`, matched against the channel's topic via the `realtime.topic()` helper — confirmed present in this project's installed Realtime version by the Task 2 reviewer's own `psql` check (`realtime.messages` exists with RLS enabled and zero policies). Add the two policies that make a channel's access mirror its room's:

```sql
create policy "session channel visibility matches room visibility (read)"
on realtime.messages
for select
to authenticated
using (
  exists (
    select 1 from public.sessions s
    where s.id = replace(realtime.topic(), 'session:', '')
      and (not s.is_private or s.owner_id = auth.uid())
  )
);

create policy "session channel visibility matches room visibility (write)"
on realtime.messages
for insert
to authenticated
with check (
  exists (
    select 1 from public.sessions s
    where s.id = replace(realtime.topic(), 'session:', '')
      and (not s.is_private or s.owner_id = auth.uid())
  )
);
```

If `realtime.topic()` does not exist under this project's installed Realtime version (check via `select proname from pg_proc where proname = 'topic' and pronamespace = 'realtime'::regnamespace;` locally), stop and report NEEDS_CONTEXT with what you found instead of inventing a different authorization mechanism — the exact helper name is a fact about the installed version, not a design choice.

- [ ] **Step 2: Apply locally and verify**

Run: `npx supabase db reset` (local stack only — this project is linked to a hosted Supabase project; never run `db push`/`db push --linked`/`link`).
Expected: migration `0004_realtime_private_channels.sql` applies clean.

Run: `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select policyname from pg_policies where tablename = 'messages' and schemaname = 'realtime';"`
Expected: both new policies listed.

- [ ] **Step 3: Manually confirm the channel-level block**

Seed a private room owned by user A (reuse the same `request.jwt.claims` technique Task 2 used to simulate roles). As a different authenticated user B, confirm `select 1 from realtime.messages where ... ` style check (or, more directly, that the `using`/`with check` conditions above evaluate false for B against A's private room's topic) — paste the actual query/output in your report.

- [ ] **Step 4: Write the failing test for the client-side config change**

```ts
// added to src/features/session/useSessionChannel.test.ts, inside the existing describe('useSessionChannel') block
test('creates the channel as a private channel, so Realtime enforces the room-visibility policy on it', async () => {
  renderHook(() => useSessionChannel('room', 'user-1'));
  await waitFor(() => expect(getChannels()).toHaveLength(1));
  const channel = soleChannel();
  expect(channel.params.config?.private).toBe(true);
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run src/features/session/useSessionChannel.test.ts`
Expected: FAIL — `channel.params.config?.private` is `undefined`.

- [ ] **Step 6: Implement the one-line change in `src/features/session/useSessionChannel.ts`**

In the `supabase.channel(...)` call (currently `config: { presence: { key: userId } }`), add `private: true` to that same `config` object: `config: { presence: { key: userId }, private: true }`.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: PASS — the new test passes, and nothing else in `useSessionChannel.test.ts` (or elsewhere) regresses; the mock stores `params` as given and doesn't branch on `private`, so no mock changes are needed.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0004_realtime_private_channels.sql src/features/session/useSessionChannel.ts src/features/session/useSessionChannel.test.ts
git commit -m "fix: authorize the session Realtime channel against the room's own visibility rule"
```

---

## Task 3: Auth action wrappers + session visibility fetch in `lib/supabase.ts`

**Files:**
- Modify: `src/lib/supabase.ts`
- Test: `src/lib/supabase.test.ts`

**Interfaces:**
- Consumes: the `session_visibility` function from Task 2 (at runtime, not at test time — this task's tests mock `@supabase/supabase-js` directly, same pattern as the existing `ensureAnonymousSession` test).
- Produces, importable from `../../lib/supabase` by every later feature task:
  - `signUpWithEmail(email: string, password: string): Promise<{ error: Error | null }>`
  - `verifySignupOtp(email: string, token: string): Promise<{ error: Error | null }>`
  - `loginWithPassword(email: string, password: string): Promise<{ error: Error | null }>`
  - `requestPasswordReset(email: string): Promise<{ error: Error | null }>`
  - `verifyPasswordResetOtp(email: string, token: string): Promise<{ error: Error | null }>`
  - `setNewPassword(password: string): Promise<{ error: Error | null }>`
  - `logout(): Promise<void>`
  - `type SessionAccess = { exists: boolean; isPrivate: boolean; ownerId: string | null; sessionType: SessionType | null }`
  - `fetchSessionAccess(sessionId: string): Promise<SessionAccess | null>` (returns `null` on an RPC error; a legitimately-missing room is `{ exists: false, isPrivate: false, ownerId: null, sessionType: null }`, not `null`).

- [ ] **Step 1: Write the failing tests**

```ts
// appended to src/lib/supabase.test.ts, alongside the existing mock setup
const signUp = vi.fn().mockResolvedValue({ error: null });
const verifyOtp = vi.fn().mockResolvedValue({ error: null });
const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
const updateUser = vi.fn().mockResolvedValue({ error: null });
const signOut = vi.fn().mockResolvedValue({ error: null });
const rpc = vi.fn().mockResolvedValue({ data: [{ exists_: true, is_private: true, owner_id: 'u1', session_type: 'react' }], error: null });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { signInAnonymously, getSession, signUp, verifyOtp, signInWithPassword, resetPasswordForEmail, updateUser, signOut },
    rpc,
  }),
}));

describe('auth wrappers', () => {
  test('signUpWithEmail calls supabase.auth.signUp with email/password', async () => {
    const { signUpWithEmail } = await import('./supabase');
    await signUpWithEmail('a@b.com', 'secret123');
    expect(signUp).toHaveBeenCalledWith({ email: 'a@b.com', password: 'secret123' });
  });

  test('verifySignupOtp calls verifyOtp with type "signup"', async () => {
    const { verifySignupOtp } = await import('./supabase');
    await verifySignupOtp('a@b.com', '123456');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '123456', type: 'signup' });
  });

  test('verifyPasswordResetOtp calls verifyOtp with type "recovery"', async () => {
    const { verifyPasswordResetOtp } = await import('./supabase');
    await verifyPasswordResetOtp('a@b.com', '654321');
    expect(verifyOtp).toHaveBeenCalledWith({ email: 'a@b.com', token: '654321', type: 'recovery' });
  });

  test('logout calls signOut', async () => {
    const { logout } = await import('./supabase');
    await logout();
    expect(signOut).toHaveBeenCalledOnce();
  });

  test('fetchSessionAccess returns the parsed row on success', async () => {
    const { fetchSessionAccess } = await import('./supabase');
    const result = await fetchSessionAccess('room1');
    expect(rpc).toHaveBeenCalledWith('session_visibility', { p_id: 'room1' });
    expect(result).toEqual({ exists: true, isPrivate: true, ownerId: 'u1', sessionType: 'react' });
  });

  test('fetchSessionAccess returns null on an rpc error', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const { fetchSessionAccess } = await import('./supabase');
    expect(await fetchSessionAccess('room1')).toBe(null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: FAIL — none of the new exports exist yet.

- [ ] **Step 3: Implement the wrappers in `src/lib/supabase.ts`**

Each of the seven action wrappers is a 1-2 line pass-through to the matching `supabase.auth.*` call, returning `{ error }` (or nothing, for `logout`) exactly as described in Interfaces. `fetchSessionAccess` calls `supabase.rpc('session_visibility', { p_id: sessionId })`; on `error` or a missing/empty `data`, return `null`; otherwise map `data[0]` into the `SessionAccess` shape, validating `session_type` with `isSessionType` from `../features/session/sessionType` (import it) and reporting `null` for `sessionType` when invalid or absent — mirroring how `useSessionType` already treats an unrecognized value today.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/supabase.test.ts
git commit -m "feat: add auth action wrappers and session visibility fetch"
```

---

## Task 4: `useAuthUser` hook

**Files:**
- Create: `src/features/auth/useAuthUser.ts`
- Test: `src/features/auth/useAuthUser.test.ts`

**Interfaces:**
- Consumes: `supabase.auth.onAuthStateChange` and `ensureAnonymousSession` from `../../lib/supabase` (mocked via `supabaseMock.ts`'s Task 1 additions).
- Produces: `useAuthUser(): { userId: string | null; email: string | null; isAnonymous: boolean; loading: boolean; authFailed: boolean }`, imported by Tasks 9, 12, 13 and by `AccountMenu` (Task 11).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/auth/useAuthUser.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/auth/useAuthUser.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `useAuthUser()` in `src/features/auth/useAuthUser.ts`**

On mount: subscribe to `supabase.auth.onAuthStateChange`, setting `userId`/`email`/`isAnonymous` from the session on every event (`session?.user.is_anonymous ?? true` when there's no session yet) and `loading` to `false` once any event has fired; separately call `ensureAnonymousSession()` once to guarantee a session exists, catching its rejection into `authFailed` (and `console.error`, matching the existing `SessionWorkspace`/`ReactSessionWorkspace` catch message style) and `loading: false`. Unsubscribe on cleanup.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/auth/useAuthUser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/useAuthUser.ts src/features/auth/useAuthUser.test.ts
git commit -m "feat: add useAuthUser hook for real/anonymous identity"
```

---

## Task 5: `titleFromCode` — generate a title from a room's code

**Files:**
- Create: `src/lib/titleFromCode.ts`
- Test: `src/lib/titleFromCode.test.ts`

**Interfaces:**
- Consumes: nothing (pure function, no Supabase dependency).
- Produces: `titleFromCode(sessionType: SessionType, content: { html: string; js: string; app_jsx: string }): string`, consumed by Task 7's `useSession`.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { titleFromCode } from './titleFromCode';

describe('titleFromCode', () => {
  test('web: prefers the <title> tag text', () => {
    const title = titleFromCode('web', { html: '<title>My Page</title><h1>Hello</h1>', js: '', app_jsx: '' });
    expect(title).toBe('My Page');
  });

  test('web: falls back to the first heading when there is no <title> tag', () => {
    const title = titleFromCode('web', { html: '<h1>Welcome Aboard</h1>', js: '', app_jsx: '' });
    expect(title).toBe('Welcome Aboard');
  });

  test('web: falls back to the first // comment in JS when HTML has no title or heading', () => {
    const title = titleFromCode('web', { html: '<p>no heading</p>', js: "// Snake game\nconsole.log('hi')", app_jsx: '' });
    expect(title).toBe('Snake game');
  });

  test('web: falls back to "Untitled Web Room" when nothing matches', () => {
    expect(titleFromCode('web', { html: '', js: '', app_jsx: '' })).toBe('Untitled Web Room');
  });

  test('react: prefers the first JSX text content in app_jsx', () => {
    const title = titleFromCode('react', { html: '', js: '', app_jsx: 'function App() {\n  return <h1>Todo List</h1>;\n}' });
    expect(title).toBe('Todo List');
  });

  test('react: falls back to the component function name when there is no JSX text', () => {
    const title = titleFromCode('react', { html: '', js: '', app_jsx: 'function CounterApp() {\n  return <div />;\n}' });
    expect(title).toBe('CounterApp');
  });

  test('react: falls back to "Untitled React Room" when nothing matches', () => {
    expect(titleFromCode('react', { html: '', js: '', app_jsx: '' })).toBe('Untitled React Room');
  });

  test('truncates to 60 characters and trims whitespace', () => {
    const long = 'x'.repeat(100);
    const title = titleFromCode('web', { html: `<title>${long}</title>`, js: '', app_jsx: '' });
    expect(title.length).toBe(60);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/titleFromCode.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `titleFromCode` in `src/lib/titleFromCode.ts`**

For `'web'`: try, in order, a `<title>...</title>` match, then the first `<h1>`-`<h6>...</h6>` match, then the first non-empty `// ...` line in `js`; strip any inner tags/whitespace, trim, and fall back to `'Untitled Web Room'`. For `'react'`: try the first JSX text content between `>` and `<` inside `app_jsx` that isn't pure whitespace, then a `function <Name>(` match, falling back to `'Untitled React Room'`. Trim and truncate the final result to 60 characters (`slice(0, 60)`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/titleFromCode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/titleFromCode.ts src/lib/titleFromCode.test.ts
git commit -m "feat: generate room titles from their own code"
```

---

## Task 6: `useSessionAccess` — replaces `useSessionType`

**Files:**
- Create: `src/features/session/useSessionAccess.ts`
- Test: `src/features/session/useSessionAccess.test.ts`

Leave `src/features/session/useSessionType.ts`/`.test.ts` in place for now — `SessionRoute.tsx` is their only consumer and still imports them until Task 9 switches it over and deletes both. Deleting them here would leave `SessionRoute.tsx` (unmodified until Task 9) failing to import, breaking the build for the two tasks in between.

**Interfaces:**
- Consumes: `fetchSessionAccess` from `../../lib/supabase` (Task 3).
- Produces: 

```ts
type SessionAccessState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; sessionType: SessionType; isOwner: boolean };

function useSessionAccess(sessionId: string, typeHint: SessionType, currentUserId: string | null): SessionAccessState
```

consumed by Task 9's `SessionRoute`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/session/useSessionAccess.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/useSessionAccess.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `useSessionAccess` in `src/features/session/useSessionAccess.ts`**

Mirror `useSessionType`'s existing effect-reset-on-input-change discipline (reset to `{ status: 'loading' }` when `sessionId`/`typeHint`/`currentUserId` change, guard with an `active` flag). Return early (stay loading, no-op) while `currentUserId` is `null`. On a resolved `SessionAccess`: if `!exists`, resolve `{ status: 'ready', sessionType: typeHint, isOwner: false }`; else compute `isOwner = access.ownerId === currentUserId`; if `access.isPrivate && !isOwner`, resolve `{ status: 'denied' }`; otherwise resolve `{ status: 'ready', sessionType: access.sessionType ?? typeHint, isOwner }`. On `fetchSessionAccess` returning `null`, `console.error('codeshare: checking session access failed')` and stay loading (no retry), matching `useSessionType`'s existing error discipline. Leave `useSessionType.ts`/`.test.ts` untouched — they still have a live consumer (`SessionRoute.tsx`) until Task 9.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/useSessionAccess.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite to confirm the still-live `useSessionType` wasn't disturbed**

Run: `npm test`
Expected: PASS — `useSessionType.test.ts` and everything else stay green; this task only added a new file.

- [ ] **Step 6: Commit**

```bash
git add src/features/session/useSessionAccess.ts src/features/session/useSessionAccess.test.ts
git commit -m "feat: add useSessionAccess, to replace useSessionType once SessionRoute switches over"
```

---

## Task 7: Privacy, ownership, and title generation in `useSession`

**Files:**
- Modify: `src/features/session/useSession.ts`
- Modify: `src/features/session/useSession.test.ts`

**Interfaces:**
- Consumes: `titleFromCode` (Task 5).
- Produces: `useSession`'s new signature and return shape, consumed by Task 12 (`Header`, `SessionWorkspace`, `ReactSessionWorkspace`):

```ts
function useSession(
  sessionId: string,
  userId: string | null,
  isAnonymous: boolean,
  channel: SessionChannel | null,
  channelStatus: ChannelStatus,
  typeHint: SessionType,
  privacyHint: boolean | null, // explicit choice from the creation URL, or null to derive from isAnonymous
): UseSessionResult & { isPrivate: boolean; ownerId: string | null; title: string; setPrivacy: (next: boolean) => Promise<void> }
```

- [ ] **Step 1: Write the failing tests**

Add to `src/features/session/useSession.test.ts` (alongside its existing cases — check the current file's setup for `userId`/`channel`/`channelStatus` fixtures and reuse them):

```ts
test('a new room created by a real (non-anonymous) user defaults to private with owner_id set, when no privacyHint is given', async () => {
  mockConfig.sessionRow = null;
  renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(upsert).toHaveBeenCalled());
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ is_private: true, owner_id: 'u1' }));
});

test('a new room created by an anonymous user defaults to public with owner_id null, when no privacyHint is given', async () => {
  mockConfig.sessionRow = null;
  renderHook(() => useSession('room1', 'anon-1', true, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(upsert).toHaveBeenCalled());
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ is_private: false, owner_id: null }));
});

test('an explicit privacyHint overrides the isAnonymous-derived default', async () => {
  mockConfig.sessionRow = null;
  renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', false));
  await waitFor(() => expect(upsert).toHaveBeenCalled());
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ is_private: false, owner_id: 'u1' }));
});

test('a new room is created with a generated title from its starter content', async () => {
  mockConfig.sessionRow = null;
  renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(upsert).toHaveBeenCalled());
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ title: expect.any(String) }));
});

test('loading an existing row surfaces isPrivate/ownerId/title from it', async () => {
  mockConfig.sessionRow = { id: 'room1', html: '<h1>Hi</h1>', css: '', js: '', is_private: true, owner_id: 'u1', title: 'Hi' } as any;
  const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.isPrivate).toBe(true);
  expect(result.current.ownerId).toBe('u1');
  expect(result.current.title).toBe('Hi');
});

test('updating html recomputes and persists the title alongside the field', async () => {
  mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
  const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  result.current.updateField('html', '<title>New Title</title>');
  await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ html: '<title>New Title</title>', title: 'New Title' })));
});

test('setPrivacy upserts the new is_private value', async () => {
  mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
  const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await result.current.setPrivacy(true);
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'room1', is_private: true }));
});

test('setPrivacy surfaces an RLS rejection as connectionStatus write-failed, and does not flip isPrivate', async () => {
  mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: 'u1', title: '' } as any;
  mockConfig.upsertResult = { error: { message: 'new row violates row-level security policy' } };
  const { result } = renderHook(() => useSession('room1', 'u1', false, null, 'SUBSCRIBED', 'web', null));
  await waitFor(() => expect(result.current.loading).toBe(false));
  await result.current.setPrivacy(true);
  expect(result.current.connectionStatus).toBe('write-failed');
  expect(result.current.isPrivate).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/useSession.test.ts`
Expected: FAIL — new params/fields don't exist yet.

- [ ] **Step 3: Implement the changes in `src/features/session/useSession.ts`**

- Add `isAnonymous` and `privacyHint` parameters (per the signature above).
- In the create branch: `const isPrivate = privacyHint ?? !isAnonymous;` and `const ownerId = isAnonymous ? null : userId;`; include `is_private: isPrivate`, `owner_id: ownerId`, and `title: titleFromCode(typeHint, starter)` in that first upsert. Track `isPrivate`/`ownerId`/`title` in state, initialized from this branch.
- In the load branch: read `is_private`, `owner_id`, `title` off `data` into the same state (default `title` to `''` defensively, same `?? ''` pattern already used for `app_jsx` etc.).
- Add a `contentRef` mirroring `content` (same pattern as the existing `sessionIdRef`), kept current via an effect, so persister closures can read full up-to-date content without going stale.
- Change the persister factory so the two structural fields (`html` for web, `app_jsx` for react — `js`/`css`/`components_jsx`/`react_css` do not affect title) also compute `titleFromCode(sessionType, { ...contentRef.current, [field]: value })` and include `title` in that upsert call, and update local `title` state to match.
- Add `setPrivacy: useCallback(async (next: boolean) => { const { error } = await supabase.from('sessions').upsert({ id: sessionIdRef.current, is_private: next }); setIsPrivate(prev => error ? prev : next); setWriteFailed(Boolean(error)); }, [])`.
- Return `isPrivate`, `ownerId`, `title`, `setPrivacy` alongside the existing fields.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/useSession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/useSession.ts src/features/session/useSession.test.ts
git commit -m "feat: default room privacy from auth state and generate titles on save"
```

---

## Task 8: `AccessDenied` screen

**Files:**
- Create: `src/features/session/AccessDenied.tsx`
- Create: `src/features/session/AccessDenied.module.scss`
- Test: `src/features/session/AccessDenied.test.tsx`

**Interfaces:**
- Consumes: `AuthModal` (Task 10) — import it here; if Task 10 is implemented after this task in sequence, stub this task's render of `AuthModal` against the signature already fixed in Task 10's Interfaces block (`{ open, onOpenChange, initialMode, onSuccess }`) and revisit only if that signature changes, which it should not once committed.
- Produces: `AccessDenied(): JSX.Element` (no props — it reads `useAuthUser()` itself to decide whether to offer a login prompt), consumed by Task 9's `SessionRoute`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/session/AccessDenied.test.tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccessDenied from './AccessDenied';
import { emitAuthStateChange, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('AccessDenied', () => {
  test('shows the private-room message', () => {
    render(<AccessDenied />);
    expect(screen.getByText(/this room is private/i)).toBeInTheDocument();
  });

  test('offers a login prompt for an anonymous visitor', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    render(<AccessDenied />);
    expect(await screen.findByRole('button', { name: /log in/i })).toBeInTheDocument();
  });

  test('does not offer a login prompt for a different logged-in user', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-2', email: 'x@y.com', is_anonymous: false } });
    render(<AccessDenied />);
    await screen.findByText(/this room is private/i);
    expect(screen.queryByRole('button', { name: /log in/i })).not.toBeInTheDocument();
  });

  test('clicking Log in opens the auth modal', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    render(<AccessDenied />);
    await userEvent.click(await screen.findByRole('button', { name: /log in/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/session/AccessDenied.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `AccessDenied` in `src/features/session/AccessDenied.tsx`**

Centered message layout (reuse the general page-chrome conventions `NotFound.tsx`/`NotFound.module.scss` already establish for a similar single-message screen): "This room is private." plus, when `useAuthUser().isAnonymous` is true, a short line inviting sign-in and a "Log in" button that opens `AuthModal` (`initialMode="login"`) in local `open` state; when `onSuccess` fires, no special handling is required here beyond closing the modal — the next render of `SessionRoute` (Task 9) re-runs `useSessionAccess` because `currentUserId` changes, naturally re-evaluating access. Always include a link back to `/`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/session/AccessDenied.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/AccessDenied.tsx src/features/session/AccessDenied.module.scss src/features/session/AccessDenied.test.tsx
git commit -m "feat: add the private-room access-denied screen"
```

---

## Task 9: Wire `SessionRoute` to the new access gate

**Files:**
- Modify: `src/routes/SessionRoute.tsx`
- Modify: `src/routes/SessionRoute.test.tsx`
- Delete: `src/features/session/useSessionType.ts`, `src/features/session/useSessionType.test.ts` — `SessionRoute.tsx` is their only consumer; this task is what removes that last import, so this is the task that deletes them, not Task 6 (which only added the replacement alongside them).

**Interfaces:**
- Consumes: `useAuthUser` (Task 4), `useSessionAccess` (Task 6), `AccessDenied` (Task 8).
- Produces: `SessionRoute` now also reads a `private` search param and passes `userId`, `isAnonymous`, and a resolved `privacyHint: boolean | null` down into `SessionWorkspace`/`ReactSessionWorkspace` (Task 12 adds the matching props to those two components — until Task 12 lands, pass them as-is; TypeScript will flag the mismatch, which Task 12 resolves).

- [ ] **Step 1: Write the failing tests**

Update `src/routes/SessionRoute.test.tsx`'s existing cases to the new hook (replace any `mockConfig.sessionRow`/type-only setup with `mockConfig.rpcData` shaped per Task 6), and add:

```tsx
test('renders AccessDenied when useSessionAccess reports denied', async () => {
  mockConfig.rpcData = [{ exists_: true, is_private: true, owner_id: 'someone-else', session_type: 'web' }];
  render(<MemoryRouter initialEntries={['/code/room1']}><Routes><Route path="/code/:sessionId" element={<SessionRoute />} /></Routes></MemoryRouter>);
  expect(await screen.findByText(/this room is private/i)).toBeInTheDocument();
});

test('renders the normal workspace once access resolves to ready', async () => {
  mockConfig.rpcData = [{ exists_: true, is_private: false, owner_id: null, session_type: 'web' }];
  render(<MemoryRouter initialEntries={['/code/room1']}><Routes><Route path="/code/:sessionId" element={<SessionRoute />} /></Routes></MemoryRouter>);
  expect(await screen.findByText(/this room is private/i).catch(() => null)).toBeNull();
});
```

(Keep/adapt whatever existing tests this file already has for the 404/`!sessionId` branch and the web-vs-react dispatch — those branches are unchanged in behavior, just re-pointed at the new hook's `status: 'ready'` case instead of `useSessionType`'s old `loading`/`sessionType`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/SessionRoute.test.tsx`
Expected: FAIL — still wired to `useSessionType`.

- [ ] **Step 3: Implement the changes in `src/routes/SessionRoute.tsx`**

```tsx
const { sessionId } = useParams<{ sessionId: string }>();
const [searchParams] = useSearchParams();
const rawType = searchParams.get('type');
const typeHint: SessionType = rawType && isSessionType(rawType) ? rawType : 'web';
const rawPrivate = searchParams.get('private');
const privacyHint: boolean | null = rawPrivate === '1' ? true : rawPrivate === '0' ? false : null;
const { userId, isAnonymous, loading: authLoading } = useAuthUser();
const access = useSessionAccess(sessionId ?? '', typeHint, userId);
if (!sessionId) return <NotFound />;
if (authLoading || access.status === 'loading') return null;
if (access.status === 'denied') return <AccessDenied />;
const sessionType = access.sessionType;
return sessionType === 'react' ? (
  <ReactSessionWorkspace sessionId={sessionId} userId={userId} isAnonymous={isAnonymous} privacyHint={privacyHint} />
) : (
  <SessionWorkspace sessionId={sessionId} userId={userId} isAnonymous={isAnonymous} privacyHint={privacyHint} />
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/SessionRoute.test.tsx`
Expected: PASS (full green only after Task 12 adds the matching props to the two workspace components — if Task 12 hasn't landed yet in your execution order, a type error here is expected and resolves there; do not change those two components' prop signatures from this task).

- [ ] **Step 5: Delete the now-unused `useSessionType`**

Delete `src/features/session/useSessionType.ts` and `src/features/session/useSessionType.test.ts`, then confirm nothing else references it:

Run: `grep -rn "useSessionType" src`
Expected: no results.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/routes/SessionRoute.tsx src/routes/SessionRoute.test.tsx
git rm src/features/session/useSessionType.ts src/features/session/useSessionType.test.ts
git commit -m "feat: gate SessionRoute on useSessionAccess, rendering AccessDenied for private rooms"
```

---

## Task 10: `AuthModal`

**Files:**
- Create: `src/features/auth/AuthModal.tsx`
- Create: `src/features/auth/AuthModal.module.scss`
- Test: `src/features/auth/AuthModal.test.tsx`

**Interfaces:**
- Consumes: `signUpWithEmail`, `verifySignupOtp`, `loginWithPassword`, `requestPasswordReset`, `verifyPasswordResetOtp`, `setNewPassword` from `../../lib/supabase` (Task 3); `@radix-ui/react-dialog` (already a dependency, same primitive the codebase doesn't yet use elsewhere for a form — follow `ThemeDrawer`'s existing open/close prop convention for consistency).
- Produces: `AuthModal({ open, onOpenChange, initialMode = 'login', onSuccess }: { open: boolean; onOpenChange: (open: boolean) => void; initialMode?: 'login' | 'signup'; onSuccess?: () => void }): JSX.Element`, consumed by `AccessDenied` (Task 8), `AccountMenu` (Task 11), and `Landing` (Task 13).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/auth/AuthModal.test.tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuthModal from './AuthModal';
import {
  signUpWithEmail, verifySignupOtp, loginWithPassword,
  requestPasswordReset, verifyPasswordResetOtp, setNewPassword,
  resetSupabaseMock,
} from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('AuthModal', () => {
  test('login: submitting email+password calls loginWithPassword and onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(loginWithPassword).toHaveBeenCalledWith('a@b.com', 'secret123');
    expect(onSuccess).toHaveBeenCalled();
  });

  test('login: a rejected loginWithPassword shows its error message and does not call onSuccess', async () => {
    loginWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } });
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /log in/i }));
    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  test('signup: email+password then a correct OTP calls signUpWithEmail, verifySignupOtp, and onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="signup" onSuccess={onSuccess} />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    expect(signUpWithEmail).toHaveBeenCalledWith('new@b.com', 'secret123');
    await userEvent.type(await screen.findByLabelText(/code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(verifySignupOtp).toHaveBeenCalledWith('new@b.com', '123456');
    expect(onSuccess).toHaveBeenCalled();
  });

  test('signup: a wrong OTP shows an error and lets the user retry without closing', async () => {
    verifySignupOtp.mockResolvedValueOnce({ error: { message: 'Token has expired or is invalid' } });
    render(<AuthModal open onOpenChange={() => {}} initialMode="signup" />);
    await userEvent.type(screen.getByLabelText(/email/i), 'new@b.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await userEvent.type(await screen.findByLabelText(/code/i), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByText(/token has expired or is invalid/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/code/i)).toBeInTheDocument();
  });

  test('forgot password: email, then code+new password calls requestPasswordReset, verifyPasswordResetOtp, setNewPassword, and onSuccess', async () => {
    const onSuccess = vi.fn();
    render(<AuthModal open onOpenChange={() => {}} initialMode="login" onSuccess={onSuccess} />);
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.com');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));
    expect(requestPasswordReset).toHaveBeenCalledWith('a@b.com');
    await userEvent.type(await screen.findByLabelText(/code/i), '123456');
    await userEvent.type(screen.getByLabelText(/new password/i), 'newsecret123');
    await userEvent.click(screen.getByRole('button', { name: /reset password/i }));
    expect(verifyPasswordResetOtp).toHaveBeenCalledWith('a@b.com', '123456');
    expect(setNewPassword).toHaveBeenCalledWith('newsecret123');
    expect(onSuccess).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/auth/AuthModal.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `AuthModal` in `src/features/auth/AuthModal.tsx`**

Build on `Dialog.Root`/`Dialog.Portal`/`Dialog.Content` (the pattern `ThemeDrawer.tsx` already establishes for a controlled `open`/`onClose`-style component — follow its prop-forwarding convention, adapted to this task's `open`/`onOpenChange`). Internal state: `mode: 'login' | 'signup' | 'forgot'` (seeded from `initialMode`) and `step: 'form' | 'otp' | 'reset'`, plus `email`, `password`, `code`, `newPassword`, and `errorMessage: string | null`.

- **Login** (`mode: 'login'`, `step: 'form'`): email + password fields, "Log in" button → `loginWithPassword(email, password)`; on `{ error }`, set `errorMessage` to `error.message`; on success, call `onSuccess?.()` and `onOpenChange(false)`. A "Forgot password?" button switches `mode` to `'forgot'`.
- **Sign up** (`mode: 'signup'`, `step: 'form'`): email + password fields, "Sign up" button → `signUpWithEmail(email, password)`; on success, move to `step: 'otp'` (email + code fields, "Verify" button → `verifySignupOtp(email, code)`; on error, set `errorMessage` and stay on this step; on success, `onSuccess?.()` + close).
- **Forgot password** (`mode: 'forgot'`, `step: 'form'`): email field, "Send code" button → `requestPasswordReset(email)`; on success, move to `step: 'reset'` (code + new-password fields, "Reset password" button → first `verifyPasswordResetOtp(email, code)`, and only if that succeeds, `setNewPassword(newPassword)`; either failing sets `errorMessage` and stays; both succeeding calls `onSuccess?.()` + close).

Every field gets an associated `<label>` (so `getByLabelText` queries resolve); `errorMessage`, when set, renders as plain text the tests match by substring.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/auth/AuthModal.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/AuthModal.tsx src/features/auth/AuthModal.module.scss src/features/auth/AuthModal.test.tsx
git commit -m "feat: add AuthModal covering signup, login, and password reset"
```

---

## Task 11: `AccountMenu`

**Files:**
- Create: `src/features/auth/AccountMenu.tsx`
- Create: `src/features/auth/AccountMenu.module.scss`
- Test: `src/features/auth/AccountMenu.test.tsx`

**Interfaces:**
- Consumes: `useAuthUser` (Task 4), `AuthModal` (Task 10), `logout` from `../../lib/supabase` (Task 3), `@radix-ui/react-dropdown-menu` (already a dependency, used by `UsersMenu`/`ExportMenu` — follow their existing trigger/content pattern).
- Produces: `AccountMenu(): JSX.Element` (no props, self-contained), mounted by `Landing` (Task 13) and `Header` (Task 12), and used for navigation to `/my-rooms` (Task 14).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/auth/AccountMenu.test.tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AccountMenu from './AccountMenu';
import { emitAuthStateChange, logout, resetSupabaseMock } from '../../test/supabaseMock';

vi.mock('../../lib/supabase', () => import('../../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

function renderMenu() {
  return render(<MemoryRouter><AccountMenu /></MemoryRouter>);
}

describe('AccountMenu', () => {
  test('logged out (anonymous): shows a Log in trigger that opens AuthModal', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /log in/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  test('logged in: shows the account email and a menu with My Rooms and Log out', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'me@example.com', is_anonymous: false } });
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /me@example.com/i }));
    expect(screen.getByRole('menuitem', { name: /my rooms/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /log out/i })).toBeInTheDocument();
  });

  test('logged in: clicking Log out calls logout()', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'me@example.com', is_anonymous: false } });
    renderMenu();
    await userEvent.click(await screen.findByRole('button', { name: /me@example.com/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /log out/i }));
    expect(logout).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/auth/AccountMenu.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `AccountMenu` in `src/features/auth/AccountMenu.tsx`**

`const { email, isAnonymous, loading } = useAuthUser();` — while `loading`, render nothing (avoids a flash of the logged-out state before the real session resolves). When `isAnonymous`, render a plain "Log in" button that opens local `AuthModal` state (`initialMode="login"`). Otherwise render a `DropdownMenu.Root` (matching `UsersMenu.tsx`'s existing trigger/content structure) whose trigger shows `email`, with `DropdownMenu.Item`s "My Rooms" (a `Link to="/my-rooms"`, `role="menuitem"` via Radix) and "Log out" (`onSelect={() => logout()}`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/auth/AccountMenu.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/auth/AccountMenu.tsx src/features/auth/AccountMenu.module.scss src/features/auth/AccountMenu.test.tsx
git commit -m "feat: add AccountMenu for login/logout and My Rooms access"
```

---

## Task 12: Wire the privacy toggle, AccountMenu, and dynamic title into the session workspace

**Files:**
- Modify: `src/features/session/Header.tsx`
- Modify: `src/features/session/Header.module.scss`
- Modify: `src/features/session/Header.test.tsx`
- Modify: `src/features/session/SessionWorkspace.tsx`
- Modify: `src/features/session/SessionWorkspace.test.tsx`
- Modify: `src/features/session/ReactSessionWorkspace.tsx`
- Modify: `src/features/session/ReactSessionWorkspace.test.tsx`

**Interfaces:**
- Consumes: `userId`, `isAnonymous`, `privacyHint` as props from `SessionRoute` (Task 9) — replacing each workspace's own local `ensureAnonymousSession`/`useState`/`useEffect` boilerplate, which is deleted, not replaced with a direct `useAuthUser()` call (identity resolution now lives one level up, in `SessionRoute`); `useSession`'s new fields (Task 7); `AccountMenu` (Task 11), which is self-contained and calls `useAuthUser()` itself.
- Produces: `Header`'s new props — adds `isPrivate: boolean`, `isOwner: boolean`, `onTogglePrivacy: () => void` to its existing `Props` type; nothing downstream of this task depends on it further.

- [ ] **Step 1: Write the failing tests**

Add to `Header.test.tsx`:

```tsx
test('shows the privacy toggle pill only when isOwner is true', () => {
  const { rerender } = render(<Header {...baseProps} isPrivate={true} isOwner={false} onTogglePrivacy={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /private/i })).not.toBeInTheDocument();
  rerender(<Header {...baseProps} isPrivate={true} isOwner={true} onTogglePrivacy={vi.fn()} />);
  expect(screen.getByRole('button', { name: /private/i })).toBeInTheDocument();
});

test('clicking the privacy toggle calls onTogglePrivacy', async () => {
  const onTogglePrivacy = vi.fn();
  render(<Header {...baseProps} isPrivate={true} isOwner={true} onTogglePrivacy={onTogglePrivacy} />);
  await userEvent.click(screen.getByRole('button', { name: /private/i }));
  expect(onTogglePrivacy).toHaveBeenCalledOnce();
});

test('renders AccountMenu', () => {
  render(<Header {...baseProps} isPrivate={false} isOwner={false} onTogglePrivacy={vi.fn()} />);
  // AccountMenu renders nothing visible while useAuthUser is loading in this mock setup,
  // so assert on its container landmark instead of specific text -- adapt to whatever
  // AccountMenu's own tests already settled on as its stable query.
});
```

Add to `SessionWorkspace.test.tsx` and `ReactSessionWorkspace.test.tsx` (one case each, same shape): a room with `owner_id: null` (made anonymously, e.g. by a previous visitor), opened now by a *logged-in* `userId` — `isOwner` must still come out `false`, since `null !== userId`, so `Header` never receives `isOwner={true}` for it:

```tsx
test('a room with no owner (made anonymously) never shows the privacy toggle, even to a logged-in viewer', async () => {
  mockConfig.sessionRow = { id: 'room1', html: '', css: '', js: '', is_private: false, owner_id: null, title: '' } as any;
  render(<SessionWorkspace sessionId="room1" userId="real-1" isAnonymous={false} privacyHint={null} />);
  await waitFor(() => expect(screen.queryByText(/loading/i)).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /private|public/i })).not.toBeInTheDocument();
});
```

(Check `Header.test.tsx`'s current top for however it builds `baseProps`/renders `Header` today, and extend that fixture rather than redefining it — it already wraps with whatever router/provider context `Header` needs, e.g. for its existing `Link to="/"`.)

For `SessionWorkspace.test.tsx` and `ReactSessionWorkspace.test.tsx`: find their current render calls (today likely `render(<SessionWorkspace sessionId="room1" />)` with `ensureAnonymousSession` mocked via `supabaseMock`) and update each to the new props `userId`/`isAnonymous`/`privacyHint`, removing any assertions specific to the component's own now-removed internal sign-in effect (that behavior moved to `useAuthUser`, already covered by Task 4's tests) — add one test per file confirming the dynamic `<title>` reflects `useSession`'s `title` field, e.g.:

```tsx
test('sets the document title from the session title', async () => {
  mockConfig.sessionRow = { id: 'room1', html: '<title>Hi</title>', css: '', js: '', is_private: false, owner_id: null, title: 'Hi' } as any;
  render(<SessionWorkspace sessionId="room1" userId="u1" isAnonymous={false} privacyHint={null} />);
  await waitFor(() => expect(document.title).toBe('Hi'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/Header.test.tsx src/features/session/SessionWorkspace.test.tsx src/features/session/ReactSessionWorkspace.test.tsx`
Expected: FAIL — new props/behavior don't exist yet.

- [ ] **Step 3: Implement the changes**

**`Header.tsx`**: add `isPrivate`, `isOwner`, `onTogglePrivacy` to `Props`. Render a small toggle pill (text "Private"/"Public" per `isPrivate`, `onClick={onTogglePrivacy}`) next to the existing room-link chip, only when `isOwner` is true. Mount `<AccountMenu />` in the `.actions` row (desktop) and inside `MoreMenu`'s panel (mobile), alongside the existing `ThemeButton`/`UsersMenu`/etc. entries.

**`SessionWorkspace.tsx`** and **`ReactSessionWorkspace.tsx`** (same change in both, mirroring their existing parallel structure): accept `userId: string | null`, `isAnonymous: boolean`, `privacyHint: boolean | null` as props (replacing the local `useState`/`useEffect`/`ensureAnonymousSession` block entirely — delete it). Pass `isAnonymous` and `privacyHint` into `useSession(...)` per its Task 7 signature. Render a plain `<title>{title || 'CodeShare'}</title>` (React 19 head-hoisting, same mechanism as `PageSeo`) using the `title` field `useSession` now returns. Pass `isPrivate`, `ownerId === userId` as `isOwner`, and `setPrivacy` wrapped as `onTogglePrivacy={() => setPrivacy(!isPrivate)}` into `Header`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/Header.test.tsx src/features/session/SessionWorkspace.test.tsx src/features/session/ReactSessionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/session/Header.tsx src/features/session/Header.module.scss src/features/session/Header.test.tsx src/features/session/SessionWorkspace.tsx src/features/session/SessionWorkspace.test.tsx src/features/session/ReactSessionWorkspace.tsx src/features/session/ReactSessionWorkspace.test.tsx
git commit -m "feat: add owner-only privacy toggle, account menu, and dynamic tab title to the workspace"
```

---

## Task 13: Landing page — Public/Private toggle and highlight

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.module.scss`
- Modify: `src/routes/Landing.test.tsx`

**Interfaces:**
- Consumes: `useAuthUser` (Task 4), `AccountMenu` (Task 11).
- Produces: nothing further downstream — this is a leaf task.

- [ ] **Step 1: Write the failing tests**

Add to `Landing.test.tsx` (following its existing render/query conventions):

```tsx
test('logged-in: Public/Private toggle defaults to Private, and the create link includes ?private=1', async () => {
  emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
  render(<MemoryRouter><Landing /></MemoryRouter>);
  const privateOption = await screen.findByRole('button', { name: /^private$/i });
  expect(privateOption).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', { name: /create new room/i })).toHaveAttribute('href', expect.stringContaining('private=1'));
});

test('logged-out: selecting Private opens AuthModal instead of changing the link', async () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  await userEvent.click(await screen.findByRole('button', { name: /^private$/i }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /create new room/i })).toHaveAttribute('href', expect.stringContaining('private=0'));
});

test('logged-out: a successful login in the opened modal switches the toggle to Private', async () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  await userEvent.click(await screen.findByRole('button', { name: /^private$/i }));
  // Drive the modal to success exactly as AuthModal.test.tsx's own login case does,
  // then assert the toggle is now pressed and the link carries private=1 --
  // reuse AuthModal's already-covered login flow rather than re-deriving it here.
});

test('mentions private rooms somewhere prominent on the page', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  expect(screen.getByText(/private/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL — toggle doesn't exist yet.

- [ ] **Step 3: Implement the changes in `src/routes/Landing.tsx`**

Add `const { isAnonymous } = useAuthUser();` and `const [privacyOverride, setPrivacyOverride] = useState<boolean | null>(null);` and `const [authModalOpen, setAuthModalOpen] = useState(false);`. Compute `const isPrivate = privacyOverride ?? !isAnonymous;`. Add a second toggle group next to the existing Web/React one, mirroring its `role="group"`/`aria-pressed` pattern, with options "Public" and "Private": selecting "Public" calls `setPrivacyOverride(false)`; selecting "Private" when `isAnonymous` opens `AuthModal` (`initialMode="signup"`, `onSuccess={() => setPrivacyOverride(true)}`) instead of changing state directly; selecting "Private" when not anonymous calls `setPrivacyOverride(true)`. Extend `roomHref`/`enterRoomAs` to append `&private=${isPrivate ? 1 : 0}` (or `?private=...` when it's the only param) alongside the existing `type` param. Mount `<AccountMenu />` in the header next to `ThemeButton`. Add one short highlight line in the hero copy or a new feature card calling out that logged-in users get private rooms by default (exact wording is yours — keep it to a sentence, consistent with the hero's existing terse copy style).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.module.scss src/routes/Landing.test.tsx
git commit -m "feat: add Public/Private room toggle and highlight private rooms on Landing"
```

---

## Task 14: My Rooms history page

**Files:**
- Create: `src/routes/MyRooms.tsx`
- Create: `src/routes/MyRooms.module.scss`
- Test: `src/routes/MyRooms.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useAuthUser` (Task 4), `supabase.from('sessions')` directly (same as `useSessionType`/`useSession` already do for reads — no new wrapper needed for a one-shot list query).
- Produces: route `/my-rooms`, nothing further downstream.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/routes/MyRooms.test.tsx
import { describe, expect, test, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import MyRooms from './MyRooms';
import { emitAuthStateChange, mockConfig, resetSupabaseMock } from '../test/supabaseMock';

vi.mock('../lib/supabase', () => import('../test/supabaseMock'));

beforeEach(() => {
  resetSupabaseMock();
});

describe('MyRooms', () => {
  test('logged out (anonymous): prompts to log in instead of querying', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'anon-1', email: null, is_anonymous: true } });
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText(/log in to see your rooms/i)).toBeInTheDocument();
  });

  test('logged in: lists the owned rooms with their titles', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [
      { id: 'room1', title: 'My Todo App', is_private: true, session_type: 'react', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-20T00:00:00Z' },
      { id: 'room2', title: '', is_private: false, session_type: 'web', created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-19T00:00:00Z' },
    ];
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText('My Todo App')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my todo app/i })).toHaveAttribute('href', '/code/room1');
  });

  test('logged in: shows an empty state when there are no rooms', async () => {
    emitAuthStateChange('SIGNED_IN', { user: { id: 'real-1', email: 'a@b.com', is_anonymous: false } });
    mockConfig.sessionList = [];
    render(<MemoryRouter><MyRooms /></MemoryRouter>);
    expect(await screen.findByText(/no rooms yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/MyRooms.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `MyRooms` in `src/routes/MyRooms.tsx`, and wire the route into `App.tsx`**

`const { userId, isAnonymous, loading } = useAuthUser();` — while `loading`, render nothing. While `isAnonymous`, render a "Log in to see your rooms" prompt with a button opening `AuthModal`. Otherwise, on `userId` becoming available, run `supabase.from('sessions').select('id, title, is_private, session_type, created_at, updated_at').eq('owner_id', userId).order('updated_at', { ascending: false })` once (effect keyed on `userId`) and render the result as a list: each row a `Link to={`/code/${id}`}` showing `title || (session_type === 'react' ? 'Untitled React Room' : 'Untitled Web Room')`, a type badge, a public/private badge, and a relative `updated_at`. Render "No rooms yet — create one from the home page" when the list is empty. In `App.tsx`, import `MyRooms` and add `<Route path="/my-rooms" element={<MyRooms />} />` alongside the existing routes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/MyRooms.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite one more time**

Run: `npm test`
Expected: PASS — the entire suite, including every earlier task's tests, still green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/MyRooms.tsx src/routes/MyRooms.module.scss src/routes/MyRooms.test.tsx src/App.tsx
git commit -m "feat: add My Rooms history page"
```

---

## Deployment note (not a task — manual, post-merge)

Per the spec's Deployment note: once this ships, the "Confirm signup" and "Reset password" email templates on the **hosted** Supabase project need the same local `{{ .Token }}` OTP-form switch applied in Supabase's dashboard (Authentication → Email Templates) before real signup/reset works in production — mirroring the explicitly-manual "Hosted project setup" step `docs/supabase-setup.md` already calls out for other dashboard-only settings. Do this as its own confirmed step, not bundled into any task's commit above.
