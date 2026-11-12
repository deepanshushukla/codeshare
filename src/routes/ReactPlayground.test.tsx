import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { RoomTransitionProvider } from '../features/transition/RoomTransitionProvider';
import RoomTransitionOverlay from '../features/transition/RoomTransitionOverlay';
import ReactPlayground from './ReactPlayground';

function renderPage() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <RoomTransitionProvider>
          <ReactPlayground />
          <RoomTransitionOverlay />
        </RoomTransitionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

test('sets a unique page title', () => {
  renderPage();
  expect(document.title).toMatch(/react playground/i);
});

test('renders the H1 and the Open CTA as a real link to a new React room', () => {
  renderPage();
  expect(screen.getByRole('heading', { level: 1, name: /react playground/i })).toBeInTheDocument();
  const link = screen.getByRole('link', { name: /open react playground/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}\?type=react$/);
});

test('clicking the CTA starts the room transition instead of navigating immediately', () => {
  renderPage();
  fireEvent.click(screen.getByRole('link', { name: /open react playground/i }));
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});

test('renders every FAQ question', () => {
  renderPage();
  expect(screen.getByText(/does this support jsx and hooks/i)).toBeInTheDocument();
  expect(screen.getByText(/do i need to set up a build tool/i)).toBeInTheDocument();
});

test('links back home and across to the JavaScript compiler', () => {
  renderPage();
  expect(screen.getByRole('link', { name: /^← home$/i })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: /online javascript compiler/i })).toHaveAttribute(
    'href',
    '/javascript-compiler',
  );
});
