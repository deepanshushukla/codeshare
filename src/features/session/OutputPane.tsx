import { RotateCw } from 'lucide-react';
import OutputFrame from './OutputFrame';
import styles from './OutputPane.module.scss';

type OutputFrameProps = {
  html: string;
  css: string;
  js: string;
  runToken: number;
  onWindowReady: (win: Window | null) => void;
};

// Wraps the existing, unmodified OutputFrame (the sandboxed <iframe> -- see
// OutputFrame.tsx for the security rationale) with the 36px pane header the
// design handoff gives every pane: a glyph, a label, and (here) a reload
// button in place of the line-count/clear affordances the editor/console
// panes show. `onRun` is the same callback RunControls' Run button already
// calls (SessionWorkspace's handleRun, which bumps runToken) -- passed in
// rather than reimplemented, so "Run" and this reload button always do
// exactly the same thing.
//
// This component is ONLY for the visible, on-tab Output pane.
// SessionWorkspace's off-screen mount (which keeps the sandboxed iframe alive
// so Run/REPL work before the Output tab is ever opened) continues to render
// the bare OutputFrame directly -- there is no visible chrome to put a header
// on there, and that mount must stay exactly as it is.
export default function OutputPane({ onRun, ...frameProps }: OutputFrameProps & { onRun: () => void }) {
  return (
    <div className={styles.pane}>
      <div className={styles.header}>
        <span className={styles.glyph} style={{ color: 'oklch(0.78 0.15 150)' }}>
          ▶
        </span>
        <span>output</span>
        <button type="button" className={styles.reloadButton} title="Reload" aria-label="Reload" onClick={onRun}>
          <RotateCw size={13} />
        </button>
      </div>
      <div className={styles.frameHost}>
        <OutputFrame {...frameProps} />
        {frameProps.runToken === 0 && (
          <div className={styles.emptyState} aria-live="polite">
            <div>// Press Run or Ctrl + Enter.</div>
            <div>// Your HTML/CSS render here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
