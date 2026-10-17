import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Users } from 'lucide-react';
import type { PresenceUser } from './usePresence';
import styles from './UsersMenu.module.scss';

type Props = {
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (name: string) => void;
};

export default function UsersMenu({ users, currentUserId, name, onNameChange }: Props) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Users in this session">
        <Users size={16} />
        <span className={styles.count}>{users.length}</span>
      </DropdownMenu.Trigger>
      {/* Radix renders Content into a portal with no styling of its own, so
          without a real surface here the menu is transparent text over the
          page -- see UsersMenu.module.scss / styles/_controls.scss. */}
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
