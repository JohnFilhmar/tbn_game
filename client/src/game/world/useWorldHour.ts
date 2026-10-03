import type { TimeOfDay } from '@tbn/contracts';
import { useEffect, useMemo, useState } from 'react';
import { hourOf } from './timeOfDay';

/** The time in milliseconds, read again every minute. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

/** The hour the world shows; the clock is read again every minute. */
export function useWorldHour(timeOfDay: TimeOfDay, timeZone: string): number {
  const now = useNow();
  return useMemo(() => hourOf(timeOfDay, new Date(now), timeZone), [timeOfDay, now, timeZone]);
}
