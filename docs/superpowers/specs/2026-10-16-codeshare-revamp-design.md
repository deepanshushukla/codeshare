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
  custom-domain mapping no longer points at a live Hosting site. This needs
  to be fixed in the Firebase console/CLI as part of redeploy (requires the
  owner's authenticated Firebase session).
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
| Hosting | Stay on Firebase Hosting; fix the broken custom-domain mapping |
| Styling | Sass Modules (not Tailwind) |
| Collaboration model | Debounced last-write-wins, fixed properly (not CRDT/Yjs) |

## Target Architecture

### Build & language
Vite + React 19 + TypeScript, replacing CRA/`react-scripts` entirely.

### Backend
Firebase, modular SDK (v11+) instead of v8 namespaced imports.

- **Realtime Database** stays the sync transport — schema stays close to
  today's shape: `sessions/{sessionId}: { html, css, js, users: { [uid]:
  { name, status, lastSeen } }, createdAt, updatedAt }`.
- **Firebase Anonymous Auth** is added and is the fix for the
  `auth != null` rules bug: on load, the app silently calls
  `signInAnonymously()`, and the resulting `uid` becomes the stable
  per-participant identity for that browser — replacing the global
  `sessionStorage.user` key that currently leaks across sessions.
- **Security rules** are tightened beyond bare `auth != null`: basic shape
  validation per session node (expected keys, reasonable string size caps)
  so a bad client can't write arbitrary garbage into the database.

### Local development
Firebase Local Emulator Suite (Realtime Database + Auth) wired into the dev
script, so local development never touches the live production database or
needs production credentials. This is required for "check it locally
first" to mean anything — today there is no isolation at all.

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
- `onDisconnect()` registered right after a user is written into
  `users/{uid}`, flipping `status` to `offline` (or removing the node) if
  the connection drops without a clean unmount.
- Identity keyed by the anonymous-auth `uid`, not a hand-rolled random key
  in global `sessionStorage`.

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
  app/            routing, providers, firebase bootstrap
  features/
    landing/      marketing home page (today's AppMainPage)
    session/      Header, TabBar, EditorPane, OutputFrame, ConsolePanel,
                   UsersMenu, ExportMenu, RunControls
    errors/       404 page
  lib/
    firebase.ts   initializeApp / getDatabase / getAuth, signInAnonymously
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
- Firebase `.info/connected` drives a small "reconnecting…" banner instead
  of silently failing writes.
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
same room against the local emulator — live sync, presence join/leave,
export, Run, and Console all behave correctly.

### Repo hygiene
- Untrack `.idea/`, `.eslintcache`, `yarn-error.log`.
- Move `firebaseConfig` out of a committed source file into environment
  variables (defense in depth; client Firebase keys are meant to be
  public, but this keeps config out of source control regardless).

## Explicitly out of scope
- CRDT/Yjs-based character-level merge — staying with debounced
  last-write-wins per the collaboration-model decision above.
- Tailwind — staying with Sass Modules per the styling decision above.
- Moving hosting off Firebase.
- Any new features beyond what the current app already does (this is a
  modernization + redesign + bugfix pass, not a feature expansion).

## Deployment note

Fixing the broken codeshare.in custom-domain mapping and actually running
`firebase deploy` happens as its own confirmed step once the rewrite is
verified locally against the emulator — it touches live, shared
infrastructure and needs the owner's authenticated Firebase CLI session.
