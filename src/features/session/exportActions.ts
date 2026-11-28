import { saveAs } from 'file-saver';
import {
  buildHtmlFile,
  buildZipBlob,
  buildReactHtmlFile,
  buildReactZipBlob,
  type ExportContent,
  type ReactExportContent,
} from '../../lib/export';

export type RoomExportContent = ({ sessionType?: 'web' } & ExportContent) | ({ sessionType: 'react' } & ReactExportContent);

function timestampedName(extension: string): string {
  return `CodeShare_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

/**
 * Builds and downloads the room as a single HTML file or a ZIP, and resolves
 * with the filename so the caller can report it (Header turns it into a
 * toast). The ZIP is awaited before saveAs, so a build that fails never
 * reports success.
 */
export async function exportRoom(kind: 'html' | 'zip', content: RoomExportContent): Promise<string> {
  const filename = timestampedName(kind);
  if (kind === 'html') {
    const file = content.sessionType === 'react' ? buildReactHtmlFile(content) : buildHtmlFile(content);
    saveAs(new Blob([file], { type: 'text/html;charset=utf-8' }), filename);
  } else {
    const blob = content.sessionType === 'react' ? await buildReactZipBlob(content) : await buildZipBlob(content);
    saveAs(blob, filename);
  }
  return filename;
}
