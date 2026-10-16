import JSZip from 'jszip';

export type ExportContent = { html: string; css: string; js: string };

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
