import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useToast } from './useToast';

describe('useToast', () => {
  it('shows a message and clears it after 2s', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('Room link copied'));
    expect(result.current.message).toBe('Room link copied');
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.message).toBeNull();
    vi.useRealTimers();
  });

  it('clears pending timer when showing a new toast', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current.showToast('First toast'));
    expect(result.current.message).toBe('First toast');
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.showToast('Second toast'));
    expect(result.current.message).toBe('Second toast');
    act(() => vi.advanceTimersByTime(1000));
    // Message should still be visible because we reset the timer
    expect(result.current.message).toBe('Second toast');
    act(() => vi.advanceTimersByTime(1000));
    // Now it should be cleared
    expect(result.current.message).toBeNull();
    vi.useRealTimers();
  });
});
