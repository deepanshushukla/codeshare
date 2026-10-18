import styles from './Toast.module.scss';

export function Toast({ message, bottomOffset }: { message: string | null; bottomOffset: number }) {
  if (!message) {
    return null;
  }

  return (
    <div className={styles.toast} style={{ bottom: `${bottomOffset}px` }}>
      <span className={styles.icon}>✓</span>
      <span className={styles.message}>{message}</span>
    </div>
  );
}
