import type { TimeOfDay } from '@tbn/contracts';
import { useEffect, useMemo, useState } from 'react';
import { hourOf } from './timeOfDay';

/** The hour the world shows; the clock is read again every minute. */
export function useWorldHour(timeOfDay: TimeOfDay, timeZone: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return useMemo(() => hourOf(timeOfDay, new Date(now), timeZone), [timeOfDay, now, timeZone]);
}
