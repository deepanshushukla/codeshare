import { describe, expect, test } from 'vitest';
import { buildHtmlFile, buildZipBlob } from './export';
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
