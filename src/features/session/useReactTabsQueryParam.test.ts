import { describe, expect, test } from 'vitest';
import { renderHook, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { useReactTabsQueryParam, DEFAULT_REACT_TABS } from './useReactTabsQueryParam';

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

describe('useReactTabsQueryParam', () => {
  test('defaults to DEFAULT_REACT_TABS when there is no query param', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    expect(result.current.tabs).toEqual(DEFAULT_REACT_TABS);
  });

  test('parses a valid selectedTabs value', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=appJsx,reactCss'),
    });
    expect(result.current.tabs).toEqual({
      appJsx: true,
      componentsJsx: false,
      reactCss: true,
      console: false,
      output: false,
    });
  });

  test('ignores unrecognized keys in a malformed selectedTabs value instead of crashing', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=appJsx,bogus,'),
    });
    expect(result.current.tabs).toEqual({
      appJsx: true,
      componentsJsx: false,
      reactCss: false,
      console: false,
      output: false,
    });
  });

  test('falls back to DEFAULT_REACT_TABS when every key in selectedTabs is unrecognized', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), {
      wrapper: withRouter('/code/abc?selectedTabs=bogus,alsobogus'),
    });
    expect(result.current.tabs).toEqual(DEFAULT_REACT_TABS);
  });

  test('setTabs updates the query string', () => {
    const locationRef = { value: '' };
    const { result } = renderHook(() => useReactTabsQueryParam(), { wrapper: withRouter('/code/abc', locationRef) });
    act(() => {
      result.current.setTabs({
        appJsx: true,
        componentsJsx: true,
        reactCss: false,
        console: false,
        output: false,
      });
    });
    expect(locationRef.value).toContain('selectedTabs=appJsx,componentsJsx');
  });

  test('toggleTab refuses to close the last open pane', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    act(() => {
      // start from a state with exactly one pane open
      result.current.setTabs({
        appJsx: true,
        componentsJsx: false,
        reactCss: false,
        console: false,
        output: false,
      });
    });
    act(() => result.current.toggleTab('appJsx'));
    expect(result.current.tabs.appJsx).toBe(true);
  });

  test('toggleTab closes a pane normally when others remain open', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), { wrapper: withRouter('/code/abc') });
    // default tabs has appJsx+console open
    act(() => result.current.toggleTab('console'));
    expect(result.current.tabs.console).toBe(false);
  });

  // Equivalent of useTabsQueryParam's own relocated Alt+1-5 test (see Task
  // 8): this hook registers its own window keydown listener against its own
  // toggleTab/REACT_TAB_KEYS, independent of whichever header renders on top
  // of it.
  test('Alt+1-5 toggles the matching pane via a window keydown listener', () => {
    const { result } = renderHook(() => useReactTabsQueryParam(), { wrapper: withRouter('/code/abc') });

    // appJsx starts open (DEFAULT_REACT_TABS); Alt+2 opens componentsJsx.
    act(() => {
      fireEvent.keyDown(window, { code: 'Digit2', altKey: true });
    });
    expect(result.current.tabs.componentsJsx).toBe(true);

    act(() => {
      fireEvent.keyDown(window, { code: 'Digit5', altKey: true });
    });
    expect(result.current.tabs.output).toBe(true);
  });
});
