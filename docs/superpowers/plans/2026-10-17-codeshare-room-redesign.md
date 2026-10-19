# CodeShare Room Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Room workspace (`SessionWorkspace` and everything it renders) to match the design handoff — restyled header with a copyable room-link chip, key-badged pane tabs, presence avatars, themed Run/Export controls; restyled editor/console/output panes; a desktop status bar; and a true single-pane mobile layout with a sliding bottom tab bar — on top of the design-system plan's tokens, while keeping every piece of real functionality this page already has (Realtime sync, presence + rename, drag-to-resize panes, the sandboxed console/REPL).

**Architecture:** Desktop keeps the existing `react-resizable-panels` `Group`/`Panel`/`Separator` layout (restyled, not replaced — see the brainstorming decision below), gated behind a new `useBreakpoint()` hook; mobile (`< 760px`) bypasses resizable panels entirely and renders exactly one pane, switched via a new bottom tab bar, because there is nothing to resize with one visible pane. The existing URL-query-param pane-open state (`useTabsQueryParam`) gains a guarded `toggleTab` (at least one pane must stay open) and an Alt+1–5 shortcut; the mobile single-active-pane is separate, ephemeral `useState` in `SessionWorkspace`. Presence avatars and the REPL's input/result echo are the two places this page already has *more* real functionality than the static handoff prototyped — both are reinterpreted to add the handoff's visuals on top of the existing feature rather than replacing it.

**Tech Stack:** React 19, `react-resizable-panels`, CodeMirror 6, `@radix-ui/react-dropdown-menu`, Sass Modules, Vitest + React Testing Library.

**Spec:**
- `design_handoff_codeshare/README.md` — "Screens → 2. Room" (lines 124–157), "Toast" (lines 174–175), "Interactions & Behavior" (lines 179–187)
- `design_handoff_codeshare/CodeShare v2.dc.html` — Room markup (lines 161–282), Theme-drawer-adjacent toast/warp markup (lines 312–322), `TABS`/`META` consts (lines 332–343), `renderVals()` tab/log/pill derivation (lines 573–647), `toggleTab`/`run`/`editKey` (lines 511–571)
- Depends on: `docs/superpowers/plans/2026-10-17-codeshare-design-system.md` (tokens, `useTheme`, `ThemeButton`, `ThemeDrawer`)

## Global Constraints

- **Keep resizable panes.** Per an explicit product decision for this redesign, desktop multi-pane layout stays `react-resizable-panels` (restyled `Separator`/pane chrome), not the handoff's fixed equal-width CSS grid — this is a deliberate deviation from the handoff's literal `grid-template-columns` (README line 135), confirmed up front rather than silently matched.
- **Keep presence/rename working everywhere.** The handoff's avatar stack (lines 182–190) is hidden below `isWide` (1100px, README line 80) in the prototype, where it is a placeholder anyway (README line 187: "not prototyped"). This app's presence/rename is real. Below 1100px, fall back to the pre-existing compact "users count" trigger (icon + number) that opens the same rename dropdown, so renaming never becomes unreachable on a laptop-width or mobile screen — only the avatar-stack *visual* is a ≥1100px enhancement.
- **Keep the sandboxed-execution security model exactly as-is.** The REPL/console changes in Task 5 only change *what gets posted and where it's displayed*; user JS still only ever runs inside the `sandbox="allow-scripts"` iframe (`OutputFrame.tsx`/`sandbox.ts`), never via `eval`/`new Function` in the main window.
- Breakpoints, per README lines 78–81: `isMobile` = `< 760px` (one pane, bottom tab bar); `isWide` = `≥ 1100px` (room-id text, key badges, avatars shown); everything `≥ 760px` is "desktop" for the purposes of showing the tab row / status bar / Export label / Run's `⌃↵` hint.
- Pane render order is always `html, css, js, console, output` (handoff line 135) — already the iteration order of `TabsState`'s keys in `useTabsQueryParam.ts`; do not reorder it.
- At least one pane must stay open on desktop (README line 180); `toggleTab` on the last remaining open pane is a no-op, mirroring `toggleTab()` at handoff lines 563–571.
- Respect `--play`/`prefers-reduced-motion` on the Run-button flash, pane-enter animation, and bottom-nav pill slide.

