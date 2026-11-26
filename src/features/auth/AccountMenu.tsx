import { useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link } from 'react-router-dom';
import { useAuthUser } from './useAuthUser';
import { logout } from '../../lib/supabase';
import AuthModal from './AuthModal';
import styles from './AccountMenu.module.scss';

/**
 * Self-contained account affordance -- takes no props, reads `useAuthUser()`
 * itself -- so `Header` and `Landing` can both mount it without wiring auth
 * state through. Anonymous visitors (the default, pre-login state every
 * session starts in -- see `useAuthUser`) get a plain "Log in" button that
 * opens the shared `AuthModal`; a real account gets a dropdown (mirroring
 * `UsersMenu`'s existing Radix trigger/content pattern) showing the email,
 * with "My Rooms" and "Log out".
 *
 * Renders nothing while `loading`: `useAuthUser` starts anonymous and only
 * resolves once a confirmed session comes back, so rendering the "Log in"
 * button during that window would flash logged-out chrome in front of a
 * visitor who turns out, a tick later, to already be logged in.
 */
export default function AccountMenu() {
  const { email, isAnonymous, loading } = useAuthUser();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (loading) return null;

  if (isAnonymous) {
    return (
      <>
        <button type="button" className={styles.loginButton} onClick={() => setAuthModalOpen(true)}>
          Log in
        </button>
        <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} initialMode="login" />
      </>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger}>{email}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={6} align="end">
          <DropdownMenu.Item className={styles.item} asChild>
            <Link to="/my-rooms">My Rooms</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={() => logout()}>
            Log out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
