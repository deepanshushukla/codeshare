import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import { buildHtmlFile, buildZipBlob, type ExportContent } from '../../lib/export';
import styles from './ExportMenu.module.scss';

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
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Export">
        <Download size={16} />
        Export
      </DropdownMenu.Trigger>
      {/* Radix renders Content into a portal with no styling of its own, so
          without these classes the menu is transparent text over the page. */}
      <DropdownMenu.Content className={styles.content} sideOffset={6} align="end">
        <DropdownMenu.Item className={styles.item} onSelect={exportHtml}>
          HTML file
        </DropdownMenu.Item>
        <DropdownMenu.Item className={styles.item} onSelect={exportZip}>
          Zip file
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
