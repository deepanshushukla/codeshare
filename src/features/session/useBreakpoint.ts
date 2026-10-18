import { useState, useEffect } from 'react';

export function useBreakpoint() {
  const [isMobile, setIsMobile] = useState(() => {
    const mobileQuery = window.matchMedia('(max-width: 759px)');
    return mobileQuery.matches;
  });

  const [isWide, setIsWide] = useState(() => {
    const wideQuery = window.matchMedia('(min-width: 1100px)');
    return wideQuery.matches;
  });

  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 759px)');
    const wideQuery = window.matchMedia('(min-width: 1100px)');

    const mobileHandler = () => setIsMobile(window.matchMedia('(max-width: 759px)').matches);
    const wideHandler = () => setIsWide(window.matchMedia('(min-width: 1100px)').matches);

    mobileQuery.addEventListener('change', mobileHandler);
    wideQuery.addEventListener('change', wideHandler);

    return () => {
      mobileQuery.removeEventListener('change', mobileHandler);
      wideQuery.removeEventListener('change', wideHandler);
    };
  }, []);

  return { isMobile, isWide };
}
