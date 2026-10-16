import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Create New Room link at /', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(screen.getByRole('link', { name: /^create new room$/i })).toBeInTheDocument();
});

test('renders the 404 page at an unknown route', () => {
  window.history.pushState({}, '', '/this-does-not-exist');
  render(<App />);
  expect(screen.getByText('404')).toBeInTheDocument();
});
