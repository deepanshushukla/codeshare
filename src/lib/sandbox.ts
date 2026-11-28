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
  // React's development build replays a render error so it is reported as
  // "uncaught" twice in a row; relaying both would double every error in the
  // Console. Only an identical message within a moment of the last is dropped.
  var lastError = { message: null, at: 0 };
  window.onerror = function (message) {
    var text = String(message);
    var now = Date.now();
    if (text === lastError.message && now - lastError.at < 1000) return true;
    lastError = { message: text, at: now };
    parent.postMessage({ type: 'runtime-error', message: text }, '*');
    return true;
  };
  // Keys pressed while the preview has focus stay inside this document, so
  // the parent's Cmd/Ctrl+Enter Run listener would never see them. Forward
  // just that one shortcut (RunControls accepts it only from its own frames).
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      parent.postMessage({ type: 'run-shortcut' }, '*');
    }
  });
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

// Real-world React snippets almost always start with `import React from
// 'react'` (or `import * as React from 'react'`, `import { useState } from
// 'react'`, `export default function App()`), but there is no bundler or
// module loader anywhere in this sandbox -- only the React/ReactDOM UMD
// globals the CDN scripts attach to `window`. A literal `import`/`export`
// statement is invalid syntax inside the `new Function(...)` body the
// transformed code runs in, so without this, pasting completely ordinary
// React code throws a bare SyntaxError. This rewrites every import form
// (default, namespace, named, aliased, combined, multi-line) from 'react' /
// 'react-dom' / 'react-dom/client' into equivalent reads off the globals.
// CSS side-effect imports are dropped (the CSS tab already applies). An
// import from any other package becomes a `throw` naming that package, so
// the user gets "Can't import "lodash"" instead of "Cannot use import
// statement outside a module". Not a full module resolver -- this is a
// playground, not a bundler.
const MODULE_GLOBALS: Record<string, string> = {
  react: 'React',
  'react-dom': 'ReactDOM',
  'react-dom/client': 'ReactDOM',
};

function rewriteImportClause(clause: string, globalName: string): string {
  const statements: string[] = [];
  // Default and/or namespace bindings come before any `{...}` part.
  const braceIndex = clause.indexOf('{');
  const head = braceIndex === -1 ? clause : clause.slice(0, braceIndex);
  for (const part of head.split(',').map((p) => p.trim()).filter(Boolean)) {
    const name = part.replace(/^\*\s*as\s+/, '').trim();
    // Same-name bindings are already in scope (they are the parameters of the
    // `new Function` the code runs in); `const React = React` would be a TDZ error.
    if (name && name !== globalName) statements.push(`const ${name} = ${globalName};`);
  }
  if (braceIndex !== -1) {
    const inner = clause.slice(braceIndex + 1, clause.lastIndexOf('}')).replace(/\b([\w$]+)\s+as\s+([\w$]+)/g, '$1: $2');
    statements.push(`const {${inner}} = ${globalName};`);
  }
  return statements.join(' ');
}