## Review Focus

- **Resizing a pane to near-zero width, then toggling a different pane off/on:** the restyled `Separator` must not let a pane's content become unreadable or let `react-resizable-panels` end up in an inconsistent size state — exercise this combination explicitly since Task 10 restyles the separator the existing pane-toggle logic (Task 3) already covers functionally.
- **A collaborator's code floods `console.log` in a tight loop while the Console pane is closed:** the new leveled/glyphed rendering (Task 5) must still respect the existing 500-entry cap (`ConsolePanel.tsx`'s `MAX_CONSOLE_ENTRIES`) — a restyle that drops the cap while rewriting the component would reopen the unbounded-memory issue that constant already guards against.
- **Resizing the window across the 760px/1100px boundaries while mid-interaction** (console REPL input focused, a theme drawer open, a pane drag in progress): nothing should lose focus, drop the drawer, or strand the UI between the mobile and desktop layouts — `useBreakpoint()`'s listener-driven updates (Task 1) are what this depends on, so its re-render behavior needs a resize-crossing test, not just an initial-value one.
- **Running code, then immediately switching away from Output on mobile, then hitting Run again:** the handoff's "Run auto-switches to Output" behavior (README line 155) must re-trigger every time Run is pressed from an editor tab, not just the first time — a naive "switch once" implementation would only fire on mount.
- **The REPL input is empty or whitespace-only, or the eval throws a non-Error value** (e.g. `throw 'boom'`): must not post a blank/`[object Object]` log row or crash the bridge script — this exercises both the existing guard in `ConsolePanel.handleKeyDown` and the new result/error serialization in `sandbox.ts` (Task 5).

---

## File Structure

- Create `src/features/session/useBreakpoint.ts` + `.test.ts` — `isMobile`/`isWide` via `matchMedia`.
- Create `src/lib/avatarColor.ts` + `.test.ts` — deterministic per-user avatar color.
- Create `src/features/session/Toast.tsx` + `.module.scss`, `src/features/session/useToast.ts` + `.test.ts`.
- Create `src/features/session/MobileTabBar.tsx` + `.module.scss`.
- Create `src/features/session/StatusBar.tsx` + `.module.scss`.
- Create `src/features/session/OutputPane.tsx` + `.module.scss` (wraps the existing `OutputFrame`).
- Modify `src/features/session/useTabsQueryParam.ts` + `.test.ts` — add guarded `toggleTab`.
- Modify `src/lib/sandbox.ts` + `.test.ts` — distinct REPL-result message.
- Modify `src/features/session/ConsolePanel.tsx` + `.module.scss` + `.test.tsx`.
- Modify `src/features/session/EditorPane.tsx` + `.module.scss` + `.test.tsx`.
- Modify `src/features/session/Header.tsx` + `.module.scss`.
- Modify `src/features/session/TabBar.tsx` + `.module.scss`.
- Modify `src/features/session/UsersMenu.tsx` + `.module.scss`.
- Modify `src/features/session/ExportMenu.tsx` + `.module.scss`.
- Modify `src/features/session/RunControls.tsx` + `.module.scss`.
- Modify `src/features/session/SessionWorkspace.tsx` + `.module.scss` + `.test.tsx`.
- Modify `src/styles/tokens.scss`, `src/styles/theme.scss` — drop the now-unused legacy tokens (last task, once nothing references them).

## Task 1: `useBreakpoint()`

**Files:**
- Create: `src/features/session/useBreakpoint.ts`
- Create: `src/features/session/useBreakpoint.test.ts`

