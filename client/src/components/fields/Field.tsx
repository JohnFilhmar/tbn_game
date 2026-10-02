import { useId, type ReactNode } from 'react';
import { cx } from '@/lib/ui/cx';

/** The ids and state a control needs to be tied to its label, hint and error. */
export interface FieldControl {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
}

/** Props of `Field`. */
export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  /** Hides the label visually and keeps it for screen readers. */
  hideLabel?: boolean;
  className?: string;
  children: (control: FieldControl) => ReactNode;
}

/** The classes of a text input, select or text area. */
export function inputClasses(invalid: boolean): string {
  return cx(
    'block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 disabled:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-800',
    invalid ? 'border-red-600 dark:border-red-400' : 'border-slate-300 dark:border-slate-600',
  );
}

/** A labelled control with its hint and its error, tied together for assistive technology. */
export function Field({ label, hint, error, hideLabel = false, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint === undefined ? '' : hintId, error === undefined ? '' : errorId]
      .filter((part) => part.length > 0)
      .join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1', className)}>
      <label
        htmlFor={id}
        className={cx(
          'text-sm font-medium text-slate-800 dark:text-slate-200',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>
      {children({ id, describedBy, invalid: error !== undefined })}
      {hint !== undefined && (
        <p id={hintId} className="text-xs text-slate-600 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-xs font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
