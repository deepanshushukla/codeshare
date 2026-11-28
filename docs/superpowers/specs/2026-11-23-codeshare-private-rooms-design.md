# Private rooms, accounts, and room history — design

## Intent and why

CodeShare rooms are currently all-or-nothing public: anyone with the link
can read and edit a room's content, because every visitor (including
someone who has never signed up for anything) is silently signed in as an
anonymous Supabase Auth user, and the current RLS policy treats
`anonymous` and real accounts identically (`auth.role() = 'authenticated'`
is true for both).

The owner wants rooms that genuinely only they can see — not
"unguessable URL," actually access-controlled — available to anyone who
signs up with an email/password, with no setup cost (no OAuth app to
register, no third-party dependency). Logged-in users get this by
default; everyone else keeps today's fully-public behavior unless they
specifically ask to go private, at which point they're walked into
signing up.

Once accounts exist, two more things become possible and the owner wants
both: a page listing the rooms you own (since a random room id like
`a3f9x1` means nothing in a list), and a human-readable title for each
room generated automatically from the code written in it.

## Goals

- A logged-in user's new rooms are **private by default**; they can flip
  any room they own to public, at creation or any time after.
- A logged-out visitor's rooms behave exactly as they do today (public,
  editable by anyone with the link) **unless** they try to make one
  private — that action prompts sign-up/login first, then proceeds.
- Visiting a private room you don't own shows a clear, dedicated
  "this room is private" screen — never a blank editor, and never a
  silent write failure.
- Full account lifecycle on Supabase Auth: sign up with email **OTP**
  verification, log in, forgot/reset password (also OTP-based), log out.
- A logged-in user can see a list of rooms they own ("My Rooms"),
  each labeled with a generated title.
- Every room gets a short, human-readable title **generated from its own
  code** — no manual naming UI, no AI/LLM call.

## Non-goals

- Inviting specific other people into a private room. Per the original
  ask, private means **owner-only** — there is no sharing tier between
  "anyone with the link" and "only me."
- Linking an anonymous visitor's pre-existing rooms to a new account
  after they sign up. Rooms created before logging in stay ownerless and
  public; signing up doesn't retroactively claim anything.
- Deleting rooms from the My Rooms list (viewing/opening only, for now).
- OAuth/social login — email + password only (see Approaches).
- User-editable room titles — titles are fully generated from the code,
  per the owner's explicit instruction, not a rename field.

## Anti-goals

(Things that would make this a failure even if it "technically works.")

- A private room's content becoming readable by anyone other than its
  owner, through *any* path — a direct query, an upsert race, the new
  existence-check function described below, or a stale RLS policy left
  over from today's "anyone authenticated" rules. This is the one part
  of this feature that must have no holes.
- A visitor landing on a private room they don't own and seeing a blank
  or broken editor instead of the dedicated access-denied screen.
- An OTP/reset code usable by anyone other than the account holder it
  was emailed to (Supabase's standard guarantee — called out because the
  whole verification/reset flow depends on it).

## Constraints found in the current code

- **RLS today is identity-blind.** `sessions` policies check only
  `auth.role() = 'authenticated'`, which anonymous sessions satisfy —
  every visitor can already read and write every room. The rewrite has
  to narrow this without breaking normal public-room collaboration.
- **Anonymous → real login already "just works" as a session swap.**
  `ensureAnonymousSession()` (`src/lib/supabase.ts`) only creates an
  anonymous session when no session exists at all; it already favors a
  persisted real session on reload. Nothing today reads
  `session.user.is_anonymous`, though — the UI needs a small hook that
  exposes that flag, since "is this visitor logged in for real" drives
  the default-private toggle and the account menu.
