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
      const serialized = serializeTabs(next);
      navigate(
        { pathname: location.pathname, search: serialized ? `?selectedTabs=${serialized}` : '' },
        { replace: true },
      );
    },
    [location.pathname, navigate],
  );

  const toggleTab = useCallback(
    (key: keyof ReactTabsState) => {
      const openCount = REACT_TAB_KEYS.filter((k) => tabs[k]).length;
      if (tabs[key] && openCount === 1) return; // refuse to close the last open pane
      setTabs({ ...tabs, [key]: !tabs[key] });
    },
    [tabs, setTabs],
  );

  return { tabs, setTabs, toggleTab };
}
