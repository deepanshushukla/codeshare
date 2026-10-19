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
      {(Object.keys(LABELS) as (keyof TabsState)[]).map((key, index) => (
        <button
          key={key}
          className={tabs[key] ? styles.active : styles.tab}
          onClick={() => toggleTab(key)}
          // The badge shows the digit; these say what it means, for mouse and
          // screen-reader users respectively (Header owns the listener).
          title={`Alt+${index + 1}`}
          aria-keyshortcuts={`Alt+${index + 1}`}
        >
          {/* The pane's Alt+N digit. aria-hidden so the button's accessible
              name stays "HTML"/"Output" rather than "1 HTML"/"5 Output" --
              aria-keyshortcuts above is the announced form. CSS-hidden below
              1100px (see the stylesheet) rather than gated on
              useBreakpoint(), which keeps this component free of hooks and
              of a re-render on every breakpoint crossing. */}
          <span className={styles.key} aria-hidden="true">
            {index + 1}
          </span>
          {LABELS[key]}
        </button>
      ))}
    </div>
  );
}
