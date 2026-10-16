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
});
