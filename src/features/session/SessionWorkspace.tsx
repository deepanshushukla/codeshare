import { useEffect, useState } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useSession } from './useSession';
import { useTabsQueryParam } from './useTabsQueryParam';
import { ensureAnonymousSession } from '../../lib/supabase';
import EditorPane from './EditorPane';

// react-resizable-panels v4 renamed the old PanelGroup/Panel/PanelResizeHandle
// trio to Group/Panel/Separator, with `orientation` replacing `direction`.
export default function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    ensureAnonymousSession().then(setUserId);
  }, []);

  const { tabs } = useTabsQueryParam();
  const { html, css, js, updateField } = useSession(sessionId, userId);

  return (
    <Group orientation="horizontal" style={{ height: '100%' }}>
      {tabs.html && (
        <Panel>
          <EditorPane title="HTML" language="html" value={html} onChange={(v) => updateField('html', v)} />
        </Panel>
      )}
      {tabs.html && (tabs.css || tabs.js) && <Separator />}
      {tabs.css && (
        <Panel>
          <EditorPane title="CSS" language="css" value={css} onChange={(v) => updateField('css', v)} />
        </Panel>
      )}
      {tabs.css && tabs.js && <Separator />}
      {tabs.js && (
        <Panel>
          <EditorPane title="JS" language="javascript" value={js} onChange={(v) => updateField('js', v)} />
        </Panel>
      )}
    </Group>
  );
}
