import { useMemo } from 'react';
import { buildSandboxDocument } from '../../lib/sandbox';

type Props = { html: string; css: string; js: string };

// SECURITY: this is the single place user-authored JS runs. `srcDoc` is
// parsed by the browser into a brand-new, separately-sandboxed document --
// not evaluated by this app's JS -- and `sandbox="allow-scripts"` (with no
// `allow-same-origin`) gives that document an opaque origin, so it cannot
// reach this window's localStorage, cookies, or JS globals (e.g. the
// Supabase client) even if the postMessage bridge in sandbox.ts has a bug.
export default function OutputFrame({ html, css, js }: Props) {
  const srcDoc = useMemo(() => buildSandboxDocument(html, css, js), [html, css, js]);
  return (
    <iframe
      title="Output"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 0 }}
    />
  );
}
