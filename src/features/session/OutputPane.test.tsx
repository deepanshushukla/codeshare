import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import OutputPane from './OutputPane';

test('reruns the output when the reload button is clicked', () => {
  const onRun = vi.fn();
  render(<OutputPane html="" css="" js="" runToken={0} onWindowReady={() => {}} onRun={onRun} />);
  fireEvent.click(screen.getByRole('button', { name: /reload/i }));
  expect(onRun).toHaveBeenCalled();
});

test('renders the output iframe from the wrapped OutputFrame', () => {
  render(<OutputPane html="" css="" js="" runToken={0} onWindowReady={() => {}} onRun={() => {}} />);
  expect(screen.getByTitle('Output')).toBeInTheDocument();
});
