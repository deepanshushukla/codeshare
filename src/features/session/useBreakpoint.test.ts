import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useBreakpoint } from './useBreakpoint';

function mockMatchMedia(matchesFor: (query: string) => boolean) {
  const listeners = new Map<string, Set<() => void>>();
  window.matchMedia = vi.fn((query: string) => {
    const set = listeners.get(query) ?? new Set();
    listeners.set(query, set);
    return {
      matches: matchesFor(query),
      media: query,
      addEventListener: (_: string, cb: () => void) => set.add(cb),
      removeEventListener: (_: string, cb: () => void) => set.delete(cb),
    } as unknown as MediaQueryList;
  });
  return { fire: (query: string) => listeners.get(query)?.forEach((cb) => cb()) };
}

describe('useBreakpoint', () => {
  it('reports isMobile under 760px and isWide at/above 1100px', () => {
    mockMatchMedia((q) => q.includes('max-width'));
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current).toEqual({ isMobile: true, isWide: false });
  });

  it('updates when the viewport crosses a breakpoint', () => {
    let wide = false;
    const { fire } = mockMatchMedia((q) => (q.includes('min-width') ? wide : false));
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isWide).toBe(false);
    wide = true;
    act(() => fire('(min-width: 1100px)'));
    expect(result.current.isWide).toBe(true);
  });
});
