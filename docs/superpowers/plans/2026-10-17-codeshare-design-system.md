# CodeShare Design System (Theming) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the theme/hue token system (3 themes × 4 accent hues, OKLCH), its React state/persistence, and the shared Theme Button + Theme Drawer UI — the prerequisite every other design-handoff plan (Home, Room) consumes for colors and the theme switcher.

**Architecture:** Port the design handoff's `palette(theme, hue)` function (a pure JS object-literal generator, not CSS-only) into `src/lib/theme.ts`; a `ThemeProvider` applies the returned CSS custom properties to `document.documentElement` via `style.setProperty` (same technique the handoff prototype uses) and persists `{theme, hue}` to `localStorage`. A shared `ThemeButton`/`ThemeDrawer` pair (built on the already-installed `@radix-ui/react-dialog`) lets the user pick theme + accent hue; Home and Room both mount one instance of each, wired to the same `useTheme()` context.

**Tech Stack:** React 19 context + hooks, `@radix-ui/react-dialog` (existing dependency), Sass Modules, Vitest + React Testing Library.

**Spec:**
- `design_handoff_codeshare/README.md` — "Design Tokens" section (lines 20–82), "Theme drawer" screen (lines 158–166), "Persistence" bullet (line 185), "Motion" bullet (line 186)
- `design_handoff_codeshare/CodeShare v2.dc.html` — `THEMES`/`HUES` consts (lines 353–358), `palette()` (lines 471–497), `applyTheme()` (lines 499–507), theme drawer markup (lines 285–310), localStorage shape (lines 380–397, 463–468)

## Global Constraints

- Persisted state lives under the single localStorage key `codeshare.v2` (line 381 of the handoff script), read/written as one JSON blob so this plan's `{theme, hue}` fields and later plans' fields (`code`, `open`, `room`, `mobileTab`) never clobber each other.
- Writes to localStorage are debounced 400ms (line 464–467).
- Default theme is `abyss`, default hue is `teal` (line 391).
- All theme colors are OKLCH; hue-dependent tokens must recompute from the *current* hue number, not a hardcoded one, exactly reproducing `palette()`'s arithmetic (including the `h+30`/`h-40` offsets used for Phosphor's `--tk-str`/`--tk-num`).
- Respect `prefers-reduced-motion`: `--play` must resolve to `paused` when the OS/browser signals reduced motion, `running` otherwise (README line 186).
- Do not remove the existing `--color-*` / `--color-syntax-*` tokens in this plan — Home and Room plans migrate their own consumers off them and retire them once nothing references them.

## Review Focus

- **No `matchMedia` support in the test environment:** `prefers-reduced-motion` detection must not throw in jsdom (which lacks `window.matchMedia` by default) and must not throw in real browsers lacking the media feature either — test both a present-and-matching and an absent `matchMedia`.
- **localStorage unavailable or throwing** (private browsing, quota, disabled storage): reading/writing must degrade to in-memory defaults, not crash the app on mount.
- **Corrupt/partial persisted JSON** (hand-edited, old schema, truncated): parsing must fall back to defaults field-by-field rather than losing the whole app shell.
- **Unknown `theme`/`hue` value in storage** (e.g. from a future version or tampering): must fall back to the default theme/hue rather than reading `undefined` properties of `THEMES`/`HUES`.
- **Rapid theme/hue switching before the 400ms debounce fires, then an immediate reload:** the last selection must still be the one persisted, not a stale mid-sequence one.

---

## File Structure

