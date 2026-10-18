import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../../features/theme/ThemeProvider';
import OrbitVisual from './OrbitVisual';

// Extracts the full declaration block for `selector` from a CSS/SCSS source
// string, counting braces so a nested rule (like .chip's `&[data-color=...]`)
// doesn't truncate the match early.
function extractRuleBlock(css: string, selector: string): string {
  const headerIndex = css.indexOf(`${selector} {`);
  if (headerIndex === -1) {
    throw new Error(`selector ${selector} not found in CSS source`);
  }
  const braceStart = css.indexOf('{', headerIndex);
  let depth = 0;
  let i = braceStart;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  return css.slice(braceStart, i + 1);
}

// OrbitVisual calls useTheme() (to skip its JS typing loop under reduced
// motion), which throws without a ThemeProvider ancestor -- same wrapper
// Landing.test.tsx uses.
function renderOrbit(room = 'abcd-1234') {
  return render(
    <ThemeProvider>
      <OrbitVisual room={room} />
    </ThemeProvider>,
  );
}

// The full HERO snippet OrbitVisual types out (kept in sync with the module's
// own const; asserted as the rendered text of the <pre>).
const HERO = "function greet(name) {\n  console.log(`Hello, ${name}!`);\n}\n\ngreet('world');";

afterEach(() => {
  vi.restoreAllMocks();
});

it('renders the three orbiting file-type chips and the room id', () => {
  renderOrbit();
  expect(screen.getByText('<html>')).toBeInTheDocument();
  expect(screen.getByText('{ css }')).toBeInTheDocument();
  expect(screen.getByText('js()')).toBeInTheDocument();
  expect(screen.getByText(/abcd-1234/)).toBeInTheDocument();
});

it('renders the whole snippet immediately and starts no typing timer under prefers-reduced-motion', () => {
  // The typing loop is driven by setInterval in JS, so motion.scss's
  // reduced-motion CSS overrides cannot reach it -- this is the one animation
  // on Home that has to opt out in TypeScript.
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const setInterval_ = vi.spyOn(globalThis, 'setInterval');

  const { container } = renderOrbit();

  expect(container.querySelector('pre')?.textContent).toBe(HERO);
  expect(setInterval_).not.toHaveBeenCalled();
});

it('starts empty and runs the typing timer when reduced motion is NOT requested', () => {
  const setInterval_ = vi.spyOn(globalThis, 'setInterval');

  const { container } = renderOrbit();

  expect(container.querySelector('pre')?.textContent).toBe('');
  expect(setInterval_).toHaveBeenCalled();
});

// The companion "one-shot animations must NOT wire --play" assertion that used
// to live here is now covered systemically, for every *.module.scss in the
// repo, by src/styles/reducedMotion.test.ts. This remaining half is NOT
// covered there (that test deliberately does not *mandate* --play on
// continuous animations, so that a future one can use another mechanism), so
// it stays here as the orbit's own reduced-motion coverage.
it('the orbit\'s continuous spin/breathe/unspin/bar/blink animations are --play-gated so they freeze under reduced motion', () => {
  const scssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'OrbitVisual.module.scss');
  const css = readFileSync(scssPath, 'utf8');

  for (const selector of ['.tickRing', '.glow', '.chipLayer', '.chip', '.equalizerBar', '.caret']) {
    expect(extractRuleBlock(css, selector)).toContain('animation-play-state: var(--play);');
  }
});
