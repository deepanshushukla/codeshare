import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import OrbitVisual from './OrbitVisual';

it('renders the three orbiting file-type chips and the room id', () => {
  render(<OrbitVisual room="abcd-1234" />);
  expect(screen.getByText('<html>')).toBeInTheDocument();
  expect(screen.getByText('{ css }')).toBeInTheDocument();
  expect(screen.getByText('js()')).toBeInTheDocument();
  expect(screen.getByText(/abcd-1234/)).toBeInTheDocument();
});

// Extracts the full declaration block for `selector` from a CSS/SCSS source
// string, counting braces so a nested rule doesn't truncate the match early
// (same approach Landing.test.tsx's extractRuleBlock uses).
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

it('the orbit\'s one-shot fade-in does NOT wire --play, but the continuous spin/breathe/unspin/bar/blink animations still do', () => {
  // `animation-play-state: paused` pins an animation's current time at 0 the
  // instant it would start -- wiring --play onto the orbit's fill-mode
  // `both` fade-in would freeze it invisible forever under reduced motion
  // instead of landing on its visible end state (see the comment above the
  // reduced-motion media query in src/styles/motion.scss). The continuous
  // decorative animations below have no invisible keyframe, so pausing
  // mid-cycle via --play is correct for them.
  const scssPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'OrbitVisual.module.scss');
  const css = readFileSync(scssPath, 'utf8');

  expect(extractRuleBlock(css, '.orbit')).not.toContain('animation-play-state: var(--play);');

  for (const selector of ['.tickRing', '.glow', '.chipLayer', '.chip', '.equalizerBar', '.caret']) {
    expect(extractRuleBlock(css, selector)).toContain('animation-play-state: var(--play);');
  }
});
