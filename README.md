# CodeShare

[codeshare.in](https://codeshare.in) — a real-time collaborative code-sharing
tool. Create a session, share the URL, and everyone who opens it edits the
same HTML/CSS/JS and sees each other's cursors, names, and live output in
sync.

A session has HTML/CSS/JS editor tabs, a Console tab for `console.log`
output, and a live Output preview. Content and presence (who's currently
viewing) sync across every browser on the same session URL.

## Stack

Vite + React 19 + TypeScript + Supabase (Postgres + Realtime + Auth) +
CodeMirror 6 + Radix UI + Sass Modules.

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture breakdown and
[`docs/supabase-setup.md`](./docs/supabase-setup.md) for how the Supabase
side (schema, RLS, Realtime Broadcast/Presence, Auth) is wired up.

## Local development

You'll need the [Supabase CLI](https://supabase.com/docs/guides/cli) and a
local Docker runtime (the CLI uses it to run Postgres/Realtime/Auth
locally).

```bash
# 1. Install dependencies
npm install

# 2. Start the local Supabase stack (Postgres + Realtime + Auth + Studio)
npx supabase start

# 3. Copy the env template and fill in the URL + anon key printed by `supabase start`
cp .env.example .env.local

# 4. Start the dev server
npm run dev
```

`npx supabase start` prints an `API URL` and `anon key` — put those in
`.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never
commit `.env.local` (it's already gitignored); `.env.example` holds the
placeholder keys only.

If you change anything under `supabase/migrations/`, re-apply the schema
to your local stack with:

```bash
npx supabase db reset
```

### Other useful commands

```bash
npm run build       # TypeScript check + production build (outputs to dist/)
npm run preview     # Serve the production build locally
npm test            # Run the Vitest suite once
npm run test:watch  # Vitest in watch mode
```

## Deploying

This repo is set up for a static build (`npm run build`) served behind a
platform like Vercel, with `vercel.json` already providing the SPA
rewrite needed so that `/code/:sessionId` doesn't 404 on a hard refresh.

Actually creating the hosted Supabase project, enabling anonymous auth on
it, pushing the schema, creating the Vercel project with its environment
variables, and repointing codeshare.in's DNS are live-infrastructure
steps, not something to script blindly. See the **"Hosted project
setup"** section of [`docs/supabase-setup.md`](./docs/supabase-setup.md#hosted-project-setup-when-we-get-to-deploying)
for exactly what those steps are when it's time to do them.
