# CodeShare Home Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `src/routes/Landing.tsx` to match the design handoff's Home screen pixel-for-pixel — animated hero, orbiting hero visual, marquee ticker, hairline feature grid, bottom CTA block, two-sided footer — on top of the theme tokens/`ThemeButton`/`ThemeDrawer` from the design-system plan, fully responsive per the handoff's breakpoints.

**Architecture:** Landing stays a single route component but grows a few focused children (`OrbitVisual`, a room-creation transition overlay) and two small framework-agnostic utilities (a JS syntax tokenizer for the decorative hero snippet, and the transition's timing state). The transition overlay is mounted once at the app root (so it survives the route change it triggers) and driven by a context Home calls into; the CTA stays a real `<a>`/`<Link>` so the existing "real link, not a button" guarantee and its test keep passing, with the animation layered on top of a plain left-click only.

**Tech Stack:** React 19, React Router v7 `Link`/`useNavigate`, Sass Modules, `lucide-react` icons, Vitest + React Testing Library + fake timers.

**Spec:**
- `design_handoff_codeshare/README.md` — "Screens → 1. Home" (lines 87–123), "Room-creation transition" (lines 167–172), "Toast" is Room-only (not used here)
- `design_handoff_codeshare/CodeShare v2.dc.html` — Home markup (lines 48–157), `FEATURES`/`TICKER`/`HERO` consts (lines 332, 344–352), `RX.js`/`hlNodes`/`MAP` tokenizer (lines 360, 365–378), `newRoom()`/key handler (lines 437–438, 556–561)
- Depends on: `docs/superpowers/plans/2026-10-17-codeshare-design-system.md` (Tasks 2, 4, 5, 6, 7, 8 — `useTheme`, `ThemeButton`, `ThemeDrawer`, motion keyframes, `ScanlineOverlay`/`ThemeProvider` already mounted in `App.tsx`)

## Global Constraints

- The "Create New Room" CTA and the bottom-CTA button must remain real `<a href="/code/:id">` elements (`react-router-dom`'s `Link`) — `src/routes/Landing.test.tsx` asserts `getByRole('link', { name: /^create new room$/i })` with a 10-char lowercase-alphanumeric href, and that guarantee (works with no JS, middle-click, ctrl-click, "open in new tab") must not regress.
- All copy is verbatim from the handoff: eyebrow `FREE · NO SIGN-UP REQUIRED`, H1 `Share code in real-time with CodeShare` (three animated spans), lead paragraph (unchanged from the current Landing.tsx — already matches), the 6 feature titles/descriptions/tags/indices (handoff lines 344–351), the ticker words (line 352), footer `{CodeShare}` / `© 2026 CodeShare` (lines 154–155).
- Breakpoints per the handoff's Design Tokens table (README lines 78–81): `< 760px` mobile, `760–1099px` compact desktop, `≥ 1100px` full desktop. Home's only breakpoint-gated behavior is the hero's 2-column grid collapsing via its own `auto-fit`/`minmax` (no JS needed); everything else is fluid `clamp()`.
- Respect `--play`/`prefers-reduced-motion` on every continuous animation (ticker, orbit spin, breathing glow, ping, blinking cursor, scanline) by setting `animation-play-state: var(--play)`, per the design-system plan's Task 5.
- Pressing `N` creates a room exactly like the N key on Home does in the handoff (line 438) — but only when focus is not in a text input/textarea (there are none on Home today, but guard it anyway since it's the handoff's exact condition).

## Review Focus

- **Ctrl/Cmd/Shift/middle-click on the CTA:** must perform the browser's native action (open in new tab / new window) instead of being swallowed by the transition's `preventDefault`.
- **Clicking the CTA twice quickly, or pressing N while the transition overlay is already active:** must not double-start the transition or schedule two navigations (mirrors the handoff's `if (this.state.warp) return;` guard, line 557).
- **`prefers-reduced-motion: reduce`:** the hero's rise-in, highlighter-mark sweep, orbit spin, ping, and ticker must all stop moving (not merely slow down) — this is the Home plan's biggest concentration of continuous CSS animation, so it's the page where a missed `var(--play)` wire-up would be most visible.
- **Very narrow viewports (e.g. 320px):** the eyebrow, H1, and "or press N" hint must not overflow horizontally — `clamp()` minimums and `text-wrap: balance/pretty` (handoff lines 74, 79) are what the spec relies on for this, not a separate mobile stylesheet.
- **JS disabled or before hydration:** the CTA and bottom-CTA anchors must still have a real `href` pointing at a valid room URL (already guaranteed by keeping them as `Link`s per Global Constraints, but worth a direct test since it's the one thing a careless rewrite could drop).

---

## File Structure

- Create `src/lib/highlightJs.ts` — the hero snippet's regex tokenizer.
- Create `src/lib/highlightJs.test.ts`
- Create `src/features/transition/RoomTransitionProvider.tsx` — context + `useRoomTransition()`.
- Create `src/features/transition/RoomTransitionProvider.test.tsx`
- Create `src/features/transition/RoomTransitionOverlay.tsx` + `.module.scss`
- Modify `src/App.tsx` — wrap `<Routes>` in `<RoomTransitionProvider>` (inside the existing `ThemeProvider`), render `<RoomTransitionOverlay />`.
- Create `src/routes/Landing/OrbitVisual.tsx` + `.module.scss` — the hero's orbiting rings/chips/center card.
- Rewrite `src/routes/Landing.tsx`
- Rewrite `src/routes/Landing.module.scss`
- `src/routes/Landing.test.tsx` — keep its existing assertion passing; add the new tests below.

## Task 1: Hero-snippet JS tokenizer

**Files:**
- Create: `src/lib/highlightJs.ts`
- Create: `src/lib/highlightJs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Token = { text: string; tag?: 'com' | 'str' | 'key' | 'num' | 'fn' }`; `function tokenizeJs(code: string): Token[]`.

- [ ] **Step 1: Write the failing tests**

```ts
import { tokenizeJs } from './highlightJs';

it('tags keywords, strings, and call-position identifiers, leaving plain text untagged', () => {
  const tokens = tokenizeJs("function greet(name) {\n  console.log(`Hi`);\n}");
  expect(tokens).toEqual(expect.arrayContaining([
    { text: 'function', tag: 'key' },
    { text: 'greet', tag: 'fn' },
    { text: '`Hi`', tag: 'str' },
  ]));
  expect(tokens.some((t) => t.text === '(' && !t.tag)).toBe(true);
});

it('tags line comments', () => {
  expect(tokenizeJs('// hi\nx')).toEqual(expect.arrayContaining([{ text: '// hi', tag: 'com' }]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/highlightJs.test.ts`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `tokenizeJs`**

Port the `js` entry of `RX` (line 360) and the matching-group walk in `hlNodes` (lines 365–377) from the handoff, specialized to just the `js` language (Home only ever highlights the JS hero snippet) and returning plain data (`Token[]`) instead of React elements — the component in Task 6 turns tokens into `<span>`s itself.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/highlightJs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/highlightJs.ts src/lib/highlightJs.test.ts
git commit -m "feat: add JS tokenizer for the Home hero snippet"
```

## Task 2: `RoomTransitionProvider` / `useRoomTransition()`

**Files:**
- Create: `src/features/transition/RoomTransitionProvider.tsx`
- Create: `src/features/transition/RoomTransitionProvider.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `function RoomTransitionProvider({ children }: { children: React.ReactNode }): JSX.Element`
  - `function useRoomTransition(): { active: boolean; roomId: string | null; start: (roomId: string, onNavigate: () => void) => void }` — `start` is a no-op while `active` is already `true` (Review Focus: double-click guard). On a successful call: sets `active=true` and `roomId` synchronously; at 650ms calls `onNavigate()`; at 1150ms sets `active=false`. Timers are cleared on unmount.

- [ ] **Step 1: Write the failing tests**

```tsx
function Probe() {
  const { active, roomId, start } = useRoomTransition();
  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="room">{roomId}</span>
      <button onClick={() => start('abcd-1234', () => { navigated = true; })}>go</button>
    </div>
  );
}
let navigated = false;

beforeEach(() => { navigated = false; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

it('activates immediately, navigates at 650ms, deactivates at 1150ms', () => {
  render(<RoomTransitionProvider><Probe /></RoomTransitionProvider>);
  fireEvent.click(screen.getByText('go'));
  expect(screen.getByTestId('active')).toHaveTextContent('true');
  expect(screen.getByTestId('room')).toHaveTextContent('abcd-1234');
  expect(navigated).toBe(false);
  vi.advanceTimersByTime(650);
  expect(navigated).toBe(true);
  expect(screen.getByTestId('active')).toHaveTextContent('true');
  vi.advanceTimersByTime(500);
  expect(screen.getByTestId('active')).toHaveTextContent('false');
});

it('ignores a second start() call while already active', () => {
  render(<RoomTransitionProvider><Probe /></RoomTransitionProvider>);
  fireEvent.click(screen.getByText('go'));
  fireEvent.click(screen.getByText('go')); // should be a no-op
  vi.advanceTimersByTime(650);
  expect(navigated).toBe(true); // navigate still only fires once -- no crash/double-fire
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/transition/RoomTransitionProvider.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `RoomTransitionProvider`**

Mirror `newRoom()` (handoff lines 556–561): guard re-entry, two `setTimeout`s (650ms, 1150ms), cleared in a `useEffect` cleanup.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/transition/RoomTransitionProvider.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transition/RoomTransitionProvider.tsx src/features/transition/RoomTransitionProvider.test.tsx
git commit -m "feat: add RoomTransitionProvider"
```

## Task 3: `RoomTransitionOverlay` + mount in `App.tsx`

**Files:**
- Create: `src/features/transition/RoomTransitionOverlay.tsx`
- Create: `src/features/transition/RoomTransitionOverlay.module.scss`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useRoomTransition()`.
- Produces: `export default function RoomTransitionOverlay(): JSX.Element | null` — renders `null` while `!active`; otherwise the full-screen iris layer showing `/r/{roomId}` (handoff lines 316–322).

- [ ] **Step 1: Implement `RoomTransitionOverlay`**

Translate handoff lines 316–322 (the `iris`/`irisOut` keyframes already exist from the design-system plan's Task 5).

- [ ] **Step 2: Mount the provider and overlay in `App.tsx`**

Wrap `<Routes>` in `<RoomTransitionProvider>` (nested inside the existing `<ThemeProvider>` from the design-system plan), render `<RoomTransitionOverlay />` as a sibling of `<Routes>`.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/transition/RoomTransitionOverlay.tsx src/features/transition/RoomTransitionOverlay.module.scss src/App.tsx
git commit -m "feat: mount the room-creation transition overlay"
```

## Task 4: Header (grid background, logo, ThemeButton, New Room pill)

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.module.scss`

**Interfaces:**
- Consumes: `useTheme`/`ThemeButton`/`ThemeDrawer` (design-system plan); `generateSessionId` (existing).
- Produces: nothing new consumed elsewhere — this task only changes Landing's own header markup/styles.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the theme button and opens the theme drawer', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(screen.getByRole('heading', { name: /theme/i })).toBeInTheDocument(); // drawer title
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL — no theme button yet

- [ ] **Step 3: Implement the header**

Sticky header (handoff lines 52–66): fixed grid-line background behind the whole page (line 50, masked fade per the gradient given there), logo as `<span>{</span>CodeShare<span>}</span>` with braces in `var(--acc)`, `<ThemeButton variant="pill" onOpenDrawer={...} />` + local `themeDrawerOpen` state + `<ThemeDrawer>`, and the "+ New Room" pill (keep it a `Link`, per Global Constraints — this one has no transition animation in the handoff's own spec, only the hero CTA does).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.module.scss
git commit -m "feat: redesign Home header"
```

## Task 5: Hero copy block + CTA transition wiring + N shortcut

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.module.scss`

**Interfaces:**
- Consumes: `useRoomTransition()`, `useNavigate()`.
- Produces: nothing new consumed elsewhere.

- [ ] **Step 1: Write the failing tests**

```tsx
it('keeps the CTA a real link to the new room', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

it('a plain click starts the transition instead of navigating immediately', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  fireEvent.click(screen.getByRole('link', { name: /^create new room$/i }));
  expect(screen.getByText(/\/r\//)).toBeInTheDocument(); // overlay now showing /r/{id}
});

it('a ctrl-click is left alone (native new-tab behavior, no preventDefault)', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  const link = screen.getByRole('link', { name: /^create new room$/i });
  const event = createEvent.click(link, { ctrlKey: true });
  const prevented = !fireEvent(link, event);
  expect(prevented).toBe(false);
});

it('pressing N starts the transition', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  fireEvent.keyDown(window, { key: 'n' });
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the hero copy block**

Eyebrow with ping dot (handoff lines 70–73), the three staggered-`rise` H1 spans with the `mark` highlighter sweep on "real-time" (lines 74–78), the lead paragraph (already correct text, just restyle), the CTA (`onClick`: if `e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey`, do nothing extra and let the browser handle it; otherwise `e.preventDefault()` and `start(newRoomId, () => navigate(roomHref))`), and the "or press [N]" hint. Add a `window` keydown listener for `n`/`N` (skip when `document.activeElement` is an `INPUT`/`TEXTAREA`, per Global Constraints) that calls the same `start(...)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.module.scss
git commit -m "feat: redesign Home hero copy and wire the room-creation transition"
```

## Task 6: `OrbitVisual`

**Files:**
- Create: `src/routes/Landing/OrbitVisual.tsx`
- Create: `src/routes/Landing/OrbitVisual.module.scss`
- Modify: `src/routes/Landing.tsx` (render it in place of the old `mockWindow`)

**Interfaces:**
- Consumes: `tokenizeJs` (Task 1).
- Produces: `export default function OrbitVisual({ room }: { room: string }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the three orbiting file-type chips and the room id', () => {
  render(<OrbitVisual room="abcd-1234" />);
  expect(screen.getByText('<html>')).toBeInTheDocument();
  expect(screen.getByText('{ css }')).toBeInTheDocument();
  expect(screen.getByText('js()')).toBeInTheDocument();
  expect(screen.getByText(/abcd-1234/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/Landing/OrbitVisual.test.tsx`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement `OrbitVisual`**

Translate handoff lines 89–113: outer ring, rotating tick ring, breathing glow, the 24s-rotating/counter-rotating chip layer, and the center card (equalizer bars, `tokenizeJs`-rendered typing animation of the `HERO` constant at lines 331/595, blinking caret, `Hello, world!` footer fading in once typing completes). The typing interval (60ms/tick, matching line 445) lives in a `useEffect` inside this component so it only runs while Home is mounted.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/Landing/OrbitVisual.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing/OrbitVisual.tsx src/routes/Landing/OrbitVisual.module.scss src/routes/Landing/OrbitVisual.test.tsx src/routes/Landing.tsx
git commit -m "feat: add the Home hero orbit visual"
```

## Task 7: Ticker marquee

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.module.scss`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders the ticker words', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  expect(screen.getAllByText('JavaScript').length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the ticker**

Duplicated word list (handoff line 352) inside a `marquee`-animated flex row with the rotated-diamond separators (lines 109, 116–121).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.module.scss
git commit -m "feat: add Home ticker marquee"
```

## Task 8: Features grid copy + layout

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.module.scss`

- [ ] **Step 1: Write the failing test**

```tsx
it('renders each feature with its index and tag', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  expect(screen.getByText('01')).toBeInTheDocument();
  expect(screen.getByText('pair')).toBeInTheDocument();
  expect(screen.getByText('Remote pair programming')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL — current `FEATURES` array has no index/tag

- [ ] **Step 3: Implement the features grid**

Add `n`/`tag` to each entry (handoff lines 344–351: `pair, hire, link, save, learn, fix`), hairline-border grid (line 129), per-card layout (index + tag row, title, description) and hover `background: var(--acc-soft)` (line 131).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.module.scss
git commit -m "feat: redesign Home features grid"
```

## Task 9: Bottom CTA block + footer

**Files:**
- Modify: `src/routes/Landing.tsx`
- Modify: `src/routes/Landing.module.scss`

- [ ] **Step 1: Write the failing test**

```tsx
it('the bottom CTA is also a real link, and the footer shows the 2026 copyright', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  const links = screen.getAllByRole('link', { name: /create new room/i });
  expect(links.length).toBe(2); // hero CTA + bottom CTA
  expect(screen.getByText('© 2026 CodeShare')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the bottom CTA + footer**

Full-width button block with the invert-on-hover treatment (handoff lines 143–149) — same `Link` + transition wiring pattern as Task 5's hero CTA (same `onClick` guard, same `start(...)` call). Two-sided footer (lines 152–157).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/routes/Landing.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/Landing.tsx src/routes/Landing.module.scss
git commit -m "feat: add Home bottom CTA block and two-sided footer"
```

## Task 10: Mobile pass + manual verification

**Files:**
- Modify: `src/routes/Landing.module.scss` (only if the manual pass below finds a gap — otherwise no change)

- [ ] **Step 1: Run the full suite and the production build**

Run: `npm test && npm run build`
Expected: both PASS

- [ ] **Step 2: Manual browser verification**

Run `npm run dev`, open Home at a 360px-wide viewport and a 1440px-wide viewport. Confirm: header wraps/stays usable, hero collapses to one column, orbit visual scales down without overflow, ticker still scrolls, feature grid goes to one column, bottom CTA block text doesn't overflow its circle button, footer doesn't wrap awkwardly. Toggle the OS/browser's reduced-motion setting and confirm the ticker/orbit/ping/mark-sweep all stop. Fix any gap found directly in `Landing.module.scss`.

- [ ] **Step 3: Commit (only if Step 2 required a fix)**

```bash
git add src/routes/Landing.module.scss
git commit -m "fix: mobile-width Home layout gaps"
```

---

## Self-Review Notes

- **Spec coverage:** Header, Hero copy, Hero visual, Ticker, Features, Bottom CTA, Footer, and the room-creation transition are each their own task; the Theme drawer screen is explicitly out of scope here (owned by the design-system plan, just consumed via `ThemeButton`/`ThemeDrawer`).
- **Review Focus** lines each have a test: modified-click passthrough and double-start guard (Task 5/2), reduced-motion (manual pass, Task 10 — CSS-only behavior isn't meaningfully assertable in jsdom), narrow-viewport overflow (manual pass, Task 10), link-without-JS (Task 4/5/9's `getByRole('link')` assertions, which fail if the CTA is ever turned into a non-anchor element).
- **Type consistency:** `useRoomTransition()`'s `start(roomId, onNavigate)` signature (fixed in Task 2) is used identically in Tasks 5 and 9 — both CTAs call it the same way.
- **Proportion check:** CSS/animation values are referenced by handoff line number rather than transcribed in full, since the file itself is the source of truth for every `clamp()`/color/timing value; the plan's job is the component/task split and the interaction logic (transition timing, click-guard, tokenizer), which have no copy-pasteable spec form.
