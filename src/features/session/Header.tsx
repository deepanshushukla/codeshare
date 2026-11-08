import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MoreVertical, Sparkles } from 'lucide-react';
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

type MoreMenuProps = {
  users: PresenceUser[];
  currentUserId: string | null;
  name: string;
  onNameChange: (n: string) => void;
  isWide: boolean;
  onOpenTheme: () => void;
  exportContent: Props['exportContent'];
  onExported: (filename: string) => void;
  currentType: SessionType;
};

// Below 760px, Theme/Users/Export/New-session collapse into this one "More"
// button -- the header has no overflow/wrap handling (see .actions in
// Header.module.scss and the commit that first hit this: five ~36px
// controls plus the logo and room-link chip genuinely do not fit a common
// ~375-390px phone width). A plain toggled panel rather than another nested
// Radix DropdownMenu: UsersMenu and ExportMenu are themselves full
// DropdownMenu.Root trees, and nesting one popover library instance inside
// another's Content is exactly the kind of thing that's cheap to get subtly
// wrong (click-outside/focus-trap interaction between two independent
// dismissable layers) and expensive to debug without being able to see it
// render. A manually-closed `<div>` panel with its own single outside-click
// listener sidesteps that entirely, at the cost of writing that listener
// by hand instead of getting it for free.
function MoreMenu({
  users,
  currentUserId,
  name,
  onNameChange,
  isWide,
  onOpenTheme,
  exportContent,
  onExported,
  currentType,
}: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    // 'pointerdown' (not 'click'): closing on the same event that opened the
    // trigger would otherwise require the trigger's own onClick to run
    // first and race this listener -- capture phase sidesteps the ordering
    // question entirely rather than relying on it.
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open]);

  return (
    <div className={styles.moreWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.moreTrigger}
        aria-label="More"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className={styles.morePanel} role="menu">
          <button
            type="button"
            className={styles.moreThemeAction}
            role="menuitem"
            onClick={() => {
              onOpenTheme();
              setOpen(false);
            }}
          >
            Theme
          </button>
          <div className={styles.morePanelItem}>
            <UsersMenu users={users} currentUserId={currentUserId} name={name} onNameChange={onNameChange} isWide={isWide} />
          </div>
          <div className={styles.morePanelItem}>
            <ExportMenu
              {...exportContent}
              onExported={(filename) => {
                onExported(filename);
                setOpen(false);
              }}
            />
          </div>
          <div className={styles.morePanelItem}>
            <NewSessionButton currentType={currentType} />
          </div>
        </div>
      )}
    </div>
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
  // raises the toast above the bottom tab bar AND picks which `.actions`
  // layout renders below -- below 760px, Theme/Users/Export/New-session
  // collapse into the MoreMenu panel (see its own comment for why).
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
        {isMobile ? (
          <MoreMenu
            users={users}
            currentUserId={currentUserId}
            name={name}
            onNameChange={onNameChange}
            isWide={isWide}
            onOpenTheme={() => setThemeDrawerOpen(true)}
            exportContent={exportContent}
            onExported={(filename) => showToast(`Exported ${filename}`)}
            currentType={exportContent.sessionType ?? 'web'}
          />
        ) : (
          <>
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
          </>
        )}
        <RunControls onRun={onRun} />
      </div>

      <ThemeDrawer open={themeDrawerOpen} onClose={() => setThemeDrawerOpen(false)} />
      <Toast message={toast} bottomOffset={isMobile ? TOAST_BOTTOM_OFFSET_MOBILE : TOAST_BOTTOM_OFFSET} />
    </header>
  );
}
