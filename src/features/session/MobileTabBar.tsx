import { TAB_KEYS, type TabsState } from './useTabsQueryParam';
import styles from './MobileTabBar.module.scss';

// Glyph + label per pane, matching the design handoff's TABS map
// (design_handoff_codeshare/CodeShare v2.dc.html, lines 337-342). The same
// five keys and the same order as TAB_KEYS, which is also what the Alt+1-5
// shortcut and the desktop TabBar use -- the sliding pill's position is
// derived from that shared order, so it must not be re-declared here.
const SEGMENTS: Record<keyof TabsState, { label: string; glyph: string }> = {
  html: { label: 'HTML', glyph: '<>' },
  css: { label: 'CSS', glyph: '{}' },
  js: { label: 'JS', glyph: 'JS' },
  console: { label: 'Console', glyph: '❯_' },
  output: { label: 'Output', glyph: '▶' },
};

type Props = {
  active: keyof TabsState;
  onSelect: (key: keyof TabsState) => void;
};

// The mobile (<760px) pane selector: a 5-segment control pinned to the bottom
// of the screen. Unlike the desktop TabBar, these are *radio*-like, not
// toggles -- the mobile layout shows exactly one pane at a time, so selecting
// a segment replaces the visible pane rather than opening an extra one. That
// is why it takes `active`/`onSelect` (SessionWorkspace's `mobileTab` state)
// instead of the `tabs`/`toggleTab` pair, and why there is no min-one-open
// guard to enforce: one is always selected by construction.
export default function MobileTabBar({ active, onSelect }: Props) {
  // Clamped at 0 so the pill never ends up translated off the control if
  // `active` were ever a key outside TAB_KEYS.
  const activeIndex = Math.max(0, TAB_KEYS.indexOf(active));

  return (
    <nav className={styles.bar} aria-label="Panes">
      <div className={styles.track}>
        {/* The accent pill, laid out as one fifth of the track's inner width
            and moved by whole multiples of its own width. Inline `transform`
            (rather than a class per index) is the only per-render value --
            the transition that animates it lives in the stylesheet. */}
        <span
          className={styles.pill}
          aria-hidden="true"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={key === active ? styles.segmentActive : styles.segment}
            // `aria-current` rather than `aria-pressed`: these behave as
            // navigation between panes (one of five is current), not as five
            // independent on/off toggles.
            aria-current={key === active ? 'page' : undefined}
            onClick={() => onSelect(key)}
          >
            {/* aria-hidden so the accessible name stays "HTML"/"Console"
                rather than "<> HTML"/"❯_ Console". */}
            <span className={styles.glyph} aria-hidden="true">
              {SEGMENTS[key].glyph}
            </span>
            <span className={styles.label}>{SEGMENTS[key].label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
