import type { ConnectionStatus } from './useSession';
import styles from './ConnectionBanner.module.scss';

export default function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status !== 'reconnecting') return null;
  return (
    <div className={styles.banner} role="status">
      Reconnecting…
    </div>
  );
}
