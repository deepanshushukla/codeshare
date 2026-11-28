# CodeShare React Mode — Design

## Intent and why

CodeShare today only supports vanilla HTML/CSS/JS sessions. The user wants
to additionally support a React-flavored session — modeled on
[OneCompiler's React tool](https://onecompiler.com/react) — where whoever
holds the session link can write JSX across a small fixed set of files and
see a live-rendered React app, the same way Web sessions work today. This
is a scoped-down version of the original ask (which also mentioned Node.js
and Python); those are explicitly out of scope for this round — see
Non-goals.

## Goals

- A new session type, **React**, chosen at session creation, alongside the
  existing **Web** (HTML/CSS/JS) type.
- A React session exposes a fixed set of files — `App.jsx`,
  `Components.jsx`, `styles.css` — synced live the same way Web session
  tabs are today (per-field debounce to Postgres + immediate Realtime
  Broadcast).
- The Output pane renders the compiled React app, using the same
  sandboxed-iframe model (`sandbox="allow-scripts allow-modals"`, no
  `allow-same-origin`) and Console bridge that Web sessions use today.
- Export (HTML file / ZIP) keeps working for React sessions, producing a
  self-contained artifact that runs standalone (no build step required by
  whoever opens it).
- From **inside an existing session's editor** (not just the Landing
  page), there's a "new session" control that lets you spawn a fresh Web
  or React session. It opens the new session in a **new browser tab** —
  the session you're currently in (and whoever else is in it with you)
  stays untouched, since this is a live collaborative room you're not
  trying to leave.

## Non-goals (this round)

- Node.js and Python execution — explicitly deferred by the person who
  requested this; not designed here at all.
- Switching an existing session between Web and React mode after creation.
- Free-form file trees (add/remove/rename files) — the file set is fixed.
- npm package imports of any kind beyond React + ReactDOM.
- TypeScript (`.tsx`) — JSX only.
- Live auto-refresh of JSX on keystroke (see "Run model" below) — Run
  stays an explicit action for React mode, like it already is for the JS
  pane in Web mode.
- Offline/CDN-outage resilience — React mode introduces a runtime
  dependency on a CDN-hosted UMD build; no vendoring/self-hosting is in
  scope now.

## Anti-goals

- Don't make Web sessions worse to add this — the existing 3-column
  html/css/js schema, debounce/broadcast model, and sandbox security
  posture (no `allow-same-origin`, no eval in main thread) must be
  preserved unchanged for Web sessions.
- Don't quietly expand scope to a real bundler/webpack-style multi-file
  project — this is a playground, not a project generator.

## Current state (ground truth, for the builder)

- `sessions` table (`supabase/migrations/0001_init.sql`) has exactly
  `id, html, css, js, created_at, updated_at`, each of html/css/js capped
  at 200,000 chars via `check` constraints. There is no session-type
  discriminator column today.
- Session creation is lazy and client-only: `Landing.tsx` generates an id
  and navigates to `/code/:id` without touching Postgres. The row is only
  created inside `useSession`'s `loadOrCreate()` (`useSession.ts:72-93`),
  which `upsert()`s hardcoded `STARTER_CONTENT` if no row exists yet.
- `EditorPane` is a single reusable component; `SessionWorkspace` mounts
  **three separate instances** of it (one per html/css/js), not tabs
  within one editor. Each instance's `language` prop selects a CodeMirror
  language extension from a fixed map
  (`LANGUAGE_EXTENSIONS = {html, css, javascript}` in `EditorPane.tsx`).
- Per-field sync: `useSession.updateField(field, value)` does three things
  synchronously — optimistic local state, a debounced (400ms) Postgres
  upsert of just that column, and an **immediate** Realtime Broadcast
  `edit` event carrying `{field, value, userId}`. `EditField` is typed as
  `'html' | 'css' | 'js'` (`useSessionChannel.ts:4`).
- `sandbox.ts`'s `buildSandboxDocument(html, css, js)` builds a plain
  string-concatenated HTML document: css into an `id="__cs_style"` tag,
  html into an `id="__cs_root"` div, then the bridge script, then the raw
  js in a `<script>` tag. `OutputFrame` remounts the iframe (new `key`)
  only when `runToken` changes, which is what re-executes the js; html/css
  changes instead get live-patched via a `postMessage({type:'update', ...})`
  into the already-running document, specifically because JS throws on
  incomplete mid-keystroke syntax while HTML/CSS parse leniently (the
  existing code comment this design must stay consistent with).
