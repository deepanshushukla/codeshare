import type { ConnectionStatus } from './useSession';
import styles from './ConnectionBanner.module.scss';

// Every non-healthy state the session can be in gets a line here, because the
// alternative (what this app used to do) is failing silently: a rejected
// upsert still showed the edit locally and still broadcast it to everyone
// else, so the content looked saved right up until a reload lost it.
const MESSAGES: Partial<Record<ConnectionStatus, string>> = {
  reconnecting: 'Reconnecting…',
  'write-failed': "Couldn't save your latest changes — they may be lost if you reload.",
  'auth-failed': "Couldn't sign in — live sync, presence, and saving are unavailable.",
};

export default function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  const message = MESSAGES[status];
  if (!message) return null;
  return (
    <div className={styles.banner} role="status">
      {message}
    </div>
  );
}
