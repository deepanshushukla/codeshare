import { describe, expect, test } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useTabsQueryParam, DEFAULT_TABS } from './useTabsQueryParam';

// NB: kept as plain createElement calls (rather than JSX) so this spec file can
// stay a .ts file per the interface contract, instead of requiring .tsx.
//
// MemoryRouter keeps its history entirely in memory — it never calls the
// browser's history API, so window.location never changes in this test
// environment. A LocationProbe child reads the router's own location on each
// render and mirrors it into a ref the test can assert against.
function LocationProbe({ locationRef }: { locationRef: { value: string } }) {
  const location = useLocation();
  locationRef.value = `${location.pathname}${location.search}`;
  return null;
}

function withRouter(initialPath: string, locationRef: { value: string } = { value: '' }) {
  return ({ children }: { children: ReactNode }) =>
    createElement(
      MemoryRouter,
      { initialEntries: [initialPath] },
      createElement(LocationProbe, { locationRef }),
      children,
    );
}

describe('useTabsQueryParam', () => {
  test('defaults to DEFAULT_TABS when there is no query param', () => {
    const { result } = renderHook(() => useTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    expect(result.current.tabs).toEqual(DEFAULT_TABS);
  });

  test('parses a valid selectedTabs value', () => {
    const { result } = renderHook(() => useTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=html,css'),
    });
    expect(result.current.tabs).toEqual({ html: true, css: true, js: false, console: false, output: false });
  });

  test('ignores unrecognized keys in a malformed selectedTabs value instead of crashing', () => {
    const { result } = renderHook(() => useTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=html,bogus,'),
    });
    expect(result.current.tabs).toEqual({ html: true, css: false, js: false, console: false, output: false });
  });

  test('falls back to DEFAULT_TABS when every key in selectedTabs is unrecognized', () => {
    const { result } = renderHook(() => useTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=bogus,alsobogus'),
    });
    expect(result.current.tabs).toEqual(DEFAULT_TABS);
  });

  test('setTabs updates the query string', () => {
    const locationRef = { value: '' };
    const { result } = renderHook(() => useTabsQueryParam(), { wrapper: withRouter('/code/abc', locationRef) });
    act(() => {
      result.current.setTabs({ html: true, css: true, js: false, console: false, output: false });
    });
    expect(locationRef.value).toContain('selectedTabs=html,css');
  });

  test('toggleTab refuses to close the last open pane', () => {
    const { result } = renderHook(() => useTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    act(() => {
      // start from a state with exactly one pane open
      result.current.setTabs({ html: false, css: false, js: true, console: false, output: false });
    });
    act(() => result.current.toggleTab('js'));
    expect(result.current.tabs.js).toBe(true);
  });

  test('toggleTab closes a pane normally when others remain open', () => {
    const { result } = renderHook(() => useTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    // default tabs has js+console open
    act(() => result.current.toggleTab('console'));
    expect(result.current.tabs.console).toBe(false);
  });
});
