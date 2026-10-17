import { describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConsolePanel, { MAX_CONSOLE_ENTRIES } from './ConsolePanel';

function postConsoleMessage(text: string) {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type: 'console', level: 'log', args: [text] } }),
  );
}

describe('ConsolePanel', () => {
  test('renders messages relayed from the sandboxed iframe', () => {
    render(<ConsolePanel onRepl={vi.fn()} />);
    act(() => postConsoleMessage('hello from the sandbox'));
    expect(screen.getByText('hello from the sandbox')).toBeInTheDocument();
  });

  test('caps retained entries so a runaway loop cannot grow state without bound', () => {
    render(<ConsolePanel onRepl={vi.fn()} />);
    const flood = MAX_CONSOLE_ENTRIES + 120;
    act(() => {
      for (let i = 0; i < flood; i++) postConsoleMessage(`line ${i}`);
    });

    // Collaborator-authored code runs in the iframe, so message volume is
    // adversary-controlled: `setInterval(() => console.log(x))` used to grow
    // this array (and the DOM) until the host tab locked up.
    expect(screen.getAllByText(/^line \d+$/)).toHaveLength(MAX_CONSOLE_ENTRIES);
    expect(screen.getByText(`line ${flood - 1}`)).toBeInTheDocument();
    expect(screen.queryByText('line 0')).not.toBeInTheDocument();
  });

  test('sends REPL input to the parent on Enter', async () => {
    const onRepl = vi.fn();
    render(<ConsolePanel onRepl={onRepl} />);
    const input = screen.getByLabelText('Console input');
    await userEvent.type(input, '1 + 1{Enter}');
    expect(onRepl).toHaveBeenCalledWith('1 + 1');
  });

  test('Shift+Enter inserts a newline instead of submitting, like DevTools', async () => {
    const onRepl = vi.fn();
    render(<ConsolePanel onRepl={onRepl} />);
    const input = screen.getByLabelText('Console input') as HTMLTextAreaElement;
    await userEvent.type(input, 'line1{Shift>}{Enter}{/Shift}line2');
    expect(onRepl).not.toHaveBeenCalled();
    expect(input.value).toBe('line1\nline2');

    // A plain Enter after that still submits the whole multi-line input.
    await userEvent.type(input, '{Enter}');
    expect(onRepl).toHaveBeenCalledWith('line1\nline2');
    expect(input.value).toBe('');
  });
});
