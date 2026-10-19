import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Systemic reduced-motion invariant for the whole app's Sass Modules.
//
// Background: `animation-play-state: paused` pins an animation's current time
// at 0 the instant it would start. Under `prefers-reduced-motion: reduce`,
// src/styles/motion.scss sets `--play: paused` BEFORE any animation runs, so a
// rule that wires `animation-play-state: var(--play)` onto a one-shot
// entrance/exit animation (fill-mode `both`/`forwards`) never runs it at all:
// it sits frozen on its FIRST keyframe -- the hidden/offset one -- forever.
// That is exactly the bug Task 10 found (Home's hero copy and orbit fade-in
// invisible for reduced-motion users). One-shot animations are instead handled
// by motion.scss's `animation-duration`/`animation-delay` overrides, which
// collapse them to their visible end state almost instantly.
//
// This file replaces the per-selector allowlists that used to live in
// Landing.test.tsx / OrbitVisual.test.tsx (each hand-listing "these class
// names must/must not have --play"). Those could only protect the selectors
// someone remembered to add. This walks every `*.module.scss` in src/ off
// disk, so a brand-new stylesheet from a future plan (the Room workspace
// redesign, for one) is covered the moment it is written, with no test edit.
const stylesDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(stylesDir, '..');

// One-shot entrance/reveal/exit keyframes: they run once from a hidden or
// offset state to a settled one (or, for irisOut, deliberately out). These
// must NEVER declare `animation-play-state`.
// `runFlash` is the Room header Run button's click sweep -- declared locally in
// RunControls.module.scss (CSS Modules scopes the name) rather than in
// motion.scss, since it belongs to that one control. It runs once to
// `opacity: 0` with fill-mode `forwards`, so it is a one-shot: under reduced
// motion it must collapse to that settled, invisible end state, not freeze on
// its opaque first keyframe.
const ONE_SHOT_KEYFRAMES = ['rise', 'fade', 'mark', 'paneIn', 'drawerIn', 'toastIn', 'iris', 'irisOut', 'runFlash'];

// Continuous/looping decorative keyframes: every frame of the loop is a
// visually sane resting state, so freezing them mid-cycle via
// `animation-play-state: var(--play)` is harmless (and is the convention here),
// but is not *required* -- a future animation may reasonably opt out or use a
// different mechanism. This test only forbids the one-shot-paused bug.
const CONTINUOUS_KEYFRAMES = ['spin', 'unspin', 'breathe', 'bar', 'blink', 'ping', 'marquee', 'scanmove'];

function collectModuleStylesheets(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectModuleStylesheets(full));
    } else if (entry.isFile() && entry.name.endsWith('.module.scss')) {
      found.push(full);
    }
  }
  return found;
}

// Several of these stylesheets carry long `//` comments that quote
// "animation-play-state: var(--play)" while explaining why the rule must not
// use it -- stripping comments first is what keeps this from reading those
// explanations as declarations. (No stylesheet in src/ contains a `//` inside
// a value, e.g. a `url(https://...)`, so this plain strip is safe here.)
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

type Rule = { selector: string; body: string };

// Flattens nested Sass into one entry per rule block, where `body` holds only
// that block's OWN declarations (a nested `&:hover { ... }` becomes its own
// entry rather than counting toward its parent). "Same rule block" is the
// precise scope that matters here: `animation-play-state` only interferes with
// an `animation` declared on the same element in the same block.
function flattenRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const stack: Rule[] = [];
  let current: Rule = { selector: '<root>', body: '' };

  for (const ch of css) {
    if (ch === '{') {
      // Everything since the previous `;` is the child block's selector (or
      // at-rule prelude) -- move it out of the parent's body and open a block.
      const cut = current.body.lastIndexOf(';') + 1;
      const selector = current.body.slice(cut).trim();
      current.body = current.body.slice(0, cut);
      stack.push(current);
      current = { selector, body: '' };
    } else if (ch === '}') {
      rules.push(current);
      current = stack.pop() ?? { selector: '<root>', body: '' };
    } else {
      current.body += ch;
    }
  }
  rules.push(current);
  return rules;
}

