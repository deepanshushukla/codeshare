import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import Landing from './Landing';

test('the Create New Room link points at /code/<id>', () => {
  render(
    <ThemeProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </ThemeProvider>,
  );
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

// The brief's test example renders Landing under bare MemoryRouter, but
// ThemeButton/ThemeDrawer call useTheme() and throw without a ThemeProvider
// ancestor -- every other test exercising them (ThemeButton.test.tsx,
// ThemeDrawer.test.tsx) wraps in one, so this does too.
test('renders the theme button and opens the theme drawer', () => {
  render(
    <ThemeProvider>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </ThemeProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(screen.getByRole('heading', { name: /theme/i })).toBeInTheDocument(); // drawer title
});
