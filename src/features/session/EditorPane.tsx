import { useEffect, useRef } from 'react';
import { EditorView, keymap } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import styles from './EditorPane.module.scss';

const LANGUAGE_EXTENSIONS = { html: html(), css: css(), javascript: javascript() };

type Props = {
  title: string;
  language: keyof typeof LANGUAGE_EXTENSIONS;
  value: string;
  onChange: (value: string) => void;
};

export default function EditorPane({ title, language, value, onChange }: Props) {
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

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          keymap.of(defaultKeymap),
          LANGUAGE_EXTENSIONS[language],
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (applyingExternalValueRef.current) return;
            onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: hostRef.current,
    });
    viewRef.current = view;
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

  return (
    <div className={styles.pane}>
      <div className={styles.title}>{title}</div>
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
