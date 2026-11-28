import { useEffect, useState } from 'react';
import { Lock, X } from 'lucide-react';
import styles from './PrivacyNudge.module.scss';

export const PRIVACY_NUDGE_SEEN_KEY = 'codeshare.privateModeNudgeSeen';

// localStorage can be unavailable (private browsing, blocked storage); the
// nudge is a nicety, so failing to read/write just means it may show again.
function hasSeenNudge(): boolean {
  try {
    return window.localStorage.getItem(PRIVACY_NUDGE_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPrivacyNudgeSeen(): void {
  try {
    window.localStorage.setItem(PRIVACY_NUDGE_SEEN_KEY, '1');
  } catch {
    // ignore -- see hasSeenNudge
  }
}

const SHOW_DELAY_MS = 1200;

/**
 * A one-time callout telling a room's owner that private mode exists. Rendered
 * by Header inside a `position: relative` wrapper around whichever control
 * actually makes the room private on this layout, and drawn below it with an
 * arrow pointing up at it. `enabled` is Header's "owner of a public room"
 * check; once dismissed ("Got it", the close button, or using the control --
 * Header calls markPrivacyNudgeSeen for that) it never shows again in this
 * browser.
 */
export default function PrivacyNudge({
  enabled,
  onDismiss,
  align = 'right',
}: {
  enabled: boolean;
  onDismiss: () => void;
  // Which edge of the anchor the card lines up with: 'left' for a control near
  // the left of the header (the Public/Private pill), 'right' for the actions.
  align?: 'left' | 'right';
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!enabled || hasSeenNudge()) {
      setVisible(false);
      return;
    }
    // A beat after the workspace appears, so it reads as a hint rather than
    // part of the page loading.
    const timer = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  if (!enabled || !visible) return null;

  function dismiss() {
    markPrivacyNudgeSeen();
    setVisible(false);
    onDismiss();
  }

  return (
    <div
      className={`${styles.nudge} ${align === 'left' ? styles.alignLeft : ''}`}
      role="dialog"
      aria-labelledby="privacy-nudge-title"
      aria-describedby="privacy-nudge-body"
    >
      <div className={styles.card}>
        <span className={styles.arrow} aria-hidden="true" />
        <div className={styles.head}>
          <span className={styles.icon} aria-hidden="true">
            <Lock size={14} />
          </span>
          <p className={styles.title} id="privacy-nudge-title">
            <span className={styles.badge}>New</span> Private mode
          </p>
          <button type="button" className={styles.close} aria-label="Dismiss" onClick={dismiss}>
            <X size={14} />
          </button>
        </div>
        <p className={styles.body} id="privacy-nudge-body">
          Make this room private and only you can open it. Anyone else viewing it loses access right away.
        </p>
        <button type="button" className={styles.gotIt} onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
