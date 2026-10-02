import { humanize, toneOf, type Tone } from '@/lib/format/labels';
import { cx } from '@/lib/ui/cx';

const TONE_CLASSES: Record<Tone, string> = {
  neutral:
    'bg-slate-100 text-slate-700 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600',
  info: 'bg-sky-50 text-sky-800 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-700',
  success:
    'bg-emerald-50 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-700',
  warning:
    'bg-amber-50 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-700',
  danger: 'bg-red-50 text-red-800 ring-red-300 dark:bg-red-950 dark:text-red-200 dark:ring-red-700',
};

/** Props of `StatusBadge`. */
export interface StatusBadgeProps {
  /** A status as the API sends it, such as `awaiting_approval`. */
  status: string;
  /** Words to show instead of the status itself. */
  label?: string;
  tone?: Tone;
}

/** A status as a coloured label; the words carry the meaning, the colour only helps. */
export function StatusBadge({ status, label, tone }: StatusBadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset',
        TONE_CLASSES[tone ?? toneOf(status)],
      )}
    >
      {label ?? humanize(status)}
    </span>
  );
}
