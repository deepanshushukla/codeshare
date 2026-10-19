import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { ThemeProvider } from '../theme/ThemeProvider';

describe('StatusBar', () => {
  it('shows the open pane count and the current theme name', () => {
    render(
      <ThemeProvider>
        <StatusBar openCount={3} />
      </ThemeProvider>,
    );
    expect(screen.getByText('3 panes')).toBeInTheDocument();
    expect(screen.getByText('Abyss')).toBeInTheDocument();
  });

  it('shows the synced indicator and the Alt+1-5 hint', () => {
    render(
      <ThemeProvider>
        <StatusBar openCount={2} />
      </ThemeProvider>,
    );
    expect(screen.getByText('synced')).toBeInTheDocument();
    expect(screen.getByText('Alt + 1–5 toggles panes')).toBeInTheDocument();
  });
});
