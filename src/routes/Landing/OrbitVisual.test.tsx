import { render, screen } from '@testing-library/react';
import OrbitVisual from './OrbitVisual';

it('renders the three orbiting file-type chips and the room id', () => {
  render(<OrbitVisual room="abcd-1234" />);
  expect(screen.getByText('<html>')).toBeInTheDocument();
  expect(screen.getByText('{ css }')).toBeInTheDocument();
  expect(screen.getByText('js()')).toBeInTheDocument();
  expect(screen.getByText(/abcd-1234/)).toBeInTheDocument();
});
