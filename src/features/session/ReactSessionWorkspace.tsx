import { useCallback, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSession, type ConnectionStatus } from './useSession';
import { useSessionChannel } from './useSessionChannel';
import { REACT_TAB_KEYS, useReactTabsQueryParam, type ReactTabsState } from './useReactTabsQueryParam';
import { usePresence } from './usePresence';
import { useBreakpoint } from './useBreakpoint';
import EditorPane from './EditorPane';
import OutputFrame from './OutputFrame';
import OutputPane from './OutputPane';
import ConsolePanel from './ConsolePanel';
import Header from './Header';
import ReactTabBar from './ReactTabBar';
import ReactMobileTabBar from './ReactMobileTabBar';
import ConnectionBanner from './ConnectionBanner';
import StatusBar from './StatusBar';
// Reused verbatim from the Web workspace: every class used below (workspace,
// panes, mobilePane, separator, offscreenOutput) is generic layout chrome,
// not Web-specific, so there is no React-mode stylesheet of its own.
import styles from './SessionWorkspace.module.scss';

// The three panes a Run should take the user *away* from on mobile, mirroring
// SessionWorkspace's MOBILE_EDITOR_TABS (see that file's comment for the full
// rationale, including why Console is deliberately excluded alongside
// Output).
const MOBILE_EDITOR_TABS: (keyof ReactTabsState)[] = ['appJsx', 'componentsJsx', 'reactCss'];

