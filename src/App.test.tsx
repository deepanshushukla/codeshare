import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the landing placeholder at /', () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(screen.getByText('landing')).toBeInTheDocument();
});