// Matches the `animation` shorthand/longhand only -- `animation-play-state`,
// `animation-delay` etc. have a `-` where this requires `:`.
const ANIMATION_DECL = /animation\s*:\s*([^;}]*)/g;
const PLAY_STATE_DECL = /animation-play-state\s*:/;

function usedKeyframeNames(animationValue: string, names: string[]): string[] {
  // Word-boundary matching keeps `spin` from matching inside `unspin` and
  // `iris` from matching inside `irisOut`.
  return names.filter(name => new RegExp(`\\b${name}\\b`).test(animationValue));
}

const stylesheets = collectModuleStylesheets(srcDir).map(file => ({
  file,
  relative: path.relative(srcDir, file),
  rules: flattenRules(stripComments(readFileSync(file, 'utf8'))),
}));

describe('reduced-motion invariants across every src/**/*.module.scss', () => {
  test('the walk actually finds stylesheets and animations (guards against a silently empty sweep)', () => {
    expect(stylesheets.length).toBeGreaterThan(5);
    const animationCount = stylesheets
      .flatMap(sheet => sheet.rules)
      .flatMap(rule => [...rule.body.matchAll(ANIMATION_DECL)]).length;
    expect(animationCount).toBeGreaterThan(10);
  });

  test('no rule running a ONE-SHOT keyframe also declares animation-play-state', () => {
    // The core invariant. `animation-play-state: <anything>` is flagged, not
    // just `var(--play)`: a literal `paused` is the same bug, and a literal
    // `running` is a confusing no-op that invites someone to "fix" it into
    // `var(--play)` later.
    const violations: string[] = [];

    for (const { relative, rules } of stylesheets) {
      for (const rule of rules) {
        if (!PLAY_STATE_DECL.test(rule.body)) continue;
        for (const [, value] of rule.body.matchAll(ANIMATION_DECL)) {
          const oneShot = usedKeyframeNames(value, ONE_SHOT_KEYFRAMES);
          if (oneShot.length > 0) {
            violations.push(
              `${relative} -> ${rule.selector}: one-shot keyframe "${oneShot.join(', ')}" ` +
                'must not declare animation-play-state (it would freeze on its hidden first ' +
                'keyframe under prefers-reduced-motion; motion.scss\'s duration/delay override ' +
                'already handles it)',
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  test('every animation used in a module stylesheet references a keyframe classified above', () => {
    // Forces a deliberate one-shot-vs-continuous decision for any new
    // animation: an unclassified keyframe name fails here with instructions,
    // instead of silently escaping the invariant above.
    const unclassified: string[] = [];

    for (const { relative, rules } of stylesheets) {
      for (const rule of rules) {
        for (const [, value] of rule.body.matchAll(ANIMATION_DECL)) {
          const known = usedKeyframeNames(value, [...ONE_SHOT_KEYFRAMES, ...CONTINUOUS_KEYFRAMES]);
          if (known.length === 0) {
            unclassified.push(
              `${relative} -> ${rule.selector}: "animation:${value.trim()}" names no classified ` +
                'keyframe. Add it to ONE_SHOT_KEYFRAMES or CONTINUOUS_KEYFRAMES in ' +
                'src/styles/reducedMotion.test.ts (see the header comment for which bucket).',
            );
          }
        }
      }
    }

    expect(unclassified).toEqual([]);
  });

  test('every @keyframes defined in motion.scss is classified in exactly one bucket', () => {
    // The other half of the same guard: classification is required at
    // definition time, not only at first use, so a keyframe added by a plan
    // that does not yet consume it still gets bucketed.
    const motionCss = readFileSync(path.join(stylesDir, 'motion.scss'), 'utf8');
    const defined = [...motionCss.matchAll(/@keyframes\s+([\w-]+)/g)].map(match => match[1]);

    expect(defined.length).toBeGreaterThan(0);
    for (const name of defined) {
      const buckets = [
        ONE_SHOT_KEYFRAMES.includes(name) ? 'one-shot' : null,
        CONTINUOUS_KEYFRAMES.includes(name) ? 'continuous' : null,
      ].filter(Boolean);
      expect(buckets, `@keyframes ${name} must be in exactly one bucket`).toHaveLength(1);
    }
  });
});
