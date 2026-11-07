import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type ReactTabsState = {
  appJsx: boolean;
  componentsJsx: boolean;
  reactCss: boolean;
  console: boolean;
  output: boolean;
};

export const DEFAULT_REACT_TABS: ReactTabsState = {
  appJsx: true,
  componentsJsx: false,
  reactCss: false,
  console: true,
  output: false,
};

export const REACT_TAB_KEYS = Object.keys(DEFAULT_REACT_TABS) as (keyof ReactTabsState)[];

function parseSelectedTabs(value: string | null): ReactTabsState {
  if (!value) return { ...DEFAULT_REACT_TABS };
  const requested = new Set(
    value.split(',').filter((key) => (REACT_TAB_KEYS as string[]).includes(key)),
  );
  if (requested.size === 0) return { ...DEFAULT_REACT_TABS };
  const tabs = {
    appJsx: false,
    componentsJsx: false,
    reactCss: false,
    console: false,
    output: false,
  } as ReactTabsState;
  for (const key of REACT_TAB_KEYS) {
    tabs[key] = requested.has(key);
  }
  return tabs;
}

function serializeTabs(tabs: ReactTabsState): string {
  return REACT_TAB_KEYS.filter((key) => tabs[key]).join(',');
}

/**
 * The new query string for a `selectedTabs` change, keeping every OTHER param
 * that was already in the URL -- most importantly `?type=react`, the
 * session-type hint a freshly created React room relies on until its Postgres
 * row exists (see SessionRoute/useSessionType). Writing `?selectedTabs=...`
 * wholesale dropped it, so toggling a pane in a brand-new React room could
 * silently persist it as a Web session.
 *
 * Duplicated verbatim from useTabsQueryParam.ts (same reason parse/serialize
 * are: each hook owns its own tab-key set); see that copy for why the
 * selectedTabs part is concatenated rather than run through
 * URLSearchParams.toString().
 */
function buildSearch(currentSearch: string, serialized: string): string {
  const others = new URLSearchParams(currentSearch);
  others.delete('selectedTabs');
  const rest = others.toString();
  const parts = [serialized ? `selectedTabs=${serialized}` : '', rest].filter(Boolean);
  return parts.length ? `?${parts.join('&')}` : '';
}

export function useReactTabsQueryParam(): {
  tabs: ReactTabsState;
  setTabs: (tabs: ReactTabsState) => void;
  toggleTab: (key: keyof ReactTabsState) => void;
} {
  const location = useLocation();
  const navigate = useNavigate();
  const [tabs, setTabsState] = useState<ReactTabsState>(() =>
    parseSelectedTabs(new URLSearchParams(location.search).get('selectedTabs')),
  );

  useEffect(() => {
    setTabsState(parseSelectedTabs(new URLSearchParams(location.search).get('selectedTabs')));
    // Only re-derive from the URL on first mount / external navigation, not on every
    // location change caused by our own setTabs below (see its guard).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTabs = useCallback(
    (next: ReactTabsState) => {
      setTabsState(next);
      navigate(
        { pathname: location.pathname, search: buildSearch(location.search, serializeTabs(next)) },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  const toggleTab = useCallback(
    (key: keyof ReactTabsState) => {
      const openCount = REACT_TAB_KEYS.filter((k) => tabs[k]).length;
      if (tabs[key] && openCount === 1) return; // refuse to close the last open pane
      setTabs({ ...tabs, [key]: !tabs[key] });
    },
    [tabs, setTabs],
  );

  // --- Alt+1-5 pane shortcut ---------------------------------------------
  // Global keydown listener mapping Alt+1 through Alt+5 to toggling the
  // App.jsx/Components.jsx/CSS/Console/Output panes (in REACT_TAB_KEYS
  // order). Equivalent to useTabsQueryParam's own effect (see Task 8),
  // parameterized on this hook's own toggleTab/REACT_TAB_KEYS.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && /^Digit[1-5]$/.test(e.code)) {
        e.preventDefault();
        toggleTab(REACT_TAB_KEYS[+e.code.slice(5) - 1]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTab]);
  // -------------------------------------------------------------------------

  return { tabs, setTabs, toggleTab };
}