- Create `src/lib/theme.ts` — `ThemeKey`, `HueKey` types, `THEMES`, `HUES` consts, `palette(theme, hue)`, `applyTheme(theme, hue, reducedMotion)`.
- Create `src/lib/theme.test.ts`
- Create `src/lib/persistedState.ts` — generic debounced-merge localStorage blob helper used by this plan and (later) the Room plan.
- Create `src/lib/persistedState.test.ts`
- Create `src/features/theme/ThemeProvider.tsx` — context provider + `useTheme()` hook.
- Create `src/features/theme/ThemeProvider.test.tsx`
- Create `src/features/theme/ThemeButton.tsx` + `ThemeButton.module.scss`
- Create `src/features/theme/ThemeDrawer.tsx` + `ThemeDrawer.module.scss`
- Create `src/features/theme/ThemeDrawer.test.tsx`
- Create `src/features/theme/ScanlineOverlay.tsx` + `ScanlineOverlay.module.scss`
- Modify `src/styles/tokens.scss` — add `--font-display`, static default (abyss/teal) OKLCH fallback values on `:root` so first paint before JS runs already matches the default theme.
- Create `src/styles/motion.scss` — the handoff's keyframes (`rise`, `fade`, `mark`, `spin`, `unspin`, `marquee`, `blink`, `ping`, `breathe`, `scanmove`, `paneIn`, `drawerIn`, `toastIn`, `iris`, `irisOut`, `bar`) plus the `prefers-reduced-motion` fallback rule for `--play`.
- Modify `src/styles/globals.scss` — `@use` motion.scss; update `::selection`/scrollbar rules to the new tokens.
- Modify `index.html` — add the Google Fonts preconnect + stylesheet `<link>`s (Unbounded 400/600/800, IBM Plex Mono 400/500/600, IBM Plex Sans 400/500/600), per handoff lines 12–14.
- Modify `src/App.tsx` — wrap `<Routes>` in `<ThemeProvider>`, render `<ScanlineOverlay />` as a sibling.
- Modify `src/test-setup.ts` — add a `window.matchMedia` stub (jsdom has none; `ThemeProvider` and future breakpoint hooks in the Room plan need it).

## Task 1: `matchMedia` test stub

**Files:**
- Modify: `src/test-setup.ts`

**Interfaces:**
- Produces: a global `window.matchMedia` that exists in every test, returning an object with `{ matches, media, addEventListener, removeEventListener }` so code under test can register/unregister listeners without throwing.

- [ ] **Step 1: Write the failing test**

```ts
// src/test-setup.test.ts
it('provides a window.matchMedia stub', () => {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  expect(typeof mql.addEventListener).toBe('function');
  expect(() => mql.addEventListener('change', () => {})).not.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test-setup.test.ts`
Expected: FAIL — `window.matchMedia is not a function`

- [ ] **Step 3: Implement the stub in `src/test-setup.ts`**

Mirror the existing `ResizeObserver` stub's `typeof globalThis.X === 'undefined'` guard style already in this file. The stub's `matches` can always be `false`; only presence and listener add/remove need to work for this plan's tests.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test-setup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/test-setup.ts src/test-setup.test.ts
git commit -m "test: stub window.matchMedia for jsdom"
```

## Task 2: `palette()` / theme tables

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`

**Interfaces:**
- Produces:
  - `type ThemeKey = 'abyss' | 'paper' | 'phosphor'`
  - `type HueKey = 'teal' | 'aqua' | 'jade' | 'cyan'`
  - `const THEMES: Record<ThemeKey, { name: string; note: string; dark: boolean; scan: number; black?: boolean }>`
  - `const HUES: Record<HueKey, { name: string; deg: number }>`
  - `const DEFAULT_THEME: ThemeKey = 'abyss'`, `const DEFAULT_HUE: HueKey = 'teal'`
  - `function palette(theme: ThemeKey, hue: HueKey): Record<string, string>` — returns the full CSS-variable map (`--bg`, `--bg2`, `--bg3`, `--ed`, `--text`, `--muted`, `--faint`, `--line`, `--line2`, `--acc`, `--acc-t`, `--acc-ink`, `--acc-soft`, `--glow`, `--warn`, `--err`, `--tk-key`, `--tk-str`, `--tk-num`, `--tk-com`, `--tk-fn`, `--tk-tag`, `--tk-attr`)
  - `function applyTheme(theme: ThemeKey, hue: HueKey, reducedMotion: boolean): void` — sets every `palette()` entry plus `--scan` and `--play` on `document.documentElement.style`, and sets `document.documentElement.style.colorScheme`.
- Consumes: nothing (base of the dependency chain).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/theme.test.ts
import { palette, applyTheme, THEMES, HUES } from './theme';

