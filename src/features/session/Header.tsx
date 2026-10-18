import { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { TAB_KEYS, type TabsState } from './useTabsQueryParam';
import type { PresenceUser } from './usePresence';
import TabBar from './TabBar';
import UsersMenu from './UsersMenu';
import ExportMenu from './ExportMenu';
import RunControls from './RunControls';
import styles from './Header.module.scss';

type Props = {
  tabs: TabsState;
  setTabs: (t: TabsState) => void;
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (n: string) => void;
  onRun: () => void;
  html: string;
  css: string;
  js: string;
};

export default function Header({
  tabs,
  setTabs,
  users,
  currentUserId,
  name,
  onNameChange,
  onRun,
  html,
  css,
  js,
}: Props) {
  // Guarded pane toggle: refuses to close the only currently-open pane.
  // Mirrors useTabsQueryParam's toggleTab guard (handoff lines 565-570),
  // built here from the tabs/setTabs props Header already receives.
  const toggleTab = useCallback(
    (key: keyof TabsState) => {
      const openCount = TAB_KEYS.filter((k) => tabs[k]).length;
      if (tabs[key] && openCount === 1) return;
      setTabs({ ...tabs, [key]: !tabs[key] });
    },
    [tabs, setTabs],
  );

  // --- Alt+1-5 pane shortcut ---------------------------------------------
  // Global keydown listener mapping Alt+1 through Alt+5 to toggling the
  // HTML/CSS/JS/Console/Output panes (in TAB_KEYS order). Kept as its own
  // self-contained effect, separate from the rest of Header's logic, so a
  // future header redesign (see Task 8) can lift the JSX around it without
  // disturbing this listener.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && /^Digit[1-5]$/.test(e.code)) {
        e.preventDefault();
        toggleTab(TAB_KEYS[+e.code.slice(5) - 1]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTab]);
  // -------------------------------------------------------------------------

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        CodeShare
      </Link>
      <TabBar tabs={tabs} toggleTab={toggleTab} />
      <div className={styles.actions}>
        <RunControls onRun={onRun} />
        <ExportMenu html={html} css={css} js={js} />
        <UsersMenu users={users} currentUserId={currentUserId} name={name} onNameChange={onNameChange} />
      </div>
    </header>
  );
}
