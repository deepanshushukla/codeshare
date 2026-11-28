# CodeShare React Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second session type, React, alongside today's Web (HTML/CSS/JS) sessions — a fixed 3-file (`App.jsx`/`Components.jsx`/`styles.css`) JSX playground that renders live in the same sandboxed-iframe Output pane, chosen at session creation, plus an in-editor control to spawn a new Web or React session in a new tab.

**Architecture:** Low-level primitives (`useSession`, `EditorPane`, `sandbox.ts`, `OutputFrame`, `export.ts`/`ExportMenu`) are generalized in place to carry a `sessionType` discriminant, since that's purely additive and low-risk. The tab/pane UI and top-level workspace shell are NOT generalized in place — Web's `useTabsQueryParam`/`TabBar`/`MobileTabBar`/`SessionWorkspace` stay untouched, and React mode gets its own parallel `useReactTabsQueryParam`/`ReactTabBar`/`ReactMobileTabBar`/`ReactSessionWorkspace`, sharing the generalized primitives above. `SessionRoute` picks between the two shells based on the session's persisted `session_type` (falling back to a `?type=` URL hint only for sessions that don't exist yet).

**Tech Stack:** Vite + React 19 + TypeScript + Supabase (Postgres + Realtime) + CodeMirror 6 + Vitest/RTL. React mode additionally loads React, ReactDOM, and Babel Standalone **inside the sandboxed iframe only** via pinned-version CDN `<script>` tags (unpkg) — no new build-time dependency for the app itself.

**Spec:** `docs/superpowers/specs/2026-11-07-codeshare-react-mode-design.md`

## Global Constraints

- Web session behavior, schema, and security posture must not change.
- All user-authored code (JS or JSX) executes only inside the sandboxed `<iframe sandbox="allow-scripts allow-modals">` (no `allow-same-origin`) — never in the main app's React tree. `eval`/`new Function` are permitted only inside that sandboxed document's own script, matching the existing REPL precedent in `BRIDGE_SCRIPT`.
- Every new text column (`app_jsx`, `components_jsx`, `react_css`) gets the same `char_length(...) < 200000` constraint as `html`/`css`/`js`.
- No npm imports beyond React + ReactDOM; no TypeScript (`.tsx`); no free-form file tree; no live-refresh-on-keystroke for React mode (Run is explicit, like today's `js` pane); a session's type is fixed at creation and never switches.
- The existing debounced-persist (400ms per field) + immediate-broadcast sync model is reused unchanged, just over a wider field set.
- Pinned CDN versions (unpkg), used verbatim — never `@latest`:
  - `https://unpkg.com/react@19.2.0/umd/react.production.min.js`
  - `https://unpkg.com/react-dom@19.2.0/umd/react-dom.production.min.js`
  - `https://unpkg.com/@babel/standalone@7.26.4/babel.min.js`

## Review Focus

- Visiting an existing React session's bare link (no `?type=react` in the URL — e.g. a bookmarked/re-shared link) must still render the React shell, because the persisted `session_type` column is the source of truth, not the URL hint (URL hint only matters for sessions that don't exist yet).
- A JSX syntax error (e.g. an unclosed tag) in `App.jsx` must show a visible, readable error message inside the Output pane itself, not leave it blank, and must not throw repeatedly/spam the console.
- Writing past the 200,000-char cap on `app_jsx`/`components_jsx`/`react_css` must surface the existing write-failed banner, the same way it already does for `html`/`css`/`js` — not silently drop the edit.
- Exporting a React session (HTML file and ZIP) must produce a file where `Components.jsx`'s definitions are actually reachable from `App.jsx` under the concatenation convention, and the file renders standalone with no build step.
- The in-editor "new session" control must never navigate the current tab away, touch the current session's content, or disrupt its Realtime channel — it only opens a new tab.

---

## File Structure

**New files:**
- `supabase/migrations/0002_react_mode.sql` — schema migration
- `src/features/session/sessionType.ts` — `SessionType` type + validation guard
- `src/features/session/useSessionType.ts` + `.test.ts` — route-level type resolution hook
- `src/features/session/useReactTabsQueryParam.ts` + `.test.ts`
- `src/features/session/ReactTabBar.tsx` (no dedicated test file — matches `TabBar.tsx`, which has none either; covered via `ReactSessionWorkspace.test.tsx`)
- `src/features/session/ReactMobileTabBar.tsx` (no dedicated test file — matches `MobileTabBar.tsx`, same reason)
- `src/features/session/ReactSessionWorkspace.tsx` + `.test.tsx`

**Modified files:**
- `src/features/session/useSessionChannel.ts` — widen `EditField`
- `src/features/session/useSession.ts` — widen `SessionContent`, two starter-content constants, `typeHint` param, `sessionType` in return
- `src/features/session/EditorPane.tsx` — add `jsx` language, optional `fileName` override
- `src/lib/sandbox.ts` + `.test.ts` — add `buildReactSandboxDocument`
- `src/features/session/OutputFrame.tsx` + `.test.tsx` — `sessionType`-discriminated props
- `src/features/session/OutputPane.tsx` — `sessionType` prop for empty-state copy
- `src/lib/export.ts` + `.test.ts` — React export branch
- `src/features/session/ExportMenu.tsx` — `sessionType`-discriminated content prop
- `src/features/session/Header.tsx` + `.test.tsx` — `tabBar` slot, `exportContent` union, relocate Alt+1-5 shortcut, new "new session" control
- `src/features/session/useTabsQueryParam.ts` + `.test.ts` — add the relocated Alt+1-5 effect
- `src/routes/SessionRoute.tsx` — branch between `SessionWorkspace`/`ReactSessionWorkspace`
- `src/routes/Landing.tsx` + `.test.tsx` — Web/React picker

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/0002_react_mode.sql`

**Interfaces:**
- Produces: `sessions.session_type` (`text`, default `'web'`, check `in ('web','react')`), `sessions.app_jsx`, `sessions.components_jsx`, `sessions.react_css` (each `text not null default ''`, check `char_length(...) < 200000`) — consumed by every later task that reads/writes these columns.

- [ ] **Step 1: Write the migration**

```sql
alter table sessions
  add column session_type text not null default 'web',
  add column app_jsx text not null default '',
  add column components_jsx text not null default '',
  add column react_css text not null default '';

