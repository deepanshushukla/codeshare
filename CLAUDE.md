# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CodeShare (codeshare.in) is a real-time collaborative code-sharing tool.
A "session" (room) has HTML/CSS/JS editor tabs, a Console tab, and an
Output preview; content and user presence sync live across everyone
viewing the same session URL.

## Repo is mid-rewrite — read this first

The repo currently contains the **original 2020-era implementation**
(Create React App + React 17 + Firebase v8 + CodeMirror 5 + antd). It is
being fully rewritten to a modern stack (Vite + React 19 + TypeScript +
Supabase + CodeMirror 6), per the approved design spec at
**`docs/superpowers/specs/2026-10-16-codeshare-revamp-design.md`**.

Read that spec before making architectural decisions — it documents the
target architecture, the bugs being fixed (and why), and what's explicitly
out of scope. Once the rewrite lands, update this file to describe the new
stack/commands and remove the legacy section below.

## Legacy app (current code on disk, until the rewrite replaces it)

### Commands
```
yarn start      # dev server (react-scripts start, REACT_APP_ENV=prod)
yarn build      # production build to build/
yarn lint       # eslint --fix src/**/*.js src/**/*.jsx
yarn prettier   # prettier --write "src/**/*.{js,jsx}"
yarn test       # react-scripts test (no test files currently exist)
```
There is no CI config and no test suite populated — `yarn test` runs
CRA's Jest watcher against zero test files.

### Architecture (legacy)
- **Routing** (`src/index.js`): `/` → landing page (`AppMainPage`);
  `/code/:sessionId` → the editor workspace (`AppContainer` → `App`);
  bare `/:sessionId` redirects to `/code/:sessionId`; `/error/page` → 404.
- **Sync model**: one Firebase Realtime Database node per session at
  `live-sessions/{sessionId}`, holding `{ html, css, js, users }`. `App.js`
  subscribes with `.on("value", ...)` and writes per-field updates via
  `src/utils/firebaseRealtime.js` (debounced through
  `src/utils/debounce.js`). There is no operational-transform/CRDT merge —
  it's last-write-wins per field.
- **Identity/presence**: a random 3-char id is generated client-side and
  cached in `sessionStorage` (global key `"user"`, not scoped per
  session), written into `users/{userId}` with an online/away `status`
  toggled on `visibilitychange`. **Known bug**: no `onDisconnect()`, so a
  closed tab never clears presence.
- **Tab state**: `App.js` holds `tabs` (html/css/js/console/output
  booleans) and mirrors it into the `?selectedTabs=` query param so a
  session URL can be shared with a specific tab layout already open.
  **Known bug**: the default-tabs object (`Initial_Tabs`) is a
  module-level object mutated in place rather than copied.
- **Execution**: the Output tab renders user HTML/CSS/JS into a sandboxed
  `<iframe sandbox="allow-scripts">` via `srcDoc`. Separately, the Run
  button (`runClick`) also calls `eval(js)` **directly in the main app
  window** so the Console tab (which hooks the parent `window.console` via
  `console-feed`) shows output — this is a real security bug (synced,
  attacker-controlled JS executes unsandboxed), fixed in the rewrite by
  routing all execution through the sandboxed iframe with a `postMessage`
  console bridge instead.
- **Firebase config**: `src/firebase-config.js` has the project's client
  config hardcoded (not env-based). `database.rules.json` requires
  `auth != null` for all reads/writes, but the app never calls Firebase
  Auth anywhere — reads/writes are expected to be failing in production.
- Deployed via Firebase Hosting (`firebase.json`, `.firebaserc`, project
  `live-code-share`); the custom domain mapping for codeshare.in is
  currently broken (see the spec's audit findings). The rewrite moves
  hosting to Vercel and the backend to Supabase, retiring Firebase
  entirely.
