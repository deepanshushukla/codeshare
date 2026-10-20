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

test('shows a hint to click Run before the first run', () => {
  render(<OutputPane html="" css="" js="" runToken={0} onWindowReady={() => {}} onRun={() => {}} />);
  expect(screen.getByText(/Press Run or Ctrl \+ Enter/i)).toBeInTheDocument();
});

test('hides the Run hint once a run has happened', () => {
  render(<OutputPane html="" css="" js="" runToken={1} onWindowReady={() => {}} onRun={() => {}} />);
  expect(screen.queryByText(/Press Run or Ctrl \+ Enter/i)).not.toBeInTheDocument();
});
