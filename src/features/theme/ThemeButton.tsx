import { useTheme } from './ThemeProvider';
import styles from './ThemeButton.module.scss';

type ThemeButtonProps = {
  variant: 'pill' | 'square';
  onOpenDrawer: () => void;
  // Lets a header layout position the button without wrapping it in an
  // extra element.
  className?: string;
};

// An explicit map rather than styles[`button_${variant}`] -- a typo or a rename
// in the stylesheet becomes a type error here instead of silently resolving to
// className={undefined}.
const VARIANT_CLASS: Record<ThemeButtonProps['variant'], string> = {
  pill: styles.button_pill,
  square: styles.button_square,
};

export default function ThemeButton({ variant, onOpenDrawer, className }: ThemeButtonProps) {
  const { themeName } = useTheme();

  return (
    <button
      type="button"
      className={[VARIANT_CLASS[variant], className].filter(Boolean).join(' ')}
      onClick={onOpenDrawer}
      aria-label={`Theme: ${themeName}`}
    >
      <div className={styles.swatch} />
      {variant === 'pill' && <span className={styles.label}>{themeName}</span>}
    </button>
  );
}
