import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import EditorPane from './EditorPane';

const onChange = vi.fn();

beforeEach(() => {
  onChange.mockClear();
});

function codeMirrorView(): EditorView {
  // The CodeMirror host is the only non-title, non-textarea child of the pane.
  const host = document.querySelector('.cm-editor');
  const view = host instanceof HTMLElement ? EditorView.findFromDOM(host) : null;
  if (!view) throw new Error('no CodeMirror view mounted');
  return view;
}

describe('EditorPane', () => {
  test('does not report a change when the value prop is updated externally', () => {
    const { rerender } = render(<EditorPane title="JS" language="javascript" value="first" onChange={onChange} />);
    expect(codeMirrorView().state.doc.toString()).toBe('first');
    onChange.mockClear();

    // Simulates a remote edit arriving over Realtime (or the session's stored
    // content landing after the initial load): the parent re-renders with a
    // new `value`, the pane dispatches it into CodeMirror to display it.
    rerender(<EditorPane title="JS" language="javascript" value="remote edit" onChange={onChange} />);

    expect(codeMirrorView().state.doc.toString()).toBe('remote edit');
    // Reporting this back as a local edit is C2: it made B re-broadcast A's
    // keystroke under B's own id (defeating the self-echo guard, so the two
    // clients overwrote each other) and wrote freshly-loaded content straight
    // back to Postgres on mount.
    expect(onChange).not.toHaveBeenCalled();
  });

  test('reports a genuine edit made in the editor', () => {
    render(<EditorPane title="JS" language="javascript" value="a" onChange={onChange} />);
    onChange.mockClear();

    // A user-originated transaction, i.e. not driven by the value prop.
    const view = codeMirrorView();
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'b' }, userEvent: 'input.type' });

    expect(onChange).toHaveBeenCalledWith('ab');
  });

  test('reports typing into the accessible mirror textarea', async () => {
    render(<EditorPane title="JS" language="javascript" value="" onChange={onChange} />);
    const textarea = screen.getByLabelText('JS editor');
    textarea.focus();
    await userEvent.type(textarea, 'z', { skipClick: true });
    expect(onChange).toHaveBeenCalledWith('z');
  });

  test('shows the file glyph, filename, and a live line count', () => {
    render(<EditorPane title="JS" language="javascript" value={'a\nb\nc'} onChange={() => {}} />);
    expect(screen.getByText('script.js')).toBeInTheDocument();
    expect(screen.getByText('3 ln')).toBeInTheDocument();
  });

  test('updates the line count live as the user types', () => {
    render(<EditorPane title="JS" language="javascript" value="a" onChange={onChange} />);
    expect(screen.getByText('1 ln')).toBeInTheDocument();

    const view = codeMirrorView();
    act(() => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: '\nb\nc' }, userEvent: 'input.type' });
    });

    expect(screen.getByText('3 ln')).toBeInTheDocument();
  });

  test('updates the line count when the value prop changes remotely', () => {
    const { rerender } = render(<EditorPane title="JS" language="javascript" value="a" onChange={onChange} />);
    expect(screen.getByText('1 ln')).toBeInTheDocument();

    rerender(<EditorPane title="JS" language="javascript" value={'a\nb\nc\nd'} onChange={onChange} />);

    expect(screen.getByText('4 ln')).toBeInTheDocument();
  });

  test('renders a jsx-language pane with JSX syntax support', () => {
    render(<EditorPane title="App" language="jsx" value="function App() { return <div />; }" onChange={() => {}} />);
    // assert no throw / pane renders — CodeMirror's javascript({jsx:true}) extension accepts JSX syntax that plain javascript() would mark invalid.
  });

  test('fileName prop overrides the default displayed filename', () => {
    render(<EditorPane title="App" language="jsx" fileName="App.jsx" value="" onChange={() => {}} />);
    expect(screen.getByText('App.jsx')).toBeInTheDocument();
  });

  test('omitting fileName keeps the existing default for an unaffected language', () => {
    render(<EditorPane title="JS" language="javascript" value="" onChange={() => {}} />);
    expect(screen.getByText('script.js')).toBeInTheDocument();
  });
  describe('keyboard', () => {
    function press(view: EditorView, init: KeyboardEventInit): { handled: boolean; event: KeyboardEvent } {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      return { handled: runScopeHandlers(view, event, 'editor'), event };
    }

    test('Tab indents the current line instead of moving focus out of the editor', () => {
      render(<EditorPane title="JS" language="javascript" value="let a = 1;" onChange={onChange} />);
      const view = codeMirrorView();
      view.dispatch({ selection: { anchor: 0 } });
      const { handled } = press(view, { key: 'Tab' });
      expect(handled).toBe(true);
      expect(view.state.doc.toString()).toMatch(/^\s+let a = 1;$/);
    });

    test('Tab inserts the indent at the cursor, not at the start of the line', () => {
      render(<EditorPane title="JS" language="javascript" value="let a=1;" onChange={onChange} />);
      const view = codeMirrorView();
      view.dispatch({ selection: { anchor: 4 } }); // between "let " and "a=1;" -- on a tab stop
      expect(press(view, { key: 'Tab' }).handled).toBe(true);
      expect(view.state.doc.toString()).toBe('let   a=1;');
      expect(view.state.selection.main.head).toBe(6);
    });

    test('Tab off a tab stop pads to the next one (2-space indent), like VS Code', () => {
      render(<EditorPane title="JS" language="javascript" value="let a=1;" onChange={onChange} />);
      const view = codeMirrorView();
      view.dispatch({ selection: { anchor: 5 } }); // column 5 -> next stop is column 6
      press(view, { key: 'Tab' });
      expect(view.state.doc.toString()).toBe('let a =1;');
      expect(view.state.selection.main.head).toBe(6);
    });

    test('Tab with a multi-line selection indents every selected line', () => {
      render(<EditorPane title="JS" language="javascript" value={'a;\nb;'} onChange={onChange} />);
      const view = codeMirrorView();
      view.dispatch({ selection: { anchor: 0, head: 4 } });
      expect(press(view, { key: 'Tab' }).handled).toBe(true);
      expect(view.state.doc.toString()).toBe('  a;\n  b;');
    });

    test('Shift+Tab un-indents', () => {
      render(<EditorPane title="JS" language="javascript" value={'  let a = 1;'} onChange={onChange} />);
      const view = codeMirrorView();
      view.dispatch({ selection: { anchor: 4 } });
      expect(press(view, { key: 'Tab', shiftKey: true }).handled).toBe(true);
      expect(view.state.doc.toString()).toBe('let a = 1;');
    });

    test.each([
      ['Ctrl+Enter', { ctrlKey: true }],
      ['Cmd+Enter', { metaKey: true }],
    ])('%s does not insert a line, and is left to bubble up to the Run shortcut', (_label, mods) => {
      render(<EditorPane title="JS" language="javascript" value="let a = 1;" onChange={onChange} />);
      const view = codeMirrorView();
      view.dispatch({ selection: { anchor: 10 } });
      const { event } = press(view, { key: 'Enter', ...mods });
      expect(view.state.doc.toString()).toBe('let a = 1;');
      expect(event.cancelBubble).toBe(false);
    });
  });
});
