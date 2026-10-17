import { palette, applyTheme } from './theme';

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
