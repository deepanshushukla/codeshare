import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Create New Room link at /', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  // Home now has two "Create New Room" links (hero CTA + bottom CTA block,
  // added in Task 9) -- getAllByRole avoids the now-ambiguous getByRole match.
  expect(screen.getAllByRole('link', { name: /^create new room$/i }).length).toBeGreaterThan(0);
});

test('renders the 404 page at an unknown route', () => {
  window.history.pushState({}, '', '/this-does-not-exist');
  render(<App />);
  expect(screen.getByText('404')).toBeInTheDocument();
});
