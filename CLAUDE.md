# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

CodeShare (codeshare.in) is a real-time collaborative code-sharing tool.
A "session" (room) has HTML/CSS/JS editor tabs, a Console tab, and an
Output preview; content and user presence sync live across everyone
viewing the same session URL.

## Stack

**Vite + React 19 + TypeScript + Supabase + CodeMirror 6 + Radix UI + Sass Modules**

This is a complete rewrite of the original 2020-era CRA/Firebase app.
For design rationale and architecture details, see:
- `docs/superpowers/specs/2026-10-16-codeshare-revamp-design.md` — architectural decisions and feature overview
- `docs/supabase-setup.md` — Supabase setup, schema, auth, Realtime Broadcast/Presence

## Commands

```
npm run dev              # Start Vite dev server (requires supabase start + .env.local)
npm run build            # TypeScript check + Vite production build
npm run preview          # Preview the production build locally
npm test                 # Run the Vitest suite once
npm run test:watch      # Vitest in watch mode

npx supabase start      # Start local Postgres + Realtime + Auth (printed URL + anon key go in .env.local)
npx supabase db reset   # Re-apply migrations from supabase/migrations/
```

**Before first `npm run dev`**: 
1. Copy `.env.example` to `.env.local`
2. Run `npx supabase start` and copy the output URL + anon key into `.env.local`

## Architecture

### Tech stack
- **Build**: Vite (dev/build) + TypeScript + React 19
- **Backend**: Supabase (Postgres + Realtime Broadcast/Presence + Auth)
- **Editor**: CodeMirror 6 with HTML/CSS/JS language support
- **UI**: Radix UI primitives + lucide-react icons + Sass Modules
- **Execution**: Sandboxed iframe with `postMessage` console bridge (no eval in main thread)
- **Resizable panes**: react-resizable-panels
- **Testing**: Vitest + React Testing Library

### Routing
`src/routes/` — React Router v7:
- `/` → `Landing` (create new session)
- `/code/:sessionId` → `SessionRoute` (editor workspace)
- `*` → `NotFound` (404)

### Data flow
- **Postgres** (the `sessions` table) is the source of truth for session content (html/css/js)
- The `session_users` table exists in the migration but is **reserved and currently unused** — no code reads or writes it. It is there for a planned future enhancement (persisting display names across reloads / empty rooms); display names today live only in ephemeral Presence state, so a custom name is lost on reload
- **Realtime Broadcast** carries live edits between connected clients (low latency, debounced updates)
- **Realtime Presence** tracks who's online (automatic join/leave, fixes the old "user stays online forever" bug)
- **Auth** — anonymous sign-in per browser session, used in RLS policies and Presence tracking

### Feature organization
- **`src/features/session/`** — Session workspace components
  - `EditorPane` — tabs, CodeMirror instances, editor state
  - `OutputFrame` — sandboxed iframe runner
  - `ConsolePanel` — rendered console logs (via postMessage bridge)
  - `UsersMenu` — presence list with per-user editable names
  - `ExportMenu` — export current output as HTML or ZIP
  - `RunControls` — Run button + keyboard shortcuts
  - `useSessionChannel` — owns the session's **single** Realtime channel (both the broadcast and the presence binding, registered before one `subscribe()`); `supabase.channel()` dedupes by topic, so creating it in more than one hook is broken by construction — see `docs/supabase-setup.md`
  - `useSession` — React hook for session data sync (takes the channel from `useSessionChannel`)
  - `usePresence` — React hook for presence state (takes the channel from `useSessionChannel`)

- **`src/lib/`** — Framework-agnostic utilities
  - `supabase.ts` — Supabase client setup, anonymous auth bootstrap
  - `sandbox.ts` — iframe execution engine + console.log postMessage bridge
  - `export.ts` — HTML/ZIP file generation (file-saver + jszip)
  - `debounce.ts` — debounced write helper
  - `randomId.ts` — session ID generation

- **`src/styles/`** — Sass setup
  - `tokens.scss` — design tokens (colors, spacing, type scale)
  - `globals.scss` — CSS reset + theme setup (light/dark mode via CSS custom properties)

### Security & correctness
- **Execution sandboxing**: Code runs only in iframe with `sandbox="allow-scripts"` (no `allow-same-origin`). Console output forwarded via postMessage, never eval in main thread.
- **Identity scoping**: Auth user ID (not hand-rolled sessionStorage) drives per-session identity and RLS policies.
- **Presence cleanup**: Supabase Presence automatically fires leave events on client disconnect, no manual handler needed.
- **Debounced writes**: Local edits are debounced before upserting to Postgres; Broadcast carries immediate copies to connected clients.

For full architecture details, see the design spec above.
