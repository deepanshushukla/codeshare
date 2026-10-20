import { describe, expect, test } from 'vitest';
import { buildSandboxDocument } from './sandbox';

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
});
