import type { ConnectionStatus } from './useSession';
import { useTheme } from '../theme/ThemeProvider';
import styles from './StatusBar.module.scss';

// Short footer labels for every non-connected state. The wording tracks
// ConnectionBanner's MESSAGES deliberately -- the banner (above the panes) and
// this footer bar describe the same `ConnectionStatus`, so they must not
// disagree. These are the terse forms that fit a 28px bar; the banner keeps
// the full sentence.
const PENDING_LABEL: Record<Exclude<ConnectionStatus, 'connected'>, string> = {
  connecting: 'connecting…',
  reconnecting: 'reconnecting…',
  'write-failed': 'not saved',
  'auth-failed': 'sign-in failed',
};

// Desktop-only footer bar (`CodeShare v2.dc.html`, lines 258-264): a synced
// indicator, the open-pane count, a static Alt+1-5 hint, and the current
// theme name right-aligned. It is rendered ONLY from SessionWorkspace's
// desktop branch -- mobile already has its own bottom bar (MobileTabBar), so
// this is never mounted there. The `<760px` rule in StatusBar.module.scss is
// a belt-and-suspenders backstop, not the primary guard.
//
// `status` is the same value SessionWorkspace hands ConnectionBanner. It used
// to be hardcoded to "synced", which meant a dropped connection rendered a
// "Reconnecting…" banner directly above a footer insisting everything was
// saved.
export default function StatusBar({ openCount, status }: { openCount: number; status: ConnectionStatus }) {
  const { themeName } = useTheme();
  const connected = status === 'connected';

  return (
    <footer className={styles.bar}>
      <span className={connected ? styles.synced : styles.pending}>
        <span className={connected ? styles.dot : styles.dotPending} aria-hidden="true" />
        {connected ? 'synced' : PENDING_LABEL[status]}
      </span>
      <span>{openCount} panes</span>
      <span>Alt + 1–5 toggles panes</span>
      <span className={styles.theme}>{themeName}</span>
    </footer>
  );
}
