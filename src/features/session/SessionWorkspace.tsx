import { useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSession } from './useSession';
import { useTabsQueryParam } from './useTabsQueryParam';
import { usePresence } from './usePresence';
import { ensureAnonymousSession } from '../../lib/supabase';
import EditorPane from './EditorPane';
import UsersMenu from './UsersMenu';
import OutputFrame from './OutputFrame';
import ConsolePanel from './ConsolePanel';

// react-resizable-panels v4 renamed the old PanelGroup/Panel/PanelResizeHandle
// trio to Group/Panel/Separator, with `orientation` replacing `direction`.
export default function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    ensureAnonymousSession().then(setUserId);
  }, []);

  const { tabs } = useTabsQueryParam();
  const { html, css, js, updateField } = useSession(sessionId, userId);
  const { users, name, setName } = usePresence(sessionId, userId);

  return (
    <>
      <UsersMenu users={users} currentUserId={userId} name={name} onNameChange={setName} />
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
            <ConsolePanel />
          </Panel>
        )}
        {tabs.console && tabs.output && <Separator />}
        {tabs.output && (
          <Panel>
            <OutputFrame html={html} css={css} js={js} />
          </Panel>
        )}
      </Group>
    </>
  );
}
