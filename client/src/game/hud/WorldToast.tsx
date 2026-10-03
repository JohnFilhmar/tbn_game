import { useEffect, useState } from 'react';
import { useWorldStore } from '@/game/world/worldStore';

/** How long a toast stays, in milliseconds. */
const SHOWN_MS = 3_500;

/** The world's latest toast, such as the grass count, read out and faded after a few seconds. */
export function WorldToast() {
  const toast = useWorldStore((state) => state.toast);
  const [fadedId, setFadedId] = useState<number | null>(null);
  useEffect(() => {
    if (toast === null) return undefined;
    const timer = window.setTimeout(() => setFadedId(toast.id), SHOWN_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const isShown = toast !== null && fadedId !== toast.id;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 flex justify-center px-3">
      <p
        role="status"
        className={
          isShown
            ? 'rounded-lg border-2 border-teal-500 bg-slate-900/90 px-4 py-2 font-display text-sm font-semibold text-teal-200 shadow-chunk'
            : 'sr-only'
        }
      >
        {isShown ? toast.text : ''}
      </p>
    </div>
  );
}
