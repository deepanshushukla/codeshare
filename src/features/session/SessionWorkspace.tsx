import { useCallback, useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSession, type ConnectionStatus } from './useSession';
import { useSessionChannel } from './useSessionChannel';
import { TAB_KEYS, useTabsQueryParam, type TabsState } from './useTabsQueryParam';
import { usePresence } from './usePresence';
import { useBreakpoint } from './useBreakpoint';
import { ensureAnonymousSession } from '../../lib/supabase';
import EditorPane from './EditorPane';
import OutputFrame from './OutputFrame';
import OutputPane from './OutputPane';
import ConsolePanel from './ConsolePanel';
import Header from './Header';
import MobileTabBar from './MobileTabBar';
import ConnectionBanner from './ConnectionBanner';
import StatusBar from './StatusBar';
import styles from './SessionWorkspace.module.scss';

// The three panes a Run should take the user *away* from on mobile: having
// pressed Run from an editor, what they want to see next is the result.
//
// DELIBERATE NARROWING of the plan's literal `mobileTab !== 'output'`: this
// excludes 'console' as well as 'output'. Both already show the result of a
// run, and the Console pane in particular is where someone reads log output
// and re-runs from the REPL -- switching away from it mid-Run would yank away
// the pane they are actively reading. Pinned by a test
// ("mobile Run from the Console pane stays on Console").
const MOBILE_EDITOR_TABS: (keyof TabsState)[] = ['html', 'css', 'js'];

