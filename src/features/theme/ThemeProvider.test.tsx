import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider';

function Probe() {
  const { theme, hue, themeName, setTheme, setHue } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="hue">{hue}</span>
      <span data-testid="name">{themeName}</span>
      <button onClick={() => setTheme('paper')}>paper</button>
      <button onClick={() => setHue('jade')}>jade</button>
    </div>
  );
}

describe('ThemeProvider / useTheme', () => {
  // writePersisted (src/lib/persistedState.ts) debounces its actual localStorage
  // write by 400ms via a module-level setTimeout. Using fake timers for every
  // test -- even ones that don't assert on persistence -- keeps any setTheme/
  // setHue call from leaving a real pending timeout dangling across tests,
  // matching the convention in src/lib/persistedState.test.ts.
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('defaults to abyss/teal when nothing is persisted', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('abyss');
    expect(screen.getByTestId('hue')).toHaveTextContent('teal');
    expect(screen.getByTestId('name')).toHaveTextContent('Abyss');
  });

  it('restores a persisted theme/hue on mount', () => {
    localStorage.setItem('codeshare.v2', JSON.stringify({ theme: 'phosphor', hue: 'cyan' }));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('phosphor');
  });

  it('falls back to defaults for an unknown persisted theme value', () => {
    localStorage.setItem('codeshare.v2', JSON.stringify({ theme: 'nope' }));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('abyss');
  });

  it('setTheme updates state, the documentElement CSS vars, and useTheme() throws outside the provider', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('paper'));
    expect(screen.getByTestId('theme')).toHaveTextContent('paper');
    expect(document.documentElement.style.getPropertyValue('--bg')).toBe('oklch(0.975 0.006 190)');
    expect(() => render(<Probe />)).toThrow();
  });

  it('setHue updates state and re-applies the palette for the current theme', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('jade'));
    expect(screen.getByTestId('hue')).toHaveTextContent('jade');
    // abyss (dark, non-black) + jade (160deg): --acc should reflect the new hue.
    expect(document.documentElement.style.getPropertyValue('--acc')).toBe('oklch(0.82 0.14 160)');
  });

  it('persists theme/hue changes so a later mount restores them', () => {
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByText('paper'));
    fireEvent.click(screen.getByText('jade'));
    // writePersisted debounces the actual localStorage write by 400ms.
    act(() => {
      vi.advanceTimersByTime(400);
    });
    unmount();

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme')).toHaveTextContent('paper');
    expect(screen.getByTestId('hue')).toHaveTextContent('jade');
  });

  it('falls back to defaults for an unknown persisted hue value', () => {
    localStorage.setItem('codeshare.v2', JSON.stringify({ hue: 'magenta' }));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('hue')).toHaveTextContent('teal');
  });

  it('reacts to the OS prefers-reduced-motion setting changing after mount', () => {
    const listeners: Array<(event: { matches: boolean }) => void> = [];
    const mql = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: (type: string, cb: (event: { matches: boolean }) => void) => {
        if (type === 'change') listeners.push(cb);
      },
      removeEventListener: vi.fn(),
    };
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(document.documentElement.style.getPropertyValue('--play')).toBe('running');

    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });
    expect(document.documentElement.style.getPropertyValue('--play')).toBe('paused');

    window.matchMedia = original;
  });

  it('does not crash when matchMedia is unsupported', () => {
    const original = window.matchMedia;
    // @ts-expect-error -- simulating an environment without matchMedia
    delete window.matchMedia;

    expect(() =>
      render(
        <ThemeProvider>
          <Probe />
        </ThemeProvider>,
      ),
    ).not.toThrow();

    window.matchMedia = original;
  });
});
