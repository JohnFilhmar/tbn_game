import { Field } from './Field';

/** Props of `ColorField`. */
export interface ColorFieldProps {
  label: string;
  /** A hex colour such as `#ffcc00`. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** A labelled colour picker on the native input, which gives a hex colour. */
export function ColorField({ label, value, onChange, className }: ColorFieldProps) {
  return (
    <Field label={label} className={className}>
      {({ id, describedBy }) => (
        <input
          id={id}
          type="color"
          value={value}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full cursor-pointer rounded-md border border-slate-300 bg-white p-1 dark:border-slate-600 dark:bg-slate-900"
        />
      )}
    </Field>
  );
}