- `sandbox="allow-scripts allow-modals"`, confirmed **no**
  `allow-same-origin`. Confirmed during design research: `allow-scripts`
  alone is sufficient for a `<script src="https://...">` CDN tag to load
  and execute inside the sandboxed document — `allow-same-origin`'s
  absence affects storage/origin access, not script loading. This is what
  makes loading React/ReactDOM/Babel Standalone from a CDN viable without
  weakening the sandbox.
- `ExportMenu` builds exports from the html/css/js triple only, via plain
  string templates (`src/lib/export.ts`) — no transform/bundle step exists
  anywhere in the export path today.
- No Babel/JSX/React-in-sandbox tooling exists anywhere in the repo today
  (confirmed by grep) — this is being introduced from scratch.

## Decisions made so far (by the person who asked for this)

- React mode is picked at session creation; a session is Web or React for
  its whole life, never switched later.
- The file set is **multi-file but fixed** (not free-form) — the person
  confirmed "multi-file" then "fixed set of files" when asked to choose
  between those two axes.
- React + ReactDOM only — no npm import support in v1.
- **Fixed file set confirmed**: `App.jsx` (root component),
  `Components.jsx` (shared sub-components, same-scope with `App.jsx` — see
  note below on how sharing works without a bundler), `styles.css`
  (global styles) — a 3-file mirror of today's 3-tab Web shape. Confirmed
  directly against the OneCompiler reference rather than assumed.
- **Run model confirmed**: React mode behaves like the `js` pane does
  today — Run is an explicit action (`runToken` bump → full iframe
  remount → Babel-transpile-then-execute), no live-patch-on-keystroke.
  JSX syntax errors mid-keystroke would otherwise spam the console
  constantly, which is exactly the problem the existing code comment in
  `OutputFrame.tsx` describes for plain JS — the same reasoning applies,
  more strongly, to JSX.
- **Error-state behavior (my call, settled)**: unlike Web mode — where a
  JS runtime error still leaves static HTML/CSS visible because only the
  `js` script tag fails — a React-mode transform/render error would
  otherwise blank the entire Output pane, since Output *is* the render
  output. `buildReactSandboxDocument` wraps the mount call so an uncaught
  Babel-transform or top-level React-render error is caught and rendered
  as a visible, readable error message inside `#__cs_root` (not just
  relayed to Console) — matching Web mode's spirit of "always show
  something in Output," without implementing a full React error-boundary
  component.

## Decisions left to the builder

- **Landing page UI** for choosing Web vs React: left open — could be a
  toggle beside the existing create action or two distinct cards/buttons.
  Either is consistent with the rest of this design; pick whichever is
  less disruptive to `Landing.tsx`'s current layout.
- **In-editor "new session" control UI**: left open — likely a small
  button/menu in `Header.tsx`'s `actions` cluster offering "New Web
  Session" / "New React Session", but exact placement and whether it's a
  dropdown vs. two menu items is up to the builder.
- **React/Babel versions**: pin specific versions in the CDN URLs (e.g.
  a specific React 19.x UMD build and a specific `@babel/standalone`
  version) rather than `@latest`, for reproducibility — exact versions
  left to the builder.
- **CDN provider**: unpkg (or equivalent) for the UMD builds of
  `react`, `react-dom`, and `@babel/standalone`.

## How it should work (architecture)

### Schema

Add, additively, to the `sessions` table (new migration, not editing
`0001_init.sql`):

- `session_type text not null default 'web'` with a `check` constraint
  limiting it to `('web', 'react')`.
- New nullable-with-default columns for the React file set, e.g.
  `app_jsx text not null default ''`, `components_jsx text not null
  default ''`, `react_css text not null default ''`, each with the same
  200,000-char `check` constraint pattern as the existing columns.

Web sessions ignore the new columns; React sessions ignore
html/css/js. `session_type` is set once at row-creation time (in the same
`loadOrCreate()` upsert path) and never changes.

### Creation flow

`Landing.tsx` needs a way to carry the chosen type into the route — e.g.
encode it in the generated link (`/code/:id?type=react` or a distinct
route segment) — so `SessionRoute`/`useSession` knows which `STARTER_CONTENT`
shape and which columns to upsert on first load. This is the one new
decision point in an otherwise-unchanged lazy-creation flow.

