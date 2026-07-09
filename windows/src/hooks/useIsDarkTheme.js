import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore.js';

/** Resolves the `theme` setting ('auto' | 'light' | 'dark') to the currently
 *  active light/dark mode, tracking OS changes while `theme === 'auto'`. */
export function useIsDarkTheme() {
  const theme = useStore((s) => s.theme);
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : true
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return systemDark;
}
