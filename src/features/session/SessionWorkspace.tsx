import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSession, type ConnectionStatus } from './useSession';
import { useSessionChannel } from './useSessionChannel';
import { useTabsQueryParam } from './useTabsQueryParam';
import { usePresence } from './usePresence';
import { ensureAnonymousSession } from '../../lib/supabase';
import EditorPane from './EditorPane';
import OutputFrame from './OutputFrame';
import ConsolePanel from './ConsolePanel';
import Header from './Header';
import ConnectionBanner from './ConnectionBanner';
import styles from './SessionWorkspace.module.scss';

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

  function handleRun() {
    setRunToken((t) => t + 1);
  }
  function handleRepl(code: string) {
    iframeWindowRef.current?.postMessage({ type: 'repl', code }, '*');
  }

  // The sandboxed iframe is the only thing that executes code, so it has to
  // exist whenever the user can ask for code to run -- including the default
  // tab layout (js + console, no output), where Run and the Console REPL used
  // to be silent no-ops because nothing was mounted to receive them. It is
  // mounted for `console` too, just parked off-screen until `output` is on.
  const outputFrame = (tabs.console || tabs.output) && (
    <OutputFrame
      html={html}
      css={css}
      js={js}
      runToken={runToken}
      onWindowReady={(win) => {
        iframeWindowRef.current = win;
      }}
    />
  );

  const bannerStatus: ConnectionStatus = authFailed ? 'auth-failed' : connectionStatus;

  return (
    <div className={styles.workspace}>
      <Header
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
      <Group orientation="horizontal" className={styles.panes}>
        {tabs.html && (
          <Panel>
            <EditorPane title="HTML" language="html" value={html} onChange={(v) => updateField('html', v)} />
          </Panel>
        )}
        {tabs.html && (tabs.css || tabs.js || tabs.console || tabs.output) && <Separator className={styles.separator} />}
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
        {tabs.output && <Panel>{outputFrame}</Panel>}
      </Group>
      {!tabs.output && outputFrame && (
        <div className={styles.offscreenOutput} aria-hidden="true">
          {outputFrame}
        </div>
      )}
    </div>
  );
}
