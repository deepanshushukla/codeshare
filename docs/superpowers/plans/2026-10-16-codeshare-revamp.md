# CodeShare Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite CodeShare from CRA/React17/Firebase to Vite/React19/TypeScript/Supabase, fixing the security/correctness bugs found in the audit, with a full visual redesign, while keeping full feature parity.

**Architecture:** A Vite+React+TypeScript SPA talks to Supabase (Postgres for durable session content, Realtime Broadcast for live edit propagation, Realtime Presence for who's online, anonymous Auth for per-browser identity). Code execution moves entirely into a sandboxed iframe with a `postMessage` bridge feeding the Console panel — no `eval` ever runs in the main app window. UI is custom (Radix primitives + Sass Modules), replacing antd; CodeMirror 6 replaces CodeMirror 5; `react-resizable-panels` replaces `react-reflex`.

**Tech Stack:** Vite, React 19, TypeScript, `@supabase/supabase-js`, CodeMirror 6, Radix UI, `lucide-react`, Sass Modules, `react-resizable-panels`, `file-saver` + `jszip`, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-16-codeshare-revamp-design.md` (read alongside `docs/supabase-setup.md` for the backend schema/policy details this plan implements verbatim).

## Global Constraints

- Backend is Supabase only — no Firebase SDK, config, or rules files remain when this plan is done.
- Styling is Sass Modules only — no Tailwind.
- Editor is CodeMirror 6 only — no CodeMirror 5 / `react-codemirror2`.
- UI primitives are Radix UI + `lucide-react` — no antd, no Font Awesome.
- Resizable panes use `react-resizable-panels` — no `react-reflex`.
- Collaboration model is debounced last-write-wins — no CRDT/Yjs.
- No `eval()` ever executes in the main application window; all user code runs inside the sandboxed output iframe.
- Row Level Security is enabled on every Postgres table; no table is left with RLS off.
- Local development runs against the Supabase CLI's local stack (`supabase start`), never the hosted project.
- No production data migration — there is no existing data worth carrying over.
- Full feature parity: landing page + "Create New Room", 4 toggleable tabs (HTML/CSS/JS/Console) + Output tab, tab selection persisted in the URL query string, resizable panes, live multi-user sync, presence list with per-user editable own display name, Run button + Ctrl/Cmd+Enter shortcut, export as `.html` or `.zip`, 404 page for missing/invalid session routes.
- Actually deploying (creating the hosted Supabase project, the Vercel project, repointing codeshare.in DNS) is **out of this plan** — it's a separate confirmed step per the spec's Deployment note. This plan ends with deployment *prep* (config files, docs) only.

## Review Focus

- **Concurrent edits from two clients on the same field must not clobber other fields.** A reasonable user pairing with someone else expects their CSS edit to never blank out the other person's JS tab. Pinned in Task 6.
- **A session id that already has a row (a second visitor joining) must load existing content, not silently reset it to blank.** The old app's `isNewSession` check is exactly the kind of thing that's easy to get backwards in a rewrite. Pinned in Task 6.
- **An unrecognized or malformed `?selectedTabs=` value must not crash the page or leave zero context visible forever.** Someone will paste a mangled URL. Pinned in Task 5.
- **An uncaught runtime error in the user's JS must show up in the Console tab as an error, not vanish silently or crash the host page.** This is the whole point of the sandbox/bridge rework. Pinned in Task 9.
- **Closing a tab ungracefully must remove that user from everyone else's presence list within a reasonable time.** This is the specific bug the Supabase Presence swap exists to fix — it needs a real check, not just a "join looks right" happy path. Pinned in Task 8.

---

## File Structure

```
src/
  main.tsx                     entry point, mounts <App/>
  App.tsx                      <BrowserRouter> + <Routes>
  routes/
    Landing.tsx                marketing home page ("Create New Room")
    SessionRoute.tsx           /code/:sessionId wrapper (load-or-create check)
    NotFound.tsx                404 page
  features/session/
    SessionWorkspace.tsx       top-level session UI: owns tab state, renders panes
    Header.tsx
    TabBar.tsx
    EditorPane.tsx             CodeMirror 6 wrapper for one language
    OutputFrame.tsx            sandboxed iframe host
    ConsolePanel.tsx           renders bridged console entries + REPL input
    UsersMenu.tsx
    ExportMenu.tsx
    RunControls.tsx
    useSession.ts              Postgres load/create + debounced upsert + Broadcast
    usePresence.ts             Presence track/sync/leave
    useTabsQueryParam.ts       tabs state <-> ?selectedTabs=
  lib/
    supabase.ts                createClient + ensureAnonymousSession()
    sandbox.ts                 buildSandboxDocument() + postMessage protocol + bridge script
    export.ts                  buildHtmlFile() + buildZipBlob()
    debounce.ts
    randomId.ts
  styles/
    tokens.scss                color/spacing/radius/type custom properties
    theme.scss                 light/dark mappings
    globals.scss
supabase/
  config.toml                  from `supabase init`
  migrations/
    0001_init.sql              sessions + session_users tables + RLS policies
```

Tests are co-located next to the source they cover (`*.test.ts` / `*.test.tsx`), the standard Vitest convention.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/styles/tokens.scss`, `src/styles/globals.scss`
- Delete: `src/index.js`, `src/index.css`, `src/reportWebVitals.js`, `src/firebase-config.js`, `src/context/`, `src/components/` (old CRA app — superseded task by task through this plan; deleting now avoids two parallel trees)
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `<App />` default export rendering a `BrowserRouter` with three placeholder routes (`/`, `/code/:sessionId`, `*`) so later tasks can fill in the real pages.

- [ ] **Step 1: Scaffold the Vite project**

```bash
npm create vite@latest . -- --template react-ts
```
When prompted about the non-empty directory, continue (the old `src/`, `public/`, `package.json` get overwritten/merged in the next steps — `public/` images are kept, CRA-specific files are removed in this task).

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom @supabase/supabase-js \
  codemirror @codemirror/lang-html @codemirror/lang-css @codemirror/lang-javascript \
  @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-dialog \
  lucide-react react-resizable-panels file-saver jszip sass
npm install -D vitest @testing-library/react @testing-library/jest-dom \
  @testing-library/user-event jsdom @types/file-saver
```

- [ ] **Step 3: Configure Vitest in `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
  },
});
```

```ts
// src/test-setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Add npm scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Delete the legacy CRA/Firebase source tree**

```bash
rm -f src/index.js src/index.css src/reportWebVitals.js src/firebase-config.js
rm -rf src/context src/components src/utils
```
(`src/utils/debounce.js` logic is reintroduced as TypeScript in Task 2; nothing here is lost permanently.)

