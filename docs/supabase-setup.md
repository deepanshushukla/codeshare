# Supabase Setup — CodeShare

This documents the Supabase side of the rewrite: what gets created, how,
and why. Companion to the architecture decisions in
`docs/superpowers/specs/2026-10-16-codeshare-revamp-design.md` — read that
first for the overall rationale (why Supabase over Firebase at all).

## What Supabase is doing for this app

Three Supabase pieces, each replacing a specific Firebase piece:

| Need | Firebase (old) | Supabase (new) | Why the swap |
|---|---|---|---|
| Durable session content (html/css/js) | Realtime Database node | Postgres table, upserted on debounced edit | Real column types + constraints instead of schemaless JSON; a Postgres row is also what a newly-joining client reads to catch up |
| Live edit propagation between connected clients | RTDB `.on("value")` listener | Realtime **Broadcast** channel, one per session | Lower latency than round-tripping every keystroke through Postgres; Postgres stays the durable copy, Broadcast is the "while you're both here" fast path |
| Who's currently in the room | Manually written `users/{id}` + `status` field, no cleanup | Realtime **Presence** on the same channel | Presence tracks join/leave automatically, including on dropped connections — this is the actual fix for the old "user stays online forever" bug, not something we have to hand-roll |
| Per-browser identity | Random id in `sessionStorage`, not scoped per session | Supabase Auth **anonymous sign-in** | Stable id tied to a real (if anonymous) auth session, usable in RLS policies |

## Schema

Two tables, created via a SQL migration (`supabase/migrations/`, applied
with `supabase db push` or via the dashboard SQL editor):

```sql
create table sessions (
  id text primary key,                 -- the session/room id from the URL
  html text not null default '',
  css text not null default '',
  js text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session_users (
  session_id text not null references sessions(id) on delete cascade,
  user_id uuid not null,               -- auth.uid() of the anonymous user
  name text not null,
  status text not null default 'online',  -- 'online' | 'away'
  last_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
```

`session_users` is **reserved for a planned future enhancement and is not
used by the app today** — nothing in `src/` reads or writes it. It is
created by the migration (with RLS) so the table and its policies are
already in place when that enhancement lands.

The intended future use: persist a *last known* name/status per user, so a
custom display name survives a reload and so someone joining a room with
nobody else connected still sees who was here. Presence is ephemeral
(in-memory on Supabase's Realtime servers), which is why a durable table
would be needed for that. Until it is implemented, display names live only
in Presence state plus React state, and a renamed user who reloads goes
back to the default `User_xxxx` name. The `last_seen_at` column is there so
that implementation can ignore rows older than, say, a few hours when
rendering the user list, without a cron job.

`html`/`css`/`js` get a `check` constraint on length (e.g.
`char_length(html) < 200000`) — this is the RLS-era replacement for the
old Firebase rules' complete lack of shape/size validation.

## Row Level Security

RLS is **on** for both tables (Supabase default for new tables, don't
disable it). Policies, since every visitor is an anonymous-auth user and
there's no concept of a private room:

```sql
alter table sessions enable row level security;
alter table session_users enable row level security;

create policy "anyone authenticated can read sessions"
  on sessions for select using (auth.role() = 'authenticated');

create policy "anyone authenticated can upsert sessions"
  on sessions for insert with check (auth.role() = 'authenticated');

create policy "anyone authenticated can update sessions"
  on sessions for update using (auth.role() = 'authenticated');

create policy "anyone authenticated can read session_users"
  on session_users for select using (auth.role() = 'authenticated');

create policy "users manage only their own presence row"
  on session_users for insert with check (auth.uid() = user_id);

create policy "users update only their own presence row"
  on session_users for update using (auth.uid() = user_id);
```

Note `auth.role() = 'authenticated'` is true for anonymous-auth sessions
too — Supabase anonymous users are real `authenticated` JWTs, just
without an identity provider attached. This is the direct replacement for
Firebase's `".read"/".write": "auth != null"`, done correctly this time
(the old app had that rule but never actually signed anyone in).

## Auth

Enable **Anonymous sign-ins** in the Supabase dashboard
(Authentication → Providers → Anonymous). On app load:

```ts
const { data } = await supabase.auth.getSession();
if (!data.session) {
  await supabase.auth.signInAnonymously();
}
```

The resulting `auth.uid()` is the stable per-browser identity used as the
Presence key and in Presence `track()` payloads (and would be
`session_users.user_id` if/when that reserved table is put to use).

## Realtime (Broadcast + Presence)

One channel per session, named by session id, carrying both concerns —
and "one" is a hard requirement, not a stylistic preference:

- `supabase.channel(topic)` **dedupes by topic**. Calling it twice with the
  same topic returns the *same* channel object and silently ignores the
  second call's `params`, so a second "creation" loses its
  `config.presence.key`.
- `channel.on('presence' | 'postgres_changes', ...)` **throws** once the
  channel is joining/joined (`cannot add 'presence' callbacks for <topic>
  after subscribe()`), so the hook that runs second cannot add its binding
  at all — uncaught, inside a `useEffect`, which blanks the page.

In this app `useSessionChannel` therefore owns the channel: it creates it
once per session (after anonymous sign-in, because the presence key is a
construction param), registers *both* bindings, calls `subscribe()` once,
and tears down with `supabase.removeChannel(channel)` — `unsubscribe()`
alone leaves the dead channel in the client's registry, where the topic
dedupe keeps handing it back out. `useSession` and `usePresence` receive
that channel and only attach listeners to it.

```ts
const channel = supabase.channel(`session:${sessionId}`, {
  config: { presence: { key: userId } },
});

channel
  .on('broadcast', { event: 'edit' }, ({ payload }) => applyRemoteEdit(payload))
  .on('presence', { event: 'sync' }, () => setUsers(channel.presenceState()))
  .subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      await channel.track({ name, status: 'online' });
    }
  });

// on local edit, after the debounced Postgres upsert:
channel.send({ type: 'broadcast', event: 'edit', payload: { field, value, userId } });
```

No `unsubscribe`/disconnect handler is needed for presence *cleanup* —
Presence's `sync`/`join`/`leave` events fire automatically for every
client on the channel when someone's connection drops, which is exactly
the bug fix called out in the design spec.

## Local development

Supabase CLI local stack, not the hosted project, for day-to-day dev:

```
supabase init          # once, creates supabase/ config
supabase start         # local Postgres + Realtime + Auth + Studio
supabase db reset      # (re)apply migrations in supabase/migrations/
```

`.env.local` points the app at the local stack's URL/anon key (printed by
`supabase start`); `.env.production` (or Vercel project env vars) points
at the hosted project. Never commit either `.env` file — only
`.env.example` with placeholder values.

## Hosted project setup (NEXT MANUAL STEP — not done yet)

Everything else in this plan (schema, RLS, app code, local-stack testing)
is complete. This section is the one remaining step, and it is
deliberately **not automated**: it creates live infrastructure
(a billable hosted Supabase project, a Vercel project, a DNS change on
codeshare.in) and needs the owner's authenticated sessions present to do
it. Do this as its own explicitly-confirmed step, not as part of a
scripted task:

1. Create the project at supabase.com (or `supabase projects create`).
2. Apply the same migration (`supabase link` + `supabase db push`).
3. Enable Anonymous sign-ins (dashboard setting, not in a migration).
4. Copy the project URL + anon key into Vercel's environment variables.
5. Create the Vercel project (it will pick up `vercel.json` at the repo
   root automatically for the SPA rewrite) and point codeshare.in's DNS
   at it.

This step is part of the deployment phase, not local build-out — see the
"Deployment note" in the design spec.
