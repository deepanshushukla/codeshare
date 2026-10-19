import { useCallback, useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import styles from './RunControls.module.scss';

// The Run button and its Ctrl/Cmd+Enter shortcut. Both paths just call
// `onRun`, which the parent (SessionWorkspace) turns into bumping
// `runToken` -- there is no code execution here at all, dynamic or
// otherwise. The actual user JS only ever runs inside the sandboxed
// <iframe> built in sandbox.ts / OutputFrame.tsx.
export default function RunControls({ onRun }: { onRun: () => void }) {
  // The flash is a one-shot sweep across the button. `flashing` mounts the
  // overlay and `onAnimationEnd` unmounts it again; `flashKey` exists so a
  // second click *while the first sweep is still running* remounts the
  // overlay (a React key change) and restarts the animation, which merely
  // re-setting `flashing` to true could not do. Deliberately no setTimeout:
  // there is no timer to leak or to clear on unmount, and under
  // prefers-reduced-motion motion.scss collapses the animation to ~0ms, so
  // animationend still fires. (One-shot animation => it must NOT wire
  // `animation-play-state: var(--play)`; see src/styles/motion.scss.)
  const [flashing, setFlashing] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const handleRun = useCallback(() => {
    setFlashKey((k) => k + 1);
    setFlashing(true);
    onRun();
  }, [onRun]);

  // Ctrl/Cmd+Enter goes through handleRun, not onRun directly: the keyboard is
  // the more frequent path, and it needs the same visual confirmation that the
  // run fired as a click gets.
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRun();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [handleRun]);

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleRun}
      aria-label="Run"
      title="Run (Ctrl+Enter)"
    >
      {flashing && (
        <span
          key={flashKey}
          data-run-flash
          aria-hidden="true"
          className={styles.flash}
          onAnimationEnd={() => setFlashing(false)}
        />
      )}
      <Play size={12} className={styles.icon} />
      <span className={styles.label}>Run</span>
      {/* CSS-hidden below 760px; `⌃↵` is noise on a touch device anyway. */}
      <span className={styles.hint}>&#8963;&crarr;</span>
    </button>
  );
}
