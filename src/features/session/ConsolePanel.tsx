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

// 'input' is a local-only echo of what the user typed into the REPL -- it is
// never sent by the sandbox bridge (see sandbox.ts), so it is not part of
// ConsoleEntry['level']. It's appended through the same appendCapped() path
// as every bridge-sourced entry so it counts toward, and is capped by, the
// same 500-entry limit as everything else.
type DisplayEntry = { id: string; level: ConsoleEntry['level'] | 'input'; args: unknown[] };

function appendCapped(entries: DisplayEntry[], entry: DisplayEntry): DisplayEntry[] {
  const next = entries.length < MAX_CONSOLE_ENTRIES ? entries : entries.slice(entries.length - MAX_CONSOLE_ENTRIES + 1);
  return [...next, entry];
}

const LEVEL_GLYPH: Record<DisplayEntry['level'], string> = {
  log: '',
  info: 'i',
  warn: '!',
  error: '×',
  input: '❯',
  result: '←',
};

// Maps a level to its CSS module class. Deliberately not a bare
// `styles[entry.level]` index: the module also has an unrelated `.input`
// class for the REPL textarea itself, so the 'input' *level* is styled via
// `.echo` instead to avoid colliding with that class name.
const LEVEL_CLASS: Record<DisplayEntry['level'], string> = {
  log: styles.log,
  info: styles.info,
  warn: styles.warn,
  error: styles.error,
  input: styles.echo,
  result: styles.outcome,
};

// Listens for postMessage traffic from the sandboxed output iframe (see
// sandbox.ts / OutputFrame.tsx) and renders it. There is no eval() or other
// dynamic code execution here -- this component only reads plain data
// objects off `MessageEvent.data` and renders their string/JSON
// representation as text.
//
// The REPL input below does not execute anything itself either: on Enter
// it calls `onRepl`, which the parent (SessionWorkspace) forwards via
// postMessage to the sandboxed iframe's own `eval` (inside the bridge
// script in sandbox.ts) -- the only place user code ever runs. The entry it
// adds locally for the typed command ('input' level) is purely cosmetic
// echo text, not anything that gets executed in this window.
export default function ConsolePanel({ onRepl }: { onRepl: (code: string) => void }) {
  const [entries, setEntries] = useState<DisplayEntry[]>([]);
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

  function submit() {
    const code = input;
    if (!code.trim()) return;
    setEntries((prev) => appendCapped(prev, { id: String(nextId++), level: 'input', args: [code] }));
    onRepl(code);
    setInput('');
  }

  // Enter submits (preventDefault before the textarea inserts its own
  // newline); Shift+Enter inserts a newline, like Chrome DevTools' console.
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Grows with content up to a cap, rather than scrolling a single line or
  // taking over the whole panel on a long paste.
  const rows = Math.min(Math.max(input.split('\n').length, 1), 8);

  return (
    <div className={styles.console}>
      <div className={styles.title}>
        <span className={styles.titleLabel}>❯_ console {entries.length}</span>
        <button type="button" className={styles.clearButton} onClick={() => setEntries([])}>
          clear
        </button>
      </div>
      <div className={styles.entries}>
        {entries.length === 0 ? (
          <div className={styles.empty}>
            <div>// Press Run or Ctrl + Enter.</div>
            <div>// Logs from your code land here.</div>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`${styles.entry} ${LEVEL_CLASS[entry.level]}`}>
              <span className={styles.glyph}>{LEVEL_GLYPH[entry.level]}</span>
              <span className={styles.text}>
                {entry.args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg))).join(' ')}
              </span>
            </div>
          ))
        )}
      </div>
      <textarea
        aria-label="Console input"
        className={styles.input}
        placeholder="Type JS and press Enter to run it, Shift+Enter for a new line…"
        rows={rows}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
