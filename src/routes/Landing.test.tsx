import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Landing from './Landing';

test('the Create New Room link points at /code/<id>', () => {
  render(<MemoryRouter><Landing /></MemoryRouter>);
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});