- [ ] **Step 6: Write `src/App.tsx` with placeholder routes**

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function Placeholder({ label }: { label: string }) {
  return <div>{label}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Placeholder label="landing" />} />
        <Route path="/code/:sessionId" element={<Placeholder label="session" />} />
        <Route path="*" element={<Placeholder label="not-found" />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 8: Write the failing test**

```tsx
// src/App.test.tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the landing placeholder at /', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(screen.getByText('landing')).toBeInTheDocument();
});
```

- [ ] **Step 9: Run the test**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS (this scaffold task has no prior code to fail against — confirm it passes, not that it fails first, since there's nothing to red-green here beyond "does the scaffold work").

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React 19 + TypeScript, remove legacy CRA tree"
```

---

### Task 2: Supabase schema, client, and anonymous auth

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/0001_init.sql`, `src/lib/supabase.ts`, `src/lib/supabase.test.ts`, `.env.example`
- Modify: `.gitignore` (add `.env*.local`, `supabase/.branches`, `supabase/.temp`)

**Interfaces:**
- Produces: `supabase` (the `SupabaseClient` instance) and `ensureAnonymousSession(): Promise<string>` (resolves to the current user's `uid`, signing in anonymously if needed) — every later hook that talks to Supabase imports these two from `src/lib/supabase.ts`.

- [ ] **Step 1: Initialize the Supabase CLI project**

```bash
npx supabase init
```

- [ ] **Step 2: Write the migration** (schema + RLS exactly as documented in `docs/supabase-setup.md`)

```sql
-- supabase/migrations/0001_init.sql
create table sessions (
  id text primary key,
  html text not null default '',
  css text not null default '',
  js text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint html_length check (char_length(html) < 200000),
  constraint css_length check (char_length(css) < 200000),
  constraint js_length check (char_length(js) < 200000)
);

create table session_users (
  session_id text not null references sessions(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

alter table sessions enable row level security;
alter table session_users enable row level security;

create policy "anyone authenticated can read sessions"
  on sessions for select using (auth.role() = 'authenticated');
create policy "anyone authenticated can insert sessions"
  on sessions for insert with check (auth.role() = 'authenticated');
create policy "anyone authenticated can update sessions"
  on sessions for update using (auth.role() = 'authenticated');

create policy "anyone authenticated can read session_users"
  on session_users for select using (auth.role() = 'authenticated');
create policy "users manage only their own presence row (insert)"
  on session_users for insert with check (auth.uid() = user_id);
create policy "users manage only their own presence row (update)"
  on session_users for update using (auth.uid() = user_id);
```

- [ ] **Step 3: Start the local stack and apply the migration**

```bash
npx supabase start
npx supabase db reset
```
Expected: command output lists `sessions` and `session_users` as created with no errors. Note the `API URL` and `anon key` printed — they go in `.env.local` in the next step.

- [ ] **Step 4: Write `.env.example` and local env file**

```
# .env.example
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```
Create `.env.local` (gitignored) with the actual local-stack URL/key from Step 3's output.

- [ ] **Step 5: Add the gitignore entries**

```
# .gitignore additions
.env*.local
supabase/.branches
supabase/.temp
```

- [ ] **Step 6: Write the failing test**

```ts
// src/lib/supabase.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest';

const signInAnonymously = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'uid-123' } } }, error: null });
const getSession = vi.fn().mockResolvedValue({ data: { session: null } });

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { signInAnonymously, getSession },
  }),
}));

beforeEach(() => {
  signInAnonymously.mockClear();
  getSession.mockClear();
});

describe('ensureAnonymousSession', () => {
  test('signs in anonymously when there is no existing session', async () => {
    const { ensureAnonymousSession } = await import('./supabase');
    const uid = await ensureAnonymousSession();
    expect(signInAnonymously).toHaveBeenCalledOnce();
    expect(uid).toBe('uid-123');
  });
});
```

- [ ] **Step 7: Run it to see it fail**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: FAIL — `src/lib/supabase.ts` does not exist yet.

- [ ] **Step 8: Implement `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function ensureAnonymousSession(): Promise<string> {
  const { data: existing } = await supabase.auth.getSession();
  if (existing.session) {
    return existing.session.user.id;
  }
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session) {
    throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no session returned'}`);
  }
  return data.session.user.id;
}
```

- [ ] **Step 9: Run the test again**

Run: `npx vitest run src/lib/supabase.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add Supabase schema/RLS migration, client, and anonymous auth"
```

---

### Task 3: Shared utils — `debounce` and `randomId`

**Files:**
- Create: `src/lib/debounce.ts`, `src/lib/debounce.test.ts`, `src/lib/randomId.ts`, `src/lib/randomId.test.ts`

**Interfaces:**
- Produces: `debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number): (...args: Args) => void`; `generateSessionId(length?: number): string`.

- [ ] **Step 1: Write the failing debounce test**

```ts
// src/lib/debounce.test.ts
import { describe, expect, test, vi } from 'vitest';
import { debounce } from './debounce';