export function stripReactModuleSyntax(source: string): string {
  return (
    source
      // `import <clause> from '<module>';` (clause may span lines)
      .replace(/\bimport\s+(type\s+)?([\w$*{][^;'"]*?)\s+from\s*['"]([^'"]+)['"]\s*;?/g, (_m, typeOnly, clause: string, mod: string) => {
        if (typeOnly) return '';
        const globalName = MODULE_GLOBALS[mod];
        if (!globalName) {
          return `throw new Error(${JSON.stringify(
            `Can't import "${mod}": only "react" and "react-dom" are available in this playground. Define it in the Components tab instead.`,
          )});`;
        }
        return rewriteImportClause(clause, globalName);
      })
      // Side-effect imports: `import './styles.css';`
      .replace(/\bimport\s*['"]([^'"]+)['"]\s*;?/g, (_m, mod: string) =>
        /\.(css|scss|sass|less)$/.test(mod) || MODULE_GLOBALS[mod]
          ? ''
          : `throw new Error(${JSON.stringify(`Can't import "${mod}": only "react" and "react-dom" are available in this playground.`)});`,
      )
      .replace(/export\s+default\s+/g, '')
      .replace(/export\s+(?=function|const|let|var|class|async\s+function)/g, '')
      .replace(/export\s*\{[^}]*\}\s*;?/g, '')
  );
}

// Pinned to React 18.3.1, not 19.x: React 19's npm package ships no `umd/`
// build at all (confirmed via unpkg's ?meta listing), so a 19.x URL here
// 404s silently -- a failed <script src> fires no catchable JS error, so
// window.React simply stays undefined and every mount throws "React is not
// defined" with nothing in the console pointing at the real cause. 18.3.1 is
// the last version with a UMD build and its createRoot API is what this file
// uses, so it's a drop-in swap.
//
// Development builds + crossorigin, on purpose:
// - A React render error is rethrown from *inside* react-dom's own script.
//   Without `crossorigin`, that script is cross-origin to this document, so
//   the browser masks every such error as a bare "Script error." with no
//   message -- the user never learns which variable was undefined. unpkg
//   serves `Access-Control-Allow-Origin: *`, which satisfies the sandbox's
//   opaque (null) origin.
// - The production build replaces React's own messages with "Minified React
//   error #130"; the development build gives the full text.
export function buildReactSandboxDocument(appJsx: string, componentsJsx: string, css: string): string {
  const userCode = JSON.stringify(stripReactModuleSyntax(`${componentsJsx}\n${appJsx}`)).replace(/<\/script/gi, '<\\/script');
  return `<!DOCTYPE html>
<html>
  <head>
    <style id="__cs_style">${css}</style>
    <script src="https://unpkg.com/react@18.3.1/umd/react.development.js" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js" crossorigin="anonymous"></script>
  </head>
  <body>
    <div id="__cs_root"></div>
    <script>${BRIDGE_SCRIPT}</script>
    <script>
      (function () {
        var source = ${userCode};
        function escapeHtml(s) {
          return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
        }
        // Paints a visible error into the output pane, but ONLY when nothing
        // has rendered there yet: an unrelated error later in a session's
        // life (a failed fetch inside an event handler, say) must not wipe
        // out a tree that is working.
        function showError(message) {
          var rootEl = document.getElementById('__cs_root');
          if (!rootEl || rootEl.innerHTML !== '') return;
          rootEl.innerHTML =
            '<pre style="color:#e05252;white-space:pre-wrap;padding:1rem;font-family:monospace;">' + escapeHtml(message) + '</pre>';
        }
        // React 18+ renders asynchronously, so a throw inside the user's App
        // component body happens *outside* the try/catch below and escapes to
        // the window as an error event -- leaving #__cs_root blank (React
        // unmounts the failed tree) with the message only in the Console.
        // This listener gives render errors the same visible treatment
        // transform errors get. It is registered with addEventListener on
        // purpose: BRIDGE_SCRIPT above owns the window.onerror property for
        // the console relay, and assigning that property here would clobber
        // it. (The bridge's handler returns true, which only preventDefaults
        // the event -- additional listeners like this one still run.) This
        // one deliberately does not postMessage the error itself either:
        // the bridge already relays every window error to the parent, so
        // doing it here too would double-log it in the Console.
        // "ReferenceError: count is not defined", not just "count is not
        // defined" -- the error type is half the explanation.
        function describeError(err) {
          if (!err) return 'Unknown error';
          if (typeof err !== 'object') return String(err);
          var text = (err.name ? err.name + ': ' : '') + (err.message || String(err));
          var missing = /^(\\S+) is not defined$/.exec(err.message || '');
          if (err.name === 'ReferenceError' && missing) {
            text += '\\n\\nHint: "' + missing[1] + '" is used but never declared. Check the spelling, or declare/import it' +
              ' (only React and ReactDOM are available as globals).';
          }
          return text;
        }
        window.addEventListener('error', function (event) {
          showError(event.error ? describeError(event.error) : String(event.message));
        });
        // Catches errors thrown while rendering, so the output names the
        // component chain they came from ("in <Counter> <- <App>") instead of
        // leaving a blank pane. componentStack frames look like
        // "at Counter (eval at ...)"; only the component names are kept.
        function ErrorBoundary(props) {
          React.Component.call(this, props);
          this.state = { error: null, components: '' };
        }
        ErrorBoundary.prototype = Object.create(React.Component.prototype);
        ErrorBoundary.prototype.constructor = ErrorBoundary;
        ErrorBoundary.getDerivedStateFromError = function (error) {
          return { error: error };
        };
        ErrorBoundary.prototype.componentDidCatch = function (error, info) {
          var names = [];
          var re = /(?:at|in) ([A-Z][\\w$]*)/g;
          var match;
          var stack = (info && info.componentStack) || '';
          while ((match = re.exec(stack))) {
            if (match[1] !== 'ErrorBoundary' && names.indexOf(match[1]) === -1) names.push(match[1]);
          }
          var components = names.length ? '<' + names.join('> <- <') + '>' : '';
          this.setState({ components: components });
          parent.postMessage({
            type: 'runtime-error',
            message: describeError(error) + (components ? '\\n    in ' + components : ''),
          }, '*');
        };
        ErrorBoundary.prototype.render = function () {
          if (!this.state.error) return this.props.children;
          return React.createElement(
            'pre',
            { style: { color: '#e05252', whiteSpace: 'pre-wrap', padding: '1rem', fontFamily: 'monospace' } },
            describeError(this.state.error) + (this.state.components ? '\\n\\n    in ' + this.state.components : '')
          );
        };
        // Nothing authored yet (a brand-new React room before its first Run):
        // skip the transform/construct/render entirely. Running them on blank
        // source made Babel emit an empty module and the constructed function
        // 'return App;' throw "App is not defined" -- a fabricated error in
        // the Console, painted under the Output pane's own empty state.
        if (!source.trim()) return;
        try {
          var transformed = Babel.transform(source, { presets: ['react'] }).code;
          var App = new Function(
            'React',
            'ReactDOM',
            transformed + "\\nreturn typeof App === 'undefined' ? undefined : App;"
          )(React, ReactDOM);
          if (typeof App !== 'function' && !(App && typeof App === 'object' && App.$$typeof)) {
            throw new Error(
              App === undefined
                ? 'No component named App was found. Define one, e.g. "function App() { return <h1>Hi</h1>; }" -- it is what gets rendered.'
                : 'App must be a React component (a function or class), but it is ' + typeof App + '.'
            );
          }
          ReactDOM.createRoot(document.getElementById('__cs_root')).render(
            React.createElement(ErrorBoundary, null, React.createElement(App))
          );
        } catch (err) {
          var message = describeError(err);
          showError(message);
          parent.postMessage({ type: 'runtime-error', message: message }, '*');
        }
      })();
    </script>
  </body>
</html>`;
}
