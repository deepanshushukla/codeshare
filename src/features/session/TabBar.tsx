import type { TabsState } from './useTabsQueryParam';
import styles from './TabBar.module.scss';

const LABELS: Record<keyof TabsState, string> = {
  html: 'HTML',
  css: 'CSS',
  js: 'JS',
  console: 'Console',
  output: 'Output',
};

export default function TabBar({
  tabs,
  toggleTab,
}: {
  tabs: TabsState;
  toggleTab: (key: keyof TabsState) => void;
}) {
  return (
    <div className={styles.bar}>
      {(Object.keys(LABELS) as (keyof TabsState)[]).map((key) => (
        <button key={key} className={tabs[key] ? styles.active : styles.tab} onClick={() => toggleTab(key)}>
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
