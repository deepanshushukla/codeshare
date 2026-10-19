import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
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
});
