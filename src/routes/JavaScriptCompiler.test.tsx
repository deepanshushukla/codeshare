import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { RoomTransitionProvider } from '../features/transition/RoomTransitionProvider';
import RoomTransitionOverlay from '../features/transition/RoomTransitionOverlay';
import JavaScriptCompiler from './JavaScriptCompiler';

// Mirrors Landing.test.tsx's renderLanding(): ThemeProvider and
// RoomTransitionProvider are both read via context hooks that throw without
// an ancestor, matching App.tsx's real tree.
function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <RoomTransitionProvider>
          <JavaScriptCompiler />
          <RoomTransitionOverlay />
        </RoomTransitionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

test('sets a unique page title', () => {
  renderPage();
  expect(document.title).toMatch(/online javascript compiler/i);
});

test('renders the H1 and the Run CTA as a real link to a new room', () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: /online javascript compiler/i })).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /run javascript now/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('clicking the CTA starts the room transition instead of navigating immediately', () => {
  renderPage();
  fireEvent.click(screen.getByRole('link', { name: /run javascript now/i }));
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});

test('renders every FAQ question', () => {
  renderPage();
  expect(screen.getByText(/is this a real javascript compiler/i)).toBeInTheDocument();
  expect(screen.getByText(/do i need to install anything/i)).toBeInTheDocument();
});

test('links back home and across to the React playground', () => {
  renderPage();
  expect(screen.getByRole('link', { name: /^← home$/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /react playground/i })).toHaveAttribute('href', '/react-playground');
});
