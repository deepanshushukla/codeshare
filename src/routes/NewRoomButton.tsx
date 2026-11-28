import { useState, type FormEvent } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Atom, Code2, Plus, X } from 'lucide-react';
import type { SessionType } from '../features/session/sessionType';
import { generateSessionId } from '../lib/randomId';
import styles from './NewRoomButton.module.scss';

const NAME_MAX = 80;

const TYPES: { type: SessionType; label: string; hint: string; Icon: typeof Code2 }[] = [
  { type: 'web', label: 'Web', hint: 'HTML, CSS & JS', Icon: Code2 },
  { type: 'react', label: 'React', hint: 'JSX components', Icon: Atom },
];

/**
 * "New room" on My Rooms. Opens a small panel: an optional name (focused, so
 * a name is one keystroke away) and Web/React. Enter creates the room right
 * away, so skipping the name costs nothing; without one the room is named
 * from its code. Lands straight in the new room's editor. Same URL shape as
 * the landing page (`?type=react` hint, explicit `private=0`); the name
 * travels in router state, never in the shareable URL.
 */
export default function NewRoomButton({ className }: { className: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<SessionType>('web');

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setName('');
  }

  function create(event?: FormEvent) {
    event?.preventDefault();
    const params = [type === 'react' ? 'type=react' : null, 'private=0'].filter(Boolean).join('&');
    const roomName = name.trim();
    navigate(`/code/${generateSessionId()}?${params}`, { state: roomName ? { roomName } : null });
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger className={className}>
        <Plus size={16} aria-hidden="true" />
        New room
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content} aria-describedby={undefined}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>New room</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <X size={16} aria-hidden="true" />
            </Dialog.Close>
          </div>

          <form className={styles.form} onSubmit={create}>
            <label className={styles.field}>
              <span className={styles.label}>
                Name <span className={styles.optional}>optional</span>
              </span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={NAME_MAX}
                placeholder="e.g. Snake game"
                autoComplete="off"
                autoFocus
              />
            </label>

            <div className={styles.types} role="radiogroup" aria-label="Room type">
              {TYPES.map(({ type: value, label, hint, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={type === value}
                  className={styles.type}
                  onClick={() => setType(value)}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className={styles.typeText}>
                    <span className={styles.typeLabel}>{label}</span>
                    <span className={styles.typeHint}>{hint}</span>
                  </span>
                </button>
              ))}
            </div>

            <button type="submit" className={styles.submit}>
              {name.trim() ? 'Create room' : 'Skip & create'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <p className={styles.note}>No name? We&rsquo;ll name it from your code. Press Enter to go.</p>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
