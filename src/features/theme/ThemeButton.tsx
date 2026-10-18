import { useTheme } from './ThemeProvider';
import styles from './ThemeButton.module.scss';

export default function ThemeButton({ variant, onOpenDrawer }: { variant: 'pill' | 'square'; onOpenDrawer: () => void }) {
  const { themeName } = useTheme();

  return (
    <button
      className={styles[`button_${variant}`]}
      onClick={onOpenDrawer}
      aria-label={`Theme: ${themeName}`}
    >
      <div className={styles.swatch} />
      {variant === 'pill' && <span className={styles.label}>{themeName}</span>}
    </button>
  );
}
