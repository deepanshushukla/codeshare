# CodeShare Revamp — Design Spec

Date: 2026-10-16
Status: Approved for planning

## Context

CodeShare (codeshare.in, repo `live-code-share`) is a real-time collaborative
code-sharing tool: a session has HTML/CSS/JS editor tabs plus a Console tab
and an Output preview, synced live across participants via Firebase Realtime
Database. It was built ~6 years ago on Create React App, React 17, Firebase
v8 (namespaced SDK), CodeMirror 5, and antd. The production site
(codeshare.in) is currently down, and the stack is deprecated end to end.

### Findings from current codebase audit

- **Hosting is broken**: codeshare.in resolves to Firebase/Fastly
  infrastructure but returns Firebase's own "Site Not Found" page — the
  custom-domain mapping no longer points at a live Hosting site. The
  revamp sidesteps diagnosing this by moving hosting to Vercel and
  repointing DNS fresh (see Decisions below).
- **Realtime Database is almost certainly rejecting all reads/writes**:
  `database.rules.json` requires `auth != null`, but the app never calls
  Firebase Auth anywhere (no `signInAnonymously`, no sign-in flow at all).
  Every `firebase.database().ref(...)` call should be hitting
  `PERMISSION_DENIED`.
- **Security bug**: `App.js` `runClick()` calls `eval(js)` directly in the
  main application window, in addition to refreshing the sandboxed output
  iframe. Since `js` is live-synced content any session participant can
  edit, this lets one collaborator's code execute unsandboxed in another
  participant's real browser tab (session storage, Firebase SDK instance,
  etc. all in scope).
- **Identity bug**: per-user identity is stored in a single global
  `sessionStorage` key (`"user"`), not scoped per session ID. Opening a
  second session in the same tab reuses/corrupts identity from the first.
- **Presence never clears**: no `onDisconnect()` handler — a closed/crashed
  tab leaves that user marked "online" in the session forever.
- **Latent state bug**: `Initial_Tabs` is a module-level object that gets
  mutated directly (`Initial_Tabs[key] = false`) instead of copied, which is
  incorrect even if it hasn't caused a visible failure yet.
- **No dev/prod isolation**: local development (`yarn start`) and
  production point at the same live Firebase project — there is no
  emulator or separate environment.
- **Deprecated stack across the board**: `react-scripts` (CRA, unmaintained),
  Firebase v8 namespaced SDK, `node-sass` (deprecated for years), CodeMirror
  5, antd v4, no TypeScript, no tests, no CI. Repo hygiene issues: `.idea/`,
  `.eslintcache`, `yarn-error.log` are committed to git.
- **Console tab is disconnected from Output**: the Console tab hooks the
  *parent* window's `console`, so it only shows logs from the main-thread
  `eval()` (the security bug above) and the console's own REPL input — it
  never shows logs from code actually running in the sandboxed Output
  iframe.

## Decisions (confirmed with project owner)

| Area | Decision |
|---|---|
| Stack depth | Full modern rewrite (not a patch, not a moderate upgrade) |
| Visual redesign | Full redesign, not just a style refresh |
| Editor engine | CodeMirror 6 |
| Hosting | **Vercel** (not Firebase Hosting) |
| Backend | **Supabase** — Postgres + Realtime (not Firebase RTDB) |
| Styling | Sass Modules (not Tailwind) |
| Collaboration model | Debounced last-write-wins, fixed properly (not CRDT/Yjs) |

Firebase is retired entirely (hosting, Realtime Database, and the planned
anonymous auth) — no production data migration, since sessions are
ephemeral rooms and the site is already down.

## Target Architecture

### Build & language
Vite + React 19 + TypeScript, replacing CRA/`react-scripts` entirely.

### Backend
**Supabase** — Postgres + Realtime + Auth — replacing Firebase entirely.

- **Postgres** holds the session row as source of truth:
  `sessions(id, html, css, js, created_at, updated_at)` and
  `session_users(session_id, user_id, name, status, last_seen_at)`. Debounced
  edits upsert into `sessions`; this is also what a newly-joining client
  reads on load to get current content.
- **Supabase Realtime** carries live updates between already-connected
  clients: a per-session **Broadcast** channel for html/css/js edits (low
  latency, not round-tripped through Postgres on every keystroke), and the
  channel's built-in **Presence** feature for who's online — Presence
  tracks joins/leaves automatically and fires a leave event when a client
  disconnects, which is the actual fix for the "presence never clears" bug
  (no hand-rolled disconnect handling needed).
- **Supabase Auth anonymous sign-in** replaces the originally-planned
  Firebase anonymous auth: on load, the app signs in anonymously, and the
  resulting user id is the stable per-participant identity for that
  browser — replacing the global `sessionStorage.user` key that currently
  leaks across sessions.
- **Row Level Security (RLS)** policies on both tables replace Firebase's
  JSON-shaped rules: real column types/constraints (e.g. length caps on
  `html`/`css`/`js`) instead of hand-rolled shape validation.

