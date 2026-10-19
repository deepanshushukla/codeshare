import { useState, useRef, useCallback, useEffect } from 'react';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    // Clear any pending hide timer
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
    }

    // Show the message
    setMessage(msg);

    // Set a new hide timer
    hideTimerRef.current = setTimeout(() => {
      setMessage(null);
      hideTimerRef.current = null;
    }, 2000);
  }, []);

  // Clean up any pending timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  return { message, showToast };
}
