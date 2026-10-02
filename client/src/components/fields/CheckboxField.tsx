import { useId, type ReactNode } from 'react';

/** Props of `CheckboxField`. */
export interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
}

/** A checkbox with its label to the right and an optional hint below. */
export function CheckboxField({ label, checked, onChange, hint, disabled }: CheckboxFieldProps) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={hint === undefined ? undefined : `${id}-hint`}
        className="mt-0.5 size-4 rounded border-slate-400 accent-teal-700 dark:accent-teal-400"
      />
      <div className="flex flex-col">
        <label htmlFor={id} className="text-sm font-medium text-slate-800 dark:text-slate-200">
          {label}
        </label>
        {hint !== undefined && (
          <p id={`${id}-hint`} className="text-xs text-slate-600 dark:text-slate-400">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