describe('debounce', () => {
  test('only calls the wrapped function once after the wait elapses', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('a');
    debounced('b');
    debounced('c');
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith('c');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/debounce.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/debounce.ts`**

```ts
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}
```

- [ ] **Step 4: Run again**

Run: `npx vitest run src/lib/debounce.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing randomId test**

```ts
// src/lib/randomId.test.ts
import { describe, expect, test } from 'vitest';
import { generateSessionId } from './randomId';

describe('generateSessionId', () => {
  test('defaults to a 10-character lowercase-alphanumeric id', () => {
    const id = generateSessionId();
    expect(id).toMatch(/^[a-z0-9]{10}$/);
  });

  test('respects a custom length', () => {
    expect(generateSessionId(4)).toHaveLength(4);
  });

  test('produces different ids across calls', () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });
});
```

- [ ] **Step 6: Run to see it fail**

Run: `npx vitest run src/lib/randomId.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `src/lib/randomId.ts`**

```ts
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function generateSessionId(length = 10): string {
  let id = '';
  for (let i = 0; i < length; i += 1) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}
```

- [ ] **Step 8: Run again**

Run: `npx vitest run src/lib/randomId.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add debounce and randomId utilities (TS port, no external random-key dep)"
```

---

### Task 4: Landing page, 404 page, and routing wiring

**Files:**
- Create: `src/routes/Landing.tsx`, `src/routes/Landing.module.scss`, `src/routes/NotFound.tsx`, `src/routes/Landing.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `generateSessionId` from `src/lib/randomId.ts` (Task 3).
- Produces: `Landing` and `NotFound` default-export components, wired into `App.tsx`'s routes in place of the Task 1 placeholders.

- [ ] **Step 1: Write the failing test**

```tsx
// src/routes/Landing.test.tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

test('the Create New Room link points at /code/<id>', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  const link = screen.getByRole('link', { name: /create new room/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL — `./Landing` does not exist.

- [ ] **Step 3: Implement `src/routes/Landing.tsx`**

```tsx
import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { generateSessionId } from '../lib/randomId';
import styles from './Landing.module.scss';

const HELPFUL_POINTS = [
  'Remote pair programming',
  'Interviews, programming tests',
  'Share your code in real time',
  'Download all your code in zip and HTML format',
  'Online study groups, seminars, workshops, meetups',
  'Troubleshooting, support',
];

export default function Landing() {
  const newRoomId = useMemo(() => generateSessionId(), []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.title}>CodeShare</span>
        <Link to={`/code/${newRoomId}`} className={styles.ctaLink}>+ Create New Room</Link>
      </header>
      <section className={styles.hero}>
        <h1>Share code in real-time with CodeShare</h1>
        <p>Share a workspace with other developers and collaborate on code live.</p>
        <Link to={`/code/${newRoomId}`} className={styles.ctaButton}>Create New Room</Link>
      </section>
      <section className={styles.points}>
        <h2>Let&rsquo;s code together</h2>
        <ul>
          {HELPFUL_POINTS.map((point) => <li key={point}>{point}</li>)}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Write `src/routes/Landing.module.scss`** (minimal structural rules; full visual design pass happens in Task 12)

```scss
.page { display: flex; flex-direction: column; min-height: 100vh; }
.header { display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; }
.title { font-weight: 600; }
.hero { padding: 2rem 1.5rem; text-align: center; }
.ctaLink, .ctaButton { text-decoration: none; }
.points ul { list-style: disc; padding-left: 1.5rem; }
```

- [ ] **Step 5: Run again**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 6: Implement `src/routes/NotFound.tsx`**

```tsx
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div>
      <h1>404</h1>
      <p>Sorry, the page you visited does not exist.</p>
      <Link to="/">Create New Session</Link>
    </div>
  );
}
```

- [ ] **Step 7: Wire both into `App.tsx`**, replacing the two of the three Task-1 placeholders:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import NotFound from './routes/NotFound';

function SessionPlaceholder() {
  return <div>session</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/code/:sessionId" element={<SessionPlaceholder />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 8: Update `src/App.test.tsx`** to match (the old "landing"-text assertion no longer applies):

```tsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Create New Room link at /', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(screen.getByRole('link', { name: /create new room/i })).toBeInTheDocument();
});

test('renders the 404 page at an unknown route', () => {
  window.history.pushState({}, '', '/this-does-not-exist');
  render(<App />);
  expect(screen.getByText('404')).toBeInTheDocument();
});
```

- [ ] **Step 9: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (all tests from Tasks 1-4)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: add landing page and 404 page, wire into routing"
```

---

### Task 5: Tab state and the `?selectedTabs=` query param

**Files:**
- Create: `src/features/session/useTabsQueryParam.ts`, `src/features/session/useTabsQueryParam.test.ts`

**Interfaces:**
- Produces: `TabsState = { html: boolean; css: boolean; js: boolean; console: boolean; output: boolean }`; `DEFAULT_TABS: TabsState`; `useTabsQueryParam(): { tabs: TabsState; setTabs: (tabs: TabsState) => void }` — later tasks (`SessionWorkspace`, `TabBar`) import `TabsState` and this hook.

- [ ] **Step 1: Write the failing tests** (covering the Review Focus item: malformed query values must not crash or silently blank the UI)

```ts
// src/features/session/useTabsQueryParam.test.ts
import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useTabsQueryParam, DEFAULT_TABS } from './useTabsQueryParam';

function withRouter(initialPath: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
  );
}

describe('useTabsQueryParam', () => {
  test('defaults to DEFAULT_TABS when there is no query param', () => {
    const { result } = renderHook(() => useTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    expect(result.current.tabs).toEqual(DEFAULT_TABS);
  });

  test('parses a valid selectedTabs value', () => {
    const { result } = renderHook(() => useTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=html,css'),
    });
    expect(result.current.tabs).toEqual({ html: true, css: true, js: false, console: false, output: false });
  });

  test('ignores unrecognized keys in a malformed selectedTabs value instead of crashing', () => {
    const { result } = renderHook(() => useTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=html,bogus,'),
    });
    expect(result.current.tabs).toEqual({ html: true, css: false, js: false, console: false, output: false });
  });

  test('falls back to DEFAULT_TABS when every key in selectedTabs is unrecognized', () => {
    const { result } = renderHook(() => useTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=bogus,alsobogus'),
    });
    expect(result.current.tabs).toEqual(DEFAULT_TABS);
  });

  test('setTabs updates the query string', () => {
    const { result } = renderHook(() => useTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    act(() => {
      result.current.setTabs({ html: true, css: true, js: false, console: false, output: false });
    });
    expect(window.location.search).toContain('selectedTabs=html%2Ccss');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/features/session/useTabsQueryParam.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type TabsState = {
  html: boolean;
  css: boolean;
  js: boolean;
  console: boolean;
  output: boolean;
};

export const DEFAULT_TABS: TabsState = {
  html: false,
  css: false,
  js: true,
  console: true,
  output: false,
};

const TAB_KEYS = Object.keys(DEFAULT_TABS) as (keyof TabsState)[];

function parseSelectedTabs(value: string | null): TabsState {
  if (!value) return { ...DEFAULT_TABS };
  const requested = new Set(value.split(',').filter((key) => (TAB_KEYS as string[]).includes(key)));
  if (requested.size === 0) return { ...DEFAULT_TABS };
  const tabs = { html: false, css: false, js: false, console: false, output: false } as TabsState;
  for (const key of TAB_KEYS) {
    tabs[key] = requested.has(key);
  }
  return tabs;
}

function serializeTabs(tabs: TabsState): string {
  return TAB_KEYS.filter((key) => tabs[key]).join(',');
}

export function useTabsQueryParam(): { tabs: TabsState; setTabs: (tabs: TabsState) => void } {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabsState] = useState<TabsState>(() =>
    parseSelectedTabs(new URLSearchParams(location.search).get('selectedTabs')),
  );

  useEffect(() => {
    setTabsState(parseSelectedTabs(new URLSearchParams(location.search).get('selectedTabs')));
    // Only re-derive from the URL on first mount / external navigation, not on every
    // location change caused by our own setTabs below (see its guard).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTabs = useCallback(
    (next: TabsState) => {
      setTabsState(next);
      const serialized = serializeTabs(next);
      navigate(
        { pathname: location.pathname, search: serialized ? `?selectedTabs=${serialized}` : '' },
        { replace: true },
      );
    },
    [location.pathname, navigate],
  );

  return { tabs, setTabs };
}
```

- [ ] **Step 4: Run again**

Run: `npx vitest run src/features/session/useTabsQueryParam.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add tab state hook backed by ?selectedTabs= query param"
```

---

### Task 6: `useSession` — load-or-create, debounced upsert, Broadcast sync

**Files:**
- Create: `src/features/session/useSession.ts`, `src/features/session/useSession.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (Task 2); `debounce` from `src/lib/debounce.ts` (Task 3).
- Produces: `EditField = 'html' | 'css' | 'js'`; `ConnectionStatus = 'connecting' | 'connected' | 'reconnecting'`; `useSession(sessionId: string, userId: string | null): { html: string; css: string; js: string; loading: boolean; connectionStatus: ConnectionStatus; updateField: (field: EditField, value: string) => void }` — consumed by `SessionWorkspace` (Task 7) and `OutputFrame`/`ConsolePanel` (Task 9) via the values it returns, and by the connection banner (Task 12).

- [ ] **Step 1: Write the failing tests** (covering both Review Focus items: create-vs-load, and concurrent edits not clobbering other fields)

```ts
// src/features/session/useSession.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const upsert = vi.fn().mockResolvedValue({ error: null });
const singleSelect = vi.fn();
const channelOn = vi.fn().mockReturnThis();
const channelSubscribe = vi.fn().mockReturnThis();
const channelSend = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: singleSelect }) }),
      upsert,
    }),
    channel: () => ({ on: channelOn, subscribe: channelSubscribe, send: channelSend }),
  },
}));

beforeEach(() => {
  upsert.mockClear();
  singleSelect.mockReset();
  channelSend.mockClear();
});

describe('useSession', () => {
  test('creates a blank row when the session does not exist yet', async () => {
    singleSelect.mockResolvedValue({ data: null, error: null });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('new-room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-room' }));
  });

  test('loads existing content instead of resetting it when the session already exists', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'existing-room', html: '<p>hi</p>', css: 'p{}', js: 'console.log(1)' },
      error: null,
    });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('existing-room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.html).toBe('<p>hi</p>');
    expect(result.current.css).toBe('p{}');
    expect(result.current.js).toBe('console.log(1)');
  });

  test('updating one field does not change the in-memory value of another field', async () => {
    singleSelect.mockResolvedValue({
      data: { id: 'room', html: '<p>a</p>', css: 'body{}', js: '1' },
      error: null,
    });
    const { useSession } = await import('./useSession');
    const { result } = renderHook(() => useSession('room', 'user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.updateField('css', 'body{color:red}'));
    expect(result.current.html).toBe('<p>a</p>');
    expect(result.current.js).toBe('1');
    expect(result.current.css).toBe('body{color:red}');
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/features/session/useSession.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/features/session/useSession.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { debounce } from '../../lib/debounce';

export type EditField = 'html' | 'css' | 'js';
export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';

type SessionContent = { html: string; css: string; js: string };

type BroadcastEditPayload = { field: EditField; value: string; userId: string };

const UPSERT_DEBOUNCE_MS = 400;

function mapChannelStatus(status: string): ConnectionStatus {
  if (status === 'SUBSCRIBED') return 'connected';
  if (status === 'CLOSED' || status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') return 'reconnecting';
  return 'connecting';
}

export function useSession(sessionId: string, userId: string | null) {
  const [content, setContent] = useState<SessionContent>({ html: '', css: '', js: '' });
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOrCreate() {
      const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).maybeSingle();
      if (!active) return;
      if (data) {
        setContent({ html: data.html, css: data.css, js: data.js });
      } else {
        await supabase.from('sessions').upsert({ id: sessionId, html: '', css: '', js: '' });
      }
      setLoading(false);
    }
    loadOrCreate();

    const channel = supabase
      .channel(`session:${sessionId}`)
      .on('broadcast', { event: 'edit' }, ({ payload }: { payload: BroadcastEditPayload }) => {
        if (payload.userId === userId) return;
        setContent((prev) => ({ ...prev, [payload.field]: payload.value }));
      })
      .subscribe((status: string) => setConnectionStatus(mapChannelStatus(status)));
    channelRef.current = channel;

    return () => {
      active = false;
      channel.unsubscribe();
    };
  }, [sessionId, userId]);

  const persist = useRef(
    debounce((field: EditField, value: string) => {
      supabase.from('sessions').upsert({ id: sessionId, [field]: value, updated_at: new Date().toISOString() });
    }, UPSERT_DEBOUNCE_MS),
  ).current;

  const updateField = useCallback(
    (field: EditField, value: string) => {
      setContent((prev) => ({ ...prev, [field]: value }));
      persist(field, value);
      channelRef.current?.send({
        type: 'broadcast',
        event: 'edit',
        payload: { field, value, userId } satisfies BroadcastEditPayload,
      });
    },
    [persist, userId],
  );

  return { ...content, loading, connectionStatus, updateField };
}
```

- [ ] **Step 4: Run again**

Run: `npx vitest run src/features/session/useSession.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add useSession hook (Postgres load-or-create + debounced upsert + Broadcast)"
```

---

### Task 7: Editor panes and `SessionWorkspace` layout

**Files:**
- Create: `src/features/session/EditorPane.tsx`, `src/features/session/EditorPane.module.scss`, `src/features/session/SessionWorkspace.tsx`, `src/features/session/SessionWorkspace.test.tsx`
- Modify: `src/App.tsx`, `src/routes/SessionRoute.tsx` (new)

**Interfaces:**
- Consumes: `useSession`, `EditField` (Task 6); `useTabsQueryParam`, `TabsState` (Task 5); `ensureAnonymousSession` (Task 2).
- Produces: `SessionWorkspace({ sessionId }: { sessionId: string })` — rendered by `SessionRoute`, which Task 1's placeholder route is replaced with.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/session/SessionWorkspace.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SessionWorkspace from './SessionWorkspace';

vi.mock('../../lib/supabase', () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue('user-1'),
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), send: vi.fn(), unsubscribe: vi.fn() }),
  },
}));