alter table sessions
  add constraint session_type_valid check (session_type in ('web', 'react')),
  add constraint app_jsx_length check (char_length(app_jsx) < 200000),
  add constraint components_jsx_length check (char_length(components_jsx) < 200000),
  add constraint react_css_length check (char_length(react_css) < 200000);
```

- [ ] **Step 2: Apply it locally**

Run: `npx supabase db reset`
Expected: migration `0002_react_mode.sql` applies with no errors (output lists it after `0001_init.sql`).

- [ ] **Step 3: Verify the new columns/constraints exist**

Run: `npx supabase db reset && echo "select column_name, data_type, column_default from information_schema.columns where table_name='sessions' order by column_name;" | npx supabase db execute` (or the equivalent via Supabase Studio's SQL editor at the local URL)
Expected: output includes `app_jsx`, `components_jsx`, `react_css` (all `text`, default `''::text`) and `session_type` (`text`, default `'web'::text`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_react_mode.sql
git commit -m "feat: add session_type and React file columns to sessions table"
```

---

### Task 2: Session content/type model

**Files:**
- Create: `src/features/session/sessionType.ts`
- Modify: `src/features/session/useSessionChannel.ts:4` (`EditField`)
- Modify: `src/features/session/useSession.ts`
- Test: `src/features/session/useSession.test.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: `type SessionType = 'web' | 'react'` and `isSessionType(value: string): value is SessionType` (from `sessionType.ts`) — consumed by every later task. `EditField = 'html' | 'css' | 'js' | 'app_jsx' | 'components_jsx' | 'react_css'`. `useSession(sessionId, userId, channel, channelStatus, typeHint: SessionType): SessionContent & { loading, connectionStatus, updateField, sessionType: SessionType }`, where `SessionContent = { html: string; css: string; js: string; app_jsx: string; components_jsx: string; react_css: string }`.

- [ ] **Step 1: Write `sessionType.ts`**

```ts
export type SessionType = 'web' | 'react';

export function isSessionType(value: string): value is SessionType {
  return value === 'web' || value === 'react';
}
```

- [ ] **Step 2: Write the failing tests**

In `useSession.test.ts`, add:

```ts
test('creates a React session with React starter content when no row exists and typeHint is react', async () => {
  // ... render the hook with typeHint: 'react' against a mocked Supabase client
  // whose select() resolves { data: null, error: null }; assert the upsert call's
  // first argument includes session_type: 'react' and non-empty app_jsx/components_jsx/react_css,
  // and the hook's returned sessionType is 'react'.
});

test('loads an existing session\'s session_type from the row, ignoring typeHint', async () => {
  // mock select() resolving { data: { ...row, session_type: 'react', app_jsx: 'x', components_jsx: 'y', react_css: 'z' } };
  // render with typeHint: 'web'; assert returned sessionType is 'react' and app_jsx === 'x'.
});

test('updateField persists app_jsx the same debounced way as html', async () => {
  // call updateField('app_jsx', 'const x = 1') and advance the debounce timer;
  // assert supabase.from('sessions').upsert was called with { id, app_jsx: 'const x = 1', updated_at: ... }.
});

