import * as Dialog from '@radix-ui/react-dialog';
import { HUES, THEMES, palette } from '../../lib/theme';
import type { HueKey, ThemeKey } from '../../lib/theme';
import { useTheme } from './ThemeProvider';
import styles from './ThemeDrawer.module.scss';

// The theme-switcher drawer: a card per THEMES entry (each previewing its OWN
// palette(key, currentHue) -- not the live, currently-applied theme -- so you
// can see Paper's card while sitting in Abyss) and a swatch per HUES entry.
// Radix's Dialog.Root drives Escape/outside-click dismissal itself via
// onOpenChange; there is no bespoke key listener here.
export default function ThemeDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme, hue, setTheme, setHue } = useTheme();

  return (
    <Dialog.Root open={open} onOpenChange={next => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.content}>
          <div className={styles.header}>
            <Dialog.Title className={styles.title}>Theme</Dialog.Title>
            <Dialog.Close className={styles.close} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' }}>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Dialog.Close>
          </div>

          <div className={styles.cards}>
            {(Object.keys(THEMES) as ThemeKey[]).map(key => {
              const card = palette(key, hue);
              const active = key === theme;
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.card}
                  style={{ borderColor: active ? 'var(--acc)' : 'var(--line2)' }}
                  onClick={() => setTheme(key)}
                  aria-pressed={active}
                >
                  <span className={styles.preview} style={{ background: card['--bg2'], color: card['--text'] }}>
                    <span style={{ color: card['--acc'] }}>const</span> room = <span style={{ color: card['--acc'] }}>live</span>()<br />
                    <span className={styles.runChip} style={{ background: card['--acc'], color: card['--acc-ink'] }}>Run</span>
                  </span>
                  <span className={styles.cardFooter}>
                    <span>{THEMES[key].name}</span>
                    <span className={styles.cardNote}>{THEMES[key].note}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className={styles.hueLabel}>ACCENT HUE</div>
          <div className={styles.hues}>
            {(Object.keys(HUES) as HueKey[]).map(key => {
              const active = key === hue;
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.swatch}
                  aria-label={HUES[key].name}
                  aria-pressed={active}
                  style={{
                    background: `oklch(0.78 0.13 ${HUES[key].deg})`,
                    boxShadow: active ? '0 0 0 2px var(--bg), 0 0 0 4px var(--text)' : 'none',
                  }}
                  onClick={() => setHue(key)}
                />
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
