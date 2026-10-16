import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import { buildHtmlFile, buildZipBlob, type ExportContent } from '../../lib/export';

function timestampedName(extension: string): string {
  return `CodeShare_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

export default function ExportMenu(content: ExportContent) {
  async function exportHtml() {
    saveAs(new Blob([buildHtmlFile(content)], { type: 'text/html;charset=utf-8' }), timestampedName('html'));
  }
  async function exportZip() {
    saveAs(await buildZipBlob(content), timestampedName('zip'));
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label="Export">
        <Download size={16} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Item onSelect={exportHtml}>HTML file</DropdownMenu.Item>
        <DropdownMenu.Item onSelect={exportZip}>Zip file</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