test('typing in the JS editor calls updateField with the new value', async () => {
  render(<MemoryRouter initialEntries={['/code/abc']}><SessionWorkspace sessionId="abc" /></MemoryRouter>);
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  const editor = screen.getByLabelText('JS editor');
  await userEvent.type(editor, 'x');
  expect(editor).toHaveValue(expect.stringContaining('x'));
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/features/session/SessionWorkspace.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `EditorPane.tsx`** (CodeMirror 6; a plain `<textarea>` fallback keeps the test above meaningful in jsdom — CodeMirror renders onto a contenteditable div that `userEvent.type` + `getByLabelText` can't drive reliably in jsdom, so the pane exposes an accessible textarea that CodeMirror is mounted alongside and kept in sync with, rather than replacing it. This mirrors how CodeMirror 6's own testing guidance recommends testing call sites, not CodeMirror internals.)

```tsx
import { useEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import styles from './EditorPane.module.scss';

const LANGUAGE_EXTENSIONS = { html: html(), css: css(), javascript: javascript() };

type Props = {
  title: string;
  language: keyof typeof LANGUAGE_EXTENSIONS;
  value: string;
  onChange: (value: string) => void;
};

export default function EditorPane({ title, language, value, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of(defaultKeymap),
          LANGUAGE_EXTENSIONS[language],
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  return (
    <div className={styles.pane}>
      <div className={styles.title}>{title}</div>
      <div ref={hostRef} className={styles.codeMirrorHost} />
      <textarea
        aria-label={`${title} editor`}
        className={styles.accessibleMirror}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
```

```scss
// EditorPane.module.scss
.pane { display: flex; flex-direction: column; height: 100%; }
.title { padding: 0.25rem 0.5rem; font-size: 0.75rem; opacity: 0.7; }
.codeMirrorHost { flex: 1; overflow: auto; }
// The accessible textarea mirrors CodeMirror's content for tests and screen
// readers; it is visually hidden but not display:none (so focus/typing work).
.accessibleMirror {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  overflow: hidden;
}
```

- [ ] **Step 4: Implement `SessionWorkspace.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { useSession } from './useSession';
import { useTabsQueryParam } from './useTabsQueryParam';
import { ensureAnonymousSession } from '../../lib/supabase';
import EditorPane from './EditorPane';

export default function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    ensureAnonymousSession().then(setUserId);
  }, []);

  const { tabs } = useTabsQueryParam();
  const { html, css, js, updateField } = useSession(sessionId, userId);

  return (
    <PanelGroup direction="horizontal">
      {tabs.html && (
        <Panel>
          <EditorPane title="HTML" language="html" value={html} onChange={(v) => updateField('html', v)} />
        </Panel>
      )}
      {tabs.html && (tabs.css || tabs.js) && <PanelResizeHandle />}
      {tabs.css && (
        <Panel>
          <EditorPane title="CSS" language="css" value={css} onChange={(v) => updateField('css', v)} />
        </Panel>
      )}
      {tabs.css && tabs.js && <PanelResizeHandle />}
      {tabs.js && (
        <Panel>
          <EditorPane title="JS" language="javascript" value={js} onChange={(v) => updateField('js', v)} />
        </Panel>
      )}
    </PanelGroup>
  );
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/features/session/SessionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 6: Create `src/routes/SessionRoute.tsx` and wire it into `App.tsx`**

```tsx
// src/routes/SessionRoute.tsx
import { useParams } from 'react-router-dom';
import SessionWorkspace from '../features/session/SessionWorkspace';
import NotFound from './NotFound';

export default function SessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId) return <NotFound />;
  return <SessionWorkspace sessionId={sessionId} />;
}
```

```tsx
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Landing from './routes/Landing';
import NotFound from './routes/NotFound';
import SessionRoute from './routes/SessionRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/code/:sessionId" element={<SessionRoute />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add CodeMirror 6 editor panes and SessionWorkspace layout"
```

---

### Task 8: Presence and the Users menu

**Files:**
- Create: `src/features/session/usePresence.ts`, `src/features/session/usePresence.test.ts`, `src/features/session/UsersMenu.tsx`, `src/features/session/UsersMenu.module.scss`
- Modify: `src/features/session/SessionWorkspace.tsx`

**Interfaces:**
- Consumes: `supabase` (Task 2).
- Produces: `PresenceUser = { userId: string; name: string; status: 'online' | 'away' }`; `usePresence(sessionId: string, userId: string | null): { users: PresenceUser[]; name: string; setName: (name: string) => void }`.

- [ ] **Step 1: Write the failing tests** (including the Review Focus item: a leave event must remove the user from the list)

```ts
// src/features/session/usePresence.test.ts
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

let presenceState: Record<string, { name: string; status: string }[]> = {};
let syncHandler: (() => void) | undefined;
const track = vi.fn().mockResolvedValue('ok');
const unsubscribe = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => ({
      on: (_type: string, _config: { event: string }, cb: () => void) => {
        syncHandler = cb;
      },
      subscribe: (statusCb?: (status: string) => void) => statusCb?.('SUBSCRIBED'),
      track,
      presenceState: () => presenceState,
      unsubscribe,
    }),
  },
}));

