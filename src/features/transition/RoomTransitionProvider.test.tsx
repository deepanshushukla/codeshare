import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { RoomTransitionProvider, useRoomTransition } from './RoomTransitionProvider';

function Probe() {
  const { active, roomId, start } = useRoomTransition();
  return (
    <div>
      <span data-testid="active">{String(active)}</span>
      <span data-testid="room">{roomId}</span>
      <button onClick={() => start('abcd-1234', () => { navigated = true; })}>go</button>
    </div>
  );
}

let navigated = false;

describe('RoomTransitionProvider / useRoomTransition', () => {
  beforeEach(() => {
    navigated = false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('activates immediately, navigates at 650ms, deactivates at 1150ms', () => {
    render(
      <RoomTransitionProvider>
        <Probe />
      </RoomTransitionProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    expect(screen.getByTestId('room')).toHaveTextContent('abcd-1234');
    expect(navigated).toBe(false);
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(navigated).toBe(true);
    expect(screen.getByTestId('active')).toHaveTextContent('true');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('active')).toHaveTextContent('false');
  });

  it('ignores a second start() call while already active', () => {
    render(
      <RoomTransitionProvider>
        <Probe />
      </RoomTransitionProvider>,
    );
    fireEvent.click(screen.getByText('go'));
    fireEvent.click(screen.getByText('go')); // should be a no-op
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(navigated).toBe(true); // navigate still only fires once -- no crash/double-fire
  });
});
