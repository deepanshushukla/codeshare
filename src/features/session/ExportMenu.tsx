import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { saveAs } from 'file-saver';
import { Download } from 'lucide-react';
import {
  buildHtmlFile,
  buildZipBlob,
  buildReactHtmlFile,
  buildReactZipBlob,
  type ExportContent,
  type ReactExportContent,
} from '../../lib/export';
import styles from './ExportMenu.module.scss';

function timestampedName(extension: string): string {
  return `CodeShare_${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
}

// `onExported` is how Header turns a successful export into a toast: Header
// owns the single useToast() instance (copy-link needs it too), so this
// component reports the filename up rather than rendering any feedback itself.
type Props = (({ sessionType?: 'web' } & ExportContent) | ({ sessionType: 'react' } & ReactExportContent)) & {
  onExported?: (filename: string) => void;
  // 'header': the ghost ring-button that sits directly in the desktop
  // `.actions` row (default, unchanged). 'menuRow': a full-width list row
  // with the label always visible -- used when Header's MoreMenu nests this
  // component inside its mobile panel instead, where it needs to look like
  // Theme/New-session's plain rows, not a standalone bordered button.
  variant?: 'header' | 'menuRow';
};

export default function ExportMenu({ onExported, variant = 'header', ...content }: Props) {
  const isMenuRow = variant === 'menuRow';
  async function exportHtml() {
    const filename = timestampedName('html');
    const file = content.sessionType === 'react' ? buildReactHtmlFile(content) : buildHtmlFile(content);
    saveAs(new Blob([file], { type: 'text/html;charset=utf-8' }), filename);
    onExported?.(filename);
  }
  async function exportZip() {
    const filename = timestampedName('zip');
    // Awaited before saveAs, so a zip that fails to build never reports success.
    const blob = content.sessionType === 'react' ? await buildReactZipBlob(content) : await buildZipBlob(content);
    saveAs(blob, filename);
    onExported?.(filename);
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={isMenuRow ? styles.menuRowTrigger : styles.trigger} aria-label="Export" title="Export">
        <Download size={15} />
        {/* CSS-hidden below 760px (icon-only there) in the 'header' variant
            rather than conditionally rendered, so crossing the breakpoint
            can't drop the label mid-open. The 'menuRow' variant has no such
            hide -- it never renders in that cramped row, only inside
            MoreMenu's panel, which always has room for the label. */}
        <span className={isMenuRow ? undefined : styles.label}>Export</span>
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
