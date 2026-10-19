import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import { buildHtmlFile, buildZipBlob, type ExportContent } from '../../lib/export';
import styles from './ExportMenu.module.scss';

function timestampedName(extension: string): string {
  return `CodeShare_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

// `onExported` is how Header turns a successful export into a toast: Header
// owns the single useToast() instance (copy-link needs it too), so this
// component reports the filename up rather than rendering any feedback itself.
type Props = ExportContent & { onExported?: (filename: string) => void };

export default function ExportMenu({ onExported, ...content }: Props) {
  async function exportHtml() {
    const filename = timestampedName('html');
    saveAs(new Blob([buildHtmlFile(content)], { type: 'text/html;charset=utf-8' }), filename);
    onExported?.(filename);
  }
  async function exportZip() {
    const filename = timestampedName('zip');
    // Awaited before saveAs, so a zip that fails to build never reports success.
    saveAs(await buildZipBlob(content), filename);
    onExported?.(filename);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Export" title="Export">
        <Download size={15} />
        {/* CSS-hidden below 760px (icon-only there) rather than conditionally
            rendered, so crossing the breakpoint can't drop the label mid-open. */}
        <span className={styles.label}>Export</span>
      </DropdownMenu.Trigger>
      {/* Content must be explicitly placed in a Portal -- Radix does NOT do
          this on its own. Without it, Content renders inline in the header's
          own stacking context, which puts it behind the resizable panes
          (CodeMirror in particular establishes its own stacking context), not
          floating above the page where its fixed positioning intends it. */}
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={6} align="end">
          <DropdownMenu.Item className={styles.item} onSelect={exportHtml}>
            HTML file
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={exportZip}>
            Zip file
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
