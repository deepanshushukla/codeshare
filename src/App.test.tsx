import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Create New Room link at /', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  // Home now has exactly two "Create New Room" links (hero CTA + bottom CTA
  // block, added in Task 9). Pin the exact count -- not just "at least one"
  // -- so a regression to 1, 3, or any other count fails this test, and
  // check the first link's href the same way Landing.test.tsx does for the
  // hero CTA, preserving this test's original "renders a real link to a new
  // room" intent (it previously only checked presence; it never checked
  // href, so the first link stands in for that original assertion).
  const links = screen.getAllByRole('link', { name: /^create new room$/i });
  expect(links).toHaveLength(2);
  expect(links[0].getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('renders the 404 page at an unknown route', () => {
  window.history.pushState({}, '', '/this-does-not-exist');
  render(<App />);
  expect(screen.getByText('404')).toBeInTheDocument();
});
