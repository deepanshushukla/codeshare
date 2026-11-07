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
export type ConsoleEntry = { id: string; level: 'log' | 'warn' | 'error' | 'info' | 'result'; args: unknown[] };

export type SandboxMessage =
  | { type: 'console'; level: ConsoleEntry['level']; args: unknown[] }
  | { type: 'runtime-error'; message: string };

// `parent.postMessage` (used by the bridge below to relay console calls out
// of the sandboxed iframe) carries its payload through the structured-clone
// algorithm, which cannot clone DOM nodes, functions, or symbols -- it
// throws DataCloneError synchronously instead. Before this existed, logging
// a DOM element (`console.log(document.createElement('button'))`) threw
// *inside* the wrapped console.log, which both skipped the native
// console.log passthrough and surfaced as an uncaught exception in the
// user's own script. This walks a console argument and swaps in a
// clone-safe stand-in for anything postMessage can't carry, so logging a
// DOM node (or a function, or an object containing either) behaves like a
// normal console call instead of crashing the sandbox.
//
// Exported so it has real unit tests against actual DOM nodes/functions
// (see sandbox.test.ts) rather than only being exercised as an opaque
// string inside BRIDGE_SCRIPT. Its source is embedded into BRIDGE_SCRIPT via
// `.toString()` below so the sandboxed iframe runs this exact, tested
// implementation -- not a hand-copied duplicate that could drift from it.
export function serializeForBridge(value: unknown, seen: unknown[] = [], depth = 4): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') {
      return `[Function: ${(value as (...args: unknown[]) => unknown).name || 'anonymous'}]`;
    }
    if (typeof value === 'symbol') return value.toString();
    return value;
  }
  if (typeof Node !== 'undefined' && value instanceof Node) {
    if (value.nodeType === 1) {
      const el = value as Element;
      const id = el.id ? `#${el.id}` : '';
      const classes = typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      return `<${el.tagName.toLowerCase()}${id}${classes}>`;
    }
    return '[Node]';
  }
  // Error/Date/RegExp are structured-cloneable natively -- leave them as-is
  // so ConsolePanel's `instanceof Error` display logic keeps working.
  if (value instanceof Error || value instanceof Date || value instanceof RegExp) return value;
  if (seen.includes(value)) return '[Circular]';
  if (depth <= 0) return Array.isArray(value) ? '[Array]' : '[Object]';
  const nextSeen = seen.concat([value]);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => serializeForBridge(item, nextSeen, depth - 1));
  }
  if (value instanceof Map) {
    return Array.from(value.entries())
      .slice(0, 100)
      .map(([k, v]) => [serializeForBridge(k, nextSeen, depth - 1), serializeForBridge(v, nextSeen, depth - 1)]);
  }
  if (value instanceof Set) {
    return Array.from(value.values())
      .slice(0, 100)
      .map((v) => serializeForBridge(v, nextSeen, depth - 1));
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value as object).slice(0, 100)) {
    result[key] = serializeForBridge((value as Record<string, unknown>)[key], nextSeen, depth - 1);
  }
  return result;
}

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
  var serializeForBridge = ${serializeForBridge.toString()};
  function wrap(level, original) {
    return function () {
      var args = Array.prototype.slice.call(arguments);
      try {
        var safeArgs = args.map(function (a) { return serializeForBridge(a); });
        parent.postMessage({ type: 'console', level: level, args: safeArgs }, '*');
      } catch (err) {
        // Last-resort fallback so a value serializeForBridge didn't catch
        // (or a postMessage quirk) still can't crash the user's script --
        // the native console call below still runs either way.
        try {
          parent.postMessage({ type: 'console', level: level, args: args.map(String) }, '*');
        } catch (err2) {
          // Give up relaying this one; never let the bridge itself throw.
        }
      }
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
        var replResult = eval(event.data.code);
        parent.postMessage({ type: 'console', level: 'result', args: [serializeForBridge(replResult)] }, '*');
      } catch (err) {
        parent.postMessage({ type: 'console', level: 'error', args: [err] }, '*');
      }
    } else if (event.data && event.data.type === 'update') {
      // Live HTML/CSS preview: patches the DOM in place via innerHTML/
      // textContent, never eval or a document reload -- so it never re-runs
      // the user's <script> (that stays Run-button-only, see OutputFrame.tsx)
      // and never throws the mid-keystroke syntax errors a reload would.
      var styleEl = document.getElementById('__cs_style');
      if (styleEl) styleEl.textContent = event.data.css;
      var rootEl = document.getElementById('__cs_root');
      if (rootEl) rootEl.innerHTML = event.data.html;
    }
  });
})();
`;

export function buildSandboxDocument(html: string, css: string, js: string): string {
  // html/css live inside id'd elements (not bare in the body) so the bridge's
  // 'update' handler above can target them directly -- see OutputFrame.tsx
  // for what posts those messages and why only html/css do, never js.
  return `<!DOCTYPE html>
<html>
  <head><style id="__cs_style">${css}</style></head>
  <body>
    <div id="__cs_root">${html}</div>
    <script>${BRIDGE_SCRIPT}</script>
    <script>${js}</script>
  </body>
</html>`;
}

export function buildReactSandboxDocument(appJsx: string, componentsJsx: string, css: string): string {
  const userCode = JSON.stringify(`${componentsJsx}\n${appJsx}`).replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html>
<html>
  <head>
    <style id="__cs_style">${css}</style>
    <script src="https://unpkg.com/react@19.2.0/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@19.2.0/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>
  </head>
  <body>
    <div id="__cs_root"></div>
    <script>${BRIDGE_SCRIPT}</script>
    <script>
      (function () {
        function escapeHtml(s) {
          return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
        }
        try {
          var transformed = Babel.transform(${userCode}, { presets: ['react'] }).code;
          var App = new Function('React', 'ReactDOM', transformed + '\\nreturn App;')(React, ReactDOM);
          ReactDOM.createRoot(document.getElementById('__cs_root')).render(React.createElement(App));
        } catch (err) {
          var message = String((err && err.message) || err);
          document.getElementById('__cs_root').innerHTML =
            '<pre style="color:#e05252;white-space:pre-wrap;padding:1rem;font-family:monospace;">' + escapeHtml(message) + '</pre>';
          parent.postMessage({ type: 'runtime-error', message: message }, '*');
        }
      })();
    </script>
  </body>
</html>`;
}
