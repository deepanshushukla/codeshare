import { useTheme } from '../theme/ThemeProvider';
import styles from './StatusBar.module.scss';

// Desktop-only footer bar (`CodeShare v2.dc.html`, lines 258-264): a synced
// indicator, the open-pane count, a static Alt+1-5 hint, and the current
// theme name right-aligned. It is rendered ONLY from SessionWorkspace's
// desktop branch -- mobile already has its own bottom bar (MobileTabBar), so
// this is never mounted there. The `<760px` rule in StatusBar.module.scss is
// a belt-and-suspenders backstop, not the primary guard.
export default function StatusBar({ openCount }: { openCount: number }) {
  const { themeName } = useTheme();

  return (
    <footer className={styles.bar}>
      <span className={styles.synced}>
        <span className={styles.dot} aria-hidden="true" />
        synced
      </span>
      <span>{openCount} panes</span>
      <span>Alt + 1–5 toggles panes</span>
      <span className={styles.theme}>{themeName}</span>
    </footer>
  );
}
