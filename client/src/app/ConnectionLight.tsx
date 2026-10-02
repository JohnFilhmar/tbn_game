import type { ConnectionStatus } from '@/lib/realtime/realtimeConnection';
import { cx } from '@/lib/ui/cx';
import { useConnectionStatus } from '@/providers/RealtimeProvider';

const LIGHTS: Record<ConnectionStatus, { label: string; className: string }> = {
  live: { label: 'Live', className: 'bg-emerald-500' },
  connecting: { label: 'Connecting', className: 'bg-amber-400' },
  reconnecting: { label: 'Reconnecting', className: 'animate-pulse bg-amber-500' },
  offline: { label: 'Offline', className: 'bg-slate-400' },
};

/** Whether the desktop is live: a light and its word, announced when it changes. */
export function ConnectionLight() {
  const light = LIGHTS[useConnectionStatus()];
  return (
    <span
      role="status"
      className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300"
    >
      <span aria-hidden="true" className={cx('size-2 rounded-full', light.className)} />
      {light.label}
    </span>
  );
}
