import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// jsdom can't actually evaluate computed animation end-states from a
// stylesheet (motion.scss isn't even loaded as CSS in the test environment),
// so this is a source-text check: it confirms the reduced-motion override
// that forces entrance animations to their `both`/`forwards` end state is
// present, rather than asserting a rendered pixel/opacity outcome.
const scssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'motion.scss');
const css = readFileSync(scssPath, 'utf8');

// Extracts the full declaration block for `atRule` (e.g.
// "@media (prefers-reduced-motion: reduce)"), counting braces so the nested
// `*, *::before, *::after { ... }` rule inside it doesn't truncate the match
// early -- same brace-counting approach Landing.test.tsx uses for selectors.
function extractBlock(source: string, atRule: string): string {
  const headerIndex = source.indexOf(atRule);
  if (headerIndex === -1) {
    throw new Error(`"${atRule}" not found in source`);
  }
  const braceStart = source.indexOf('{', headerIndex);
  let depth = 0;
  let i = braceStart;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return source.slice(braceStart, i + 1);
}

describe('reduced-motion handling (fix round 1/5: paused-before-first-paint bug)', () => {
  const reducedMotionBlock = extractBlock(css, '@media (prefers-reduced-motion: reduce)');

  test('--play is still paused for the continuous/infinite animations (spin, blink, marquee, breathe, ping, bar)', () => {
    expect(reducedMotionBlock).toContain('--play: paused;');
  });

  test('every animation and transition is forced to complete almost instantly, exactly once', () => {
    // Without this, "--play: paused" alone freezes fill-mode both/forwards
    // entrance animations (rise/fade/mark/paneIn/drawerIn/toastIn/iris/
    // irisOut) at their FIRST keyframe forever, since --play is already
    // "paused" before the animation ever starts running. Forcing the
    // duration down lets each one reach its `to`/`100%` end state under the
    // same paused play-state (an animation that has already finished is
    // unaffected by being "paused").
    expect(reducedMotionBlock).toContain('animation-duration: 0.01ms !important;');
    expect(reducedMotionBlock).toContain('animation-iteration-count: 1 !important;');
    expect(reducedMotionBlock).toContain('transition-duration: 0.01ms !important;');
  });

  test('the override applies universally (*, *::before, *::after), not just to known animated selectors', () => {
    // This file is shared across every plan that opts into the --play
    // pattern (Home's hero/orbit/ticker, ThemeDrawer's drawerIn, future
    // consumers not built yet) -- a universal selector means a new
    // consumer never has to remember to re-declare this fix for itself.
    expect(reducedMotionBlock).toMatch(/\*\s*,\s*\*::before\s*,\s*\*::after\s*\{/);
  });

  test('every fill-mode both/forwards keyframe\'s end state is the visible/settled one, so collapsing straight to it is safe', () => {
    // Entrance animations: "to"/"100%" must be the fully-visible,
    // untransformed state -- that's what reduced-motion users will see
    // almost instantly instead of the animated sweep.
    expect(css).toContain('@keyframes rise{from{opacity:0;transform:translateY(40px) skewY(4deg)}to{opacity:1;transform:none}}');
    expect(css).toContain('@keyframes fade{from{opacity:0}to{opacity:1}}');
    expect(css).toContain('@keyframes mark{from{background-size:0% 100%}to{background-size:100% 100%}}');
    expect(css).toContain('@keyframes paneIn{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}');
    expect(css).toContain('@keyframes drawerIn{from{transform:translateX(100%)}to{transform:none}}');
    expect(css).toContain(
      '@keyframes toastIn{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}',
    );
    // iris is a reveal wipe (0% clip-path:circle(0%) -> 100% circle(150%),
    // i.e. "fully revealed" is the end state); irisOut is the one
    // intentional exception -- it fades something OUT, so landing on
    // opacity:0 at 100% is its correct (not a bug) end state.
    expect(css).toContain(
      '@keyframes iris{0%{clip-path:circle(0% at var(--ix,50%) var(--iy,50%))}100%{clip-path:circle(150% at var(--ix,50%) var(--iy,50%))}}',
    );
    expect(css).toContain('@keyframes irisOut{0%,60%{opacity:1}100%{opacity:0}}');
  });
});
