import { useEffect, useState, type ReactNode } from 'react';
import { usePreferences } from '@/lib/data/hooks';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function prefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/** Applies the owner's theme preference to the page: light, dark, or the device's. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { data: preferences } = usePreferences();
  const theme = preferences?.theme ?? 'system';
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia(DARK_QUERY);
    const listener = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return children;
}
