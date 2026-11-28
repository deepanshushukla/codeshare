import { afterEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import RunControls from './RunControls';

afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelectorAll('iframe').forEach((f) => f.remove());
});

describe('RunControls', () => {
  test('labels the shortcut with Cmd on a Mac', () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel', userAgentData: undefined });
    render(<RunControls onRun={() => {}} />);
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('title', 'Run (Cmd + Enter)');
    expect(screen.getByText('⌘↵')).toBeInTheDocument();
  });

  test('labels the shortcut with Ctrl elsewhere', () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'Win32', userAgentData: undefined });
    render(<RunControls onRun={() => {}} />);
    expect(screen.getByRole('button', { name: 'Run' })).toHaveAttribute('title', 'Run (Ctrl + Enter)');
  });

  test('Cmd+Enter runs, not only Ctrl+Enter', () => {
    const onRun = vi.fn();
    render(<RunControls onRun={onRun} />);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true }));
    });
    expect(onRun).toHaveBeenCalledOnce();
  });

  test('runs when the output iframe forwards the shortcut (focus was inside the preview)', () => {
    const onRun = vi.fn();
    render(<RunControls onRun={onRun} />);
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'run-shortcut' }, source: frame.contentWindow }));
    });
    expect(onRun).toHaveBeenCalledOnce();
  });

  test('ignores a run-shortcut message that did not come from a frame on this page', () => {
    const onRun = vi.fn();
    render(<RunControls onRun={onRun} />);
    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'run-shortcut' }, source: window }));
    });
    expect(onRun).not.toHaveBeenCalled();
  });
});
