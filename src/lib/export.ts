import JSZip from 'jszip';

export type ExportContent = { html: string; css: string; js: string };

export type ReactExportContent = { appJsx: string; componentsJsx: string; reactCss: string };

export function buildHtmlFile({ html, css, js }: ExportContent): string {
  return `<!DOCTYPE html>
<html>
  <head><style>${css}</style></head>
  <body>
    ${html}
    <script>${js}</script>
  </body>
</html>`;
}

export async function buildZipBlob({ html, css, js }: ExportContent): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'index.html',
    `<!DOCTYPE html><html><head><link href="./css/index.css" rel="stylesheet"></head><body>${html}<script src="./js/index.js"></script></body></html>`,
  );
  zip.file('css/index.css', css, { createFolders: false });
  zip.file('js/index.js', js, { createFolders: false });
  return zip.generateAsync({ type: 'blob' });
}

// Same inline Babel-transform-and-mount technique as buildReactSandboxDocument
// in sandbox.ts (Task 4), reimplemented independently here -- export.ts has no
// dependency on sandbox.ts and this file produces a different artifact (a
// downloadable document, not a live sandboxed iframe), so there's no shared
// error-display wrapper: an uncaught exception just surfaces in the browser
// console when the exported file is opened, which is acceptable here.
//
// The componentsJsx+appJsx source is JSON.stringify'd so it can be embedded
// as a JS string literal inside a <script> tag below. JSON.stringify does NOT
// escape a literal `</script` substring inside the string, and the HTML
// parser doesn't care that it's inside a quoted JS string -- it will still
// treat `</script` as closing the tag early, truncating the document. The
// `.replace(...)` guards against that the same way buildReactSandboxDocument
// does.
// Pinned to React 18.3.1, not 19.x -- see the matching comment in
// src/lib/sandbox.ts: React 19's npm package ships no `umd/` build, so a
// 19.x URL here 404s silently and the exported file never renders.
//
// stripReactModuleSyntax is the same rewrite as sandbox.ts's function of the
// same name (duplicated, not imported, per this file's independence from
// sandbox.ts noted above): real React snippets open with `import React from
// 'react'` or `export default function App()`, which are invalid syntax
// inside the `new Function(...)` body below -- there's no bundler here, only
// the React/ReactDOM UMD globals the CDN scripts attach to `window`.
function stripReactModuleSyntax(source: string): string {
  return source
    .replace(/import\s+React\s*,\s*\{([^}]*)\}\s*from\s*['"]react['"]\s*;?/g, 'const {$1} = React;')
    .replace(/import\s+React\s*from\s*['"]react['"]\s*;?/g, '')
    .replace(/import\s*\{([^}]*)\}\s*from\s*['"]react['"]\s*;?/g, 'const {$1} = React;')
    .replace(/import\s+ReactDOM\s*from\s*['"]react-dom(?:\/client)?['"]\s*;?/g, '')
    .replace(/export\s+default\s+/g, '')
    .replace(/export\s+(?=function|const|let|var|class)/g, '');
}

function reactMountScript(appJsx: string, componentsJsx: string): string {
  const userCode = JSON.stringify(stripReactModuleSyntax(`${componentsJsx}\n${appJsx}`)).replace(/<\/script/gi, '<\\/script');
  return `
    <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone@7.26.4/babel.min.js"></script>
    <script>
      (function () {
        var transformed = Babel.transform(${userCode}, { presets: ['react'] }).code;
        var App = new Function('React', 'ReactDOM', transformed + '\\nreturn App;')(React, ReactDOM);
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
      })();
    </script>`;
}

export function buildReactHtmlFile({ appJsx, componentsJsx, reactCss }: ReactExportContent): string {
  return `<!DOCTYPE html>
<html>
  <head><style>${reactCss}</style></head>
  <body>
    <div id="root"></div>
    ${reactMountScript(appJsx, componentsJsx)}
  </body>
</html>`;
}

export async function buildReactZipBlob({ appJsx, componentsJsx, reactCss }: ReactExportContent): Promise<Blob> {
  const zip = new JSZip();
  zip.file(
    'index.html',
    `<!DOCTYPE html>
<html>
  <head><link href="./styles.css" rel="stylesheet"></head>
  <body>
    <div id="root"></div>
    ${reactMountScript(appJsx, componentsJsx)}
  </body>
</html>`,
  );
  zip.file('App.jsx', appJsx, { createFolders: false });
  zip.file('Components.jsx', componentsJsx, { createFolders: false });
  zip.file('styles.css', reactCss, { createFolders: false });
  return zip.generateAsync({ type: 'blob' });
}
