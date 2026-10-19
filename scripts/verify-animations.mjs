#!/usr/bin/env node
// Verifies, against the COMPILED production CSS, that every animation-name
// referenced by a rule has a matching @keyframes block in the same output.
//
// Why this exists / why it is not a Vitest test
// ---------------------------------------------
// CSS Modules rewrites both class names AND animation-name tokens inside a
// `*.module.scss` file to that file's hashed local scope. `src/styles/
// motion.scss` is a GLOBAL (non-module) stylesheet, so the ~16 @keyframes it
// declares keep their bare names. The result: a module stylesheet writing
// `animation: paneIn 0.3s ...` compiled to `animation: .3s ... _paneIn_15sy7_1`
// while the only definition in the bundle was `@keyframes paneIn` -- the names
// never matched and the animation silently never ran. Every one of the app's
// animations was dead this way except RunControls' `runFlash`, which happens
// to declare its own LOCAL @keyframes (so reference and definition get scoped
// together, consistently).
//
// The fix is to wrap each global keyframe reference as `animation:
// global(paneIn) 0.3s ...` -- the one escape Vite's CSS Modules pipeline
// actually honors inside an animation value (`postcss-modules-local-by-default`
// looks for a function node literally named `global`; a `:global(...)` prefix
// is NOT recognized there and compiles through as garbage).
//
// src/styles/motion.test.ts and src/styles/reducedMotion.test.ts were blind to
// all of this: they read SOURCE text, where the names match fine. Only the
// build output can prove it, which is why this runs against dist/ rather than
// as a unit test -- it needs `npm run build` first and Vitest has no build
// step. Run it as:
//
//     npm run build && node scripts/verify-animations.mjs
//
// Exits non-zero (and names each offender) if any reference is unmatched.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(root, 'dist', 'assets');

let files;
try {
  files = readdirSync(assetsDir).filter((name) => name.endsWith('.css'));
} catch {
  console.error(`✗ ${path.relative(root, assetsDir)} not found -- run \`npm run build\` first.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`✗ No .css files in ${path.relative(root, assetsDir)} -- run \`npm run build\` first.`);
  process.exit(1);
}

// Keywords that can legally appear in an `animation` shorthand and are NOT the
// name. Anything left over after filtering these (plus times, numbers and
// functions) is the animation-name token.
const KEYWORDS = new Set([
  'normal', 'reverse', 'alternate', 'alternate-reverse',
  'forwards', 'backwards', 'both', 'none',
  'infinite', 'paused', 'running',
  'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear',
  'step-start', 'step-end',
  'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

const IS_TIME_OR_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(s|ms)?$/i;

// Splits a declaration value on top-level separators only, so `cubic-bezier(.2,
// .8, .2, 1)` stays one token instead of fragmenting on its inner commas.
function splitTopLevel(value, separators) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && separators.includes(ch)) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function namesFromAnimationValue(value) {
  const names = [];
  // Comma separates whole animations (`animation: a 1s, b 2s`).
  for (const single of splitTopLevel(value, ',')) {
    for (const token of splitTopLevel(single, ' \t\n')) {
      if (token.includes('(')) continue; // cubic-bezier(), steps(), var()…
      if (IS_TIME_OR_NUMBER.test(token)) continue;
      if (KEYWORDS.has(token.toLowerCase())) continue;
      names.push(token);
    }
  }
  return names;
}

let failures = 0;
let checkedReferences = 0;

for (const file of files) {
  const css = readFileSync(path.join(assetsDir, file), 'utf8');

  const defined = new Set(
    [...css.matchAll(/@(?:-webkit-)?keyframes\s+([^{\s]+)/g)].map((match) => match[1]),
  );

  // `animation` / `animation-name` only -- the `(?![\w-])` stops this from
  // also matching animation-delay / -duration / -play-state etc.
  const referenced = new Map(); // name -> count
  for (const match of css.matchAll(/animation(?:-name)?(?![\w-])\s*:\s*([^;}]*)/g)) {
    for (const name of namesFromAnimationValue(match[1])) {
      referenced.set(name, (referenced.get(name) ?? 0) + 1);
    }
  }

  const unmatched = [...referenced.keys()].filter((name) => !defined.has(name));
  checkedReferences += [...referenced.values()].reduce((sum, n) => sum + n, 0);

  console.log(`\n${file}`);
  console.log(`  @keyframes defined: ${defined.size} (${[...defined].sort().join(', ')})`);
  console.log(`  animation-name references: ${referenced.size} distinct`);

  for (const name of [...referenced.keys()].sort()) {
    const ok = defined.has(name);
    if (!ok) failures++;
    console.log(`    ${ok ? '✓' : '✗'} ${name} × ${referenced.get(name)}${ok ? '' : '  <-- NO MATCHING @keyframes'}`);
  }

  // A keyframe that nothing references is dead CSS, not a broken animation --
  // reported, but not a failure.
  const unused = [...defined].filter((name) => !referenced.has(name));
  if (unused.length > 0) {
    console.log(`  (defined but unreferenced: ${unused.sort().join(', ')})`);
  }
  if (unmatched.length === 0) {
    console.log('  → all references resolve');
  }
}

console.log('');
if (failures > 0) {
  console.error(
    `✗ ${failures} animation-name reference(s) have no matching @keyframes in the built CSS.\n` +
      '  If the name looks scoped (e.g. "_paneIn_15sy7_1") it is a global keyframe declared in\n' +
      '  src/styles/motion.scss being referenced from a *.module.scss without the global()\n' +
      '  escape. Fix: `animation: global(<name>) …` in that module stylesheet.',
  );
  process.exit(1);
}

console.log(`✓ Every animation-name in the built CSS resolves to a @keyframes block (${checkedReferences} references checked).`);
