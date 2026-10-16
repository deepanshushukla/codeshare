import { useEffect, useState } from 'react';
import type { ConsoleEntry, SandboxMessage } from '../../lib/sandbox';
import styles from './ConsolePanel.module.scss';

let nextId = 0;

// Listens for postMessage traffic from the sandboxed output iframe (see
// sandbox.ts / OutputFrame.tsx) and renders it. There is no eval() or other
// dynamic code execution here -- this component only reads plain data
// objects off `MessageEvent.data` and renders their string/JSON
// representation as text.
export default function ConsolePanel() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const data = event.data as SandboxMessage | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'console') {
        setEntries((prev) => [...prev, { id: String(nextId++), level: data.level, args: data.args }]);
      } else if (data.type === 'runtime-error') {
        setEntries((prev) => [...prev, { id: String(nextId++), level: 'error', args: [data.message] }]);
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className={styles.console}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles[entry.level]}>
          {entry.args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}
        </div>
      ))}
    </div>
  );
}
