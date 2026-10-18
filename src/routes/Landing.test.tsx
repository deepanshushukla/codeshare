import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '../features/theme/ThemeProvider';
import { RoomTransitionProvider } from '../features/transition/RoomTransitionProvider';
import RoomTransitionOverlay from '../features/transition/RoomTransitionOverlay';
import Landing from './Landing';

// The brief's test examples render Landing under a bare MemoryRouter, but:
// - ThemeButton/ThemeDrawer call useTheme() and throw without a ThemeProvider
//   ancestor -- every other test exercising them (ThemeButton.test.tsx,
//   ThemeDrawer.test.tsx) wraps in one, so this does too.
// - Landing's CTA/N-shortcut now call useRoomTransition(), which throws
//   without a RoomTransitionProvider ancestor (same as App.tsx's real tree).
//   RoomTransitionOverlay is rendered alongside Landing (a sibling, matching
//   App.tsx) so the "/r/{id}" overlay text actually appears when a
//   transition starts.
function renderLanding() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <RoomTransitionProvider>
          <Landing />
          <RoomTransitionOverlay />
        </RoomTransitionProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

test('the Create New Room link points at /code/<id>', () => {
  renderLanding();
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('renders the theme button and opens the theme drawer', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('button', { name: /theme/i }));
  expect(screen.getByRole('heading', { name: /theme/i })).toBeInTheDocument(); // drawer title
});

test('keeps the CTA a real link to the new room', () => {
  renderLanding();
  const link = screen.getByRole('link', { name: /^create new room$/i });
  expect(link.getAttribute('href')).toMatch(/^\/code\/[a-z0-9]{10}$/);
});

test('a plain click starts the transition instead of navigating immediately', () => {
  renderLanding();
  fireEvent.click(screen.getByRole('link', { name: /^create new room$/i }));
  expect(screen.getByText(/\/r\//)).toBeInTheDocument(); // overlay now showing /r/{id}
});

test('a ctrl-click is left alone (native new-tab behavior, no preventDefault)', () => {
  renderLanding();
  const link = screen.getByRole('link', { name: /^create new room$/i });
  const event = createEvent.click(link, { ctrlKey: true });
  const prevented = !fireEvent(link, event);
  expect(prevented).toBe(false);
});

test('pressing N starts the transition', () => {
  renderLanding();
  fireEvent.keyDown(window, { key: 'n' });
  expect(screen.getByText(/\/r\//)).toBeInTheDocument();
});
