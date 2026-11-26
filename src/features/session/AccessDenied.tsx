import { useState } from 'react';
import AuthModal from '../auth/AuthModal';
import { useAuthUser } from '../auth/useAuthUser';
import styles from './AccessDenied.module.scss';

/**
 * Shown by `SessionRoute` (Task 9) in place of the editor workspace when
 * `useSessionAccess` reports the current visitor can't see a private room.
 * Takes no props -- it reads `useAuthUser()` itself, mirroring `AuthModal`'s
 * other callers, so `SessionRoute` doesn't need to thread auth state through.
 *
 * The login prompt only appears for an anonymous visitor: a *different*
 * logged-in (non-anonymous) user also can't see this room, but telling them
 * to "log in" would be misleading since they already are. Logging in
 * doesn't need special handling here beyond closing the modal -- `onSuccess`
 * changes `currentUserId`, which makes `SessionRoute`'s `useSessionAccess`
 * naturally re-evaluate access on the next render.
 */
export default function AccessDenied() {
  const { isAnonymous } = useAuthUser();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  return (
    <div className={styles.page}>
      <h1>This room is private.</h1>
      {isAnonymous && (
        <>
          <p className={styles.hint}>Log in to see if you have access to this room.</p>
          <button type="button" className={styles.loginButton} onClick={() => setAuthModalOpen(true)}>
            Log in
          </button>
          <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} initialMode="login" />
        </>
      )}
      <a href="/" className={styles.link}>
        Back to home
      </a>
    </div>
  );
}
