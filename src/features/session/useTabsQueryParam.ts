import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type TabsState = {
  html: boolean;
  css: boolean;
  js: boolean;
  console: boolean;
  output: boolean;
};

export const DEFAULT_TABS: TabsState = {
  html: false,
  css: false,
  js: true,
  console: true,
  output: false,
};

export const TAB_KEYS = Object.keys(DEFAULT_TABS) as (keyof TabsState)[];

function parseSelectedTabs(value: string | null): TabsState {
  if (!value) return { ...DEFAULT_TABS };
  const requested = new Set(value.split(',').filter((key) => (TAB_KEYS as string[]).includes(key)));
  if (requested.size === 0) return { ...DEFAULT_TABS };
  const tabs = { html: false, css: false, js: false, console: false, output: false } as TabsState;
  for (const key of TAB_KEYS) {
    tabs[key] = requested.has(key);
  }
  return tabs;
}

function serializeTabs(tabs: TabsState): string {
  return TAB_KEYS.filter((key) => tabs[key]).join(',');
}

export function useTabsQueryParam(): {
  tabs: TabsState;
  setTabs: (tabs: TabsState) => void;
  toggleTab: (key: keyof TabsState) => void;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabsState] = useState<TabsState>(() =>
    parseSelectedTabs(new URLSearchParams(location.search).get('selectedTabs')),
  );

  useEffect(() => {
    setTabsState(parseSelectedTabs(new URLSearchParams(location.search).get('selectedTabs')));
    // Only re-derive from the URL on first mount / external navigation, not on every
    // location change caused by our own setTabs below (see its guard).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTabs = useCallback(
    (next: TabsState) => {
      setTabsState(next);
      const serialized = serializeTabs(next);
      navigate(
        { pathname: location.pathname, search: serialized ? `?selectedTabs=${serialized}` : '' },
        { replace: true },
      );
    },
    [location.pathname, navigate],
  );

  const toggleTab = useCallback(
    (key: keyof TabsState) => {
      const openCount = TAB_KEYS.filter((k) => tabs[k]).length;
      if (tabs[key] && openCount === 1) return; // refuse to close the last open pane
      setTabs({ ...tabs, [key]: !tabs[key] });
    },
    [tabs, setTabs],
  );

  // --- Alt+1-5 pane shortcut ---------------------------------------------
  // Global keydown listener mapping Alt+1 through Alt+5 to toggling the
  // HTML/CSS/JS/Console/Output panes (in TAB_KEYS order). Relocated here from
  // Header.tsx (see Task 8) so it lives alongside the toggleTab it drives,
  // instead of depending on whichever header happens to render this hook's
  // caller.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && /^Digit[1-5]$/.test(e.code)) {
        e.preventDefault();
        toggleTab(TAB_KEYS[+e.code.slice(5) - 1]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTab]);
  // -------------------------------------------------------------------------

  return { tabs, setTabs, toggleTab };
}
