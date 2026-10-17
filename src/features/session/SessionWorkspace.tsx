import { useEffect, useRef, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSession } from './useSession';
import { useTabsQueryParam } from './useTabsQueryParam';
import { usePresence } from './usePresence';
import { ensureAnonymousSession } from '../../lib/supabase';
import EditorPane from './EditorPane';
import OutputFrame from './OutputFrame';
import ConsolePanel from './ConsolePanel';
import Header from './Header';
import ConnectionBanner from './ConnectionBanner';

// react-resizable-panels v4 renamed the old PanelGroup/Panel/PanelResizeHandle
// trio to Group/Panel/Separator, with `orientation` replacing `direction`.
export default function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    ensureAnonymousSession().then(setUserId);
  }, []);

  const { tabs, setTabs } = useTabsQueryParam();
  const { html, css, js, connectionStatus, updateField } = useSession(sessionId, userId);
  const { users, name, setName } = usePresence(sessionId, userId);

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

  return (
    <>
      <Header
        tabs={tabs}
        setTabs={setTabs}
        users={users}
        currentUserId={userId}
        name={name}
        onNameChange={setName}
        onRun={handleRun}
        html={html}
        css={css}
        js={js}
      />
      <ConnectionBanner status={connectionStatus} />
      <Group orientation="horizontal" style={{ height: '100%' }}>
        {tabs.html && (
          <Panel>
            <EditorPane title="HTML" language="html" value={html} onChange={(v) => updateField('html', v)} />
          </Panel>
        )}
        {tabs.html && (tabs.css || tabs.js || tabs.console || tabs.output) && <Separator />}
        {tabs.css && (
          <Panel>
            <EditorPane title="CSS" language="css" value={css} onChange={(v) => updateField('css', v)} />
          </Panel>
        )}
        {tabs.css && (tabs.js || tabs.console || tabs.output) && <Separator />}
        {tabs.js && (
          <Panel>
            <EditorPane title="JS" language="javascript" value={js} onChange={(v) => updateField('js', v)} />
          </Panel>
        )}
        {tabs.js && (tabs.console || tabs.output) && <Separator />}
        {tabs.console && (
          <Panel>
            <ConsolePanel onRepl={handleRepl} />
          </Panel>
        )}
        {tabs.console && tabs.output && <Separator />}
        {tabs.output && (
          <Panel>
            <OutputFrame
              html={html}
              css={css}
              js={js}
              runToken={runToken}
              onWindowReady={(win) => {
                iframeWindowRef.current = win;
              }}
            />
          </Panel>
        )}
      </Group>
    </>
  );
}