### Local development
Supabase CLI local dev stack (local Postgres + Realtime + Auth, via
`supabase start`) wired into the dev workflow, so local development never
touches the live hosted Supabase project or needs production credentials.
This is required for "check it locally first" to mean anything — today
there is no isolation at all.

### Execution engine (security fix)
Replace the dual-path "refresh iframe + eval in main thread" with a single
path: code runs **only** inside the sandboxed output iframe
(`sandbox="allow-scripts"`, explicitly no `allow-same-origin`). A small
script injected into the iframe's `srcDoc` wraps `console.log/warn/error`
and `window.onerror`, forwarding everything to the parent via
`postMessage`. The parent's Console panel renders whatever arrives over
that bridge. Net effects:
- No `eval()` ever runs in the main application window.
- The Console tab becomes an accurate reflection of what Output actually
  ran, which it currently is not.
- The console's REPL input (type a JS line, press Enter) posts that line
  into the iframe to be evaluated there too, instead of `eval`-ing locally.

### Presence
- Each client calls `channel.track({...})` on the session's Realtime
  channel on join; Supabase Presence fires sync/join/leave events to every
  other connected client automatically, including on ungraceful
  disconnect (closed tab, crash, lost network) — no manual disconnect
  handler to get wrong.
- Identity keyed by the Supabase anonymous-auth user id, not a hand-rolled
  random key in global `sessionStorage`.

### UI layer
- Drop antd and Font Awesome. Replace with **Radix UI primitives**
  (unstyled, accessible Dropdown Menu / Tooltip / Dialog) styled with Sass
  Modules, and **lucide-react** for icons.
- Design tokens (color, spacing, radius, type scale) as Sass variables /
  CSS custom properties, with light and dark theme support — this is the
  full redesign surface.
- Resizable tab panes: replace `react-reflex` (stale, last real update
  ~2021) with **react-resizable-panels** (actively maintained), same
  drag-to-resize behavior.
- Editor: CodeMirror 6 (`@codemirror/lang-html`, `lang-css`,
  `lang-javascript`), replacing CodeMirror 5 + `react-codemirror2`.

### Code layout
```
src/
  app/            routing, providers, supabase bootstrap
  features/
    landing/      marketing home page (today's AppMainPage)
    session/      Header, TabBar, EditorPane, OutputFrame, ConsolePanel,
                   UsersMenu, ExportMenu, RunControls
    errors/       404 page
  lib/
    supabase.ts   createClient, anonymous sign-in, channel helpers
    sandbox.ts    iframe runner + postMessage bridge + injected console shim
    export.ts     html/zip generation (file-saver + jszip, unchanged libs)
  styles/         tokens.scss, globals.scss, theme (light/dark)
```

### Feature parity
Everything the current app does, carried forward and redesigned, nothing
dropped: landing page with "Create New Room" (random session id), 4
toggleable tabs (HTML/CSS/JS/Console) + Output tab, tab selection persisted
in the URL query string, resizable panes, live multi-user sync of
html/css/js, presence list with per-user editable display name (only your
own name is editable), Run button + Ctrl/Cmd+Enter shortcut, export current
output as `.html` or `.zip` (index.html + css/js folder), 404 page for
missing/invalid session routes.

### Error handling
- The Realtime channel's own connection state drives a small
  "reconnecting…" banner instead of silently failing writes.
- Errors thrown by code running in the sandboxed iframe surface as
  error-level entries in the Console panel (via the `postMessage` bridge),
  instead of vanishing into the iframe's own invisible console.
- 404 page kept for routes with no/invalid session id, restyled to match
  the new design.

### Testing
Vitest + React Testing Library, scoped to logic that's actually worth
testing rather than blanket coverage:
- `debounce` utility
- export generation (`.html` / `.zip` content correctness)
- tab-state ⇄ URL query-param parsing
- presence state transitions (online/away/offline)
- the postMessage sandbox bridge (message in → console entry out)

Manual verification pass before calling this done: two browser tabs on the
same room against the local Supabase stack — live sync, presence
join/leave, export, Run, and Console all behave correctly.

### Repo hygiene
- Untrack `.idea/`, `.eslintcache`, `yarn-error.log`.
- Supabase URL/anon key live in environment variables (`.env`, gitignored),
  never committed to source — a straight improvement over the committed
  `firebaseConfig` the current code has.

## Explicitly out of scope
- CRDT/Yjs-based character-level merge — staying with debounced
  last-write-wins per the collaboration-model decision above.
- Tailwind — staying with Sass Modules per the styling decision above.
- Migrating any existing Firebase production data — Firebase is retired
  with no migration (see Decisions).
- Any new features beyond what the current app already does (this is a
  modernization + redesign + bugfix pass, not a feature expansion).

## Deployment note

Standing up the new Supabase project, creating the Vercel project, and
pointing codeshare.in's DNS at Vercel all happen as their own confirmed
step once the rewrite is verified locally against the local Supabase
stack — this touches live, shared infrastructure (DNS, a new hosting
provider) and needs the owner's authenticated Vercel and Supabase
sessions. The old Firebase project (hosting, database, auth) is
decommissioned at that point.
