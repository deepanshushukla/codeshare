import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { applyTheme, DEFAULT_HUE, DEFAULT_THEME, HUES, THEMES } from '../../lib/theme';
import type { HueKey, ThemeKey } from '../../lib/theme';
import { flushPersisted, readPersisted, writePersisted } from '../../lib/persistedState';

type ThemeContextValue = {
  theme: ThemeKey;
  hue: HueKey;
  themeName: string;
  reducedMotion: boolean;
  setTheme: (t: ThemeKey) => void;
  setHue: (h: HueKey) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && Object.keys(THEMES).includes(value);
}

function isHueKey(value: unknown): value is HueKey {
  return typeof value === 'string' && Object.keys(HUES).includes(value);
}

function readInitialTheme(): ThemeKey {
  const persisted = readPersisted();
  return isThemeKey(persisted.theme) ? persisted.theme : DEFAULT_THEME;
}

function readInitialHue(): HueKey {
  const persisted = readPersisted();
  return isHueKey(persisted.hue) ? persisted.hue : DEFAULT_HUE;
}

function getReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>(readInitialTheme);
  const [hue, setHueState] = useState<HueKey>(readInitialHue);
  const [reducedMotion, setReducedMotion] = useState<boolean>(getReducedMotion);
  // False until after the mount effect below has run once -- lets the shared
  // apply+persist effect skip persisting on mount (the values just came FROM
  // storage, or are defaults; writing them back is redundant) while still
  // persisting every change caused by setTheme/setHue afterwards.
  const mountedRef = useRef(false);

  // useLayoutEffect, not useEffect: the static defaults in tokens.scss only
  // match the DEFAULT theme, so applying a persisted Paper/Phosphor after paint
  // would show one frame of Abyss first. This app is client-rendered only
  // (BrowserRouter, no SSR), so running before paint is safe here.
  useLayoutEffect(() => {
    applyTheme(theme, hue, reducedMotion);
    if (mountedRef.current) {
      writePersisted({ theme, hue });
    }
    mountedRef.current = true;
    // reducedMotion is intentionally not a dependency: the matchMedia handler
    // below re-applies the palette itself, and re-running this effect for it
    // would persist an unchanged theme/hue on every OS-preference change.
  }, [theme, hue]);

  // Live-react to the OS reduced-motion setting changing while the app is
  // open, rather than only reading it once on mount.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
      applyTheme(theme, hue, event.matches);
    };
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, [theme, hue]);

  // A theme/hue change inside writePersisted's debounce window is lost outright
  // if the page goes away first -- flush it on pagehide.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('pagehide', flushPersisted);
    return () => window.removeEventListener('pagehide', flushPersisted);
  }, []);

  const setTheme = useCallback((t: ThemeKey) => setThemeState(t), []);
  const setHue = useCallback((h: HueKey) => setHueState(h), []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      hue,
      themeName: THEMES[theme].name,
      reducedMotion,
      setTheme,
      setHue,
    }),
    [theme, hue, reducedMotion, setTheme, setHue],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be used within a <ThemeProvider>');
  }
  return ctx;
}
