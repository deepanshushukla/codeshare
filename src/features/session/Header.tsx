import { Link } from 'react-router-dom';
import type { TabsState } from './useTabsQueryParam';
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
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        CodeShare
      </Link>
      <TabBar tabs={tabs} setTabs={setTabs} />
      <div className={styles.actions}>
        <RunControls onRun={onRun} />
        <ExportMenu html={html} css={css} js={js} />
        <UsersMenu users={users} currentUserId={currentUserId} name={name} onNameChange={onNameChange} />
      </div>
    </header>
  );
}
