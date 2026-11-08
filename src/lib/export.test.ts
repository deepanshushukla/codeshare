import { describe, expect, test } from 'vitest';
import { buildHtmlFile, buildZipBlob, buildReactHtmlFile, buildReactZipBlob } from './export';
import JSZip from 'jszip';

describe('buildHtmlFile', () => {
  test('inlines html, css, and js into one document', () => {
    const file = buildHtmlFile({ html: '<p>hi</p>', css: 'p{color:red}', js: 'console.log(1)' });
    expect(file).toContain('<p>hi</p>');
    expect(file).toContain('p{color:red}');
    expect(file).toContain('console.log(1)');
  });

  test('produces a valid (non-empty) document for entirely empty content', () => {
    const file = buildHtmlFile({ html: '', css: '', js: '' });
    expect(file).toContain('<!DOCTYPE html>');
  });
});

describe('buildZipBlob', () => {
  test('produces a zip with index.html, css/index.css, and js/index.js', async () => {
    const blob = await buildZipBlob({ html: '<p>hi</p>', css: 'p{}', js: '1' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['css/index.css', 'index.html', 'js/index.js']);
  });

  test('does not throw for entirely empty content', async () => {
    await expect(buildZipBlob({ html: '', css: '', js: '' })).resolves.toBeInstanceOf(Blob);
  });
});

describe('buildReactHtmlFile', () => {
  test('embeds componentsJsx before appJsx and the pinned CDN scripts', () => {
    const file = buildReactHtmlFile({ appJsx: 'const a = Shared;', componentsJsx: 'const Shared = 1;', reactCss: '' });
    expect(file).toContain('unpkg.com/react@18.3.1');
    expect(file).toContain('unpkg.com/@babel/standalone@7.26.4');
    expect(file.indexOf('const Shared = 1;')).toBeLessThan(file.indexOf('const a = Shared;'));
  });

  test('strips import/export syntax from appJsx/componentsJsx so real-world React snippets do not throw a bare SyntaxError', () => {
    const file = buildReactHtmlFile({
      appJsx: "import React, { useState } from 'react';\nfunction App() { const [n] = useState(0); return null; }",
      componentsJsx: '',
      reactCss: '',
    });
    expect(file).not.toContain('import React');
    expect(file).toContain('const { useState } = React;');
  });

  test('escapes a literal </script> inside embedded JSX source so it cannot close the mount script early', () => {
    const file = buildReactHtmlFile({
      appJsx: 'const a = "</script><script>alert(1)</script>";',
      componentsJsx: '',
      reactCss: '',
    });
    expect(file).not.toContain('</script><script>alert(1)</script>');
    // The document must still close normally after the mount script.
    expect(file.trim().endsWith('</html>')).toBe(true);
  });

  test("the exported React HTML file actually defines App using Components.jsx's bindings", () => {
    const file = buildReactHtmlFile({
      appJsx: 'function App(){ return React.createElement("div", null, Shared); }',
      componentsJsx: 'const Shared = "hi";',
      reactCss: '',
    });
    // Shared must be in scope when App is defined -- i.e. componentsJsx's text appears textually before appJsx's in the concatenated source Babel.transform receives.
    expect(file.indexOf('const Shared')).toBeLessThan(file.indexOf('function App'));
  });
});

describe('buildReactZipBlob', () => {
  test('produces a zip with App.jsx, Components.jsx, and styles.css', async () => {
    const blob = await buildReactZipBlob({ appJsx: 'x', componentsJsx: 'y', reactCss: 'z' });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['App.jsx', 'Components.jsx', 'index.html', 'styles.css']);
  });

  test("the zip's index.html escapes a literal </script> inside embedded JSX source", async () => {
    const blob = await buildReactZipBlob({
      appJsx: 'const a = "</script><script>alert(1)</script>";',
      componentsJsx: '',
      reactCss: '',
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const indexHtml = await zip.files['index.html'].async('text');
    expect(indexHtml).not.toContain('</script><script>alert(1)</script>');
    expect(indexHtml.trim().endsWith('</html>')).toBe(true);
  });
});