it('computes abyss/teal exactly per the design spec', () => {
  const v = palette('abyss', 'teal');
  expect(v['--acc']).toBe('oklch(0.82 0.14 180)');
  expect(v['--bg']).toBe('oklch(0.14 0.02 200)');
  expect(v['--tk-key']).toBe('oklch(0.78 0.13 300)');
});

it('computes paper/aqua exactly per the design spec', () => {
  const v = palette('paper', 'aqua');
  expect(v['--acc']).toBe('oklch(0.72 0.13 205)');
  expect(v['--bg']).toBe('oklch(0.975 0.006 190)');
  expect(v['--tk-fn']).toBe('oklch(0.45 0.1 205)');
});

it('computes phosphor/jade with the black-background + hue-offset syntax tokens', () => {
  const v = palette('phosphor', 'jade');
  expect(v['--bg']).toBe('oklch(0.1 0.006 190)');
  expect(v['--text']).toBe('oklch(0.92 0.06 160)');
  expect(v['--tk-str']).toBe('oklch(0.8 0.12 190)'); // 160 + 30
  expect(v['--tk-num']).toBe('oklch(0.85 0.1 120)'); // 160 - 40
});

it('applyTheme sets --scan per theme and --play per reduced-motion', () => {
  document.documentElement.removeAttribute('style');
  applyTheme('phosphor', 'teal', false);
  expect(document.documentElement.style.getPropertyValue('--scan')).toBe('0.5');
  expect(document.documentElement.style.getPropertyValue('--play')).toBe('running');
  applyTheme('abyss', 'teal', true);
  expect(document.documentElement.style.getPropertyValue('--scan')).toBe('0');
  expect(document.documentElement.style.getPropertyValue('--play')).toBe('paused');
  expect(document.documentElement.style.colorScheme).toBe('dark');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `src/lib/theme.ts`**

Port `THEMES`, `HUES`, and the body of `palette()` verbatim from `design_handoff_codeshare/CodeShare v2.dc.html` lines 353–358 and 471–497 (translate the JS object-literal style 1:1 into the typed signature above — every numeric constant in that function is spec-fixed, not a free choice). `HUES` stores `{ name, deg }` instead of the handoff's `[name, deg]` tuple. `applyTheme` mirrors `applyTheme()` at lines 499–507.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/theme.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts
git commit -m "feat: add theme/hue palette computation"
```

## Task 3: Persisted state blob helper

**Files:**
- Create: `src/lib/persistedState.ts`
- Create: `src/lib/persistedState.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function readPersisted(): Record<string, unknown>` — parses `localStorage.getItem('codeshare.v2')`, returns `{}` on missing/invalid/throwing storage.
  - `function writePersisted(patch: Record<string, unknown>): void` — merges `patch` into the *current* stored blob (read-modify-write) and schedules a single write 400ms later, coalescing rapid calls into the merge of all their patches rather than only the last one.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/persistedState.test.ts
import { readPersisted, writePersisted } from './persistedState';

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

it('returns {} when nothing is stored', () => {
  expect(readPersisted()).toEqual({});
});

it('returns {} for corrupt JSON instead of throwing', () => {
  localStorage.setItem('codeshare.v2', '{not json');
  expect(readPersisted()).toEqual({});
});

it('merges a patch into the existing blob after the debounce fires', () => {
  localStorage.setItem('codeshare.v2', JSON.stringify({ room: 'abcd-1234' }));
  writePersisted({ theme: 'paper' });
  vi.advanceTimersByTime(400);
  expect(readPersisted()).toEqual({ room: 'abcd-1234', theme: 'paper' });
});

it('coalesces two rapid patches into one merged write', () => {
  writePersisted({ theme: 'paper' });
  writePersisted({ hue: 'jade' });
  vi.advanceTimersByTime(400);
  expect(readPersisted()).toEqual({ theme: 'paper', hue: 'jade' });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/persistedState.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `src/lib/persistedState.ts`**

Wrap every `localStorage` call in try/catch (private browsing / disabled storage must not throw). `writePersisted` keeps one module-level pending-patch object and one `setTimeout` handle; each call merges into the pending patch and resets the 400ms timer, matching the debounce at handoff lines 464–467.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/persistedState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/persistedState.ts src/lib/persistedState.test.ts
git commit -m "feat: add debounced-merge localStorage blob helper"
```

## Task 4: `ThemeProvider` / `useTheme()`

**Files:**
- Create: `src/features/theme/ThemeProvider.tsx`
- Create: `src/features/theme/ThemeProvider.test.tsx`

**Interfaces:**
- Consumes: `palette`, `applyTheme`, `THEMES`, `HUES`, `DEFAULT_THEME`, `DEFAULT_HUE`, `ThemeKey`, `HueKey` from `../../lib/theme`; `readPersisted`, `writePersisted` from `../../lib/persistedState`.
- Produces:
  - `function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `function useTheme(): { theme: ThemeKey; hue: HueKey; themeName: string; setTheme: (t: ThemeKey) => void; setHue: (h: HueKey) => void }` — throws if called outside a `ThemeProvider` (consistent with every other React context in this codebase).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/theme/ThemeProvider.test.tsx
function Probe() {
  const { theme, hue, themeName, setTheme, setHue } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="hue">{hue}</span>
      <span data-testid="name">{themeName}</span>
      <button onClick={() => setTheme('paper')}>paper</button>
      <button onClick={() => setHue('jade')}>jade</button>
    </div>
  );
}

it('defaults to abyss/teal when nothing is persisted', () => {
  localStorage.clear();
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId('theme')).toHaveTextContent('abyss');
  expect(screen.getByTestId('hue')).toHaveTextContent('teal');
  expect(screen.getByTestId('name')).toHaveTextContent('Abyss');
});

it('restores a persisted theme/hue on mount', () => {
  localStorage.setItem('codeshare.v2', JSON.stringify({ theme: 'phosphor', hue: 'cyan' }));
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId('theme')).toHaveTextContent('phosphor');
});

it('falls back to defaults for an unknown persisted theme value', () => {
  localStorage.setItem('codeshare.v2', JSON.stringify({ theme: 'nope' }));
  render(<ThemeProvider><Probe /></ThemeProvider>);
  expect(screen.getByTestId('theme')).toHaveTextContent('abyss');
});

it('setTheme updates state, the documentElement CSS vars, and useTheme() throws outside the provider', () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);
  fireEvent.click(screen.getByText('paper'));
  expect(screen.getByTestId('theme')).toHaveTextContent('paper');
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('oklch(0.975 0.006 190)');
  expect(() => render(<Probe />)).toThrow();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/theme/ThemeProvider.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `ThemeProvider`/`useTheme`**

On mount: read `readPersisted()`, validate `theme`/`hue` are keys of `THEMES`/`HUES` (fall back to defaults otherwise), call `applyTheme` once. `setTheme`/`setHue` update state, call `applyTheme` with the new values, and `writePersisted({ theme, hue })`. Subscribe to `window.matchMedia('(prefers-reduced-motion: reduce)')` (guard for browsers where it's unsupported, per Review Focus) and re-call `applyTheme` with the updated `reducedMotion` flag on change.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/theme/ThemeProvider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/theme/ThemeProvider.tsx src/features/theme/ThemeProvider.test.tsx
git commit -m "feat: add ThemeProvider/useTheme"
```

## Task 5: Motion keyframes + font loading + token defaults

**Files:**
- Create: `src/styles/motion.scss`
- Modify: `src/styles/tokens.scss`
- Modify: `src/styles/globals.scss`
- Modify: `index.html`

**Interfaces:**
- Consumes: nothing (pure CSS/HTML).
- Produces: the `--play` custom property (default `running`, forced `paused` under `prefers-reduced-motion: reduce`) and the 15 keyframes listed in the File Structure section, available globally for the Home/Room plans' animations.

- [ ] **Step 1: Add the Google Fonts links to `index.html`**

Copy the `<link>` block verbatim from `design_handoff_codeshare/CodeShare v2.dc.html` lines 12–14 into `index.html`'s `<head>`.

- [ ] **Step 2: Create `src/styles/motion.scss`**

Copy the 15 `@keyframes` blocks verbatim from `design_handoff_codeshare/CodeShare v2.dc.html` lines 27–42, plus:

```scss
:root { --play: running; }
@media (prefers-reduced-motion: reduce) {
  :root { --play: paused; }
}
```

- [ ] **Step 3: Add `--font-display` and the default-theme fallback to `tokens.scss`**

Add `--font-display: 'Unbounded', sans-serif;` next to the existing `--font-sans`/`--font-mono`. Add a static `:root` block with the exact `palette('abyss', 'teal')` values (so the very first paint, before `ThemeProvider`'s effect runs, already matches the default theme — no flash). Do not remove the existing `--color-*` tokens (see Global Constraints).

- [ ] **Step 4: `@use` motion.scss from `globals.scss`; update `::selection`/scrollbar rules**

Add `@use './motion.scss';` and change the `::selection` background/color and the scrollbar thumb color to the new `--acc`/`--acc-ink`/`--line2` tokens (handoff lines 22–26).

- [ ] **Step 5: Verify the app still builds and the existing suite still passes**

Run: `npm run build && npm test`
Expected: both succeed (this task only adds CSS/HTML, no component changed its markup yet).

- [ ] **Step 6: Commit**

```bash
git add src/styles/motion.scss src/styles/tokens.scss src/styles/globals.scss index.html
git commit -m "feat: add motion keyframes, fonts, and default theme tokens"
```

## Task 6: `ScanlineOverlay` + wire `ThemeProvider` into `App.tsx`

**Files:**
- Create: `src/features/theme/ScanlineOverlay.tsx`
- Create: `src/features/theme/ScanlineOverlay.module.scss`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `ThemeProvider` from `./features/theme/ThemeProvider`.
- Produces: `export default function ScanlineOverlay(): JSX.Element` — a `pointer-events: none`, fixed, full-viewport div whose opacity is `var(--scan)` and whose `background-position` animates via the `scanmove` keyframe (handoff line 46), always mounted (its own opacity is 0 outside the Phosphor theme, so no conditional render is needed — matches the handoff's always-rendered overlay).

- [ ] **Step 1: Create `ScanlineOverlay`**

Translate the fixed div at handoff line 46 into a component + module.scss (the repeating-linear-gradient scanline background, `animation: scanmove .4s linear infinite`, `animation-play-state: var(--play)`, `opacity: var(--scan)`, `z-index: 70`).

- [ ] **Step 2: Wrap `<Routes>` in `<ThemeProvider>` and render `<ScanlineOverlay />` in `App.tsx`**

`ScanlineOverlay` renders once, as a sibling before `<Routes>`, inside `ThemeProvider` (so later theme context consumers in Home/Room are inside the provider too).

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS (no existing test renders `<App>` in a way the new wrapper breaks; if `App.test.tsx` does mount `<App>`, confirm it still passes unchanged)

- [ ] **Step 4: Commit**

```bash
git add src/features/theme/ScanlineOverlay.tsx src/features/theme/ScanlineOverlay.module.scss src/App.tsx
git commit -m "feat: mount ThemeProvider and scanline overlay at the app root"
```

## Task 7: `ThemeButton`

**Files:**
- Create: `src/features/theme/ThemeButton.tsx`
- Create: `src/features/theme/ThemeButton.module.scss`

**Interfaces:**
- Consumes: `useTheme()` from `./ThemeProvider`.
- Produces: `export default function ThemeButton({ variant, onOpenDrawer }: { variant: 'pill' | 'square'; onOpenDrawer: () => void }): JSX.Element` — `'pill'` matches the Home header button (handoff lines 57–60: height 38px, conic swatch + theme name label), `'square'` matches the Room header button (handoff lines 191–193: 36px square, swatch only, no label). The Theme Drawer itself is a separate component (Task 8); this button only renders the trigger and calls `onOpenDrawer` — Home and Room each own their own open/close boolean state and render `<ThemeDrawer open={...} onClose={...} />` alongside their `<ThemeButton>`.

- [ ] **Step 1: Write the failing test**

```tsx
// no new test file needed if covered by Task 8's drawer test via composition;
// otherwise add ThemeButton.test.tsx:
it('calls onOpenDrawer when clicked', () => {
  const onOpenDrawer = vi.fn();
  render(<ThemeProvider><ThemeButton variant="pill" onOpenDrawer={onOpenDrawer} /></ThemeProvider>);
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(onOpenDrawer).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/theme/ThemeButton.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `ThemeButton`**

Conic-gradient swatch (`background: conic-gradient(var(--acc) 0 50%, var(--text) 50% 100%)`, handoff line 58/192) plus, for `variant="pill"`, the current `themeName` from `useTheme()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/theme/ThemeButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/theme/ThemeButton.tsx src/features/theme/ThemeButton.module.scss src/features/theme/ThemeButton.test.tsx
git commit -m "feat: add ThemeButton trigger"
```

## Task 8: `ThemeDrawer`

**Files:**
- Create: `src/features/theme/ThemeDrawer.tsx`
- Create: `src/features/theme/ThemeDrawer.module.scss`
- Create: `src/features/theme/ThemeDrawer.test.tsx`

**Interfaces:**
- Consumes: `useTheme()`; `palette`, `THEMES`, `HUES` from `../../lib/theme`; `@radix-ui/react-dialog` (`Root`, `Portal`, `Overlay`, `Content`, `Title`, `Close`).
- Produces: `export default function ThemeDrawer({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/features/theme/ThemeDrawer.test.tsx
it('renders a card per theme and a swatch per hue, and calls setTheme/setHue on click', () => {
  render(<ThemeProvider><ThemeDrawer open onClose={() => {}} /></ThemeProvider>);
  expect(screen.getByRole('button', { name: /paper/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /paper/i }));
  // re-rendering ThemeDrawer should now show Paper's card as selected --
  // assert via the probe pattern from ThemeProvider.test.tsx, or by checking
  // document.documentElement's --bg var updated to Paper's value.
  expect(document.documentElement.style.getPropertyValue('--bg')).toBe('oklch(0.975 0.006 190)');
});

it('closes on Escape and on scrim click', () => {
  const onClose = vi.fn();
  render(<ThemeProvider><ThemeDrawer open onClose={onClose} /></ThemeProvider>);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/theme/ThemeDrawer.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `ThemeDrawer`**

Use `Dialog.Root(open, onOpenChange={(o) => !o && onClose()})` so Radix's built-in Escape/outside-click handling drives `onClose` for free (per Global Constraints, no bespoke key listener needed). Render one card per `Object.keys(THEMES)`, each colored from its *own* `palette(key, hue)` (not the currently-active theme) exactly as handoff lines 294–300/635–640 — this is what lets you preview Paper while sitting in Abyss. Render one swatch per `Object.keys(HUES)`, colored `oklch(0.78 0.13 ${deg})` (line 642), with the double-ring style on the active hue (line 643/164).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/theme/ThemeDrawer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/theme/ThemeDrawer.tsx src/features/theme/ThemeDrawer.module.scss src/features/theme/ThemeDrawer.test.tsx
git commit -m "feat: add ThemeDrawer"
```

---

## Self-Review Notes

- **Spec coverage:** Design Tokens (Task 2/5), Persistence (Task 3), Theme drawer screen (Task 7/8), Motion (Task 5/Global Constraints) are each covered. The per-screen application of these tokens (Home header button placement, Room header button placement, every component's actual colors) is explicitly deferred to the Home and Room plans, which consume `useTheme`/`ThemeButton`/`ThemeDrawer` as a finished library — that split is the point of this plan.
- **Review Focus** lines each have an assigned test: matchMedia absence (Task 1), localStorage throwing/corrupt (Task 3), unknown persisted values (Task 4), debounce coalescing (Task 3).
- **Type consistency:** `ThemeKey`/`HueKey` defined once in `theme.ts` (Task 2) and reused by name in every later task's Interfaces block, including the Home/Room plans.
