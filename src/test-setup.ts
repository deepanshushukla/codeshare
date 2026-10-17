import '@testing-library/jest-dom/vitest';

// jsdom does not implement ResizeObserver, but react-resizable-panels'
// Group component observes its own size on mount. Without this stub, any
// test that renders a Group/Panel crashes with "n is not a constructor".
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// jsdom does not implement window.matchMedia, but code under test may use it
// to detect user preferences (e.g., prefers-reduced-motion, prefers-color-scheme).
// Without this stub, any test that calls window.matchMedia crashes.
if (typeof globalThis.matchMedia === 'undefined') {
  class MediaQueryListStub implements MediaQueryList {
    matches = false;
    media = '';
    private listeners: MediaQueryListListener[] = [];

    constructor(query: string) {
      this.media = query;
    }

    addListener(listener: MediaQueryListListener) {
      this.addEventListener('change', listener as EventListener);
    }

    removeListener(listener: MediaQueryListListener) {
      this.removeEventListener('change', listener as EventListener);
    }

    addEventListener(type: string, listener: EventListener) {
      if (type === 'change') {
        this.listeners.push(listener as MediaQueryListListener);
      }
    }

    removeEventListener(type: string, listener: EventListener) {
      if (type === 'change') {
        this.listeners = this.listeners.filter(l => l !== listener);
      }
    }

    dispatchEvent(event: Event): boolean {
      return true;
    }
  }

  globalThis.matchMedia = (query: string) => {
    return new MediaQueryListStub(query);
  };
}
