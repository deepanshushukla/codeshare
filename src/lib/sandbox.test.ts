import { describe, expect, test } from 'vitest';
import { buildSandboxDocument, buildReactSandboxDocument, serializeForBridge } from './sandbox';

describe('buildSandboxDocument', () => {
  test('embeds the given html, css, and js', () => {
    const doc = buildSandboxDocument('<p>hi</p>', 'p{color:red}', 'console.log(1)');
    expect(doc).toContain('<p>hi</p>');
    expect(doc).toContain('p{color:red}');
    expect(doc).toContain('console.log(1)');
  });

  test('includes a window.onerror handler that posts a runtime-error message', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain('window.onerror');
    expect(doc).toContain("type: 'runtime-error'");
  });

  test('wraps console methods to post console messages instead of calling the native console directly', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain("type: 'console'");
    expect(doc).toMatch(/console\.(log|error|warn|info)\s*=/);
  });

  test('posts a result-level console message for a successful REPL eval, not a log-level one', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain("level: 'result'");
    expect(doc).not.toMatch(/console\.log\(eval\(/);
  });

  test('wraps html and css in elements the bridge can patch live, by id', () => {
    const doc = buildSandboxDocument('<p>hi</p>', 'p{color:red}', '');
    expect(doc).toContain('<div id="__cs_root"><p>hi</p></div>');
    expect(doc).toContain('<style id="__cs_style">p{color:red}</style>');
  });

  test('bridge listens for update messages and patches the DOM in place, not via eval or reload', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain("event.data.type === 'update'");
    expect(doc).toContain("getElementById('__cs_root')");
    expect(doc).toContain("getElementById('__cs_style')");
    expect(doc).not.toMatch(/eval\(event\.data\.html\)/);
  });

  test('bridge sanitizes console args through serializeForBridge before posting them', () => {
    const doc = buildSandboxDocument('', '', '');
    expect(doc).toContain('serializeForBridge');
  });
});

// console.log(someButton) used to throw `DataCloneError: ... could not be
// cloned` from inside the bridge's wrapped console.log, because
// postMessage's structured-clone algorithm cannot clone DOM nodes or
// functions. That throw happened before the native console.log ran, so the
// user lost both the postMessage relay *and* the native log, and the error
// surfaced as an uncaught exception in their own script. serializeForBridge
// is the fix: it walks a console argument and swaps in a clone-safe stand-in
// for anything postMessage can't carry, so logging a DOM node behaves like a
// normal console call instead of crashing the sandbox.
describe('serializeForBridge', () => {
  test('passes primitives through unchanged', () => {
    expect(serializeForBridge('hi')).toBe('hi');
    expect(serializeForBridge(42)).toBe(42);
    expect(serializeForBridge(true)).toBe(true);
    expect(serializeForBridge(null)).toBe(null);
    expect(serializeForBridge(undefined)).toBe(undefined);
  });

  test('describes a DOM element instead of trying to clone it', () => {
    const button = document.createElement('button');
    button.id = 'go';
    button.className = 'primary big';
    expect(serializeForBridge(button)).toBe('<button#go.primary.big>');
  });

  test('describes a bare element with no id or class', () => {
    const div = document.createElement('div');
    expect(serializeForBridge(div)).toBe('<div>');
  });

  test('stringifies functions instead of trying to clone them', () => {
    function greet() {}
    expect(serializeForBridge(greet)).toBe('[Function: greet]');
    expect(serializeForBridge(() => {})).toBe('[Function: anonymous]');
  });

  test('leaves Error, Date, and RegExp instances alone -- those clone fine natively', () => {
    const err = new Error('boom');
    const date = new Date(0);
    const re = /x/g;
    expect(serializeForBridge(err)).toBe(err);
    expect(serializeForBridge(date)).toBe(date);
    expect(serializeForBridge(re)).toBe(re);
  });

  test('recursively sanitizes arrays and plain objects', () => {
    const button = document.createElement('button');
    expect(serializeForBridge([1, 'a', button])).toEqual([1, 'a', '<button>']);
    expect(serializeForBridge({ el: button, n: 1 })).toEqual({ el: '<button>', n: 1 });
  });

  test('breaks circular references instead of recursing forever', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(serializeForBridge(obj)).toEqual({ a: 1, self: '[Circular]' });
  });

  test('bottoms out past the depth limit instead of walking unbounded structures', () => {
    const deep = { a: { b: { c: { d: { e: 1 } } } } };
    expect(serializeForBridge(deep, [], 2)).toEqual({ a: { b: '[Object]' } });
  });
});

describe('buildReactSandboxDocument', () => {
  test('includes pinned CDN script tags for React, ReactDOM, and Babel Standalone', () => {
    const doc = buildReactSandboxDocument('function App(){return null;}', '', '');
    expect(doc).toContain('https://unpkg.com/react@19.2.0/umd/react.production.min.js');
    expect(doc).toContain('https://unpkg.com/react-dom@19.2.0/umd/react-dom.production.min.js');
    expect(doc).toContain('https://unpkg.com/@babel/standalone@7.26.4/babel.min.js');
  });

  test('inlines css into the id="__cs_style" tag', () => {
    const doc = buildReactSandboxDocument('function App(){return null;}', '', 'body{color:red}');
    expect(doc).toContain('<style id="__cs_style">body{color:red}</style>');
  });

  test('concatenates componentsJsx before appJsx in the transform source', () => {
    const doc = buildReactSandboxDocument('const a = Shared;', 'const Shared = 1;', '');
    // Both must appear, componentsJsx first, inside whatever script carries the source to Babel.transform.
    expect(doc.indexOf('const Shared = 1;')).toBeLessThan(doc.indexOf('const a = Shared;'));
  });

  test('includes the existing BRIDGE_SCRIPT for console/REPL relay', () => {
    const doc = buildReactSandboxDocument('function App(){return null;}', '', '');
    expect(doc).toContain('console.log = wrap');
  });

  test('the catch block always wires both the visible #__cs_root error display and the runtime-error postMessage relay', () => {
    const doc = buildReactSandboxDocument('function App(){return null;}', '', '');
    const catchBlock = doc.slice(doc.indexOf('} catch (err) {'));
    expect(catchBlock).toContain("getElementById('__cs_root')");
    expect(catchBlock).toContain("type: 'runtime-error'");
  });
});