// react-resizable-panels v4 renamed the old PanelGroup/Panel/PanelResizeHandle
// trio to Group/Panel/Separator, with `orientation` replacing `direction`.
export default function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [authFailed, setAuthFailed] = useState(false);
  useEffect(() => {
    let active = true;
    ensureAnonymousSession()
      .then((id) => {
        if (active) setUserId(id);
      })
      .catch((error: unknown) => {
        // Without this, a project with anonymous sign-ins disabled leaves
        // `userId` null forever: no channel, no presence, no identity for the
        // self-echo guard -- and no hint to the user that anything is wrong.
        console.error('codeshare: anonymous sign-in failed', error);
        if (active) setAuthFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const { tabs, toggleTab } = useTabsQueryParam();
  // Below 760px the multi-pane layout has no room to be multi-pane, so the
  // workspace shows exactly one pane at a time, chosen by `mobileTab` and the
  // bottom MobileTabBar instead of by the `tabs` multi-select. `tabs` is left
  // completely alone while mobile (it still drives the desktop layout, the
  // ?selectedTabs URL param, and the Alt+1-5 shortcut), so crossing the
  // breakpoint back to desktop restores whatever pane set was open there.
  const { isMobile } = useBreakpoint();
  const [mobileTab, setMobileTab] = useState<keyof TabsState>('js');
  // Exactly one Realtime channel per session, created here and shared by both
  // useSession (broadcast edits) and usePresence (presence tracking). See
  // useSessionChannel.ts for why creating it in each hook is broken.
  const { channel, status: channelStatus } = useSessionChannel(sessionId, userId);
  const { html, css, js, connectionStatus, updateField } = useSession(sessionId, userId, channel, channelStatus);
  const { users, name, setName } = usePresence(userId, channel);

  // `runToken` only changes when the user explicitly hits Run (button or
  // Ctrl/Cmd+Enter) -- it is what OutputFrame keys its <iframe> on, so
  // typing in the editors (which updates html/css/js on every keystroke via
  // autosave) does not re-run the sandboxed code. `iframeWindowRef` is set
  // once the sandboxed iframe fires `onLoad`; the Console REPL input posts
  // messages at that window, which are only ever `eval`'d inside the
  // sandbox's own bridge script (sandbox.ts), never in this main window.
  const [runToken, setRunToken] = useState(0);
  const iframeWindowRef = useRef<Window | null>(null);

  const handleRun = useCallback(() => {
    setRunToken((t) => t + 1);
    // On mobile, only one pane is on screen, so a Run pressed from an editor
    // has no visible effect unless we also switch to Output.
    if (!isMobile) return;
    // Deliberately the updater form rather than `if (MOBILE_EDITOR_TABS
    // .includes(mobileTab))`: the updater is handed the live state at commit
    // time, so this check cannot read a `mobileTab` captured when this
    // callback was created. That matters because this must re-fire on EVERY
    // Run -- and `handleRun` is memoized (RunControls' Ctrl+Enter listener
    // depends on its identity), so a closed-over `mobileTab` would be exactly
    // the stale value that makes the auto-switch work once and then stop.
    // Returning `current` unchanged is a React state bail-out, so a Run from
    // Console/Output costs no extra render. See MOBILE_EDITOR_TABS above for
    // why Console is excluded from the auto-switch, not just Output.
    setMobileTab((current) => (MOBILE_EDITOR_TABS.includes(current) ? 'output' : current));
  }, [isMobile]);

  function handleRepl(code: string) {
    iframeWindowRef.current?.postMessage({ type: 'repl', code }, '*');
  }

  // --- The one sandboxed iframe ------------------------------------------
  //
  // The sandboxed iframe is the only thing that executes code, so it has to
  // exist whenever the user can ask for code to run -- including the default
  // tab layout (js + console, no output), where Run and the Console REPL used
  // to be silent no-ops because nothing was mounted to receive them. It is
  // mounted for `console` too, just parked off-screen until `output` is on.
  //
  // Two booleans drive this, and they are the ONLY place the desktop/mobile
  // difference enters: desktop asks the `tabs` multi-select (several panes at
  // once), mobile asks `mobileTab` (exactly one pane). Everything downstream
  // -- which wrapper the frame gets, whether the off-screen parking div is
  // rendered -- is written once against these two.
  const outputVisible = isMobile ? mobileTab === 'output' : tabs.output;
  const outputMounted = isMobile ? mobileTab === 'console' || mobileTab === 'output' : tabs.console || tabs.output;

  // Shared props, so the visible and the off-screen mount can never drift
  // apart: OutputPane builds its own OutputFrame internally (it owns the pane
  // chrome), the off-screen mount renders the bare OutputFrame since there is
  // no visible chrome to put a header on. Exactly one of the two nodes below
  // is ever non-null, so there is only ever one live <iframe> -- two
  // simultaneously-mounted frames would both answer the REPL's postMessage
  // and double every console line.
  const outputFrameProps = {
    html,
    css,
    js,
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

  const bannerStatus: ConnectionStatus = authFailed ? 'auth-failed' : connectionStatus;

  // Desktop pane count for the StatusBar footer -- counts from `tabs` (the
  // desktop multi-select), not `mobileTab`, since StatusBar only ever renders
  // in the desktop branch, where `tabs` is what actually drives the Group's
  // panes.
  const openCount = TAB_KEYS.filter((key) => tabs[key]).length;

  return (
    <div className={styles.workspace}>
      <Header
        roomId={sessionId}
        tabs={tabs}
        toggleTab={toggleTab}
        users={users}
        currentUserId={userId}
        name={name}
        onNameChange={setName}
        onRun={handleRun}
        html={html}
        css={css}
        js={js}
      />
      <ConnectionBanner status={bannerStatus} />
      {/* flex: 1 + min-height: 0 (see the stylesheet) rather than height:
          100%, which resolved against the full viewport and so stacked *on
          top of* the header/banner, pushing the bottom of every pane off
          screen with no scroll affordance. */}
      {isMobile ? (
        /* One pane, full size. No Group/Panel/Separator at all: with a single
           visible pane there is nothing to resize, and react-resizable-panels
           would only add a layout/ResizeObserver layer with no purpose. */
        <div className={styles.mobilePane}>
          {mobileTab === 'html' && (
            <EditorPane title="HTML" language="html" value={html} onChange={(v) => updateField('html', v)} />
          )}
          {mobileTab === 'css' && (
            <EditorPane title="CSS" language="css" value={css} onChange={(v) => updateField('css', v)} />
          )}
          {mobileTab === 'js' && (
            <EditorPane title="JS" language="javascript" value={js} onChange={(v) => updateField('js', v)} />
          )}
          {mobileTab === 'console' && <ConsolePanel onRepl={handleRepl} />}
          {visibleOutput}
        </div>
      ) : (
        <Group orientation="horizontal" className={styles.panes}>
          {tabs.html && (
            <Panel>
              <EditorPane title="HTML" language="html" value={html} onChange={(v) => updateField('html', v)} />
            </Panel>
          )}
          {tabs.html && (tabs.css || tabs.js || tabs.console || tabs.output) && (
            <Separator className={styles.separator} />
          )}
          {tabs.css && (
            <Panel>
              <EditorPane title="CSS" language="css" value={css} onChange={(v) => updateField('css', v)} />
            </Panel>
          )}
          {tabs.css && (tabs.js || tabs.console || tabs.output) && <Separator className={styles.separator} />}
          {tabs.js && (
            <Panel>
              <EditorPane title="JS" language="javascript" value={js} onChange={(v) => updateField('js', v)} />
            </Panel>
          )}
          {tabs.js && (tabs.console || tabs.output) && <Separator className={styles.separator} />}
          {tabs.console && (
            <Panel>
              <ConsolePanel onRepl={handleRepl} />
            </Panel>
          )}
          {tabs.console && tabs.output && <Separator className={styles.separator} />}
          {/* The chrome-wrapped OutputPane is only for this visible, on-tab
              instance -- `visibleOutput` is non-null exactly when Output is
              the pane on screen (here: `tabs.output`), and the off-screen
              mount below renders the bare OutputFrame instead. */}
          {visibleOutput && <Panel>{visibleOutput}</Panel>}
        </Group>
      )}
      {/* Desktop-only footer -- mobile already has its own bottom bar
          (MobileTabBar) just below, so this is never rendered there at all,
          not merely hidden by CSS. */}
      {!isMobile && <StatusBar openCount={openCount} />}
      {isMobile && <MobileTabBar active={mobileTab} onSelect={setMobileTab} />}
      {/* Mode-independent: `offscreenOutput` is already null whenever Output
          is the visible pane, in either layout. */}
      {offscreenOutput}
    </div>
  );
}
