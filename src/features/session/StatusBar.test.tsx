import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { ThemeProvider } from '../theme/ThemeProvider';
import type { ConnectionStatus } from './useSession';

function renderBar(openCount: number, status: ConnectionStatus = 'connected') {
  return render(
    <ThemeProvider>
      <StatusBar openCount={openCount} status={status} />
    </ThemeProvider>,
  );
}

describe('StatusBar', () => {
  it('shows the open pane count and the current theme name', () => {
    renderBar(3);
    expect(screen.getByText('3 panes')).toBeInTheDocument();
    expect(screen.getByText('Abyss')).toBeInTheDocument();
  });

  it('shows the synced indicator and the Alt+1-5 hint', () => {
    renderBar(2);
    expect(screen.getByText('synced')).toBeInTheDocument();
    expect(screen.getByText('Alt + 1–5 toggles panes')).toBeInTheDocument();
  });

  // The indicator used to be hardcoded to "synced", so a dropped connection
  // rendered ConnectionBanner's "Reconnecting…" directly above a footer
  // claiming everything was saved.
  it.each([
    ['connecting', 'connecting…'],
    ['reconnecting', 'reconnecting…'],
    ['write-failed', 'not saved'],
    ['auth-failed', 'sign-in failed'],
  ] as const)('renders %s as "%s" instead of synced', (status, label) => {
    renderBar(2, status);
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.queryByText('synced')).not.toBeInTheDocument();
  });
});
