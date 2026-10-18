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
    // No-op while active is already true (double-click guard)
    if (active) {
      return;
    }

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
      setActive(false);
      deactivateTimeoutRef.current = null;
    }, 1150);
  }, [active]);

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
