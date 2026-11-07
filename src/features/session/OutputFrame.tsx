import { useEffect, useMemo, useRef } from 'react';
import { buildReactSandboxDocument, buildSandboxDocument } from '../../lib/sandbox';

type Props =
  | { sessionType?: 'web'; html: string; css: string; js: string; runToken: number; onWindowReady: (win: Window | null) => void }
  | { sessionType: 'react'; appJsx: string; componentsJsx: string; reactCss: string; runToken: number; onWindowReady: (win: Window | null) => void };

// SECURITY: this is the single place user-authored JS runs. `srcDoc` is
// parsed by the browser into a brand-new, separately-sandboxed document --
// not evaluated by this app's JS -- and `sandbox="allow-scripts allow-modals"`
// (with no `allow-same-origin`) gives that document an opaque origin, so it
// cannot reach this window's localStorage, cookies, or JS globals (e.g. the
// Supabase client) even if the postMessage bridge in sandbox.ts has a bug.
// `allow-modals` only re-enables alert/confirm/prompt -- expected to work in
// a code playground -- and only affects the tab of whoever clicked Run
// themselves: `runToken` is local React state (see SessionWorkspace.tsx),
// never broadcast, so one person's alert() can't block anyone else's Output.
//
// `runToken` is bumped by the Run button/Ctrl+Enter shortcut (see
// RunControls.tsx / SessionWorkspace.tsx) and used as the iframe's React
// `key`. That forces React to tear down and recreate the <iframe> element
// -- which is what actually re-executes the inline <script> -- rather than
// re-running on every keystroke the way reassigning `srcDoc` alone would
// not reliably do across browsers.
export default function OutputFrame(props: Props) {
  const { runToken, onWindowReady } = props;

  // Read only at the moment of a Run, never as a reactive dependency: this
  // iframe stays mounted continuously (see SessionWorkspace's off-screen
  // wrapper) so Run/REPL work before the user ever opens the Output tab, but
  // that means `html`/`css`/`js` (or `appJsx`/`componentsJsx`/`reactCss` in
  // React mode) change on every keystroke. If `srcDoc` were recomputed from
  // those directly, the browser reloads the iframe's document on every
  // change -- rerunning the user's JS, mid-keystroke, against
  // invalid/incomplete syntax, flooding the Console with transient errors
  // nobody asked for. The ref decouples "latest content" from "when we
  // actually (re)run": only a runToken change rebuilds srcDoc, and it reads
  // whatever content was current at that instant.
  const latestContentRef = useRef(props);
  latestContentRef.current = props;

  const srcDoc = useMemo(() => {
    const current = latestContentRef.current;
    if (current.sessionType === 'react') {
      // Before the first Run, show an empty (but still bridge-scripted, so
      // Run/REPL work immediately) document rather than auto-running on load.
      if (runToken === 0) return buildReactSandboxDocument('', '', '');
      return buildReactSandboxDocument(current.appJsx, current.componentsJsx, current.reactCss);
    }
    // Before the first Run, show an empty (but still bridge-scripted, so
    // Run/REPL work immediately) document rather than auto-running on load.
    if (runToken === 0) return buildSandboxDocument('', '', '');
    return buildSandboxDocument(current.html, current.css, current.js);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runToken]);

  const onWindowReadyRef = useRef(onWindowReady);
  useEffect(() => {
    onWindowReadyRef.current = onWindowReady;
  }, [onWindowReady]);

  // Live HTML/CSS preview, decoupled from Run: frameWindowRef is only set
  // once this exact iframe instance has fired onLoad (so its bridge script's
  // message listener actually exists), and is nulled again whenever runToken
  // replaces the element -- so a stray postMessage can never reach a
  // destroyed iframe or race a not-yet-loaded one. JS is deliberately not a
  // dependency here: it only ever takes effect via the runToken-gated srcDoc
  // rebuild above (an explicit Run), because unlike HTML/CSS -- which a
  // browser parses leniently, mid-keystroke, with no errors -- JS throws on
  // incomplete syntax, which is the exact bug this split fixes (see
  // sandbox.ts's 'update' handler for the receiving end).
  //
  // React mode has no live-patch path at all (per the Run-model decision for
  // React sessions): every change there only takes effect on the next
  // explicit Run, so this effect is skipped entirely for `sessionType ===
  // 'react'` -- it never posts an 'update' message.
  const frameWindowRef = useRef<Window | null>(null);
  const html = props.sessionType === 'react' ? undefined : props.html;
  const css = props.sessionType === 'react' ? undefined : props.css;
  useEffect(() => {
    if (props.sessionType === 'react') return;
    frameWindowRef.current?.postMessage({ type: 'update', html, css }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.sessionType, html, css]);

  // Hand back a null window whenever the <iframe> this component owns goes
  // away -- both on unmount and when a Run bumps `runToken` and so replaces
  // the element. The parent otherwise keeps a handle on a destroyed window and
  // posts REPL input into the void.
  useEffect(
    () => () => {
      onWindowReadyRef.current(null);
      frameWindowRef.current = null;
    },
    [runToken],
  );

  return (
    <iframe
      key={runToken}
      title="Output"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-modals"
      style={{ width: '100%', height: '100%', border: 0 }}
      onLoad={(e) => {
        frameWindowRef.current = e.currentTarget.contentWindow;
        onWindowReady(e.currentTarget.contentWindow);
      }}
    />
  );
}
