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
  //
  // Task 13 made roomHref always carry an explicit `?private=0|1` hint (see
  // Landing.tsx's buildRoomPath) -- an anonymous visitor (the default here,
  // no auth mock configured) gets `private=0`, so the bare-path match below
  // was updated to match, same as every other href assertion Task 13 touched
  // in Landing.test.tsx.
  const links = screen.getAllByRole('link', { name: /^create new room$/i });
  expect(links).toHaveLength(2);
  expect(links[0].getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}\?private=0$/);
});

test('renders the 404 page at an unknown route', () => {
  window.history.pushState({}, '', '/this-does-not-exist');
  render(<App />);
  expect(screen.getByText('404')).toBeInTheDocument();
});