- **RLS can't distinguish "doesn't exist" from "exists, but private and
  not yours."** Both cases return zero rows from a plain `select`. The
  current create-on-missing logic in `useSessionType`/`useSession`
  (`src/features/session/`) would misread a stranger's private room as
  "no room yet" and attempt to create a blank *public* row at that same
  id — the upsert would then fail against the new update policy (since a
  private row already exists there under someone else's `owner_id`),
  surfacing as a confusing write-failure banner instead of a clear
  "this room is private" screen. This needs a dedicated existence/
  visibility check that doesn't leak content (see Decided design).
- **Local email testing already works.** The Supabase CLI's local stack
  captures every auth email (OTP codes, reset codes) in Inbucket at
  `localhost:54324` — no real mailbox needed to develop/test this. The
  "Confirm signup" template needs switching from Supabase's default
  magic-link form to the `{{ .Token }}` OTP form — a dashboard/config
  change, not application code (same for the recovery template).
- **No AI/LLM dependency exists in this codebase** (checked
  `package.json`). Titles are generated with a plain string heuristic on
  the client, not a model call — which is also the right call on
  privacy grounds: sending a private room's code to a third-party API
  just to produce a label would undercut the feature it's labeling.

## Approaches considered

**Login method** — email + password (chosen) vs. magic link vs. Google
OAuth. Magic link needs working email delivery configured before you can
test anything, even locally with Inbucket's extra step of reading the
link out of a captured email. OAuth needs a Google Cloud consent screen
registered before the app even runs. Email + password is the only one of
the three with zero external setup, so it's the pick; the schema doesn't
preclude adding the others later.

**Signup verification / password reset mechanics** — OTP code (chosen)
for both vs. the Supabase default (a confirmation *link* for signup, a
recovery *link* for reset). A link-based recovery flow needs a dedicated
`/reset-password` route that detects the token Supabase drops into the
URL fragment on redirect, which is a second, different interaction
pattern from the OTP signup flow. Using `verifyOtp` for both signup and
recovery keeps the whole auth UI to one pattern — "enter your email, then
enter the code we sent" — reused for both cases, with no extra route.

**Title generation** — client-side heuristic on the room's own code
(chosen, per owner's instruction) vs. a call to an LLM. Already settled:
heuristic wins on cost, latency, and — more importantly here — privacy,
since a private room's code shouldn't leave the browser just to generate
a label for it.

## Decided design

### Schema (new migration, `supabase/migrations/0003_private_rooms.sql`)

```sql
alter table sessions
  add column owner_id uuid references auth.users(id) on delete set null,
  add column is_private boolean not null default false,
  add column title text not null default '';
```

### RLS rewrite

Replace the three blanket `sessions` policies with ones that gate on
`is_private`/`owner_id`, and that block an anonymous session from ever
owning a private room:

```sql
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
```

`session_users` is untouched — still reserved, still unused.

### Existence/visibility check without leaking content

A `security definer` Postgres function, callable by any authenticated
user, that answers "does this id exist, and is it private, and whose is
it" without ever returning `html`/`css`/`js`/`app_jsx`/etc:

```sql
create or replace function session_visibility(p_id text)
returns table (exists_ bool, is_private bool, owner_id uuid, session_type text)
language sql security definer as $$
  select true, is_private, owner_id, session_type from sessions where id = p_id
  union all
  select false, false, null, null where not exists (select 1 from sessions where id = p_id)
  limit 1;
$$;
```

`SessionRoute` calls this (via `supabase.rpc('session_visibility', ...)`)
before deciding what to render:

- no row → proceed with today's create-on-first-visit flow.
- row exists, `is_private` false, or `owner_id = auth.uid()` → render the
  normal workspace (the existing `select *` then succeeds under the new
  RLS).
- row exists, private, not yours → render the access-denied screen
  (logged out: with a login prompt; logged in as someone else: a plain
  "this room is private" message).

**My call**: the function also returns `session_type`, and replaces
`useSessionType`'s own independent `select('session_type')`
(`src/features/session/useSessionType.ts`) entirely, rather than running
alongside it. Today that hook has the same "zero rows looks like no row"
ambiguity this function exists to fix — it just resolves it to the type
hint instead of attempting a create, which happens to be harmless only
because nothing currently acts on a wrong guess there. Leaving both in
place would mean two independent, sometimes-inconsistent answers to
"does this row exist" in the same route; folding `session_type` into this
one RPC gives `SessionRoute` a single gate that decides visibility *and*
which workspace to mount.

### Auth flows (new `src/features/auth/` folder)

- `useAuthUser()` — wraps `supabase.auth.getSession()` +
  `onAuthStateChange`, exposing `{ userId, email, isAnonymous, loading }`
  app-wide. Replaces ad-hoc identity checks wherever "is this a real
  login" matters (the privacy toggle default, the account menu, the My
  Rooms guard).
- `AuthModal` — one modal (built on the already-installed
  `@radix-ui/react-dialog`) covering:
  - **Sign up**: email + password → `signUp()` → OTP-code step →
    `verifyOtp({ type: 'signup' })`.
  - **Log in**: email + password → `signInWithPassword()`.
  - **Forgot password**: email → `resetPasswordForEmail()` sends an OTP
    → code + new password in one step → `verifyOtp({ type: 'recovery' })`
    then `updateUser({ password })`.
- `AccountMenu` — mounted in both `Landing`'s header and the session
  `Header`. Logged out: a "Log in" trigger that opens `AuthModal`. Logged
  in: shows the email, with "My Rooms" and "Log out"
  (`supabase.auth.signOut()`).

### Public/Private toggle

- **Default is driven by auth state, not just a URL param.** `useSession`'s
  create branch (`src/features/session/useSession.ts`) decides a new
  room's privacy as: an explicit choice if one was passed in, otherwise
  `is_private = !isAnonymous` — private for a real logged-in user, public
  for an anonymous one. This makes the "private by default" goal hold
  everywhere a room gets created, including `JavaScriptCompiler.tsx` and
  `ReactPlayground.tsx`'s own CTAs, which build a bare `/code/:id` link
  with no privacy hint at all today — those pages need no toggle UI of
  their own, they just inherit the correct default.
- **Landing page** adds the only explicit override: a second toggle next
  to the existing Web/React one, "Public ⇄ Private." Logged in → shown
  pre-set to Private, can flip to Public. Logged out → selecting Private
  opens `AuthModal` instead of changing anything; only a successful login
  proceeds as private. The explicit choice rides along the same way
  `?type=react` already does today (a `?private=0`/`?private=1` hint),
  overriding the auth-state default above when present.
- **`owner_id` is set on every room a real (non-anonymous) user creates,
  private or public** — not only private ones. This is what makes "My
  Rooms" (below) list everything a user owns, not just the rooms they
  made private. Anonymous-created rows keep `owner_id = null`, as today.
- **Inside an existing room**: a small toggle pill in the session
  `Header`, next to the room-link chip, shown **only** when
  `owner_id === currentUserId` — i.e. only on a room you created while
  logged in as yourself. Flipping it upserts `is_private`. Rooms with no
  owner (made anonymously) or owned by someone else show no toggle at
  all.
  - **My call**: flipping a room private while someone else already has
    it open doesn't forcibly disconnect them — RLS blocks *new*
    reads/writes immediately (so they can't keep editing, and a reload
    hits the access-denied screen), but there's no "you've been kicked"
    broadcast message built for this. That's a real feature if wanted,
    but it's new scope (a channel message type plus reactive UI) beyond
    what was asked for, so it's left out for now. The anti-goal above is
    about no *new* access ever being possible, not about retroactively
    un-rendering something already on someone's screen before the flip.

### My Rooms

- New route `/my-rooms` (`src/routes/MyRooms.tsx`). Logged out or
  anonymous → prompt to log in, no query. Logged in → `select id, title,
  is_private, session_type, created_at, updated_at from sessions where
  owner_id = auth.uid() order by updated_at desc` (already permitted by
  the new select policy, since it's always "your own"), rendered as a
  list: title, type badge, public/private badge, relative time, link to
  open.

### Title generation

Computed client-side, in the existing debounced-persist path in
`useSession` (`src/features/session/useSession.ts`) — recomputed
whenever a *structural* field changes (`html`/`js` for Web rooms,
`app_jsx` for React rooms; not on CSS-only edits), and upserted into the
new `title` column alongside that field's write.

- Web room priority: `<title>` tag text → first heading tag's text →
  first non-empty `//` comment in the JS → `"Untitled Web Room"`.
- React room priority: first JSX text content found in `app_jsx` → the
  component's function name → `"Untitled React Room"`.
- Trimmed/stripped of markup, truncated to a short length (exact limit
  left to the builder).
- Shown live as the browser tab title via a plain `<title>` tag in the
  session workspace (React 19 head-hoisting, same mechanism `PageSeo`
  already relies on, no need to route it through that component since
  this isn't full page SEO metadata) — and as the label in My Rooms.

## Deployment note

codeshare.in runs against a hosted Supabase project, not just the local
CLI stack. The "Confirm signup" and "Reset password" email template
switch (default link form → `{{ .Token }}` OTP form) has to be applied
there too, the same **explicitly-confirmed, not-automated** manual step
`docs/supabase-setup.md`'s "Hosted project setup" section already uses
for other dashboard-only settings — otherwise local testing stays green
while signup/reset ship broken in production.

## What's left to the builder

- Exact copy for every new screen (auth modal steps, access-denied
  screen, My Rooms empty state).
- Exact title-heuristic string matching (regex choices, truncation
  length) — doesn't need to be clever, just good enough for a list
  label.
- Styling of the new toggle pill, My Rooms list, and auth modal —
  follow the existing Sass Module + design-token conventions.
- Whether "My Rooms" also gets a direct nav link or stays reachable only
  through the account menu.
- Error copy for Supabase auth errors (wrong password, expired/wrong
  OTP, etc.) — surfacing Supabase's own returned error message is
  probably sufficient.
