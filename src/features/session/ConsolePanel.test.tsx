import { describe, expect, test, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
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

  test('echoes the submitted input as its own row before the result arrives', () => {
    const onRepl = vi.fn();
    render(<ConsolePanel onRepl={onRepl} />);
    const input = screen.getByLabelText('Console input');
    fireEvent.change(input, { target: { value: '1+1' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('1+1')).toBeInTheDocument();
    expect(onRepl).toHaveBeenCalledWith('1+1');
  });

  test('shows the empty-state copy when there are no entries, and clears entries on Clear', () => {
    render(<ConsolePanel onRepl={() => {}} />);
    expect(screen.getByText(/Press Run or Ctrl \+ Enter/)).toBeInTheDocument();
    fireEvent(window, new MessageEvent('message', { data: { type: 'console', level: 'warn', args: ['careful'] } }));
    expect(screen.getByText('careful')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.queryByText('careful')).not.toBeInTheDocument();
  });

  // Argument rendering used to be `typeof arg === 'string' ? arg :
  // JSON.stringify(arg)`, which degraded the REPL's two most common outcomes.
  describe('argument serialization', () => {
    function postResult(args: unknown[]) {
      act(() =>
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'console', level: 'result', args } })),
      );
    }

    test('an Error result renders "Error: <message>", not the empty object JSON.stringify produces', () => {
      // Error's name/message/stack are all non-enumerable, so
      // JSON.stringify(new Error('boom')) is "{}" -- `throw new Error('boom')`
      // used to render as a bare "× {}".
      render(<ConsolePanel onRepl={vi.fn()} />);
      postResult([new Error('boom')]);
      expect(screen.getByText('Error: boom')).toBeInTheDocument();
      expect(screen.queryByText('{}')).not.toBeInTheDocument();
    });

    test('an Error subclass keeps its own name', () => {
      render(<ConsolePanel onRepl={vi.fn()} />);
      postResult([new TypeError('x is not a function')]);
      expect(screen.getByText('TypeError: x is not a function')).toBeInTheDocument();
    });

    test('an undefined result renders the literal text "undefined", not a blank row', () => {
      // JSON.stringify(undefined) returns the *value* undefined (not a
      // string), which `.join(' ')` collapsed to '' -- so `let x = 5` and
      // every other undefined-valued statement rendered as an empty row
      // carrying nothing but the `←` glyph.
      render(<ConsolePanel onRepl={vi.fn()} />);
      postResult([undefined]);
      expect(screen.getByText('undefined')).toBeInTheDocument();
    });

    test('strings, numbers, null and plain objects are unchanged', () => {
      render(<ConsolePanel onRepl={vi.fn()} />);
      postResult(['plain', 42, null, { a: 1 }]);
      expect(screen.getByText('plain 42 null {"a":1}')).toBeInTheDocument();
    });
  });

  test('still caps entries at 500 after the restyle', () => {
    render(<ConsolePanel onRepl={() => {}} />);
    for (let i = 0; i < 520; i++) {
      fireEvent(window, new MessageEvent('message', { data: { type: 'console', level: 'log', args: [String(i)] } }));
    }
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.getByText('519')).toBeInTheDocument();
  });
});
