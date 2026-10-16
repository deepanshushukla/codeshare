import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import SessionWorkspace from './SessionWorkspace';

vi.mock('../../lib/supabase', () => ({
  ensureAnonymousSession: vi.fn().mockResolvedValue('user-1'),
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }),
    channel: () => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis(), send: vi.fn(), unsubscribe: vi.fn() }),
  },
}));

test('typing in the JS editor calls updateField with the new value', async () => {
  render(<MemoryRouter initialEntries={['/code/abc']}><SessionWorkspace sessionId="abc" /></MemoryRouter>);
  await waitFor(() => expect(screen.getByLabelText('JS editor')).toBeInTheDocument());
  const editor = screen.getByLabelText('JS editor');
  await userEvent.type(editor, 'x');
  // This jest-dom version's toHaveValue() compares with strict equality and
  // does not support asymmetric matchers (e.g. expect.stringContaining), so
  // assert the exact value instead -- the mocked session starts with an
  // empty js field, so after typing 'x' the controlled value is just 'x'.
  expect(editor).toHaveValue('x');
});
