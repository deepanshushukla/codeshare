import type { ReactTabsState } from './useReactTabsQueryParam';
import styles from './TabBar.module.scss';

const LABELS: Record<keyof ReactTabsState, string> = {
  appJsx: 'App',
  componentsJsx: 'Components',
  reactCss: 'CSS',
  console: 'Console',
  output: 'Output',
};

export default function ReactTabBar({
  tabs,
  toggleTab,
}: {
  tabs: ReactTabsState;
  toggleTab: (key: keyof ReactTabsState) => void;
}) {
  return (
    <div className={styles.bar}>
      {(Object.keys(LABELS) as (keyof ReactTabsState)[]).map((key, index) => (
        <button
          key={key}
          className={tabs[key] ? styles.active : styles.tab}
          onClick={() => toggleTab(key)}
          // The badge shows the digit; these say what it means, for mouse and
          // screen-reader users respectively (useReactTabsQueryParam owns the
          // window keydown listener that actually implements Alt+1-5).
          title={`Alt+${index + 1}`}
          aria-keyshortcuts={`Alt+${index + 1}`}
        >
          {/* The pane's Alt+N digit. aria-hidden so the button's accessible
              name stays "App"/"Output" rather than "1 App"/"5 Output" --
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
