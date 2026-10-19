import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Users } from 'lucide-react';
import { avatarColorFor } from '../../lib/avatarColor';
import type { PresenceUser } from './usePresence';
import styles from './UsersMenu.module.scss';

type Props = {
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (name: string) => void;
  // ≥1100px: show the overlapping avatar stack instead of the compact
  // icon+count. Only the TRIGGER's appearance changes -- see the note on
  // the single shared Content below.
  isWide?: boolean;
};

// Beyond this the stack stops being readable at 26px a piece; the remainder
// becomes a "+N" chip (everyone is still listed in the dropdown).
const MAX_AVATARS = 4;

/**
 * Two letters for an avatar: the initials of the first two words when a
 * display name has them, otherwise the first two characters. Default presence
 * names look like `User_ab12`, which splits into two "words" here -- so the
 * default-named users in a room get distinguishable initials (UA, UB, ...)
 * rather than every one of them reading "US".
 */
export function avatarInitials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return (words[0] ?? '').slice(0, 2).toUpperCase() || '?';
}

function AvatarStack({ users, currentUserId, name }: Omit<Props, 'onNameChange' | 'isWide'>) {
  const shown = users.slice(0, MAX_AVATARS);
  const overflow = users.length - shown.length;

  return (
    <span className={styles.stack}>
      {shown.map((user) => {
        const isSelf = user.userId === currentUserId;
        // `name` is the live local value for yourself (presence echo can lag a
        // keystroke behind), exactly as the rename input below uses it.
        const label = isSelf ? name || user.name : user.name;
        const color = avatarColorFor(user.userId);
        return (
          <span
            key={user.userId}
            className={styles.avatar}
            data-status={user.status}
            // The current user is deliberately NOT given a hashed color: they
            // read as "you" by carrying the live theme accent.
            style={isSelf ? { background: 'var(--acc)', color: 'var(--acc-ink)' } : { background: color.bg, color: color.ink }}
          >
            {avatarInitials(label)}
          </span>
        );
      })}
      {overflow > 0 && <span className={`${styles.avatar} ${styles.overflow}`}>+{overflow}</span>}
    </span>
  );
}

export default function UsersMenu({ users, currentUserId, name, onNameChange, isWide = false }: Props) {
  // An empty stack would render as a blank 36px button (presence is empty for
  // the first moments after mount), so the compact trigger also covers that.
  const showAvatars = isWide && users.length > 0;

  return (
    <DropdownMenu.Root>
      {/* One Trigger with two appearances, never two Root/Content pairs: the
          rename inputs below are the only copy of that logic, so the
          ≥1100px avatar stack and the compact icon+count open the very same
          menu and renaming is reachable at every width (a plan-level
          requirement -- see the redesign plan's Global Constraints). */}
      <DropdownMenu.Trigger
        className={showAvatars ? styles.triggerAvatars : styles.trigger}
        aria-label="Users in this session"
        title={`${users.length} ${users.length === 1 ? 'person' : 'people'} here`}
      >
        {showAvatars ? (
          <AvatarStack users={users} currentUserId={currentUserId} name={name} />
        ) : (
          <>
            <Users size={16} />
            <span className={styles.count}>{users.length}</span>
          </>
        )}
      </DropdownMenu.Trigger>
      {/* Radix renders Content into a portal with no styling of its own, so
          without a real surface here the menu is transparent text over the
          page -- see UsersMenu.module.scss. */}
      <DropdownMenu.Content className={styles.content} sideOffset={6} align="end">
        {users.map((user) => (
          <DropdownMenu.Item key={user.userId} className={styles.item} onSelect={(e) => e.preventDefault()}>
            <input
              value={user.userId === currentUserId ? name : user.name}
              disabled={user.userId !== currentUserId}
              onChange={(e) => onNameChange(e.target.value)}
              // Radix's Menu primitive does roving-tabindex focus management and
              // typeahead search at the Content/Item level, which otherwise
              // intercepts arrow keys, letters, and Escape before they reach this
              // input. Stop propagation so normal text editing works.
              onKeyDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Display name${user.userId === currentUserId ? ' (yours)' : ''}`}
            />
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
