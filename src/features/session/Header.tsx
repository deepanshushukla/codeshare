import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy } from 'lucide-react';
import { TAB_KEYS, type TabsState } from './useTabsQueryParam';
import type { PresenceUser } from './usePresence';
import TabBar from './TabBar';
import UsersMenu from './UsersMenu';
import ExportMenu from './ExportMenu';
import RunControls from './RunControls';
import ThemeButton from '../theme/ThemeButton';
import ThemeDrawer from '../theme/ThemeDrawer';
import { Toast } from './Toast';
import { useToast } from './useToast';
import { useBreakpoint } from './useBreakpoint';
import styles from './Header.module.scss';

// How far off the bottom of the viewport the toast floats, per layout.
// Desktop clears the status bar added by this plan's later task; mobile has to
// clear the ~76px bottom MobileTabBar (SessionWorkspace renders it below 760px)
// -- at the desktop offset the toast paints straight over its middle segments.
const TOAST_BOTTOM_OFFSET = 28;
const TOAST_BOTTOM_OFFSET_MOBILE = 96;

type Props = {
  roomId: string;
  tabs: TabsState;
  toggleTab: (key: keyof TabsState) => void;
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (n: string) => void;
  onRun: () => void;
  html: string;
  css: string;
  js: string;
};

export default function Header({
  roomId,
  tabs,
  toggleTab,
  users,
  currentUserId,
  name,
  onNameChange,
  onRun,
  html,
  css,
  js,
}: Props) {
  // --- Alt+1-5 pane shortcut ---------------------------------------------
  // Global keydown listener mapping Alt+1 through Alt+5 to toggling the
  // HTML/CSS/JS/Console/Output panes (in TAB_KEYS order). Kept as its own
  // self-contained effect, separate from the rest of Header's logic, so a
  // future header redesign (see Task 8) can lift the JSX around it without
  // disturbing this listener.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.altKey && /^Digit[1-5]$/.test(e.code)) {
        e.preventDefault();
        toggleTab(TAB_KEYS[+e.code.slice(5) - 1]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleTab]);
  // -------------------------------------------------------------------------

  // Header owns the one useToast() instance for this screen: both the
  // copy-link chip (below) and ExportMenu's onExported report through it.
  const { message: toast, showToast } = useToast();
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  // Only the avatar-stack *visual* is gated on >=1100px; UsersMenu's rename
  // dropdown is reachable from either trigger (see UsersMenu.tsx). `isMobile`
  // is read from the same call purely to raise the toast above the bottom tab
  // bar -- the header's own mobile adaptations are all CSS.
  const { isWide, isMobile } = useBreakpoint();

  const copyRoomLink = useCallback(async () => {
    // The chip shows the room's real route (`/code/:sessionId`) and copies the
    // absolute form of exactly that -- the design handoff's cosmetic "/r/"
    // prefix is not a route in this app, and a chip that displays a URL
    // different from the one it copies is a bug waiting to be reported.
    const url = `${window.location.origin}/code/${roomId}`;
    try {
      // Throws synchronously-into-the-promise where navigator.clipboard is
      // undefined (non-secure origins), which the catch covers too.
      await navigator.clipboard.writeText(url);
      showToast('Room link copied');
    } catch {
      showToast("Couldn't copy — copy the page URL instead");
    }
  }, [roomId, showToast]);

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo} title="Home" aria-label="Home">
        <span className={styles.brace}>{'{'}</span>
        {/* CSS-hidden below 760px, where only the braces remain as a mark. */}
        <span className={styles.wordmark}>CodeShare</span>
        <span className={styles.brace}>{'}'}</span>
      </Link>

      <button type="button" className={styles.roomChip} onClick={copyRoomLink} title="Copy room link" aria-label="Copy room link">
        {/* The path text is CSS-hidden below 1100px; the chip and its copy
            icon stay, so copying never becomes unreachable. */}
        <span className={styles.roomPath}>
          <span className={styles.roomPrefix}>/code/</span>
          {roomId}
        </span>
        <Copy size={13} aria-hidden="true" />
      </button>

      <div className={styles.center}>
        <TabBar tabs={tabs} toggleTab={toggleTab} />
      </div>

      <div className={styles.actions}>
        <UsersMenu
          users={users}
          currentUserId={currentUserId}
          name={name}
          onNameChange={onNameChange}
          isWide={isWide}
        />
        <ThemeButton variant="square" onOpenDrawer={() => setThemeDrawerOpen(true)} />
        <ExportMenu
          html={html}
          css={css}
          js={js}
          onExported={(filename) => showToast(`Exported ${filename}`)}
        />
        <RunControls onRun={onRun} />
      </div>

      <ThemeDrawer open={themeDrawerOpen} onClose={() => setThemeDrawerOpen(false)} />
      <Toast message={toast} bottomOffset={isMobile ? TOAST_BOTTOM_OFFSET_MOBILE : TOAST_BOTTOM_OFFSET} />
    </header>
  );
}