`Header.tsx` (the in-editor chrome, not Landing) gets a new "new
session" control — there's currently no way to start another session
without leaving via the logo link back to `/`. It offers the same Web/React
choice as Landing, generates a fresh id and link the same way
(`generateSessionId()` + the same type-encoding scheme above), and opens
it via `window.open(url, '_blank')` rather than `navigate()` — the
current session (and the people in it) must stay exactly as-is, since
this is a live collaborative room. The new tab then goes through the
exact same lazy `loadOrCreate()` path as any fresh Landing-originated
session; no new creation logic, just a second entry point into the same
link-generation + lazy-create flow.

### Editor

- Extend `EditorPane`'s `LANGUAGE_EXTENSIONS`/`META` maps with a `jsx`
  entry using `@codemirror/lang-javascript`'s `javascript({ jsx: true })`,
  and a `css` entry already exists and is reused as-is for `styles.css`.
- `SessionWorkspace` mounts three `EditorPane` instances for a React
  session (`App.jsx`, `Components.jsx`, `styles.css`) instead of the
  html/css/js trio, gated on `session_type`.
- Extend `EditField` (`useSessionChannel.ts`) and the broadcast payload
  type to include the new field names; the debounce-persist +
  immediate-broadcast pattern in `useSession.updateField` is reused
  unchanged, just parameterized over a different field set per session
  type.

### Sandbox / Output

New `buildReactSandboxDocument(appJsx, componentsJsx, css)` alongside the
existing `buildSandboxDocument`, selected by `OutputFrame` based on
`session_type`. It builds a document that:

1. Loads React, ReactDOM, and Babel Standalone via pinned-version CDN
   `<script src>` tags (confirmed to execute fine under `allow-scripts`
   without `allow-same-origin`).
2. Inlines `css` into an `id="__cs_style"` tag, same as today.
3. Provides an `id="__cs_root"` mount element (empty — React owns its
   contents, unlike today's html/css live-patch target).
4. Concatenates `componentsJsx` + `appJsx` into a single
   `<script type="text/babel">` block, relying on Babel Standalone's
   in-browser transform (no bundler, no real ES module resolution — this
   is why `Components.jsx` must define things `App.jsx` can reference as
   globals/same-scope, not via `import`/`export`; the builder should
   decide the simplest convention for this, e.g. both files concatenated
   into one scope rather than using ES module syntax between them).
5. Ends with a mount call: `ReactDOM.createRoot(document.getElementById('__cs_root')).render(<App />)`.
6. Reuses the existing `BRIDGE_SCRIPT` unchanged for console/error
   relay — Babel transform errors and React render errors both surface as
   thrown exceptions/`window.onerror`, which the bridge already forwards.

`runToken`-triggered full remount is the only update path (per the Run
model decision above) — no postMessage live-patch for React mode.

### Export

`ExportMenu` branches on `session_type`. For React sessions, both the
single-HTML and ZIP exports emit the same CDN-script + Babel-Standalone
structure the sandbox uses (so the exported file runs standalone in any
browser, no build step) rather than reusing the current vanilla
html/css/js templates.

## Constraints

- Must not change Web session behavior, schema, or security posture.
- Must keep the sandboxed-iframe/no-eval-in-main-thread security model —
  all execution still happens inside the sandboxed iframe; the main app
  thread never evaluates user code or JSX.
- Must stay within the existing debounce/broadcast sync architecture — no
  new sync mechanism, just a wider field set.

## What's left to the builder

- Exact migration SQL and column/constraint naming.
- Exact Landing page UI treatment for choosing session type (toggle vs.
  cards).
- Exact pinned CDN versions for React/ReactDOM/Babel Standalone.
- Exact convention for how `Components.jsx` and `App.jsx` share scope
  without a real module system (concatenation order, naming convention,
  whether `Components.jsx` is required to assign to `window.*` or just
  share top-level `const` bindings in one concatenated script).
- Test coverage plan (this codebase uses Vitest + RTL throughout; new
  sandbox-building and EditorPane-language-extension logic should get the
  same kind of coverage the existing `sandbox.test.ts`/`OutputFrame.test.tsx`
  have).
