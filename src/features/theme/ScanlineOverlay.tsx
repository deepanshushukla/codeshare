import styles from './ScanlineOverlay.module.scss';

// A fixed, full-viewport, non-interactive overlay that paints the CRT-style
// scanline texture used by the Phosphor theme. It is always mounted: its
// opacity comes from the `--scan` custom property, which `applyTheme()`
// (see `src/lib/theme.ts`, called from `ThemeProvider`) sets to 0 for every
// theme except Phosphor, so it's invisible everywhere else without needing
// a conditional render here.
export default function ScanlineOverlay() {
  return <div className={styles.overlay} aria-hidden="true" />;
}
