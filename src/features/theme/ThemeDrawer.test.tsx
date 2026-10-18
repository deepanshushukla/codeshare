import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from './ThemeProvider';
import ThemeDrawer from './ThemeDrawer';

describe('ThemeDrawer', () => {
  // Matches the convention in ThemeProvider.test.tsx: setTheme/setHue trigger
  // writePersisted's debounced localStorage write (src/lib/persistedState.ts),
  // so fake timers keep that 400ms setTimeout from dangling past the test.
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('renders a card per theme and a swatch per hue, and calls setTheme/setHue on click', () => {
    render(
      <ThemeProvider>
        <ThemeDrawer open onClose={() => {}} />
      </ThemeProvider>,
    );

    // One card per THEMES key (abyss, paper, phosphor).
    expect(screen.getByRole('button', { name: /abyss/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /paper/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /phosphor/i })).toBeInTheDocument();

    // One swatch per HUES key (teal, aqua, jade, cyan).
    expect(screen.getByRole('button', { name: /^teal$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^aqua$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^jade$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^cyan$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /paper/i }));
    // Paper's card must preview with its OWN palette, not the (still-abyss)
    // active theme's -- clicking it calls setTheme, which re-applies the
    // palette for real onto documentElement. Same assertion shape as
    // ThemeProvider.test.tsx's "setTheme updates ... documentElement" test.
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('oklch(0.975 0.006 190)');

    fireEvent.click(screen.getByRole('button', { name: /^jade$/i }));
    // Now paper (light) + jade (160deg): --acc should reflect the new hue
    // under the light-theme palette formula.
    expect(document.documentElement.style.getPropertyValue('--acc')).toBe('oklch(0.72 0.13 160)');
  });

  it('closes on Escape and on scrim click', () => {
    const onEscapeClose = vi.fn();
    const { unmount } = render(
      <ThemeProvider>
        <ThemeDrawer open onClose={onEscapeClose} />
      </ThemeProvider>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onEscapeClose).toHaveBeenCalledTimes(1);
    unmount();

    const onScrimClose = vi.fn();
    render(
      <ThemeProvider>
        <ThemeDrawer open onClose={onScrimClose} />
      </ThemeProvider>,
    );
    // Radix's DismissableLayer registers its outside-pointerdown listener in
    // a setTimeout(0) on mount, and defers the actual dismiss dispatch to the
    // next "click" following a "pointerdown" -- advance the fake timer so
    // that listener is live, then replay that sequence on the scrim.
    act(() => {
      vi.advanceTimersByTime(0);
    });
    const dialog = screen.getByRole('dialog');
    const scrim = dialog.previousElementSibling as Element;
    fireEvent.pointerDown(scrim);
    fireEvent.click(scrim);
    expect(onScrimClose).toHaveBeenCalledTimes(1);
  });
});
