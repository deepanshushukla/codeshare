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
  // Focus directly and skip userEvent's own click-to-focus step: with the
  // Console panel's Separator now also present by default (Task 9), a real
  // click lands on react-resizable-panels' Group-level pointerdown listener,
  // which does its own hit-testing via getBoundingClientRect() to decide
  // whether the click is near a resize separator. jsdom has no real layout,
  // so every element reports a degenerate (0,0,0,0) rect, which makes that
  // hit-test treat any click inside the Group as hitting the separator and
  // steals focus there instead of the editor. Focusing programmatically
  // avoids dispatching the pointer events that trigger this jsdom-only
  // ambiguity; it does not change what's being verified (that typing drives
  // onChange/updateField).
  editor.focus();
  await userEvent.type(editor, 'x', { skipClick: true });
  // This jest-dom version's toHaveValue() compares with strict equality and
  // does not support asymmetric matchers (e.g. expect.stringContaining), so
  // assert the exact value instead -- the mocked session starts with an
  // empty js field, so after typing 'x' the controlled value is just 'x'.
  expect(editor).toHaveValue('x');
});
