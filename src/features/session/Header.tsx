import { useCallback, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Lock } from 'lucide-react';
import type { SessionType } from './sessionType';
import type { PresenceUser } from './usePresence';
import UsersMenu from './UsersMenu';
import RoomMenu from './RoomMenu';
import RunControls from './RunControls';
import { exportRoom, type RoomExportContent } from './exportActions';
import ThemeDrawer from '../theme/ThemeDrawer';
import { useTheme } from '../theme/ThemeProvider';
import AuthModal from '../auth/AuthModal';
import { useAuthUser } from '../auth/useAuthUser';
import { logout } from '../../lib/supabase';
import PrivacyNudge, { markPrivacyNudgeSeen } from './PrivacyNudge';
import { Toast } from './Toast';
import { useToast } from './useToast';
import { useBreakpoint } from './useBreakpoint';
import { generateSessionId } from '../../lib/randomId';
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
  exportContent: RoomExportContent;
  // Owner-only privacy toggle. `isOwner` is already resolved by the caller
  // (ownerId === currentUserId, computed in SessionWorkspace/
  // ReactSessionWorkspace) -- Header itself does no ownership comparison, so
  // a null ownerId (an anonymously-created room) can never read as "owned"
  // here just because it also renders false-y against some other id.
  isPrivate: boolean;
  isOwner: boolean;
  // An anonymous owner created this room before signing up. They can't flip
  // privacy yet (RLS refuses is_private for an anonymous JWT), so instead of
  // the pill they get "Make private", which signs them up -- converting the
  // anonymous user in place, same id, so they still own the room -- and then
  // calls onMakePrivate.
  isAnonymous: boolean;
  onTogglePrivacy: () => void;
  onMakePrivate: () => void;
};

