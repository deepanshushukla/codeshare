import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Sparkles } from 'lucide-react';
import type { SessionType } from './sessionType';
import type { PresenceUser } from './usePresence';
import UsersMenu from './UsersMenu';
import ExportMenu from './ExportMenu';
import RunControls from './RunControls';
import ThemeButton from '../theme/ThemeButton';
import ThemeDrawer from '../theme/ThemeDrawer';
import { Toast } from './Toast';
import { useToast } from './useToast';
import { useBreakpoint } from './useBreakpoint';
import { generateSessionId } from '../../lib/randomId';
import type { ExportContent, ReactExportContent } from '../../lib/export';
import styles from './Header.module.scss';

// How far off the bottom of the viewport the toast floats, per layout.
// Desktop clears the status bar added by this plan's later task; mobile has to
// clear the ~76px bottom MobileTabBar (SessionWorkspace renders it below 760px)
// -- at the desktop offset the toast paints straight over its middle segments.
const TOAST_BOTTOM_OFFSET = 28;
const TOAST_BOTTOM_OFFSET_MOBILE = 96;

type Props = {
  roomId: string;
  tabBar: ReactNode;
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (n: string) => void;
  onRun: () => void;
  exportContent: ({ sessionType?: 'web' } & ExportContent) | ({ sessionType: 'react' } & ReactExportContent);
};

// Opens a brand-new session of the OTHER type in a new tab, never touching
// the current session's URL/state -- a quick "start something else" escape
// hatch from inside an existing room, not a navigation of it. Single
// contextual action rather than a Web/React menu: inside a Web room this
// offers React (and vice versa), since "start another one just like this"
// is already one click away via the room link itself.
function NewSessionButton({ currentType }: { currentType: SessionType }) {
  const targetType: SessionType = currentType === 'react' ? 'web' : 'react';

  function openNewSession() {
    const newId = generateSessionId();
    const suffix = targetType === 'react' ? '?type=react' : '';
    window.open(`${window.location.origin}/code/${newId}${suffix}`, '_blank');
  }

  const label = targetType === 'react' ? 'Start React App' : 'Start a new JS App';

  return (
    <button type="button" className={styles.newSessionTrigger} onClick={openNewSession} title={label}>
      <Sparkles size={15} />
      <span className={styles.newSessionLabel}>{label}</span>
    </button>
  );
}

export default function Header({
  roomId,
  tabBar,
  users,
  currentUserId,
  name,
  onNameChange,
  onRun,
  exportContent,
}: Props) {
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

      <div className={styles.center}>{tabBar}</div>

      <div className={styles.actions}>
        <UsersMenu
          users={users}
          currentUserId={currentUserId}
          name={name}
          onNameChange={onNameChange}
          isWide={isWide}
        />
        <ThemeButton variant="square" onOpenDrawer={() => setThemeDrawerOpen(true)} />
        <ExportMenu {...exportContent} onExported={(filename) => showToast(`Exported ${filename}`)} />
        <NewSessionButton currentType={exportContent.sessionType ?? 'web'} />
        <RunControls onRun={onRun} />
      </div>

      <ThemeDrawer open={themeDrawerOpen} onClose={() => setThemeDrawerOpen(false)} />
      <Toast message={toast} bottomOffset={isMobile ? TOAST_BOTTOM_OFFSET_MOBILE : TOAST_BOTTOM_OFFSET} />
    </header>
  );
}