test('surfaces write-failed when a React field write is rejected', async () => {
  // mock the upsert for app_jsx to resolve { error: <some error> };
  // assert connectionStatus becomes 'write-failed', matching today's html/css/js behavior.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- useSession.test.ts`
Expected: FAIL — `typeHint` not accepted / `sessionType` not returned / `app_jsx` not a valid `EditField`.

- [ ] **Step 3: Widen `EditField` in `useSessionChannel.ts:4`**

```ts
export type EditField = 'html' | 'css' | 'js' | 'app_jsx' | 'components_jsx' | 'react_css';
```

- [ ] **Step 4: Widen `SessionContent` and add starter content in `useSession.ts`**

```ts
type SessionContent = {
  html: string; css: string; js: string;
  app_jsx: string; components_jsx: string; react_css: string;
};

const BLANK_CONTENT: SessionContent = { html: '', css: '', js: '', app_jsx: '', components_jsx: '', react_css: '' };

const STARTER_CONTENT_WEB: SessionContent = { ...BLANK_CONTENT, html: /* unchanged existing value */, css: /* unchanged */, js: /* unchanged */ };

const STARTER_CONTENT_REACT: SessionContent = {
  ...BLANK_CONTENT,
  app_jsx: "function App() {\n  return <h1>Welcome to CodeShare 👋</h1>;\n}",
  components_jsx: '// Shared components go here, in the same scope as App.jsx.',
  react_css: 'body {\n  font-family: sans-serif;\n  padding: 2rem;\n  color: #222;\n}',
};
```

Keep the existing hardcoded html/css/js starter strings verbatim inside `STARTER_CONTENT_WEB` — do not change Web's starter copy.

- [ ] **Step 5: Thread `typeHint` through `useSession`'s signature and `loadOrCreate`**

- Add `typeHint: SessionType` as `useSession`'s 5th parameter.
- In `loadOrCreate` (`useSession.ts:72-93`): on the `data` branch, read `const sessionType = isSessionType(data.session_type) ? data.session_type : 'web'` and `setContent({ html: data.html, css: data.css, js: data.js, app_jsx: data.app_jsx, components_jsx: data.components_jsx, react_css: data.react_css })`. On the create branch, pick `const starter = typeHint === 'react' ? STARTER_CONTENT_REACT : STARTER_CONTENT_WEB` and `upsert({ id: sessionId, session_type: typeHint, ...starter })`.
- Track resolved session type in a new `useState<SessionType>(typeHint)`, updated in both `loadOrCreate` branches, and include it in the returned object as `sessionType`.

- [ ] **Step 6: Extend the per-field persister map (`useSession.ts:119-142`) to cover all six fields**, same `debounce(...)` pattern as `html`/`css`/`js`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- useSession.test.ts`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 8: Commit**

```bash
git add src/features/session/sessionType.ts src/features/session/useSessionChannel.ts src/features/session/useSession.ts src/features/session/useSession.test.ts
git commit -m "feat: extend session content model with React file fields and session type"
```

---

### Task 3: `EditorPane` — JSX language + filename override

**Files:**
- Modify: `src/features/session/EditorPane.tsx`
- Test: `src/features/session/EditorPane.test.tsx`

**Interfaces:**
- Consumes: `@codemirror/lang-javascript`'s `javascript({ jsx: true })` (already a dependency).
- Produces: `EditorPane`'s `language` prop accepts a new key `'jsx'`; a new optional prop `fileName?: string` overrides the header's displayed filename (default unchanged: derived from `META[language].file`).

- [ ] **Step 1: Write the failing tests**

```tsx
test('renders a jsx-language pane with JSX syntax support', () => {
  render(<EditorPane title="App" language="jsx" value="function App() { return <div />; }" onChange={() => {}} />);
  // assert no throw / pane renders — CodeMirror's javascript({jsx:true}) extension accepts JSX syntax that plain javascript() would mark invalid.
});

test('fileName prop overrides the default displayed filename', () => {
  render(<EditorPane title="App" language="jsx" fileName="App.jsx" value="" onChange={() => {}} />);
  expect(screen.getByText('App.jsx')).toBeInTheDocument();
});

test('omitting fileName keeps the existing default for an unaffected language', () => {
  render(<EditorPane title="JS" language="javascript" value="" onChange={() => {}} />);
  expect(screen.getByText('script.js')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- EditorPane.test.tsx`
Expected: FAIL — `'jsx'` not assignable to `language`, `fileName` prop not recognized.

- [ ] **Step 3: Add the `jsx` entry and `fileName` prop**

- `LANGUAGE_EXTENSIONS` (`EditorPane.tsx:12`): add `jsx: javascript({ jsx: true })`.
- `META` (`EditorPane.tsx:18-22`): add `jsx: { file: 'App.jsx', glyph: 'JSX', color: 'oklch(0.74 0.15 220)' }` (a placeholder default filename — the `fileName` prop overrides it per-instance for `Components.jsx`).
- `Props` (`EditorPane.tsx:88-93`): add `fileName?: string`.
- Where `meta.file` is rendered (`EditorPane.tsx:167`), render `fileName ?? meta.file` instead.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- EditorPane.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/session/EditorPane.tsx src/features/session/EditorPane.test.tsx
git commit -m "feat: add JSX language support and filename override to EditorPane"
```

---

### Task 4: `buildReactSandboxDocument`

**Files:**
- Modify: `src/lib/sandbox.ts`
- Test: `src/lib/sandbox.test.ts`

**Interfaces:**
- Consumes: existing `BRIDGE_SCRIPT` (unchanged, reused verbatim).
- Produces: `buildReactSandboxDocument(appJsx: string, componentsJsx: string, css: string): string` — consumed by Task 5 (`OutputFrame`).

- [ ] **Step 1: Write the failing tests**

```ts
test('includes pinned CDN script tags for React, ReactDOM, and Babel Standalone', () => {
  const doc = buildReactSandboxDocument('function App(){return null;}', '', '');
  expect(doc).toContain('https://unpkg.com/react@19.2.0/umd/react.production.min.js');
  expect(doc).toContain('https://unpkg.com/react-dom@19.2.0/umd/react-dom.production.min.js');
  expect(doc).toContain('https://unpkg.com/@babel/standalone@7.26.4/babel.min.js');
});

test('inlines css into the id="__cs_style" tag', () => {
  const doc = buildReactSandboxDocument('function App(){return null;}', '', 'body{color:red}');
  expect(doc).toContain('<style id="__cs_style">body{color:red}</style>');
});

test('concatenates componentsJsx before appJsx in the transform source', () => {
  const doc = buildReactSandboxDocument('const a = Shared;', 'const Shared = 1;', '');
  // Both must appear, componentsJsx first, inside whatever script carries the source to Babel.transform.
  expect(doc.indexOf('const Shared = 1;')).toBeLessThan(doc.indexOf('const a = Shared;'));
});

test('includes the existing BRIDGE_SCRIPT for console/REPL relay', () => {
  const doc = buildReactSandboxDocument('function App(){return null;}', '', '');
  expect(doc).toContain('console.log = wrap');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- sandbox.test.ts`
Expected: FAIL — `buildReactSandboxDocument` is not defined.

- [ ] **Step 3: Implement `buildReactSandboxDocument`**

Mirrors `buildSandboxDocument`'s structure (css into `#__cs_style`, `BRIDGE_SCRIPT` inline, empty `#__cs_root` mount point), but the user-code script does its own Babel transform + mount, wrapped in try/catch so a transform or render error renders a visible message into `#__cs_root` instead of leaving it blank (per the design doc's error-state decision) and also relays to Console via the existing `runtime-error` message type:

```ts
export function buildReactSandboxDocument(appJsx: string, componentsJsx: string, css: string): string {
  const userCode = JSON.stringify(`${componentsJsx}\n${appJsx}`);
  return `<!DOCTYPE html>
<html>
  <head>
    <style id="__cs_style">${css}</style>
    <script src="https://unpkg.com/react@19.2.0/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@19.2.0/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>
  </head>
  <body>
    <div id="__cs_root"></div>
    <script>${BRIDGE_SCRIPT}</script>
    <script>
      (function () {
        function escapeHtml(s) {
          return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
        }
        try {
          var transformed = Babel.transform(${userCode}, { presets: ['react'] }).code;
          var App = new Function('React', 'ReactDOM', transformed + '\\nreturn App;')(React, ReactDOM);
          ReactDOM.createRoot(document.getElementById('__cs_root')).render(React.createElement(App));
        } catch (err) {
          var message = String((err && err.message) || err);
          document.getElementById('__cs_root').innerHTML =
            '<pre style="color:#e05252;white-space:pre-wrap;padding:1rem;font-family:monospace;">' + escapeHtml(message) + '</pre>';
          parent.postMessage({ type: 'runtime-error', message: message }, '*');
        }
      })();
    </script>
  </body>
</html>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- sandbox.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the Review Focus regression test**

jsdom cannot execute the sandboxed document's own `<script>` tags, so no unit test here can actually trigger a JSX syntax error and observe the DOM — the honest, real invariant to pin at this level is that the generated document *unconditionally* wires its catch block to both the visible-error display and the console relay, for any input (not just "broken" input, which would make the assertion identical for valid input too and prove nothing about the condition it names):

```ts
test('the catch block always wires both the visible #__cs_root error display and the runtime-error postMessage relay', () => {
  const doc = buildReactSandboxDocument('function App(){return null;}', '', '');
  const catchBlock = doc.slice(doc.indexOf('} catch (err) {'));
  expect(catchBlock).toContain("getElementById('__cs_root')");
  expect(catchBlock).toContain("type: 'runtime-error'");
});
```

Run: `npm test -- sandbox.test.ts` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sandbox.ts src/lib/sandbox.test.ts
git commit -m "feat: add buildReactSandboxDocument with in-sandbox Babel transform and error display"
```

---

### Task 5: `OutputFrame` + `OutputPane` — session-type-aware rendering

**Files:**
- Modify: `src/features/session/OutputFrame.tsx`
- Modify: `src/features/session/OutputPane.tsx`
- Test: `src/features/session/OutputFrame.test.tsx`

**Interfaces:**
- Consumes: `buildReactSandboxDocument` (Task 4), `buildSandboxDocument` (unchanged).
- Produces: `OutputFrame`'s props become a discriminated union:
  ```ts
  type Props =
    | { sessionType?: 'web'; html: string; css: string; js: string; runToken: number; onWindowReady: (win: Window | null) => void }
    | { sessionType: 'react'; appJsx: string; componentsJsx: string; reactCss: string; runToken: number; onWindowReady: (win: Window | null) => void };
  ```
  `sessionType` optional+defaulting to `'web'` on the web branch, so every existing call site (which never passes it) keeps compiling and passing unchanged. `OutputPane` forwards the same union plus takes its own `sessionType?: 'web' | 'react'` only to pick empty-state copy.

- [ ] **Step 1: Write the failing tests** (added to `OutputFrame.test.tsx`, alongside the existing ones which must keep passing unmodified)

```tsx
test('builds a React sandbox document on Run for a react session', () => {
  render(
    <OutputFrame sessionType="react" appJsx="function App(){return null;}" componentsJsx="" reactCss=""
      runToken={1} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  expect(iframe.srcdoc).toContain('Babel.transform');
});

test('does not post html/css live-update messages for a react session', () => {
  const { rerender } = render(
    <OutputFrame sessionType="react" appJsx="a" componentsJsx="" reactCss="" runToken={0} onWindowReady={() => {}} />,
  );
  const iframe = screen.getByTitle<HTMLIFrameElement>('Output');
  fireEvent.load(iframe);
  const postMessage = vi.spyOn(iframe.contentWindow as Window, 'postMessage');
  rerender(<OutputFrame sessionType="react" appJsx="b" componentsJsx="" reactCss="" runToken={0} onWindowReady={() => {}} />);
  expect(postMessage).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- OutputFrame.test.tsx`
Expected: FAIL — `sessionType`/`appJsx`/`componentsJsx`/`reactCss` not accepted.

- [ ] **Step 3: Implement the branch in `OutputFrame.tsx`**

- Widen `Props` to the union above.
- In the `srcDoc` `useMemo` (`OutputFrame.tsx:43-50`): branch on `props.sessionType === 'react'` → call `buildReactSandboxDocument(appJsx, componentsJsx, reactCss)` using the same `latestContentRef`-at-Run-time pattern (ref now holds whichever fields apply); else keep today's `buildSandboxDocument(html, css, js)` path byte-for-byte.
- The live-update effect (`OutputFrame.tsx:68-70`) only runs `if (props.sessionType !== 'react')` — React mode never posts `'update'`.

- [ ] **Step 4: Add a `sessionType` prop to `OutputPane.tsx`** (default `'web'`), and swap its empty-state copy (`OutputPane.tsx:43-44`) to a React-appropriate message (e.g. `// Press Run or Ctrl + Enter to render your app.`) only when `sessionType === 'react'` — the existing Web copy stays byte-for-byte unchanged otherwise.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- OutputFrame.test.tsx`
Expected: PASS, including all pre-existing tests unmodified.

- [ ] **Step 6: Commit**

```bash
git add src/features/session/OutputFrame.tsx src/features/session/OutputFrame.test.tsx src/features/session/OutputPane.tsx
git commit -m "feat: branch OutputFrame/OutputPane on sessionType to support React mode"
```

---

### Task 6: Export — React branch

**Files:**
- Modify: `src/lib/export.ts`
- Modify: `src/features/session/ExportMenu.tsx`
- Test: `src/lib/export.test.ts`

**Interfaces:**
- Produces: `buildReactHtmlFile({ appJsx, componentsJsx, reactCss }): string` and `buildReactZipBlob({ appJsx, componentsJsx, reactCss }): Promise<Blob>` in `export.ts`. `ExportMenu`'s content prop becomes a discriminated union: `{ sessionType?: 'web' } & ExportContent` or `{ sessionType: 'react' } & ReactExportContent`, where `ReactExportContent = { appJsx: string; componentsJsx: string; reactCss: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('buildReactHtmlFile embeds componentsJsx before appJsx and the pinned CDN scripts', () => {
  const file = buildReactHtmlFile({ appJsx: 'const a = Shared;', componentsJsx: 'const Shared = 1;', reactCss: '' });
  expect(file).toContain('unpkg.com/react@19.2.0');
  expect(file).toContain('unpkg.com/@babel/standalone@7.26.4');
  expect(file.indexOf('const Shared = 1;')).toBeLessThan(file.indexOf('const a = Shared;'));
});

test('buildReactZipBlob produces a zip with App.jsx, Components.jsx, and styles.css', async () => {
  const blob = await buildReactZipBlob({ appJsx: 'x', componentsJsx: 'y', reactCss: 'z' });
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  expect(Object.keys(zip.files).sort()).toEqual(['App.jsx', 'Components.jsx', 'index.html', 'styles.css']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- export.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement `buildReactHtmlFile`/`buildReactZipBlob` in `export.ts`**

`buildReactHtmlFile` reuses the same inline Babel-transform-and-mount approach as `buildReactSandboxDocument` (Task 4) — a self-contained HTML document with the three pinned CDN `<script src>` tags, the concatenated componentsJsx+appJsx source run through `Babel.transform`/`new Function`, and `reactCss` inlined in a `<style>` tag (no error-display wrapper needed here — this is a downloaded artifact, not a live pane, so an uncaught exception in the browser console when opening the exported file is acceptable). `buildReactZipBlob` writes `App.jsx` (raw `appJsx`), `Components.jsx` (raw `componentsJsx`), `styles.css` (raw `reactCss`), and an `index.html` that `<link>`s `styles.css` and loads the three CDN scripts plus a small inline script that `fetch()`es... — **no**, zip contents can't `fetch()` sibling files when opened via `file://`. Instead, `index.html` inlines the same Babel-transform-and-mount script as the HTML export, with its source literally concatenating `Components.jsx`'s and `App.jsx`'s text at zip-build time (read from the same `componentsJsx`/`appJsx` strings passed in) — so opening `index.html` from the extracted zip works with no server, exactly like the HTML export.

- [ ] **Step 4: Update `ExportMenu.tsx`** to accept the discriminated content prop and call `buildReactHtmlFile`/`buildReactZipBlob` (via `saveAs`) when `sessionType === 'react'`, else the existing `buildHtmlFile`/`buildZipBlob` path unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- export.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the Review Focus regression test**

```ts
test('the exported React HTML file actually defines App using Components.jsx\'s bindings', () => {
  const file = buildReactHtmlFile({ appJsx: 'function App(){ return React.createElement("div", null, Shared); }', componentsJsx: 'const Shared = "hi";', reactCss: '' });
  // Shared must be in scope when App is defined -- i.e. componentsJsx's text appears textually before appJsx's in the concatenated source Babel.transform receives.
  expect(file.indexOf('const Shared')).toBeLessThan(file.indexOf('function App'));
});
```

Run: `npm test -- export.test.ts` — Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/export.ts src/lib/export.test.ts src/features/session/ExportMenu.tsx
git commit -m "feat: add React export (HTML file and zip) alongside existing Web export"
```

---

### Task 7: React tab/pane system

**Files:**
- Create: `src/features/session/useReactTabsQueryParam.ts` + `.test.ts`
- Create: `src/features/session/ReactTabBar.tsx` (no test file — see note below)
- Create: `src/features/session/ReactMobileTabBar.tsx` (no test file — see note below)

**Interfaces:**
- Produces:
  - `type ReactTabsState = { appJsx: boolean; componentsJsx: boolean; reactCss: boolean; console: boolean; output: boolean }`, `REACT_TAB_KEYS: (keyof ReactTabsState)[]`, `DEFAULT_REACT_TABS: ReactTabsState` (default: `appJsx: true, console: true`, rest `false` — mirrors Web's `js: true, console: true` default).
  - `useReactTabsQueryParam(): { tabs: ReactTabsState; setTabs: (t: ReactTabsState) => void; toggleTab: (key: keyof ReactTabsState) => void }`.
  - `ReactTabBar({ tabs, toggleTab }: { tabs: ReactTabsState; toggleTab: (key: keyof ReactTabsState) => void })`.
  - `ReactMobileTabBar({ active, onSelect }: { active: keyof ReactTabsState; onSelect: (key: keyof ReactTabsState) => void })`.
- Consumed by: Task 8 (Header's Alt+1-5 relocation targets this hook too) and Task 9 (`ReactSessionWorkspace`).

- [ ] **Step 1: Write the failing tests** for `useReactTabsQueryParam.test.ts`, directly mirroring `useTabsQueryParam.test.ts`'s suite but asserting against `appJsx`/`componentsJsx`/`reactCss`/`console`/`output` instead of `html`/`css`/`js`/`console`/`output`. Key behaviors to port: `parseSelectedTabs` ignoring unknown keys, `toggleTab` refusing to close the last open pane, `setTabs` serializing to `?selectedTabs=`. `ReactTabBar.tsx`/`ReactMobileTabBar.tsx` get no dedicated test file, matching `TabBar.tsx`/`MobileTabBar.tsx` (neither has one today) — their rendering is covered by `ReactSessionWorkspace.test.tsx` in Task 9.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- useReactTabsQueryParam.test.ts`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement all three files**, copying `useTabsQueryParam.ts`/`MobileTabBar.tsx`'s logic verbatim with the five keys above substituted, and `ReactTabBar.tsx` copying `TabBar.tsx`'s structure with `LABELS = { appJsx: 'App', componentsJsx: 'Components', reactCss: 'CSS', console: 'Console', output: 'Output' }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- useReactTabsQueryParam.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/session/useReactTabsQueryParam.ts src/features/session/useReactTabsQueryParam.test.ts src/features/session/ReactTabBar.tsx src/features/session/ReactMobileTabBar.tsx
git commit -m "feat: add React-mode tab/pane system parallel to the existing Web one"
```

---

### Task 8: `Header` generalization + in-editor new-session control

**Files:**
- Modify: `src/features/session/Header.tsx`
- Modify: `src/features/session/useTabsQueryParam.ts` (add the relocated Alt+1-5 effect)
- Modify: `src/features/session/useReactTabsQueryParam.ts` (add the equivalent effect)
- Modify: `src/features/session/SessionWorkspace.tsx` (update its `<Header>` call site to the new prop contract)
- Test: `src/features/session/Header.test.tsx`
- Test: `src/features/session/useTabsQueryParam.test.ts`

**Interfaces:**
- Consumes: `ReactTabBar`/`useReactTabsQueryParam` (Task 7), `ExportMenu`'s new discriminated content prop (Task 6).
- Produces: `Header`'s new prop shape:
  ```ts
  type Props = {
    roomId: string;
    tabBar: ReactNode;
    users: PresenceUser[];
    currentUserId: string | null;
    name: string;
    onNameChange: (n: string) => void;
    onRun: () => void;
    exportContent: ({ sessionType?: 'web' } & ExportContent) | ({ sessionType: 'react' } & ReactExportContent);
  };
  ```
  (drops `tabs`, `toggleTab`, `html`, `css`, `js`). Consumed by Task 9 (`ReactSessionWorkspace`) and this task's own update to `SessionWorkspace.tsx`.

- [ ] **Step 1: Write the failing tests** (rewrite the relevant parts of `Header.test.tsx` to the new prop contract: pass `tabBar={<TabBar tabs={...} toggleTab={...} />}` and `exportContent={{ html, css, js }}` instead of the old flat props; keep every existing behavioral assertion — copy-link chip, UsersMenu, RunControls, theme drawer — intact)

Add new tests:

```tsx
test('renders whatever is passed as tabBar', () => {
  render(<Header {...baseProps} tabBar={<div data-testid="custom-tab-bar" />} />);
  expect(screen.getByTestId('custom-tab-bar')).toBeInTheDocument();
});

test('the "new session" control opens a new tab and does not navigate the current one', () => {
  const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  render(<Header {...baseProps} />);
  fireEvent.click(screen.getByRole('button', { name: /new react session/i })); // exact accessible name per Step 3's UI
  expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('?type=react'), '_blank');
  expect(window.location.pathname).not.toBe(expect.stringContaining('?type=react'));
});
```

Also move any existing Alt+1-5 assertions from `Header.test.tsx` into `useTabsQueryParam.test.ts`, asserting `toggleTab` fires on a simulated `Alt+Digit1..5` `keydown` dispatched on `window`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Header.test.tsx useTabsQueryParam.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `Header.tsx`: replace the `tabs`/`toggleTab` props and the inline `<TabBar .../>` (`Header.tsx:115`) with `{tabBar}`. Replace `html`/`css`/`js` props and the `<ExportMenu html css js .../>` call (`Header.tsx:127-132`) with `exportContent` passed straight through: `<ExportMenu {...exportContent} onExported={...} />` (requires `ExportMenu`'s props to already accept the spread shape from Task 6). Remove the Alt+1-5 `useEffect` (`Header.tsx:57-66`) and its now-unused `TAB_KEYS` import entirely. Add a new "new session" control to the `actions` cluster: a small `DropdownMenu` (same Radix primitive `ExportMenu` already uses) with two items, "New Web Session" and "New React Session", each generating a fresh id via `generateSessionId()` and calling `window.open(`${window.location.origin}/code/${newId}${type === 'react' ? '?type=react' : ''}`, '_blank')`.
- `useTabsQueryParam.ts`: add a `useEffect` registering the Alt+1-5 `window` keydown listener, using this hook's own `toggleTab`/`TAB_KEYS`, identical logic to what was removed from Header.
- `useReactTabsQueryParam.ts`: add the equivalent effect using `REACT_TAB_KEYS`/its own `toggleTab`.
- `SessionWorkspace.tsx:152-164`: update the `<Header>` call site to pass `tabBar={<TabBar tabs={tabs} toggleTab={toggleTab} />}` and `exportContent={{ html, css, js }}`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Header.test.tsx useTabsQueryParam.test.ts SessionWorkspace.test.tsx`
Expected: PASS — including `SessionWorkspace.test.tsx` unmodified (its behavior must not change, only the prop-plumbing at the `<Header>` call site inside it).

- [ ] **Step 5: Commit**

```bash
git add src/features/session/Header.tsx src/features/session/Header.test.tsx src/features/session/useTabsQueryParam.ts src/features/session/useTabsQueryParam.test.ts src/features/session/useReactTabsQueryParam.ts src/features/session/SessionWorkspace.tsx
git commit -m "feat: generalize Header for React mode and add in-editor new-session control"
```

---

### Task 9: `ReactSessionWorkspace`

**Files:**
- Create: `src/features/session/ReactSessionWorkspace.tsx`
- Test: `src/features/session/ReactSessionWorkspace.test.tsx`

**Interfaces:**
- Consumes: `useSession` (Task 2, called with `typeHint: 'react'`), `useSessionChannel` (unchanged), `EditorPane` with `language="jsx"`/`"css"` + `fileName` (Task 3), `OutputFrame`/`OutputPane` with `sessionType="react"` (Task 5), `useReactTabsQueryParam`/`ReactTabBar`/`ReactMobileTabBar` (Task 7), `Header` with `tabBar`/`exportContent` (Task 8).
- Produces: `ReactSessionWorkspace({ sessionId }: { sessionId: string })` — a top-level component, consumed by Task 11 (`SessionRoute`).

- [ ] **Step 1: Write the failing tests** — port `SessionWorkspace.test.tsx`'s structure (same auth-bootstrap, channel, run-token, mobile/desktop, off-screen-output-mount coverage) substituting `App.jsx`/`Components.jsx`/`styles.css` for `html`/`css`/`js`. Key cases: renders three `EditorPane`s with filenames `App.jsx`/`Components.jsx`/`styles.css`; Run bumps `runToken` and is passed to `OutputFrame` with `sessionType="react"`; the off-screen `OutputFrame` mount exists whenever `console` or `output` is open, mirroring Web's dual-mount strategy; Header receives `exportContent={{ sessionType: 'react', appJsx, componentsJsx, reactCss }}`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- ReactSessionWorkspace.test.tsx`
Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Implement `ReactSessionWorkspace.tsx`**

Copy `SessionWorkspace.tsx`'s structure (auth bootstrap, `useSessionChannel`, `useSession(sessionId, userId, channel, channelStatus, 'react')`, `usePresence`, `runToken`/`iframeWindowRef`, `handleRun`/`handleRepl`, the dual visible/off-screen `OutputFrame` mount, mobile/desktop branching) verbatim in shape, with these substitutions: `useTabsQueryParam`→`useReactTabsQueryParam`, `TabBar`→`ReactTabBar`, `MobileTabBar`→`ReactMobileTabBar`, `TAB_KEYS`→`REACT_TAB_KEYS`, the three `EditorPane`s become `language="jsx" fileName="App.jsx"` / `language="jsx" fileName="Components.jsx"` / `language="css" fileName="styles.css"` bound to `app_jsx`/`components_jsx`/`react_css` via `updateField`, `MOBILE_EDITOR_TABS` becomes `['appJsx', 'componentsJsx', 'reactCss']`, and the `outputFrameProps`/`Header`'s `exportContent` carry `{ sessionType: 'react', appJsx: app_jsx, componentsJsx: components_jsx, reactCss: react_css }`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- ReactSessionWorkspace.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/session/ReactSessionWorkspace.tsx src/features/session/ReactSessionWorkspace.test.tsx
git commit -m "feat: add ReactSessionWorkspace assembling the React-mode editor/output shell"
```

---

### Task 10: `useSessionType` hook

**Files:**
- Create: `src/features/session/useSessionType.ts`
- Test: `src/features/session/useSessionType.test.ts`

**Interfaces:**
- Produces: `useSessionType(sessionId: string, typeHint: SessionType): { sessionType: SessionType | null; loading: boolean }` — consumed by Task 11 (`SessionRoute`).

- [ ] **Step 1: Write the failing tests**

```ts
test('resolves to the row\'s session_type when a row exists, ignoring typeHint', async () => {
  // mock supabase.from('sessions').select('session_type').eq(...).maybeSingle() -> { data: { session_type: 'react' }, error: null }
  // render the hook with typeHint 'web'; after the microtask, loading is false and sessionType is 'react'.
});

test('falls back to typeHint when no row exists yet', async () => {
  // mock -> { data: null, error: null }; render with typeHint 'react'; sessionType resolves to 'react'.
});

test('starts in a loading state', () => {
  // mock a select() that never resolves; assert loading is true, sessionType is null, synchronously after render.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- useSessionType.test.ts`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement**

```ts
export function useSessionType(sessionId: string, typeHint: SessionType): { sessionType: SessionType | null; loading: boolean } {
  // useEffect: supabase.from('sessions').select('session_type').eq('id', sessionId).maybeSingle();
  // on resolve: setSessionType(data && isSessionType(data.session_type) ? data.session_type : typeHint); setLoading(false).
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- useSessionType.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/session/useSessionType.ts src/features/session/useSessionType.test.ts
git commit -m "feat: add useSessionType for route-level session type resolution"
```

---

### Task 11: `SessionRoute` branching

**Files:**
- Modify: `src/routes/SessionRoute.tsx`
- Test: create `src/routes/SessionRoute.test.tsx` (none exists today)

**Interfaces:**
- Consumes: `useSessionType` (Task 10), `isSessionType` (Task 2), `SessionWorkspace` (unchanged), `ReactSessionWorkspace` (Task 9).

- [ ] **Step 1: Write the failing tests**

```tsx
test('renders SessionWorkspace when the resolved type is web', () => {
  // mock useSessionType -> { sessionType: 'web', loading: false }; render at /code/abc; assert SessionWorkspace's known DOM (e.g. the HTML EditorPane's filename) appears.
});

test('renders ReactSessionWorkspace when the resolved type is react', () => {
  // mock useSessionType -> { sessionType: 'react', loading: false }; assert App.jsx EditorPane appears.
});

test('renders nothing (not NotFound, not either workspace) while loading', () => {
  // mock useSessionType -> { sessionType: null, loading: true }; assert neither workspace's content nor NotFound renders.
});

test('reads the type hint from a ?type=react query param for a not-yet-existing session', () => {
  // mock useSessionType to assert it was called with typeHint 'react' when rendered at /code/newid?type=react.
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- SessionRoute.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
export default function SessionRoute() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  const typeHint: SessionType = rawType && isSessionType(rawType) ? rawType : 'web';
  if (!sessionId) return <NotFound />;
  const { sessionType, loading } = useSessionType(sessionId, typeHint);
  if (loading || !sessionType) return null;
  return sessionType === 'react' ? <ReactSessionWorkspace sessionId={sessionId} /> : <SessionWorkspace sessionId={sessionId} />;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- SessionRoute.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/SessionRoute.tsx src/routes/SessionRoute.test.tsx
git commit -m "feat: branch SessionRoute between Web and React workspaces by session type"
```

---

### Task 12: `Landing` — Web/React picker

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.test.tsx`

**Interfaces:**
- Consumes: nothing new — just changes which `roomHref` the existing create actions navigate to.

- [ ] **Step 1: Write the failing tests** (extend `Landing.test.tsx`)

```tsx
test('defaults to creating a Web session', () => {
  render(<Landing />, { wrapper: RouterWrapper });
  fireEvent.click(screen.getByText('Create New Room'));
  expect(mockNavigate).toHaveBeenCalledWith(expect.not.stringContaining('?type='));
});

test('selecting React before creating navigates with ?type=react', () => {
  render(<Landing />, { wrapper: RouterWrapper });
  fireEvent.click(screen.getByRole('button', { name: /react/i })); // the toggle
  fireEvent.click(screen.getByText('Create New Room'));
  expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('?type=react'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- Landing.test.tsx`
Expected: FAIL — no toggle exists yet.

- [ ] **Step 3: Implement**

- Add `const [sessionType, setSessionType] = useState<SessionType>('web')` and a small two-option toggle (`Web` / `React`) near the hero's CTA buttons.
- `roomHref` (`Landing.tsx:69`) becomes `` `/code/${newRoomId}${sessionType === 'react' ? '?type=react' : ''}` `` — recomputed whenever `sessionType` changes (keep it a plain derived `const`, not memoized, since it's cheap).
- All three existing `Link to={roomHref}` call sites (`Landing.tsx:134, 164, 212`) and `enterRoom`'s `navigate(roomHref)` pick up the change automatically since they already read `roomHref`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- Landing.test.tsx`
Expected: PASS, including every pre-existing test (default Web behavior unchanged).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS — all suites, old and new.

- [ ] **Step 6: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.test.tsx
git commit -m "feat: add Web/React picker to the Landing page session creation flow"
```

---

## Self-Review

**Spec coverage:** Every Goal in the spec maps to a task — session type at creation (Tasks 2, 11, 12), fixed React file set with live sync (Tasks 2, 3, 9), Output rendering via the sandboxed iframe (Tasks 4, 5), export (Task 6), in-editor new-session control (Task 8). Every Non-goal is respected by omission (no npm imports, no TS, no free-form files, no live-refresh, no in-session type switch). The Anti-goal ("don't make Web sessions worse") is addressed structurally by Task 9's decision to duplicate the workspace shell rather than branch inside the existing one.

**Review Focus coverage:** bare-link-resolves-from-DB → Task 11 Step 1's test 1 + Task 10. JSX-error-shows-in-Output → Task 4 Step 5. 200k-char-cap-write-failure → Task 2 Step 1's 4th test. Export's Components→App scope convention → Task 6 Step 6. New-session-control-doesn't-navigate-away → Task 8 Step 1's second test.

**Proportion check:** 12 tasks for a feature touching schema, two sync-model types, two tab systems, two workspace shells, sandboxed execution, and export is proportionate to the spec's own length — most task bodies are signatures/test names/exact values, with a full code body given only where Task 4/6 genuinely determine a non-obvious algorithm (the in-sandbox Babel-transform-and-mount-with-error-display sequence) that no signature or test name could otherwise pin down.
