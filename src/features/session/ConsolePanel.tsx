import { useEffect, useState, type KeyboardEvent } from 'react';
import type { ConsoleEntry, SandboxMessage } from '../../lib/sandbox';
import styles from './ConsolePanel.module.scss';

let nextId = 0;

// The iframe this panel listens to runs code any participant can edit, so the
// message volume is adversary-controlled: `setInterval(() => console.log(x))`
// in a collaborator's JS would otherwise grow this array (and the rendered
// DOM) without bound until the host tab locks up. Keep a bounded tail --
// enough scrollback to be useful, small enough that a runaway loop costs a
// constant amount of memory and render work.
export const MAX_CONSOLE_ENTRIES = 500;

function appendCapped(entries: ConsoleEntry[], entry: ConsoleEntry): ConsoleEntry[] {
  const next = entries.length < MAX_CONSOLE_ENTRIES ? entries : entries.slice(entries.length - MAX_CONSOLE_ENTRIES + 1);
  return [...next, entry];
}

// Listens for postMessage traffic from the sandboxed output iframe (see
// sandbox.ts / OutputFrame.tsx) and renders it. There is no eval() or other
// dynamic code execution here -- this component only reads plain data
// objects off `MessageEvent.data` and renders their string/JSON
// representation as text.
//
// The REPL input below does not execute anything itself either: on Enter
// it calls `onRepl`, which the parent (SessionWorkspace) forwards via
// postMessage to the sandboxed iframe's own `eval` (inside the bridge
// script in sandbox.ts) -- the only place user code ever runs.
export default function ConsolePanel({ onRepl }: { onRepl: (code: string) => void }) {
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      const data = event.data as SandboxMessage | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'console') {
        setEntries((prev) => appendCapped(prev, { id: String(nextId++), level: data.level, args: data.args }));
      } else if (data.type === 'runtime-error') {
        setEntries((prev) => appendCapped(prev, { id: String(nextId++), level: 'error', args: [data.message] }));
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function handleKeyUp(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && input.trim()) {
      onRepl(input);
      setInput('');
    }
  }

  return (
    <div className={styles.console}>
      <div className={styles.title}>Console</div>
      <input
        aria-label="Console input"
        className={styles.input}
        placeholder="Type JS and press Enter to run it here…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyUp={handleKeyUp}
      />
      <div className={styles.entries}>
        {entries.map((entry) => (
          <div key={entry.id} className={styles[entry.level]}>
            {entry.args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}
          </div>
        ))}
      </div>
    </div>
  );
}
