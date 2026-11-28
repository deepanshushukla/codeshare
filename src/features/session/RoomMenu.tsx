import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Link } from 'react-router-dom';
import { FileCode2, FileArchive, FolderOpen, Link2, LogIn, LogOut, Menu, Sparkles } from 'lucide-react';
import type { SessionType } from './sessionType';
import type { RoomExportContent } from './exportActions';
import styles from './RoomMenu.module.scss';

type Props = {
  exportContent: RoomExportContent;
  themeName: string;
  onCopyLink: () => void;
  onOpenTheme: () => void;
  onExport: (kind: 'html' | 'zip') => void;
  onNewSession: (type: SessionType) => void;
  // Account section. `accountLoading` hides it entirely until auth resolves,
  // so a logged-in visitor never sees a flash of "Log in".
  accountLoading: boolean;
  email: string | null;
  isAnonymous: boolean;
  onLogin: () => void;
  onLogout: () => void;
};

/**
 * The room's single secondary-actions menu, on every screen size: copy link,
 * theme, export, start another room, and the account. Everything that isn't
 * editing (tabs), presence, privacy or Run lives here, so the header stays
 * calm. One flat Radix menu, with no nested dropdowns inside it, so it can't
 * close itself under a nested portal's click.
 *
 * Every action that opens something longer-lived than the menu (theme drawer,
 * login modal) is owned by Header: menu content unmounts on select.
 */
export default function RoomMenu({
  exportContent,
  themeName,
  onCopyLink,
  onOpenTheme,
  onExport,
  onNewSession,
  accountLoading,
  email,
  isAnonymous,
  onLogin,
  onLogout,
}: Props) {
  const currentType: SessionType = exportContent.sessionType === 'react' ? 'react' : 'web';
  const otherType: SessionType = currentType === 'react' ? 'web' : 'react';
  const newSessionLabel = otherType === 'react' ? 'Start React App' : 'Start a new JS App';

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={styles.trigger} aria-label="Menu" title="Menu">
        <Menu size={18} aria-hidden="true" />
      </DropdownMenu.Trigger>
      {/* Portaled: inline it would sit behind CodeMirror's stacking context. */}
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={8} align="end">
          <DropdownMenu.Item className={styles.item} onSelect={onCopyLink}>
            <Link2 size={15} aria-hidden="true" />
            Copy room link
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={onOpenTheme}>
            <span className={styles.swatch} aria-hidden="true" />
            Theme
            <span className={styles.hint}>{themeName}</span>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.label}>Export</DropdownMenu.Label>
          <DropdownMenu.Item className={styles.item} onSelect={() => onExport('html')}>
            <FileCode2 size={15} aria-hidden="true" />
            HTML file
          </DropdownMenu.Item>
          <DropdownMenu.Item className={styles.item} onSelect={() => onExport('zip')}>
            <FileArchive size={15} aria-hidden="true" />
            Zip file
          </DropdownMenu.Item>

          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item className={styles.item} onSelect={() => onNewSession(otherType)}>
            <Sparkles size={15} aria-hidden="true" />
            {newSessionLabel}
          </DropdownMenu.Item>

          {!accountLoading && (
            <>
              <DropdownMenu.Separator className={styles.separator} />
              {isAnonymous ? (
                <DropdownMenu.Item className={styles.item} onSelect={onLogin}>
                  <LogIn size={15} aria-hidden="true" />
                  Log in
                </DropdownMenu.Item>
              ) : (
                <>
                  {email && (
                    <DropdownMenu.Label className={styles.email} title={email}>
                      {email}
                    </DropdownMenu.Label>
                  )}
                  <DropdownMenu.Item className={styles.item} asChild>
                    <Link to="/my-rooms">
                      <FolderOpen size={15} aria-hidden="true" />
                      My Rooms
                    </Link>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className={styles.item} onSelect={onLogout}>
                    <LogOut size={15} aria-hidden="true" />
                    Log out
                  </DropdownMenu.Item>
                </>
              )}
            </>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
