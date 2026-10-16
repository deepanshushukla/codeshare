// Builds the HTML document rendered inside the sandboxed output <iframe>.
//
// SECURITY: this is the ONLY place in the app where user-authored JS is
// allowed to execute. It never runs in the main application window -- it is
// injected as `srcDoc` into an <iframe sandbox="allow-scripts"> (see
// OutputFrame.tsx), which gives the iframe an opaque origin with no
// `allow-same-origin`. That means even if this bridge script has a bug, the
// iframe cannot reach the parent window's localStorage, cookies, or JS
// globals (e.g. the Supabase client instance). There is no eval() or
// `new Function()` anywhere in the main app's React tree; the user's JS is
// executed only because the browser parses and runs a <script> tag inside
// this separately-sandboxed document, exactly as it would for any other
// HTML page.
export type ConsoleEntry = { id: string; level: 'log' | 'warn' | 'error' | 'info'; args: unknown[] };

export type SandboxMessage =
  | { type: 'console'; level: ConsoleEntry['level']; args: unknown[] }
  | { type: 'runtime-error'; message: string };

// This string is injected into the sandboxed iframe's own document and runs
// only in that isolated context -- never in the main window. It wraps
// console methods and window.onerror so output/errors are relayed to the
// parent via postMessage instead of being silently dropped inside the
// sandboxed frame (which has no visible devtools console of its own). It
// also listens for `{ type: 'repl', code }` messages from the parent
// (Console panel REPL input, see ConsolePanel.tsx / SessionWorkspace.tsx)
// and `eval`s them -- but that eval runs inside this sandboxed document's
// own opaque `about:srcdoc` origin (no `allow-same-origin`), so it cannot
// reach the parent window's Supabase client, storage, or anything else
// outside the iframe. There is still no eval() anywhere in the main app's
// React tree.
const BRIDGE_SCRIPT = `
(function () {
  function wrap(level, original) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      parent.postMessage({ type: 'console', level: level, args: args }, '*');
      original.apply(console, args);
    };
  }
  console.log = wrap('log', console.log);
  console.warn = wrap('warn', console.warn);
  console.error = wrap('error', console.error);
  console.info = wrap('info', console.info);
  window.onerror = function (message) {
    parent.postMessage({ type: 'runtime-error', message: String(message) }, '*');
    return true;
  };
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'repl') {
      try {
        console.log(eval(event.data.code));
      } catch (err) {
        console.error(err);
      }
    }
  });
})();
`;

export function buildSandboxDocument(html: string, css: string, js: string): string {
  return `<!DOCTYPE html>
<html>
  <head><style>${css}</style></head>
  <body>
    ${html}
    <script>${BRIDGE_SCRIPT}</script>
    <script>${js}</script>
  </body>
</html>`;
}