beforeEach(() => {
  presenceState = {};
  syncHandler = undefined;
  track.mockClear();
});

describe('usePresence', () => {
  test('tracks the local user on mount', async () => {
    const { usePresence } = await import('./usePresence');
    renderHook(() => usePresence('room', 'user-1'));
    await waitFor(() => expect(track).toHaveBeenCalledWith(expect.objectContaining({ status: 'online' })));
  });

  test('a presence leave event removes that user from the list', async () => {
    const { usePresence } = await import('./usePresence');
    const { result } = renderHook(() => usePresence('room', 'user-1'));
    presenceState = { 'user-2': [{ name: 'User_abc', status: 'online' }] };
    act(() => syncHandler?.());
    await waitFor(() => expect(result.current.users.map((u) => u.userId)).toContain('user-2'));

    presenceState = {};
    act(() => syncHandler?.());
    await waitFor(() => expect(result.current.users.map((u) => u.userId)).not.toContain('user-2'));
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/features/session/usePresence.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `usePresence.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

export type PresenceUser = { userId: string; name: string; status: 'online' | 'away' };

function defaultName(userId: string): string {
  return `User_${userId.slice(0, 4)}`;
}

export function usePresence(sessionId: string, userId: string | null) {
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [name, setNameState] = useState('');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;
    setNameState((prev) => prev || defaultName(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`session:${sessionId}`, { config: { presence: { key: userId } } });
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState() as Record<string, { name: string; status: 'online' | 'away' }[]>;
      setUsers(
        Object.entries(state).map(([id, metas]) => ({
          userId: id,
          name: metas[0]?.name ?? defaultName(id),
          status: metas[0]?.status ?? 'online',
        })),
      );
    });
    channel.subscribe(async (status: string) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({ name: name || defaultName(userId), status: 'online' });
      }
    });
    channelRef.current = channel;

    const handleVisibility = () => {
      channel.track({ name: name || defaultName(userId), status: document.visibilityState === 'visible' ? 'online' : 'away' });
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userId]);

  const setName = useCallback((next: string) => {
    setNameState(next);
    channelRef.current?.track({ name: next, status: 'online' });
  }, []);

  return { users, name, setName };
}
```

- [ ] **Step 4: Run again**

Run: `npx vitest run src/features/session/usePresence.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `UsersMenu.tsx`** (Radix Dropdown; only the local user's own name is editable, matching the old app's behavior)

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Users } from 'lucide-react';
import type { PresenceUser } from './usePresence';
import styles from './UsersMenu.module.scss';

type Props = {
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (name: string) => void;
};

export default function UsersMenu({ users, currentUserId, name, onNameChange }: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Users in this session">
        <Users size={16} />
        <span className={styles.count}>{users.length}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content className={styles.content}>
        {users.map((user) => (
          <DropdownMenu.Item key={user.userId} className={styles.item} onSelect={(e) => e.preventDefault()}>
            <input
              value={user.userId === currentUserId ? name : user.name}
              disabled={user.userId !== currentUserId}
              onChange={(e) => onNameChange(e.target.value)}
              aria-label={`Display name${user.userId === currentUserId ? ' (yours)' : ''}`}
            />
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
```

```scss
// UsersMenu.module.scss
.trigger { display: flex; align-items: center; gap: 0.25rem; }
.count { font-size: 0.75rem; }
.content { display: flex; flex-direction: column; padding: 0.5rem; gap: 0.25rem; }
.item input { width: 100%; }
```

- [ ] **Step 6: Wire into `SessionWorkspace.tsx`** — add presence alongside the existing session content:

```tsx
// additions to SessionWorkspace.tsx
import { usePresence } from './usePresence';
import UsersMenu from './UsersMenu';

// inside the component, after `const { html, css, js, updateField } = useSession(...)`:
const { users, name, setName } = usePresence(sessionId, userId);

// rendered above the <PanelGroup>:
<UsersMenu users={users} currentUserId={userId} name={name} onNameChange={setName} />
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add Presence-backed user list with editable own display name"
```

---

### Task 9: Sandboxed execution engine, Output tab, Console tab

**Files:**
- Create: `src/lib/sandbox.ts`, `src/lib/sandbox.test.ts`, `src/features/session/OutputFrame.tsx`, `src/features/session/ConsolePanel.tsx`, `src/features/session/ConsolePanel.module.scss`
- Modify: `src/features/session/SessionWorkspace.tsx`

**Interfaces:**
- Produces: `buildSandboxDocument(html: string, css: string, js: string): string`; `ConsoleEntry = { id: string; level: 'log' | 'warn' | 'error' | 'info'; args: unknown[] }`; `SandboxMessage = { type: 'console'; level: ConsoleEntry['level']; args: unknown[] } | { type: 'runtime-error'; message: string }` — the shape posted from the iframe and listened for by `ConsolePanel`.

- [ ] **Step 1: Write the failing test** (covering the Review Focus item: an uncaught error must be captured as a console-visible message, not silently dropped)

```ts
// src/lib/sandbox.test.ts
import { describe, expect, test } from 'vitest';
import { buildSandboxDocument } from './sandbox';

describe('buildSandboxDocument', () => {
  test('embeds the given html, css, and js', () => {
    const doc = buildSandboxDocument('<p>hi</p>', 'p{color:red}', 'console.log(1)');
    expect(doc).toContain('<p>hi</p>');
    expect(doc).toContain('p{color:red}');
    expect(doc).toContain('console.log(1)');
  });

  test('includes a window.onerror handler that posts a runtime-error message', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain('window.onerror');
    expect(doc).toContain("type: 'runtime-error'");
  });

  test('wraps console methods to post console messages instead of calling the native console directly', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain("type: 'console'");
    expect(doc).toMatch(/console\.(log|error|warn|info)\s*=/);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/sandbox.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/sandbox.ts`**

```ts
export type ConsoleEntry = { id: string; level: 'log' | 'warn' | 'error' | 'info'; args: unknown[] };

export type SandboxMessage =
  | { type: 'console'; level: ConsoleEntry['level']; args: unknown[] }
  | { type: 'runtime-error'; message: string };

const BRIDGE_SCRIPT = `
(function () {
  var levels = ['log', 'warn', 'error', 'info'];
  levels.forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      parent.postMessage({ type: 'console', level: level, args: args }, '*');
      original.apply(console, args);
    };
  });
  window.onerror = function (message) {
    parent.postMessage({ type: 'runtime-error', message: String(message) }, '*');
    return true;
  };
})();
`;

export function buildSandboxDocument(html: string, css: string, js: string): string {
  return `<!DOCTYPE html>
<html>
  <head><style>${css}</style></head>
  <body>
    ${html}
    <script>${BRIDGE_SCRIPT}</script>
    <script>${js}</script>
  </body>
</html>`;
}
```

- [ ] **Step 4: Run again**

Run: `npx vitest run src/lib/sandbox.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `OutputFrame.tsx`**

```tsx
type Props = { html: string; css: string; js: string };
import { useMemo } from 'react';
import { buildSandboxDocument } from '../../lib/sandbox';

export default function OutputFrame({ html, css, js }: Props) {
  const srcDoc = useMemo(() => buildSandboxDocument(html, css, js), [html, css, js]);
  return (
    <iframe
      title="Output"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 0 }}
    />
  );
}
```

- [ ] **Step 6: Implement `ConsolePanel.tsx`** (listens for `postMessage`, no `eval` anywhere)

```tsx
import { useEffect, useRef, useState } from 'react';
import type { ConsoleEntry, SandboxMessage } from '../../lib/sandbox';
import styles from './ConsolePanel.module.scss';

