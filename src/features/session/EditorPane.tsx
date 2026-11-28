import { useEffect, useRef, useState } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorSelection, EditorState, Prec, type StateCommand } from '@codemirror/state';
import { indentLess, indentMore } from '@codemirror/commands';
import { basicSetup } from 'codemirror';
import { HighlightStyle, getIndentUnit, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import styles from './EditorPane.module.scss';

const LANGUAGE_EXTENSIONS = { html: html(), css: css(), javascript: javascript(), jsx: javascript({ jsx: true }) };

// File-type metadata (glyph + accent color + display filename), mirroring
// the design handoff's META map (design_handoff_codeshare, lines ~332-336).
// Derived locally from `language` rather than threaded through as props so
// existing call sites (SessionWorkspace.tsx) don't need to change.
const META: Record<keyof typeof LANGUAGE_EXTENSIONS, { file: string; glyph: string; color: string }> = {
  html: { file: 'index.html', glyph: '<>', color: 'oklch(0.74 0.15 40)' },
  css: { file: 'style.css', glyph: '{}', color: 'oklch(0.72 0.13 250)' },
  javascript: { file: 'script.js', glyph: 'JS', color: 'oklch(0.84 0.14 95)' },
  jsx: { file: 'App.jsx', glyph: 'JSX', color: 'oklch(0.74 0.15 220)' },
};

// Colors here are CSS custom properties (the --ed/--text/--acc/--tk-* design
// tokens from src/styles/tokens.scss) rather than literal hex values, so this
// follows the app's theming automatically -- no JS-side dark-mode detection
// needed, same as every other component.
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--ed)',
    color: 'var(--text)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'var(--font-mono)',
  },
  '.cm-content': {
    caretColor: 'var(--acc)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--acc)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--ed)',
    color: 'var(--faint)',
    opacity: '0.7',
    minWidth: '42px',
    border: 'none',
    borderRight: '1px solid var(--line)',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    // Subtle tint for the active line -- deliberately low-contrast (see
    // ConsolePanel.module.scss for the same color-mix-with-a-design-token
    // pattern used elsewhere in the new theme).
    backgroundColor: 'color-mix(in oklch, var(--bg3) 40%, transparent)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklch, var(--acc) 30%, transparent)',
  },
});

// Token mapping notes: the new design system has no dedicated token for
// operators/punctuation, plain property names, or type names/class names
// (unlike the old --color-syntax-operator/-property/-type trio). Closest
// sensible picks, by eye against the handoff's palette:
//   - operator/punctuation -> --text (same weight as prose, not called out)
//   - plain property name  -> --muted (secondary, but still legible)
//   - type name/class name -> --tk-attr (nearest existing "naming" accent)
const syntaxTheme = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--tk-com)', fontStyle: 'italic' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--tk-str)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--tk-num)' },
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.modifier],
    color: 'var(--tk-key)',
    fontWeight: 600,
  },
  { tag: [t.operator, t.punctuation], color: 'var(--text)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--tk-fn)' },
  { tag: [t.propertyName], color: 'var(--muted)' },
  { tag: [t.typeName, t.className], color: 'var(--tk-attr)' },
  { tag: [t.tagName], color: 'var(--tk-tag)' },
  { tag: [t.attributeName], color: 'var(--tk-attr)' },
  { tag: [t.invalid], color: '#e05252', textDecoration: 'underline wavy' },
]);

type Props = {
  title: string;
  language: keyof typeof LANGUAGE_EXTENSIONS;
  value: string;
  onChange: (value: string) => void;
  fileName?: string;
};

// Tab like most code editors: with a bare cursor, insert one indent unit of
// spaces *at the cursor* (CodeMirror's indentWithTab always indents the whole
// line, wherever the cursor is); with text selected, indent the selected
// lines. Shift+Tab always un-indents the lines.
const insertIndentAtCursor: StateCommand = ({ state, dispatch }) => {
  if (state.readOnly) return false;
  if (state.selection.ranges.some((range) => !range.empty)) return indentMore({ state, dispatch });
  const unit = state.facet(indentUnit);
  // A tab-based indentUnit inserts a tab character; otherwise pad with spaces
  // to the next multiple of the indent width (a "tab stop"), like VS Code.
  const width = getIndentUnit(state);
  dispatch(
    state.update(
      state.changeByRange((range) => {
        const line = state.doc.lineAt(range.head);
        const column = range.head - line.from;
        const insert = unit === '\t' ? '\t' : ' '.repeat(width - (column % width) || width);
        return { changes: { from: range.head, insert }, range: EditorSelection.cursor(range.head + insert.length) };
      }),
      { scrollIntoView: true, userEvent: 'input.indent' },
    ),
  );
  return true;
};

export default function EditorPane({ title, language, value, onChange, fileName }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // True only for the duration of the dispatch in the sync effect below, i.e.
  // while this pane is being *told* to display a new `value` (a remote edit
  // arriving over Realtime, or the session's existing content on first load).
  // CodeMirror's updateListener cannot otherwise tell that apart from the user
  // typing, and reporting it as a local edit is what made two people in one
  // room overwrite each other: B's pane echoed A's keystroke back as if B had
  // typed it (carrying B's userId, so useSession's self-echo guard let it
  // through), and loading existing content wrote that same content straight
  // back to Postgres.
  const applyingExternalValueRef = useRef(false);
  // Line count for the header's "N ln" readout. Initialized from the initial
  // `value` on mount, then kept live off the same updateListener that already
  // forwards local edits -- not a second listener -- so it reflects both local
  // typing and remote edits dispatched via the value-sync effect below (both
  // paths fire a transaction with docChanged: true).
  const [lineCount, setLineCount] = useState(() => value.split('\n').length);

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          // basicSetup leaves Tab to the browser (moves focus) for keyboard
          // accessibility; a code editor should indent instead (see
          // insertIndentAtCursor). CodeMirror still offers a way out: Esc
          // then Tab moves focus as usual.
          keymap.of([
            { key: 'Tab', run: insertIndentAtCursor },
            { key: 'Shift-Tab', run: indentLess },
          ]),
          // basicSetup binds Mod-Enter (Cmd on Mac, Ctrl elsewhere) to "insert
          // blank line", so the Run shortcut also edited the code. Claim both
          // combos here as no-ops: CodeMirror doesn't stop propagation for a
          // keymap binding, so the keydown still reaches RunControls' window
          // listener and runs the code -- it just no longer types anything.
          Prec.highest(
            keymap.of([
              { key: 'Mod-Enter', run: () => true },
              { key: 'Ctrl-Enter', run: () => true },
            ]),
          ),
          LANGUAGE_EXTENSIONS[language],
          editorTheme,
          syntaxHighlighting(syntaxTheme),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            setLineCount(update.state.doc.lines);
            if (applyingExternalValueRef.current) return;
            onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
    setLineCount(view.state.doc.lines);
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      // CodeMirror runs update listeners synchronously inside dispatch(), so
      // this flag is set for exactly this one transaction and nothing else.
      applyingExternalValueRef.current = true;
      try {
        view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
      } finally {
        applyingExternalValueRef.current = false;
      }
    }
  }, [value]);

  const meta = META[language];

  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.glyph} style={{ color: meta.color }}>
          {meta.glyph}
        </span>
        <span>{fileName ?? meta.file}</span>
        <span className={styles.lineCount}>{lineCount} ln</span>
      </div>
      <div ref={hostRef} className={styles.codeMirrorHost} />
      <textarea
        aria-label={`${title} editor`}
        className={styles.accessibleMirror}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
