import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type RoomTransitionContextValue = {
  active: boolean;
  roomId: string | null;
  start: (roomId: string, onNavigate: () => void) => void;
};

const RoomTransitionContext = createContext<RoomTransitionContextValue | null>(null);

export function RoomTransitionProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);

  // Use refs to track timers so we can clear them on unmount
  const navigateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deactivateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The re-entry (double-click) guard lives in a ref, not in the `active`
  // state: reading `active` inside start() would make start() close over it,
  // changing start's identity on every activate/deactivate. Consumers list
  // `start` in useEffect deps (Landing's "N" keydown listener does), so that
  // churn would tear down and re-add real listeners twice per transition.
  // `active` is still state -- the overlay renders off it -- only the guard
  // moved.
  const activeRef = useRef(false);

  // Clear timers on unmount to prevent dangling timers
  useEffect(() => {
    return () => {
      if (navigateTimeoutRef.current !== null) {
        clearTimeout(navigateTimeoutRef.current);
      }
      if (deactivateTimeoutRef.current !== null) {
        clearTimeout(deactivateTimeoutRef.current);
      }
    };
  }, []);

  const start = useCallback((newRoomId: string, onNavigate: () => void) => {
    // No-op while a transition is already running (double-click guard)
    if (activeRef.current) {
      return;
    }
    activeRef.current = true;

    // Set active and roomId synchronously
    setActive(true);
    setRoomId(newRoomId);

    // Schedule onNavigate callback at 650ms
    navigateTimeoutRef.current = setTimeout(() => {
      onNavigate();
      navigateTimeoutRef.current = null;
    }, 650);

    // Schedule deactivation at 1150ms
    deactivateTimeoutRef.current = setTimeout(() => {
      activeRef.current = false;
      setActive(false);
      deactivateTimeoutRef.current = null;
    }, 1150);
  }, []);

  const value = useMemo<RoomTransitionContextValue>(
    () => ({
      active,
      roomId,
      start,
    }),
    [active, roomId, start],
  );

  return (
    <RoomTransitionContext.Provider value={value}>
      {children}
    </RoomTransitionContext.Provider>
  );
}

export function useRoomTransition(): RoomTransitionContextValue {
  const ctx = useContext(RoomTransitionContext);
  if (!ctx) {
    throw new Error('useRoomTransition() must be used within a <RoomTransitionProvider>');
  }
  return ctx;
}
