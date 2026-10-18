import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ThemeProvider } from './ThemeProvider';
import ThemeButton from './ThemeButton';

describe('ThemeButton', () => {
  it('calls onOpenDrawer when clicked (pill variant)', () => {
    const onOpenDrawer = vi.fn();
    render(
      <ThemeProvider>
        <ThemeButton variant="pill" onOpenDrawer={onOpenDrawer} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /theme/i }));
    expect(onOpenDrawer).toHaveBeenCalled();
  });

  it('calls onOpenDrawer when clicked (square variant)', () => {
    const onOpenDrawer = vi.fn();
    render(
      <ThemeProvider>
        <ThemeButton variant="square" onOpenDrawer={onOpenDrawer} />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onOpenDrawer).toHaveBeenCalled();
  });

  it('merges a caller-supplied className onto the variant class', () => {
    render(
      <ThemeProvider>
        <ThemeButton variant="square" onOpenDrawer={vi.fn()} className="headerSlot" />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveClass('headerSlot');
    // The per-variant class is still applied alongside it.
    expect(button.className.split(' ').length).toBe(2);
  });

  it('renders a real <button> (type="button", so it never submits a form)', () => {
    render(
      <ThemeProvider>
        <ThemeButton variant="pill" onOpenDrawer={vi.fn()} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('displays theme name for pill variant', () => {
    const onOpenDrawer = vi.fn();
    render(
      <ThemeProvider>
        <ThemeButton variant="pill" onOpenDrawer={onOpenDrawer} />
      </ThemeProvider>,
    );
    // Default theme name from ThemeProvider is 'Abyss'
    expect(screen.getByText('Abyss')).toBeInTheDocument();
  });
});