export default function Header({
  roomId,
  tabBar,
  users,
  currentUserId,
  name,
  onNameChange,
  onRun,
  exportContent,
  isPrivate,
  isOwner,
  isAnonymous,
  onTogglePrivacy,
  onMakePrivate,
}: Props) {
  // Header owns the one useToast() instance for this screen: copy-link and
  // export both report through it.
  const { message: toast, showToast } = useToast();
  const [themeDrawerOpen, setThemeDrawerOpen] = useState(false);
  // `isWide` picks the avatar stack vs the compact users-count trigger;
  // `isMobile` drops the pane tabs (the bottom MobileTabBar replaces them)
  // and lifts the toast above that bar.
  const { isWide, isMobile } = useBreakpoint();
  const { themeName } = useTheme();
  const { email, loading: authLoading } = useAuthUser();
  // Held here, not inside RoomMenu: menu content unmounts on select, and
  // would take a modal opened from it down with it.
  const [authMode, setAuthMode] = useState<'signup' | 'login' | null>(null);

  // An anonymous owner can't flip privacy yet (RLS refuses is_private for an
  // anonymous JWT), so the same switch opens signup instead -- converting the
  // anonymous user in place, same id, so they still own the room -- and the
  // room goes private once that succeeds.
  const canMakePrivate = isOwner && isAnonymous;
  // One-time "private mode exists" callout for the owner of a public room,
  // anchored to the privacy switch. Using the switch counts as having seen it.
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const nudgeEnabled = isOwner && !isPrivate && !nudgeDismissed;
  const dismissNudge = useCallback(() => {
    markPrivacyNudgeSeen();
    setNudgeDismissed(true);
  }, []);

  const copyRoomLink = useCallback(async () => {
    // The room's real route, absolute -- not the handoff's cosmetic "/r/".
    const url = `${window.location.origin}/code/${roomId}`;
    try {
      // Throws into the promise where navigator.clipboard is undefined
      // (non-secure origins), which the catch covers too.
      await navigator.clipboard.writeText(url);
      showToast('Room link copied');
    } catch {
      showToast("Couldn't copy — copy the page URL instead");
    }
  }, [roomId, showToast]);

  const handleExport = useCallback(
    async (kind: 'html' | 'zip') => {
      try {
        const filename = await exportRoom(kind, exportContent);
        showToast(`Exported ${filename}`);
      } catch (error) {
        console.error('codeshare: export failed', error);
        showToast("Couldn't export this room");
      }
    },
    [exportContent, showToast],
  );

  // Opens a brand-new room of the given type in a new tab, never touching
  // the current room.
  const openNewSession = useCallback((type: SessionType) => {
    const suffix = type === 'react' ? '?type=react' : '';
    window.open(`${window.location.origin}/code/${generateSessionId()}${suffix}`, '_blank');
  }, []);

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.logo} title="Home" aria-label="Home">
        <span className={styles.brace}>{'{'}</span>
        {/* CSS-hidden below 760px, where only the braces remain as a mark. */}
        <span className={styles.wordmark}>CodeShare</span>
        <span className={styles.brace}>{'}'}</span>
      </Link>

      {/* Owner-only. Server-enforced too (RLS + a trigger on `sessions`, see
          useSession's setPrivacy) -- this is the affordance, not the guard. A
          room with no owner (made anonymously, owner_id null) has isOwner
          false for everyone, so nobody gets the switch there. */}
      {isOwner && (
        <span className={styles.nudgeAnchor}>
          <button
            type="button"
            role="switch"
            aria-checked={isPrivate}
            aria-label="Private room"
            className={styles.privacySwitch}
            onClick={() => {
              dismissNudge();
              if (canMakePrivate) setAuthMode('signup');
              else onTogglePrivacy();
            }}
            title={
              canMakePrivate
                ? 'Sign up to make this room private'
                : isPrivate
                  ? 'Private — only you can open this room. Click to make it public.'
                  : 'Public — anyone with the link can open it. Click to make it private.'
            }
          >
            {isPrivate ? <Lock size={14} aria-hidden="true" /> : <Globe size={14} aria-hidden="true" />}
            <span className={styles.privacyLabel}>{isPrivate ? 'Private' : 'Public'}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.thumb} />
            </span>
          </button>
          <PrivacyNudge enabled={nudgeEnabled} onDismiss={() => setNudgeDismissed(true)} align="left" />
        </span>
      )}

      {/* Below 760px the bottom MobileTabBar is the pane selector, so the
          header carries no tabs there -- the empty box stays as the flex
          spacer that pushes the actions right. */}
      <div className={styles.center}>{!isMobile && tabBar}</div>

      <div className={styles.actions}>
        <UsersMenu users={users} currentUserId={currentUserId} name={name} onNameChange={onNameChange} isWide={isWide} />
        <RunControls onRun={onRun} />
        <RoomMenu
          exportContent={exportContent}
          themeName={themeName}
          onCopyLink={copyRoomLink}
          onOpenTheme={() => setThemeDrawerOpen(true)}
          onExport={handleExport}
          onNewSession={openNewSession}
          accountLoading={authLoading}
          email={email}
          isAnonymous={isAnonymous}
          onLogin={() => setAuthMode('login')}
          onLogout={() => void logout()}
        />
      </div>

      <ThemeDrawer open={themeDrawerOpen} onClose={() => setThemeDrawerOpen(false)} />
      <AuthModal
        open={authMode !== null}
        onOpenChange={(open) => {
          if (!open) setAuthMode(null);
        }}
        initialMode={authMode ?? 'login'}
        // Opened from the Private switch: if they log in to an existing
        // account instead of signing up, this room moves to that account and
        // goes private in the same step (see loginWithPassword).
        makePrivateRoomId={authMode === 'signup' ? roomId : undefined}
        onSuccess={(how, details) => {
          if (authMode !== 'signup') return;
          if (how === 'signup') {
            onMakePrivate();
            showToast('Account created — this room is now private');
          } else if (details?.claimedRoomIds.includes(roomId)) {
            showToast('Logged in — this room is now private');
          } else {
            // Not a room this browser created anonymously, so the account
            // that just logged in doesn't own it.
            showToast('Logged in. Only the account that created a room can make it private');
          }
        }}
      />
      <Toast message={toast} bottomOffset={isMobile ? TOAST_BOTTOM_OFFSET_MOBILE : TOAST_BOTTOM_OFFSET} />
    </header>
  );
}
