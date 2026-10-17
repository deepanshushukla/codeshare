export type ThemeKey = 'abyss' | 'paper' | 'phosphor';
export type HueKey = 'teal' | 'aqua' | 'jade' | 'cyan';

export const THEMES: Record<ThemeKey, { name: string; note: string; dark: boolean; scan: number; black?: boolean }> = {
  abyss: { name: 'Abyss', note: 'dark', dark: true, scan: 0 },
  paper: { name: 'Paper', note: 'light', dark: false, scan: 0 },
  phosphor: { name: 'Phosphor', note: 'crt', dark: true, scan: 0.5, black: true }
};

export const HUES: Record<HueKey, { name: string; deg: number }> = {
  teal: { name: 'Teal', deg: 180 },
  aqua: { name: 'Aqua', deg: 205 },
  jade: { name: 'Jade', deg: 160 },
  cyan: { name: 'Cyan', deg: 220 }
};

export const DEFAULT_THEME: ThemeKey = 'abyss';
export const DEFAULT_HUE: HueKey = 'teal';

export function palette(theme: ThemeKey, hue: HueKey): Record<string, string> {
  const th = THEMES[theme] || THEMES.abyss;
  const h = (HUES[hue] || HUES.teal).deg;
  const dark = th.dark;

  if (!dark) {
    return {
      '--bg': 'oklch(0.975 0.006 190)',
      '--bg2': 'oklch(0.95 0.01 190)',
      '--bg3': 'oklch(0.92 0.012 190)',
      '--ed': 'oklch(0.99 0.004 190)',
      '--text': 'oklch(0.2 0.03 200)',
      '--muted': 'oklch(0.42 0.025 200)',
      '--faint': 'oklch(0.56 0.02 200)',
      '--line': `oklch(0.45 0.06 ${h} / 0.14)`,
      '--line2': `oklch(0.45 0.06 ${h} / 0.26)`,
      '--acc': `oklch(0.72 0.13 ${h})`,
      '--acc-t': `oklch(0.46 0.09 ${h})`,
      '--acc-ink': `oklch(0.18 0.04 ${h})`,
      '--acc-soft': `oklch(0.72 0.13 ${h} / 0.12)`,
      '--glow': `oklch(0.72 0.13 ${h} / 0.4)`,
      '--warn': 'oklch(0.5 0.12 70)',
      '--err': 'oklch(0.5 0.18 25)',
      '--tk-key': 'oklch(0.48 0.16 300)',
      '--tk-str': 'oklch(0.5 0.12 60)',
      '--tk-num': 'oklch(0.52 0.16 30)',
      '--tk-com': 'oklch(0.6 0.02 200)',
      '--tk-fn': `oklch(0.45 0.1 ${h})`,
      '--tk-tag': `oklch(0.47 0.1 ${h})`,
      '--tk-attr': 'oklch(0.48 0.14 250)'
    };
  }

  const b = th.black;
  return {
    '--bg': b ? 'oklch(0.1 0.006 190)' : 'oklch(0.14 0.02 200)',
    '--bg2': b ? 'oklch(0.14 0.01 190)' : 'oklch(0.18 0.022 200)',
    '--bg3': b ? 'oklch(0.18 0.012 190)' : 'oklch(0.22 0.024 200)',
    '--ed': b ? 'oklch(0.115 0.008 190)' : 'oklch(0.155 0.02 200)',
    '--text': b ? `oklch(0.92 0.06 ${h})` : 'oklch(0.96 0.01 190)',
    '--muted': b ? `oklch(0.78 0.07 ${h})` : 'oklch(0.76 0.02 195)',
    '--faint': b ? `oklch(0.58 0.05 ${h})` : 'oklch(0.56 0.02 200)',
    '--line': `oklch(0.82 0.14 ${h} / 0.12)`,
    '--line2': `oklch(0.82 0.14 ${h} / 0.24)`,
    '--acc': `oklch(0.82 0.14 ${h})`,
    '--acc-t': `oklch(0.85 0.13 ${h})`,
    '--acc-ink': `oklch(0.18 0.04 ${h})`,
    '--acc-soft': `oklch(0.82 0.14 ${h} / 0.1)`,
    '--glow': `oklch(0.82 0.14 ${h} / 0.45)`,
    '--warn': 'oklch(0.86 0.13 85)',
    '--err': 'oklch(0.76 0.16 25)',
    '--tk-key': b ? `oklch(0.9 0.1 ${h})` : 'oklch(0.78 0.13 300)',
    '--tk-str': b ? `oklch(0.8 0.12 ${h + 30})` : 'oklch(0.86 0.11 85)',
    '--tk-num': b ? `oklch(0.85 0.1 ${h - 40})` : 'oklch(0.78 0.14 35)',
    '--tk-com': b ? `oklch(0.5 0.05 ${h})` : 'oklch(0.56 0.02 200)',
    '--tk-fn': `oklch(0.85 0.13 ${h})`,
    '--tk-tag': `oklch(0.82 0.14 ${h})`,
    '--tk-attr': b ? `oklch(0.78 0.08 ${h})` : 'oklch(0.78 0.11 250)'
  };
}

export function applyTheme(theme: ThemeKey, hue: HueKey, reducedMotion: boolean): void {
  const th = THEMES[theme] || THEMES.abyss;
  const v = palette(theme, hue);
  v['--scan'] = String(th.scan);
  v['--play'] = reducedMotion ? 'paused' : 'running';
  const r = document.documentElement;
  Object.keys(v).forEach(k => r.style.setProperty(k, v[k]));
  r.style.colorScheme = th.dark ? 'dark' : 'light';
}