let nextId = 0;

export default function ConsolePanel() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<SandboxMessage>) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'console') {
        setEntries((prev) => [...prev, { id: String(nextId++), level: data.level, args: data.args }]);
      } else if (data.type === 'runtime-error') {
        setEntries((prev) => [...prev, { id: String(nextId++), level: 'error', args: [data.message] }]);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className={styles.console}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles[entry.level]}>
          {entry.args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}
        </div>
      ))}
    </div>
  );
}
```

```scss
// ConsolePanel.module.scss
.console { font-family: monospace; font-size: 0.8rem; overflow: auto; height: 100%; padding: 0.5rem; }
.log, .info { opacity: 0.9; }
.warn { color: #caa23a; }
.error { color: #e05252; }
```

- [ ] **Step 7: Wire `OutputFrame` and `ConsolePanel` into `SessionWorkspace.tsx`**, gated by `tabs.output` / `tabs.console` exactly like the editor panes in Task 7:

```tsx
import OutputFrame from './OutputFrame';
import ConsolePanel from './ConsolePanel';

// additional Panels inside the existing <PanelGroup>, following the same
// `{tabs.X && <Panel>...}` / `{tabs.X && <PanelResizeHandle/>}` pattern as html/css/js:
{tabs.console && <Panel><ConsolePanel /></Panel>}
{tabs.output && <Panel><OutputFrame html={html} css={css} js={js} /></Panel>}
```

- [ ] **Step 8: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add sandboxed iframe execution with postMessage console bridge"
```

---

### Task 10: Run controls (button + Ctrl/Cmd+Enter) and console REPL input

**Files:**
- Create: `src/features/session/RunControls.tsx`
- Modify: `src/features/session/OutputFrame.tsx`, `src/features/session/ConsolePanel.tsx`, `src/features/session/SessionWorkspace.tsx`

**Interfaces:**
- Produces: `RunControls({ onRun }: { onRun: () => void })`.
- Modifies `OutputFrame` to accept a `runToken: number` prop that forces the iframe to remount (re-running the code) only when `runToken` changes, decoupling "run" from "every keystroke" (parity with the old app's manual Run button, without re-running on autosave).
- Modifies `ConsolePanel` to accept an `onRepl: (line: string) => void` the REPL input calls.

This task deliberately keeps execution flowing through the one sandboxed path built in Task 9 — the REPL line is injected into the iframe via `postMessage`+`eval` **inside the sandbox**, not the main window, preserving the Global Constraint.

- [ ] **Step 1: Add a `runToken` prop to `OutputFrame.tsx`**

```tsx
type Props = { html: string; css: string; js: string; runToken: number };

export default function OutputFrame({ html, css, js, runToken }: Props) {
  const srcDoc = useMemo(() => buildSandboxDocument(html, css, js), [html, css, js, runToken]);
  return (
    <iframe
      key={runToken}
      title="Output"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 0 }}
    />
  );
}
```
(`key={runToken}` forces React to recreate the iframe element, which is what actually re-executes the inline `<script>` — reassigning `srcDoc` alone does not reliably re-run scripts in all browsers.)

- [ ] **Step 2: Implement `RunControls.tsx`**

```tsx
import { useEffect } from 'react';
import { Play } from 'lucide-react';

export default function RunControls({ onRun }: { onRun: () => void }) {
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onRun();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onRun]);

  return (
    <button onClick={onRun} aria-label="Run">
      <Play size={14} /> Run (Ctrl+&crarr;)
    </button>
  );
}
```

- [ ] **Step 3: Extend the sandbox bridge to accept REPL lines, in `src/lib/sandbox.ts`**

```ts
// append to BRIDGE_SCRIPT in src/lib/sandbox.ts, inside the same IIFE:
window.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'repl') {
    try {
      console.log(eval(event.data.code));
    } catch (err) {
      console.error(err);
    }
  }
});
```
This `eval` runs **inside the sandboxed iframe's own isolated `about:srcdoc` origin** (no `allow-same-origin`), not the main app window — it cannot reach `window.supabase`, session storage, or anything outside the iframe. That is the distinction the Global Constraint cares about.

- [ ] **Step 4: Rewrite `ConsolePanel.tsx` in full**, adding the REPL input alongside the Task 9 message listener:

```tsx
import { useEffect, useState } from 'react';
import type { ConsoleEntry, SandboxMessage } from '../../lib/sandbox';
import styles from './ConsolePanel.module.scss';

let nextId = 0;

export default function ConsolePanel({ onRepl }: { onRepl: (code: string) => void }) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    function handleMessage(event: MessageEvent<SandboxMessage>) {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'console') {
        setEntries((prev) => [...prev, { id: String(nextId++), level: data.level, args: data.args }]);
      } else if (data.type === 'runtime-error') {
        setEntries((prev) => [...prev, { id: String(nextId++), level: 'error', args: [data.message] }]);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function handleKeyUp(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && input.trim()) {
      onRepl(input);
      setInput('');
    }
  }

  return (
    <div className={styles.console}>
      <input
        aria-label="Console input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyUp={handleKeyUp}
      />
      {entries.map((entry) => (
        <div key={entry.id} className={styles[entry.level]}>
          {entry.args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Add an `onLoad` ref callback to `OutputFrame.tsx`** so its `contentWindow` is reachable for REPL messages:

```tsx
// src/features/session/OutputFrame.tsx, in full
import { useMemo } from 'react';
import { buildSandboxDocument } from '../../lib/sandbox';

type Props = {
  html: string;
  css: string;
  js: string;
  runToken: number;
  onWindowReady: (win: Window | null) => void;
};

export default function OutputFrame({ html, css, js, runToken, onWindowReady }: Props) {
  const srcDoc = useMemo(() => buildSandboxDocument(html, css, js), [html, css, js, runToken]);
  return (
    <iframe
      key={runToken}
      title="Output"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 0 }}
      onLoad={(e) => onWindowReady(e.currentTarget.contentWindow)}
    />
  );
}
```

- [ ] **Step 6: Wire Run + REPL together in `SessionWorkspace.tsx`**

```tsx
// additions to SessionWorkspace.tsx
import { useRef, useState } from 'react';
import RunControls from './RunControls';

// inside the component:
const [runToken, setRunToken] = useState(0);
const iframeWindowRef = useRef<Window | null>(null);

function handleRun() {
  setRunToken((t) => t + 1);
}
function handleRepl(code: string) {
  iframeWindowRef.current?.postMessage({ type: 'repl', code }, '*');
}

// rendered in place of Task 9's <OutputFrame>/<ConsolePanel>:
<RunControls onRun={handleRun} />
<OutputFrame
  html={html} css={css} js={js}
  runToken={runToken}
  onWindowReady={(win) => { iframeWindowRef.current = win; }}
/>
<ConsolePanel onRepl={handleRepl} />
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS (no new unit tests added in this task beyond what Task 9 already covers for the bridge protocol — this task is UI wiring; verify manually per Step 8)

- [ ] **Step 8: Manual check**

Start the dev server (`npm run dev`), open a session, type `console.log("hi")` in the JS tab with Output+Console open, click Run, confirm "hi" appears in Console. Type `1+1` into the Console input and press Enter, confirm `2` appears.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add Run button/shortcut and console REPL, both routed through the sandbox"
```

---

### Task 11: Export menu

**Files:**
- Create: `src/lib/export.ts`, `src/lib/export.test.ts`, `src/features/session/ExportMenu.tsx`
- Modify: `src/features/session/SessionWorkspace.tsx`

**Interfaces:**
- Produces: `buildHtmlFile(content: { html: string; css: string; js: string }): string`; `buildZipBlob(content: { html: string; css: string; js: string }): Promise<Blob>`.

- [ ] **Step 1: Write the failing tests** (including the empty-content edge case)

```ts
// src/lib/export.test.ts
import { describe, expect, test } from 'vitest';
import { buildHtmlFile, buildZipBlob } from './export';
import JSZip from 'jszip';

describe('buildHtmlFile', () => {
  test('inlines html, css, and js into one document', () => {
    const file = buildHtmlFile({ html: '<p>hi</p>', css: 'p{color:red}', js: 'console.log(1)' });
    expect(file).toContain('<p>hi</p>');
    expect(file).toContain('p{color:red}');
    expect(file).toContain('console.log(1)');
  });

  test('produces a valid (non-empty) document for entirely empty content', () => {
    const file = buildHtmlFile({ html: '', css: '', js: '' });
    expect(file).toContain('<!DOCTYPE html>');
  });
});

describe('buildZipBlob', () => {
  test('produces a zip with index.html, css/index.css, and js/index.js', async () => {
    const blob = await buildZipBlob({ html: '<p>hi</p>', css: 'p{}', js: '1' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['css/index.css', 'index.html', 'js/index.js']);
  });

  test('does not throw for entirely empty content', async () => {
    await expect(buildZipBlob({ html: '', css: '', js: '' })).resolves.toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run src/lib/export.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/export.ts`**

```ts
import JSZip from 'jszip';

export type ExportContent = { html: string; css: string; js: string };

export function buildHtmlFile({ html, css, js }: ExportContent): string {
  return `<!DOCTYPE html>
<html>
  <head><style>${css}</style></head>
  <body>
    ${html}
    <script>${js}</script>
  </body>
</html>`;
}

export async function buildZipBlob({ html, css, js }: ExportContent): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'index.html',
    `<!DOCTYPE html><html><head><link href="./css/index.css" rel="stylesheet"></head><body>${html}<script src="./js/index.js"></script></body></html>`,
  );
  zip.file('css/index.css', css);
  zip.file('js/index.js', js);
  return zip.generateAsync({ type: 'blob' });
}
```

- [ ] **Step 4: Run again**

Run: `npx vitest run src/lib/export.test.ts`
Expected: PASS

- [ ] **Step 5: Implement `ExportMenu.tsx`**

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import { buildHtmlFile, buildZipBlob, type ExportContent } from '../../lib/export';

function timestampedName(extension: string): string {
  return `CodeShare_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

export default function ExportMenu(content: ExportContent) {
  async function exportHtml() {
    saveAs(new Blob([buildHtmlFile(content)], { type: 'text/html;charset=utf-8' }), timestampedName('html'));
  }
  async function exportZip() {
    saveAs(await buildZipBlob(content), timestampedName('zip'));
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Export">
        <Download size={16} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={exportHtml}>HTML file</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={exportZip}>Zip file</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
```

- [ ] **Step 6: Wire into `SessionWorkspace.tsx`**

```tsx
import ExportMenu from './ExportMenu';
// rendered alongside UsersMenu/RunControls:
<ExportMenu html={html} css={css} js={js} />
```

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add HTML/zip export menu"
```

---

### Task 12: Header, TabBar, and full visual redesign pass

**Files:**
- Create: `src/features/session/Header.tsx`, `src/features/session/Header.module.scss`, `src/features/session/TabBar.tsx`, `src/features/session/TabBar.module.scss`, `src/features/session/ConnectionBanner.tsx`, `src/features/session/ConnectionBanner.module.scss`, `src/styles/theme.scss`
- Modify: `src/styles/tokens.scss`, `src/styles/globals.scss`, `src/features/session/SessionWorkspace.tsx`, `src/routes/Landing.module.scss`, `src/routes/NotFound.tsx`

This is the "full redesign" surface from the spec. It's primarily presentational, so verification here is manual (visual) rather than unit-tested — the components being styled already have behavioral test coverage from Tasks 5-11.

- [ ] **Step 1: Define design tokens in `src/styles/tokens.scss`**

```scss
:root {
  --color-bg: #ffffff;
  --color-bg-raised: #f5f5f7;
  --color-text: #1a1a1a;
  --color-border: #e0e0e0;
  --color-accent: #3b82f6;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 1rem;
  --radius: 6px;
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: 'SFMono-Regular', ui-monospace, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #15161a;
    --color-bg-raised: #1e1f24;
    --color-text: #e8e8ea;
    --color-border: #2c2d33;
    --color-accent: #60a5fa;
  }
}
```

- [ ] **Step 2: Write `src/styles/theme.scss`** (explicit light/dark override classes, for a future manual theme toggle — out of scope to build a toggle UI now, but the CSS variables support one without rework)

```scss
[data-theme='light'] {
  --color-bg: #ffffff;
  --color-text: #1a1a1a;
}
[data-theme='dark'] {
  --color-bg: #15161a;
  --color-text: #e8e8ea;
}
```

- [ ] **Step 3: Update `src/styles/globals.scss`**

```scss
@use './tokens.scss';
@use './theme.scss';

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-sans);
  background: var(--color-bg);
  color: var(--color-text);
}
```

- [ ] **Step 4: Implement `TabBar.tsx`**

```tsx
import type { TabsState } from './useTabsQueryParam';
import styles from './TabBar.module.scss';

const LABELS: Record<keyof TabsState, string> = {
  html: 'HTML', css: 'CSS', js: 'JS', console: 'Console', output: 'Output',
};

export default function TabBar({ tabs, setTabs }: { tabs: TabsState; setTabs: (t: TabsState) => void }) {
  return (
    <div className={styles.bar}>
      {(Object.keys(LABELS) as (keyof TabsState)[]).map((key) => (
        <button
          key={key}
          className={tabs[key] ? styles.active : styles.tab}
          onClick={() => setTabs({ ...tabs, [key]: !tabs[key] })}
        >
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
```

```scss
// TabBar.module.scss
.bar { display: flex; gap: var(--space-1); }
.tab, .active {
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
}
.active { background: var(--color-accent); color: #fff; border-color: var(--color-accent); }
```

- [ ] **Step 5: Implement `Header.tsx`**, composing `TabBar`, `UsersMenu`, `ExportMenu`, `RunControls`:

```tsx
import { Link } from 'react-router-dom';
import type { TabsState } from './useTabsQueryParam';
import type { PresenceUser } from './usePresence';
import TabBar from './TabBar';
import UsersMenu from './UsersMenu';
import ExportMenu from './ExportMenu';
import RunControls from './RunControls';
import styles from './Header.module.scss';

type Props = {
  tabs: TabsState;
  setTabs: (t: TabsState) => void;
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (n: string) => void;
  onRun: () => void;
  html: string; css: string; js: string;
};

export default function Header({ tabs, setTabs, users, currentUserId, name, onNameChange, onRun, html, css, js }: Props) {
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>CodeShare</Link>
      <TabBar tabs={tabs} setTabs={setTabs} />
      <div className={styles.actions}>
        <RunControls onRun={onRun} />
        <ExportMenu html={html} css={css} js={js} />
        <UsersMenu users={users} currentUserId={currentUserId} name={name} onNameChange={onNameChange} />
      </div>
    </header>
  );
}
```

```scss
// Header.module.scss
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-raised);
}
.brand { font-weight: 600; text-decoration: none; color: var(--color-text); }
.actions { display: flex; align-items: center; gap: var(--space-2); }
```

- [ ] **Step 6: Implement `ConnectionBanner.tsx`** (the spec's "reconnecting…" banner, backed by `useSession`'s `connectionStatus`):

```tsx
// src/features/session/ConnectionBanner.tsx
import type { ConnectionStatus } from './useSession';
import styles from './ConnectionBanner.module.scss';

export default function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status !== 'reconnecting') return null;
  return <div className={styles.banner} role="status">Reconnecting…</div>;
}
```

```scss
// src/features/session/ConnectionBanner.module.scss
.banner {
  padding: var(--space-1) var(--space-3);
  background: #caa23a;
  color: #1a1a1a;
  font-size: 0.8rem;
  text-align: center;
}
```

- [ ] **Step 7: Replace the ad-hoc controls in `SessionWorkspace.tsx` with the new `Header`**, removing the separately-rendered `UsersMenu`/`ExportMenu`/`RunControls` calls added in Tasks 8/10/11 (they now live inside `Header`), and render `ConnectionBanner` below it using `connectionStatus` from `useSession` (Task 6):

```tsx
<Header
  tabs={tabs}
  setTabs={setTabs}
  users={users}
  currentUserId={userId}
  name={name}
  onNameChange={setName}
  onRun={handleRun}
  html={html} css={css} js={js}
/>
<ConnectionBanner status={connectionStatus} />
```

- [ ] **Step 8: Restyle `Landing.module.scss` and `NotFound.tsx`** to use the same tokens (`var(--color-bg)`, `var(--color-accent)`, etc.) so the marketing page and 404 page visually match the session workspace.

- [ ] **Step 9: Run the full suite**

Run: `npx vitest run`
Expected: PASS (no behavioral changes in this task besides the banner, which renders `null` in the default mocked `connectionStatus: 'connecting'` case used by existing tests, so no existing assertions change)

- [ ] **Step 10: Manual visual check**

`npm run dev`, open `/`, create a room, toggle each tab on/off, confirm layout holds together, then toggle the OS/browser dark-mode setting and confirm the `prefers-color-scheme` tokens switch correctly.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: full visual redesign — design tokens, light/dark theme, Header/TabBar"
```

---

### Task 13: Repo hygiene cleanup

**Files:**
- Delete: `.idea/` (untrack), `.eslintcache`, `yarn-error.log`, `database.rules.json`, `firebase.json`, `.firebaserc`, `.firebase/`
- Modify: `.gitignore`, `package.json`, `CLAUDE.md`

- [ ] **Step 1: Untrack IDE/build artifacts**

```bash
git rm -r --cached .idea .eslintcache yarn-error.log
rm -rf .idea .eslintcache yarn-error.log
```

- [ ] **Step 2: Remove the now-unused Firebase project files**

```bash
git rm database.rules.json firebase.json .firebaserc
rm -rf .firebase
```

- [ ] **Step 3: Update `.gitignore`**

```
node_modules/
dist
.idea/
.eslintcache
yarn-error.log
.env*.local
supabase/.branches
supabase/.temp
.DS_Store
```

- [ ] **Step 4: Remove now-dead devDependencies/scripts from `package.json`** left over from the CRA/eslint/husky/lint-staged/prettier-for-CRA setup that Task 1's `npm create vite` scaffold doesn't use (keep `eslint`/`prettier` only if a Task-14-equivalent lint setup is wanted — this plan doesn't add one, so remove them to avoid an unused, misconfigured `.eslintrc` sitting in the repo):

```bash
npm uninstall eslint eslint-config-prettier eslint-plugin-prettier eslint-plugin-react-hooks husky lint-staged node-sass prettier cross-env
rm -f .eslintrc .eslintignore .prettierrc .prettierignore
```

- [ ] **Step 5: Update `CLAUDE.md`** — replace the "Legacy app" section (now deleted) with the real current commands/architecture:

```markdown
## Commands
- `npm run dev` — local dev server (expects `supabase start` running and `.env.local` populated)
- `npm run build` — type-check + production build
- `npm test` — run the Vitest suite once
- `npm run test:watch` — Vitest in watch mode
- `npx supabase start` / `npx supabase db reset` — local Postgres/Realtime/Auth stack

## Architecture
See `docs/superpowers/specs/2026-10-16-codeshare-revamp-design.md` and
`docs/supabase-setup.md` for the full design. In short: `src/features/session`
holds the editor workspace (tabs, sync, presence, sandboxed execution);
`src/lib` holds framework-agnostic logic (Supabase client, sandbox/export
utilities); Postgres is the source of truth for session content, Realtime
Broadcast/Presence carry live updates between connected clients.
```

- [ ] **Step 6: Run the full suite one more time to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove Firebase project files and legacy tooling, update CLAUDE.md"
```

---

### Task 14: End-to-end manual verification

No new files — this task is a verification gate before deployment prep, confirming the Review Focus items hold when exercised as a real user would, not just under mocks.

- [ ] **Step 1: Start the local stack**

```bash
npx supabase start
npm run dev
```

- [ ] **Step 2: Two-tab sync check**

Open the same `/code/<id>` URL in two browser windows. Type in the HTML tab in window A; confirm it appears in window B within ~1 second. Repeat for CSS and JS. Confirm editing CSS in one window never changes what's showing in the other window's JS tab (Review Focus: field isolation).

- [ ] **Step 3: Join-existing-session check**

With window A still open on a room with content typed in, open that same room URL fresh in window C. Confirm window C loads the existing content instead of a blank editor (Review Focus: create-vs-load).

- [ ] **Step 4: Presence check**

With windows A and B both open on the same room, confirm both users appear in the Users menu. Close window B's tab entirely (not just navigate away). Within a few seconds, confirm window A's Users menu no longer lists that user (Review Focus: presence leave on ungraceful disconnect).

- [ ] **Step 5: Malformed URL check**

Manually edit the URL to `?selectedTabs=bogus,html` and reload. Confirm the HTML tab shows and the page doesn't crash (Review Focus: malformed query param).

- [ ] **Step 6: Runtime error check**

In the JS tab, type `throw new Error("boom")`, open Console and Output, click Run. Confirm "boom" appears as an error-level line in Console and the app itself keeps working afterward (Review Focus: sandbox error surfacing).

- [ ] **Step 7: Export check**

With some content typed in, use the export menu to download both the `.html` and `.zip` files; open each and confirm the content matches what's in the editors.

- [ ] **Step 8: Record the result**

If every check passes, this task is done — no commit needed (nothing changed). If anything fails, fix it as a new commit before moving to Task 15, referencing which check caught it.

---

### Task 15: Deployment prep (no live deploy)

**Files:**
- Create: `vercel.json`
- Modify: `docs/supabase-setup.md` (mark the "Hosted project setup" section as the next manual step), `README.md`

This task prepares configuration only. Actually creating the hosted Supabase project, creating the Vercel project, and repointing codeshare.in's DNS are live-infrastructure actions requiring the owner's authenticated sessions — per the spec's Deployment note, those happen as a separate explicitly-confirmed step after this plan, not as part of it.

- [ ] **Step 1: Add `vercel.json`** for SPA client-side routing (so `/code/:sessionId` doesn't 404 on a hard refresh):

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Confirm the production build works standalone**

```bash
npm run build
npx vite preview
```
Expected: the preview server serves the built app; manually spot-check `/`, create a room, confirm it loads against whichever Supabase project `.env.production`/Vercel env vars point at (local stack is fine for this check).

- [ ] **Step 3: Write `README.md`** replacing the stock CRA README with real project instructions: what CodeShare is, local dev setup (`supabase start`, `.env.local`, `npm run dev`), running tests, and a pointer to `docs/supabase-setup.md`'s "Hosted project setup" section for the actual deploy steps.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add Vercel SPA rewrite config and project README"
```

- [ ] **Step 5: Stop here and hand off**

The remaining steps — creating the hosted Supabase project, enabling anonymous auth on it, running `supabase db push` against it, creating the Vercel project, setting its environment variables, and repointing codeshare.in's DNS — are the live-infrastructure actions flagged throughout this plan and the spec as needing explicit, separate confirmation with the owner present.
