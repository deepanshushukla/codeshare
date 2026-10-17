import { useEffect, useMemo, useRef } from 'react';
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
  // Read only at the moment of a Run, never as a reactive dependency: this
  // iframe stays mounted continuously (see SessionWorkspace's off-screen
  // wrapper) so Run/REPL work before the user ever opens the Output tab, but
  // that means `html`/`css`/`js` change on every keystroke. If `srcDoc` were
  // recomputed from those directly, the browser reloads the iframe's
  // document on every change -- rerunning the user's JS, mid-keystroke,
  // against invalid/incomplete syntax, flooding the Console with transient
  // errors nobody asked for. The ref decouples "latest content" from "when
  // we actually (re)run": only a runToken change rebuilds srcDoc, and it
  // reads whatever content was current at that instant.
  const latestContentRef = useRef({ html, css, js });
  latestContentRef.current = { html, css, js };

  const srcDoc = useMemo(() => {
    // Before the first Run, show an empty (but still bridge-scripted, so
    // Run/REPL work immediately) document rather than auto-running on load.
    if (runToken === 0) return buildSandboxDocument('', '', '');
    const { html, css, js } = latestContentRef.current;
    return buildSandboxDocument(html, css, js);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  const onWindowReadyRef = useRef(onWindowReady);
  useEffect(() => {
    onWindowReadyRef.current = onWindowReady;
  }, [onWindowReady]);
  // Hand back a null window whenever the <iframe> this component owns goes
  // away -- both on unmount and when a Run bumps `runToken` and so replaces
  // the element. The parent otherwise keeps a handle on a destroyed window and
  // posts REPL input into the void.
  useEffect(
    () => () => {
      onWindowReadyRef.current(null);
    },
    [runToken],
  );

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