// Mirrors SessionWorkspace.tsx's shape exactly -- see that file's own
// comments for the invariants reproduced here (dual visible/off-screen
// OutputFrame mount, mobile/desktop branching, runToken/iframeWindowRef,
// etc.). The one real difference is the naming seam: useSession returns
// snake_case (`app_jsx`/`components_jsx`/`react_css`, matching Supabase's
// column names), while OutputFrame/OutputPane/exportActions/ReactTabBar/
// ReactMobileTabBar all use camelCase (`appJsx`/`componentsJsx`/`reactCss`).
// The rename happens explicitly at each boundary below -- never implicitly.
//
// userId/isAnonymous/privacyHint arrive as props from SessionRoute -- see
// SessionWorkspace.tsx's identical comment for why the local
// ensureAnonymousSession()-based effect this used to have is gone.
export default function ReactSessionWorkspace({
  sessionId,
  userId,
  isAnonymous,
  privacyHint,
  initialIsPrivate = false,
  onAccessRevoked = () => {},
}: {
  sessionId: string;
  userId: string | null;
  isAnonymous: boolean;
  privacyHint: boolean | null;
  // Whether the room is private as of SessionRoute's access check, so a
  // private room's owner joins the owner-only Realtime topic straight away
  // instead of passing through the public one first.
  initialIsPrivate?: boolean;
  // Called when the owner makes the room private while this (non-owner)
  // visitor has it open; SessionRoute re-checks access and shows AccessDenied.
  onAccessRevoked?: () => void;
}) {
  const { tabs, toggleTab } = useReactTabsQueryParam();
  const { isMobile } = useBreakpoint();
  const [mobileTab, setMobileTab] = useState<keyof ReactTabsState>('appJsx');
  // Exactly one Realtime channel per session, shared by useSession (broadcast
  // edits) and usePresence (presence tracking) -- see useSessionChannel.ts.
  // Which Realtime topic to sit on: the public one, or the owner-only private
  // one (see useSessionChannel). Seeded from the access check, then follows
  // the row's is_private once it has loaded -- so making the room private
  // moves this client off the topic other viewers are still subscribed to.
  const [channelPrivate, setChannelPrivate] = useState(initialIsPrivate);
  const { channel, status: channelStatus } = useSessionChannel(sessionId, userId, channelPrivate);
  const {
    app_jsx,
    components_jsx,
    react_css,
    connectionStatus,
    updateField,
    isPrivate,
    ownerId,
    title,
    setPrivacy,
    loading,
    accessRevoked,
  } = useSession(sessionId, userId, isAnonymous, channel, channelStatus, 'react', privacyHint);
  const { users, name, setName } = usePresence(userId, channel);
  useEffect(() => {
    if (!loading) setChannelPrivate(isPrivate);
  }, [loading, isPrivate]);
  useEffect(() => {
    if (accessRevoked) onAccessRevoked();
  }, [accessRevoked, onAccessRevoked]);

  // See SessionWorkspace.tsx's identical comment: `runToken` only changes on
  // an explicit Run, so typing (which updates app_jsx/components_jsx/
  // react_css on every keystroke via autosave) never re-runs the sandbox.
  const [runToken, setRunToken] = useState(0);
  const iframeWindowRef = useRef<Window | null>(null);

  const handleRun = useCallback(() => {
    setRunToken((t) => t + 1);
    if (!isMobile) return;
    // Updater form, not a closed-over `mobileTab` -- see SessionWorkspace.tsx's
    // handleRun for why that distinction matters (it must re-fire on every Run).
    setMobileTab((current) => (MOBILE_EDITOR_TABS.includes(current) ? 'output' : current));
  }, [isMobile]);

  function handleRepl(code: string) {
    iframeWindowRef.current?.postMessage({ type: 'repl', code }, '*');
  }

  // --- The one sandboxed iframe ------------------------------------------
  // Same dual visible/off-screen mount strategy as SessionWorkspace.tsx: the
  // sandboxed iframe must exist whenever the user can ask for code to run
  // (including the default appJsx+console layout, with Output closed), and
  // exactly one of the two nodes below is ever non-null.
  const outputVisible = isMobile ? mobileTab === 'output' : tabs.output;
  const outputMounted = isMobile ? mobileTab === 'console' || mobileTab === 'output' : tabs.console || tabs.output;

  // The naming-seam rename happens right here: useSession's snake_case
  // fields become OutputFrame/OutputPane's camelCase props, explicitly.
  const outputFrameProps = {
    sessionType: 'react' as const,
    appJsx: app_jsx,
    componentsJsx: components_jsx,
    reactCss: react_css,
    runToken,
    onWindowReady: (win: Window | null) => {
      iframeWindowRef.current = win;
    },
  };
  const visibleOutput = outputMounted && outputVisible ? <OutputPane {...outputFrameProps} onRun={handleRun} /> : null;
  const offscreenOutput =
    outputMounted && !outputVisible ? (
      <div className={styles.offscreenOutput} aria-hidden="true">
        <OutputFrame {...outputFrameProps} />
      </div>
    ) : null;
  // -----------------------------------------------------------------------

  const bannerStatus: ConnectionStatus = connectionStatus;
  // (See SessionWorkspace.tsx's identical comment: nothing here sets
  // 'auth-failed' anymore -- that lives in useAuthUser, one level up.)

  // Desktop pane count for the StatusBar footer -- counts from `tabs` (the
  // desktop multi-select), not `mobileTab`, same as SessionWorkspace.tsx.
  const openCount = REACT_TAB_KEYS.filter((key) => tabs[key]).length;

  return (
    <div className={styles.workspace}>
      {/* See SessionWorkspace.tsx's identical comment: React 19 head-hoisting. */}
      <title>{title || 'CodeShare'}</title>
      <Header
        roomId={sessionId}
        tabBar={<ReactTabBar tabs={tabs} toggleTab={toggleTab} />}
        users={users}
        currentUserId={userId}
        name={name}
        onNameChange={setName}
        onRun={handleRun}
        exportContent={{ sessionType: 'react', appJsx: app_jsx, componentsJsx: components_jsx, reactCss: react_css }}
        isPrivate={isPrivate}
        isOwner={ownerId !== null && ownerId === userId}
        isAnonymous={isAnonymous}
        onTogglePrivacy={() => setPrivacy(!isPrivate)}
        onMakePrivate={() => setPrivacy(true)}
      />
      <ConnectionBanner status={bannerStatus} />
      {isMobile ? (
        <div className={styles.mobilePane}>
          {mobileTab === 'appJsx' && (
            <EditorPane
              title="App"
              language="jsx"
              fileName="App.jsx"
              value={app_jsx}
              onChange={(v) => updateField('app_jsx', v)}
            />
          )}
          {mobileTab === 'componentsJsx' && (
            <EditorPane
              title="Components"
              language="jsx"
              fileName="Components.jsx"
              value={components_jsx}
              onChange={(v) => updateField('components_jsx', v)}
            />
          )}
          {mobileTab === 'reactCss' && (
            <EditorPane
              title="CSS"
              language="css"
              fileName="styles.css"
              value={react_css}
              onChange={(v) => updateField('react_css', v)}
            />
          )}
          {mobileTab === 'console' && <ConsolePanel onRepl={handleRepl} />}
          {visibleOutput}
        </div>
      ) : (
        <Group orientation="horizontal" className={styles.panes}>
          {tabs.appJsx && (
            <Panel>
              <EditorPane
                title="App"
                language="jsx"
                fileName="App.jsx"
                value={app_jsx}
                onChange={(v) => updateField('app_jsx', v)}
              />
            </Panel>
          )}
          {tabs.appJsx && (tabs.componentsJsx || tabs.reactCss || tabs.console || tabs.output) && (
            <Separator className={styles.separator} />
          )}
          {tabs.componentsJsx && (
            <Panel>
              <EditorPane
                title="Components"
                language="jsx"
                fileName="Components.jsx"
                value={components_jsx}
                onChange={(v) => updateField('components_jsx', v)}
              />
            </Panel>
          )}
          {tabs.componentsJsx && (tabs.reactCss || tabs.console || tabs.output) && (
            <Separator className={styles.separator} />
          )}
          {tabs.reactCss && (
            <Panel>
              <EditorPane
                title="CSS"
                language="css"
                fileName="styles.css"
                value={react_css}
                onChange={(v) => updateField('react_css', v)}
              />
            </Panel>
          )}
          {tabs.reactCss && (tabs.console || tabs.output) && <Separator className={styles.separator} />}
          {tabs.console && (
            <Panel>
              <ConsolePanel onRepl={handleRepl} />
            </Panel>
          )}
          {tabs.console && tabs.output && <Separator className={styles.separator} />}
          {visibleOutput && <Panel>{visibleOutput}</Panel>}
        </Group>
      )}
      {!isMobile && <StatusBar openCount={openCount} status={bannerStatus} />}
      {isMobile && <ReactMobileTabBar active={mobileTab} onSelect={setMobileTab} />}
      {offscreenOutput}
    </div>
  );
}
