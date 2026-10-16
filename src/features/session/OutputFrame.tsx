import { useMemo } from 'react';
import { buildSandboxDocument } from '../../lib/sandbox';

type Props = {
  html: string;
  css: string;
  js: string;
  runToken: number;
  onWindowReady: (win: Window | null) => void;
};

// SECURITY: this is the single place user-authored JS runs. `srcDoc` is
// parsed by the browser into a brand-new, separately-sandboxed document --
// not evaluated by this app's JS -- and `sandbox="allow-scripts"` (with no
// `allow-same-origin`) gives that document an opaque origin, so it cannot
// reach this window's localStorage, cookies, or JS globals (e.g. the
// Supabase client) even if the postMessage bridge in sandbox.ts has a bug.
//
// `runToken` is bumped by the Run button/Ctrl+Enter shortcut (see
// RunControls.tsx / SessionWorkspace.tsx) and used as the iframe's React
// `key`. That forces React to tear down and recreate the <iframe> element
// -- which is what actually re-executes the inline <script> -- rather than
// re-running on every keystroke the way reassigning `srcDoc` alone would
// not reliably do across browsers.
export default function OutputFrame({ html, css, js, runToken, onWindowReady }: Props) {
  const srcDoc = useMemo(() => buildSandboxDocument(html, css, js), [html, css, js, runToken]);
  return (
    <iframe
      key={runToken}
      title="Output"
      srcDoc={srcDoc}
      sandbox="allow-scripts"
      style={{ width: '100%', height: '100%', border: 0 }}
      onLoad={(e) => onWindowReady(e.currentTarget.contentWindow)}
    />
  );
}
