import { useEffect } from 'react';
import { Play } from 'lucide-react';
import styles from './RunControls.module.scss';

// The Run button and its Ctrl/Cmd+Enter shortcut. Both paths just call
// `onRun`, which the parent (SessionWorkspace) turns into bumping
// `runToken` -- there is no code execution here at all, dynamic or
// otherwise. The actual user JS only ever runs inside the sandboxed
// <iframe> built in sandbox.ts / OutputFrame.tsx.
export default function RunControls({ onRun }: { onRun: () => void }) {
  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onRun();
      }
    }
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [onRun]);

  return (
    <button type="button" className={styles.button} onClick={onRun} aria-label="Run">
      <Play size={14} /> Run <span className={styles.shortcut}>(Ctrl+&crarr;)</span>
    </button>
  );
}