**Interfaces:**
- Consumes: `window.matchMedia` (stubbed globally by the design-system plan's Task 1; this task's tests override the stub's `matches`/listener behavior per-test).
- Produces: `function useBreakpoint(): { isMobile: boolean; isWide: boolean }` — `isMobile` tracks `(max-width: 759px)`, `isWide` tracks `(min-width: 1100px)`, both updating live as the viewport crosses either threshold.

- [ ] **Step 1: Write the failing tests**

```ts
function mockMatchMedia(matchesFor: (query: string) => boolean) {
  const listeners = new Map<string, Set<() => void>>();
  window.matchMedia = vi.fn((query: string) => {
    const set = listeners.get(query) ?? new Set();
    listeners.set(query, set);
    return {
      matches: matchesFor(query),
      media: query,
      addEventListener: (_: string, cb: () => void) => set.add(cb),
      removeEventListener: (_: string, cb: () => void) => set.delete(cb),
    } as unknown as MediaQueryList;
  });
  return { fire: (query: string) => listeners.get(query)?.forEach((cb) => cb()) };
}

it('reports isMobile under 760px and isWide at/above 1100px', () => {
  mockMatchMedia((q) => q.includes('max-width'));
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current).toEqual({ isMobile: true, isWide: false });
});

it('updates when the viewport crosses a breakpoint', () => {
  let wide = false;
  const { fire } = mockMatchMedia((q) => (q.includes('min-width') ? wide : false));
  const { result } = renderHook(() => useBreakpoint());
  expect(result.current.isWide).toBe(false);
  wide = true;
  act(() => fire('(min-width: 1100px)'));
  expect(result.current.isWide).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/useBreakpoint.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `useBreakpoint`**

Two `matchMedia` queries, each with a `change`-event listener wired through `useEffect`/`useState`, cleaned up on unmount.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/useBreakpoint.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/useBreakpoint.ts src/features/session/useBreakpoint.test.ts
git commit -m "feat: add useBreakpoint for the Room mobile/wide layout split"
```

## Task 2: Avatar color hashing

**Files:**
- Create: `src/lib/avatarColor.ts`
- Create: `src/lib/avatarColor.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `function avatarColorFor(userId: string): { bg: string; ink: string }` — deterministic per `userId`, OKLCH, visually in the same family as the handoff's example presence colors (lines 186–187: `oklch(0.76 0.15 320)` / `oklch(0.84 0.14 80)`) — i.e. `bg: oklch(0.8 0.14 <hash-hue>)`, `ink: oklch(0.22 0.05 <hash-hue>)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('is deterministic for the same userId', () => {
  expect(avatarColorFor('user-123')).toEqual(avatarColorFor('user-123'));
});

it('varies across different userIds', () => {
  const colors = new Set(['a', 'b', 'c', 'd'].map((id) => avatarColorFor(id).bg));
  expect(colors.size).toBeGreaterThan(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/avatarColor.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `avatarColorFor`**

A small string hash (e.g. sum/rotate char codes) mapped into `[0, 360)` for the hue.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/avatarColor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/avatarColor.ts src/lib/avatarColor.test.ts
git commit -m "feat: add per-user avatar color hashing"
```

## Task 3: Guarded `toggleTab` + Alt+1–5 shortcut

**Files:**
- Modify: `src/features/session/useTabsQueryParam.ts`
- Modify: `src/features/session/useTabsQueryParam.test.ts`
- Modify: `src/features/session/TabBar.tsx` (call `toggleTab` instead of raw `setTabs`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `useTabsQueryParam()` now also returns `toggleTab: (key: keyof TabsState) => void` — a no-op when `key` is the only currently-open tab.

- [ ] **Step 1: Write the failing tests**

```ts
it('toggleTab refuses to close the last open pane', () => {
  const { result } = renderHook(() => useTabsQueryParam(), { wrapper: MemoryRouterWrapper });
  act(() => { // start from a state with exactly one pane open
    result.current.setTabs({ html: false, css: false, js: true, console: false, output: false });
  });
  act(() => result.current.toggleTab('js'));
  expect(result.current.tabs.js).toBe(true);
});

it('toggleTab closes a pane normally when others remain open', () => {
  const { result } = renderHook(() => useTabsQueryParam(), { wrapper: MemoryRouterWrapper });
  act(() => result.current.toggleTab('console')); // default tabs has js+console+output
  expect(result.current.tabs.console).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/useTabsQueryParam.test.ts`
Expected: FAIL — `toggleTab` does not exist

- [ ] **Step 3: Implement `toggleTab`**

Mirror `toggleTab()`'s desktop branch (handoff lines 565–570): count currently-open keys; if `key` is open and it's the only one, return without calling `setTabs`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/useTabsQueryParam.test.ts`
Expected: PASS

- [ ] **Step 5: Wire `TabBar` to `toggleTab` and add the Alt+1–5 shortcut**

In `Header.tsx` (which already holds `tabs`/`setTabs`), add a `useEffect` keydown listener: `if (e.altKey && /^Digit[1-5]$/.test(e.code))` → `e.preventDefault(); toggleTab(TAB_KEYS[+e.code.slice(5) - 1])` (handoff line 437). `TabBar` calls the passed-in `toggleTab` instead of building its own next-state object.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/session/useTabsQueryParam.ts src/features/session/useTabsQueryParam.test.ts src/features/session/TabBar.tsx src/features/session/Header.tsx
git commit -m "feat: guard the last open pane and add Alt+1-5 pane shortcuts"
```

## Task 4: `Toast`

**Files:**
- Create: `src/features/session/Toast.tsx` + `.module.scss`
- Create: `src/features/session/useToast.ts` + `.test.ts`

**Interfaces:**
- Consumes: `useBreakpoint()` (Task 1) — mobile Room toasts sit 96px from the bottom instead of 28px (README line 156/handoff line 644).
- Produces:
  - `function useToast(): { message: string | null; showToast: (message: string) => void }` — auto-clears after 2000ms (handoff lines 550–554).
  - `function Toast({ message, bottomOffset }: { message: string | null; bottomOffset: number }): JSX.Element | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('shows a message and clears it after 2s', () => {
  vi.useFakeTimers();
  const { result } = renderHook(() => useToast());
  act(() => result.current.showToast('Room link copied'));
  expect(result.current.message).toBe('Room link copied');
  act(() => vi.advanceTimersByTime(2000));
  expect(result.current.message).toBeNull();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/session/useToast.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `useToast`/`Toast`**

`useToast` clears any pending hide-timer before starting a new one (so two toasts in quick succession don't hide early). `Toast` renders the `✓ {message}` pill (handoff line 313) or `null`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/session/useToast.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/Toast.tsx src/features/session/Toast.module.scss src/features/session/useToast.ts src/features/session/useToast.test.ts
git commit -m "feat: add Toast"
```

## Task 5: REPL result message + Console restyle

**Files:**
- Modify: `src/lib/sandbox.ts` + `.test.ts`
- Modify: `src/features/session/ConsolePanel.tsx` + `.module.scss` + `.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ConsoleEntry['level']` widened to `'log' | 'warn' | 'error' | 'info' | 'result'` (a `'result'` row is the REPL's return value, rendered with the `←` glyph, handoff line 592); `ConsolePanel` itself appends a local `'input'`-styled row (`❯` glyph) synchronously when the user submits REPL input, *before* calling `onRepl` — this is purely local UI state, not a new `ConsoleEntry` level, so it does not need bridge round-tripping.

- [ ] **Step 1: Write the failing test for `sandbox.ts`**

```ts
it('posts a result-level console message for a successful REPL eval, not a log-level one', () => {
  // Build the doc, extract BRIDGE_SCRIPT's text, and assert it posts
  // { type: 'console', level: 'result', args: [...] } on a successful eval
  // and { type: 'runtime-error', message } on a throw -- e.g. by asserting
  // on the BRIDGE_SCRIPT source string, since it only ever runs inside a
  // real iframe otherwise.
  const doc = buildSandboxDocument('', '', '');
  expect(doc).toContain("level: 'result'");
  expect(doc).not.toMatch(/console\.log\(eval\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/sandbox.test.ts`
Expected: FAIL

- [ ] **Step 3: Change the REPL branch in `BRIDGE_SCRIPT`**

Replace the `console.log(eval(...))` / `console.error(err)` pair (current `sandbox.ts` lines ~50–56) with a direct `parent.postMessage({ type: 'console', level: 'result', args: [eval(event.data.code)] }, '*')` in the try branch, keeping `parent.postMessage({ type: 'console', level: 'error', args: [err] }, '*')` in the catch — no `console.*` call needed either way, since the point is only to relay to the parent. Widen `ConsoleEntry['level']` and `SandboxMessage`'s `level` type accordingly in the same file.

- [ ] **Step 4: Run the sandbox test to verify it passes**

Run: `npx vitest run src/lib/sandbox.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing `ConsolePanel` tests**

```tsx
it('echoes the submitted input as its own row before the result arrives', () => {
  const onRepl = vi.fn();
  render(<ConsolePanel onRepl={onRepl} />);
  const input = screen.getByLabelText('Console input');
  fireEvent.change(input, { target: { value: '1+1' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(screen.getByText('1+1')).toBeInTheDocument();
  expect(onRepl).toHaveBeenCalledWith('1+1');
});

it('shows the empty-state copy when there are no entries, and clears entries on Clear', () => {
  render(<ConsolePanel onRepl={() => {}} />);
  expect(screen.getByText(/Press Run or Ctrl \+ Enter/)).toBeInTheDocument();
  fireEvent(window, new MessageEvent('message', { data: { type: 'console', level: 'warn', args: ['careful'] } }));
  expect(screen.getByText('careful')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /clear/i }));
  expect(screen.queryByText('careful')).not.toBeInTheDocument();
});

it('still caps entries at 500 after the restyle', () => {
  render(<ConsolePanel onRepl={() => {}} />);
  for (let i = 0; i < 520; i++) {
    fireEvent(window, new MessageEvent('message', { data: { type: 'console', level: 'log', args: [String(i)] } }));
  }
  expect(screen.queryByText('0')).not.toBeInTheDocument();
  expect(screen.getByText('519')).toBeInTheDocument();
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npx vitest run src/features/session/ConsolePanel.test.tsx`
Expected: FAIL

- [ ] **Step 7: Implement the Console restyle**

Header `❯_ console {count}` + Clear button (handoff lines 225–230); per-level glyph/color/background/left-edge map (handoff lines 589–593, `LS` table) including the new `result` row and a local-only `input` row (appended directly to `entries` state in the submit handler, with a distinct id so it doesn't collide with bridge-sourced ids); empty-state copy (handoff line 233). Keep `appendCapped`/`MAX_CONSOLE_ENTRIES` exactly as-is (Review Focus).

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx vitest run src/features/session/ConsolePanel.test.tsx src/lib/sandbox.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/sandbox.ts src/lib/sandbox.test.ts src/features/session/ConsolePanel.tsx src/features/session/ConsolePanel.module.scss src/features/session/ConsolePanel.test.tsx
git commit -m "feat: restyle Console pane with leveled rows and a distinct REPL result"
```

## Task 6: Editor pane restyle

**Files:**
- Modify: `src/features/session/EditorPane.tsx` + `.module.scss` + `.test.tsx`

**Interfaces:**
- Consumes: new `--tk-*`/`--ed`/`--acc`/`--faint` tokens from the design-system plan.
- Produces: `EditorPane` gains a `glyph: string` and `fileColor: string` prop (or derives them from `language` via a small local map mirroring `META`, handoff lines 332–336) and a live line count in its header.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows the file glyph, filename, and a live line count', () => {
  render(<EditorPane title="JS" language="javascript" value={'a\nb\nc'} onChange={() => {}} />);
  expect(screen.getByText('script.js')).toBeInTheDocument();
  expect(screen.getByText('3 ln')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/session/EditorPane.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the pane header and recolor the CodeMirror theme**

Add the 36px header bar (glyph in its file color, filename, right-aligned `N ln` — handoff lines 210–214/333–336/586–587) computed from `view.state.doc.lines` via the existing `updateListener`. Repoint `editorTheme`/`syntaxTheme` (current lines 18–64) from `--color-*`/`--color-syntax-*` to `--ed`/`--text`/`--acc`/`--faint`/`--tk-*`, and widen `.cm-gutters` to 42px at 70% opacity (handoff lines 70, 137).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/session/EditorPane.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/EditorPane.tsx src/features/session/EditorPane.module.scss src/features/session/EditorPane.test.tsx
git commit -m "feat: restyle editor panes with file glyphs and new theme tokens"
```

## Task 7: `OutputPane`

**Files:**
- Create: `src/features/session/OutputPane.tsx` + `.module.scss`
- Modify: `src/features/session/SessionWorkspace.tsx` (render `OutputPane` instead of the bare `OutputFrame` inside the `output` tab's `Panel`)

**Interfaces:**
- Consumes: `OutputFrame`'s existing props, plus `onRun: () => void` for the reload button.
- Produces: `export default function OutputPane(props: OutputFrameProps & { onRun: () => void }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
it('reruns the output when the reload button is clicked', () => {
  const onRun = vi.fn();
  render(<OutputPane html="" css="" js="" runToken={0} onWindowReady={() => {}} onRun={onRun} />);
  fireEvent.click(screen.getByRole('button', { name: /reload/i }));
  expect(onRun).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/session/OutputPane.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `OutputPane`**

Header `▶ output` + reload icon button (handoff lines 249–252) wrapping the existing `<OutputFrame>` unchanged. Note the off-screen-output usage in `SessionWorkspace.tsx` (the `tabs.console || tabs.output` mount, and the `!tabs.output` off-screen wrapper) keeps using bare `OutputFrame`, not `OutputPane` — only the visible, on-tab instance gets the header, since the off-screen one has no visible chrome to show.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/session/OutputPane.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/OutputPane.tsx src/features/session/OutputPane.module.scss src/features/session/SessionWorkspace.tsx
git commit -m "feat: add OutputPane header with reload"
```

## Task 8: Header redesign

**Files:**
- Modify: `src/features/session/Header.tsx` + `.module.scss`
- Modify: `src/features/session/UsersMenu.tsx` + `.module.scss`
- Modify: `src/features/session/ExportMenu.tsx` + `.module.scss`
- Modify: `src/features/session/RunControls.tsx` + `.module.scss`

**Interfaces:**
- Consumes: `useBreakpoint()` (Task 1), `avatarColorFor` (Task 2), `useToast`/`Toast` (Task 4), `ThemeButton`/`ThemeDrawer` (design-system plan).
- Produces: `Header` gains a `roomId: string` prop (for the copy-link chip) and renders `<Toast>` itself (owns the `useToast()` instance, since copy-link and export both need to trigger it and both already receive `Header`'s props or are rendered by it).

- [ ] **Step 1: Write the failing tests**

```tsx
it('copies the room link and shows a toast', async () => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  render(<Header roomId="abcd-1234" tabs={DEFAULT_TABS} setTabs={() => {}} toggleTab={() => {}} users={[]} currentUserId={null} name="" onNameChange={() => {}} onRun={() => {}} html="" css="" js="" />);
  fireEvent.click(screen.getByTitle(/copy room link/i));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('abcd-1234'));
  expect(await screen.findByText(/room link copied/i)).toBeInTheDocument();
});

it('shows an overlapping avatar per present user at wide widths, with the current user styled distinctly', () => {
  mockMatchMedia(() => true); // isWide
  render(<Header /* …props…, */ users={[{ userId: 'me', name: 'Ava', status: 'online' }, { userId: 'them', name: 'Kenji', status: 'online' }]} currentUserId="me" />);
  expect(screen.getByText('AV')).toBeInTheDocument();
  expect(screen.getByText('KE')).toBeInTheDocument();
});

it('falls back to the compact users-count trigger below 1100px', () => {
  mockMatchMedia(() => false); // not isWide
  render(<Header /* … */ users={[{ userId: 'a', name: 'A', status: 'online' }]} />);
  expect(screen.getByRole('button', { name: /users in this session/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/Header.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the header**

Logo button to `/` (handoff line 164, wordmark text hidden `<760px` via CSS), room-link dashed chip with copy icon (lines 165–168) calling `navigator.clipboard.writeText` + `showToast('Room link copied')` (line 624), center tab row (unchanged logic from Task 3, restyled per lines 173–176, key badges CSS-hidden `<1100px`), right side: `UsersMenu` restyled into the overlapping-avatar trigger at `isWide` (per `avatarColorFor`, current user using `--acc`/`--acc-ink`) and the pre-existing compact trigger below that (Global Constraints), `ThemeButton variant="square"` + `ThemeDrawer`, `ExportMenu` restyled (ghost button, label CSS-hidden `<760px`), `RunControls` restyled (accent button, flash animation on click via a transient class toggled with a `setTimeout`/`onAnimationEnd`, `⌃↵` hint CSS-hidden `<760px`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/Header.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/Header.tsx src/features/session/Header.module.scss src/features/session/UsersMenu.tsx src/features/session/UsersMenu.module.scss src/features/session/ExportMenu.tsx src/features/session/ExportMenu.module.scss src/features/session/RunControls.tsx src/features/session/RunControls.module.scss
git commit -m "feat: redesign Room header, avatars, export, and run controls"
```

## Task 9: Mobile single-pane layout + bottom tab bar

**Files:**
- Create: `src/features/session/MobileTabBar.tsx` + `.module.scss`
- Modify: `src/features/session/SessionWorkspace.tsx` + `.module.scss` + `.test.tsx`

**Interfaces:**
- Consumes: `useBreakpoint()` (Task 1).
- Produces: `SessionWorkspace` adds local `mobileTab: keyof TabsState` state (default `'js'`, handoff line 394); when `useBreakpoint().isMobile`, it renders exactly the one pane matching `mobileTab` (no `Group`/`Panel`/`Separator` at all) plus `<MobileTabBar active={mobileTab} onSelect={setMobileTab} />` instead of the desktop tab row/status bar; `handleRun` additionally does `if (isMobile && mobileTab !== 'output') setMobileTab('output')` on every call (Review Focus: must re-fire every Run, not just once).

- [ ] **Step 1: Write the failing tests**

```tsx
it('renders only the active mobile pane and a 5-tab bottom bar', () => {
  mockMatchMedia(() => true); // isMobile
  render(<SessionWorkspace sessionId="abcd-1234" />);
  expect(screen.getAllByRole('button', { name: /^(html|css|js|console|output)$/i })).toHaveLength(5);
  // only one editor/console/output region is in the DOM
});

it('switches to Output every time Run is pressed on mobile, even repeatedly', () => {
  mockMatchMedia(() => true);
  render(<SessionWorkspace sessionId="abcd-1234" />);
  fireEvent.click(screen.getByRole('button', { name: /run/i }));
  expect(/* output pane visible */ screen.getByTitle('Output')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^js$/i })); // navigate back to JS
  fireEvent.click(screen.getByRole('button', { name: /run/i })); // run again
  expect(screen.getByTitle('Output')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/session/SessionWorkspace.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement `MobileTabBar` and the mobile render path**

5-segment control with a sliding accent pill positioned via inline `transform: translateX(${index * 100}%)` (handoff lines 271–278/604), `min-height: 50px` touch targets, `padding-bottom: calc(10px + env(safe-area-inset-bottom))` (line 270). In `SessionWorkspace`, branch the whole pane-rendering block on `isMobile`: mobile renders only the pane matching `mobileTab` directly (still mounting the off-screen `OutputFrame` per the existing comment at `SessionWorkspace.tsx:63-67`, unchanged); desktop keeps today's `Group`/`Panel`/`Separator` tree unchanged in logic (only its CSS changes, in Task 10).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/session/SessionWorkspace.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/MobileTabBar.tsx src/features/session/MobileTabBar.module.scss src/features/session/SessionWorkspace.tsx src/features/session/SessionWorkspace.module.scss src/features/session/SessionWorkspace.test.tsx
git commit -m "feat: add mobile single-pane layout with bottom tab bar"
```

## Task 10: Desktop pane chrome + separator restyle

**Files:**
- Modify: `src/features/session/SessionWorkspace.module.scss`
- Modify: `src/features/session/EditorPane.module.scss`, `ConsolePanel.module.scss`, `OutputPane.module.scss` (border radius/background only — chrome already added in Tasks 5–7)

**Interfaces:**
- Consumes: new tokens only; no interface changes.

- [ ] **Step 1: Restyle `.separator`**

Keep the existing hit-area/`:hover`/`:active` structure (current lines 19–40) but repoint colors to `--line`/`--acc` and keep the drag cursor — this is "restyle, don't replace" per the brainstorming decision in Global Constraints.

- [ ] **Step 2: Add the 14px-radius/`--line`-border/`--ed`-background pane chrome and the `paneIn` entrance animation**

Apply to each pane's outer wrapper (handoff line 135/209/224/248); `animation-play-state: var(--play)`.

- [ ] **Step 3: Manual browser verification**

Run `npm run dev`, open a Room, resize two adjacent panes near their minimum width, toggle a third pane open/closed, confirm no pane becomes unreadable or the drag handle unreachable (Review Focus).

- [ ] **Step 4: Run the full suite and production build**

Run: `npm test && npm run build`
Expected: both PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/SessionWorkspace.module.scss src/features/session/EditorPane.module.scss src/features/session/ConsolePanel.module.scss src/features/session/OutputPane.module.scss
git commit -m "feat: restyle desktop pane chrome and the resizable separator"
```

## Task 11: `StatusBar`

**Files:**
- Create: `src/features/session/StatusBar.tsx` + `.module.scss`
- Modify: `src/features/session/SessionWorkspace.tsx` (render it, desktop-only)

**Interfaces:**
- Consumes: `useBreakpoint()` (Task 1); the current open-pane count; `useTheme()`'s `themeName`.
- Produces: `export default function StatusBar({ openCount }: { openCount: number }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
it('shows the open pane count and the current theme name', () => {
  render(<ThemeProvider><StatusBar openCount={3} /></ThemeProvider>);
  expect(screen.getByText('3 panes')).toBeInTheDocument();
  expect(screen.getByText('Abyss')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/session/StatusBar.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `StatusBar`**

`● synced` / `{N} panes` / `Alt + 1–5 toggles panes` / theme name (handoff lines 261–266), CSS-hidden `<760px` (it's the desktop footer; mobile has the bottom tab bar instead).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/session/StatusBar.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/session/StatusBar.tsx src/features/session/StatusBar.module.scss src/features/session/SessionWorkspace.tsx
git commit -m "feat: add desktop status bar"
```

## Task 12: Retire the legacy token set + final verification

**Files:**
- Modify: `src/styles/tokens.scss`, `src/styles/theme.scss`

**Interfaces:** none — cleanup only.

- [ ] **Step 1: Grep for any remaining consumer of the legacy tokens**

Run: `grep -rn -- '--color-' src --include=*.scss`
Expected: no matches outside `tokens.scss`/`theme.scss` themselves (every consumer was migrated across the design-system/Home/Room plans). If any remain, restyle that file to the new tokens first.

- [ ] **Step 2: Delete the now-unused `--color-*`/`--color-syntax-*` declarations and `theme.scss`'s dead `[data-theme]` rules**

`theme.scss`'s light/dark override classes predate this redesign's own `data-theme` attribute (now meaning `abyss`/`paper`/`phosphor`, set by `ThemeProvider`) — delete the file's contents (or the file itself, updating `globals.scss`'s `@use`) once confirmed unreferenced.

- [ ] **Step 3: Run the full suite, the production build, and a manual pass**

Run: `npm test && npm run build`, then `npm run dev` and click through Home → New Room → every pane combination → every theme × hue combination → mobile width, confirming nothing still renders the old blue/gray palette.

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.scss src/styles/theme.scss
git commit -m "chore: retire the pre-redesign color tokens"
```

---

## Self-Review Notes

- **Spec coverage:** Header (Task 8), pane tabs/shortcuts (Task 3), editor/console/output panes (Tasks 5–7), theme drawer (consumed from the design-system plan, not re-implemented here), status bar (Task 11), mobile layout (Task 9), toast (Task 4) are each covered. The handoff's fixed fixed-grid pane layout is deliberately *not* implemented, per the up-front resizing decision recorded in Global Constraints.
- **Review Focus** lines each have a test or explicit manual step: resize-to-near-zero (Task 10 manual step), the 500-entry cap surviving the restyle (Task 5 Step 5's third test), breakpoint-crossing mid-interaction (Task 1's crossing test + Task 9's render-path split), Run-auto-switch re-firing (Task 9's second test), REPL edge inputs (existing `ConsolePanel` guard, exercised implicitly by Task 5's tests using non-empty input).
- **Type consistency:** `ConsoleEntry['level']` is widened once, in Task 5, and nowhere else redefines it. `useBreakpoint()`'s `{ isMobile, isWide }` shape (Task 1) is consumed identically by Tasks 4, 8, 9, and 11.
- **Proportion check:** every CSS/animation value is referenced by handoff line number; the tasks themselves encode the decisions the handoff can't (which existing component owns which new prop, how the resizable-panes decision interacts with the mobile single-pane path, how the real presence feature coexists with the mock avatar visual, how the REPL's existing security boundary is preserved while its message shape changes).
