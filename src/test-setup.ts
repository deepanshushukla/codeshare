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
