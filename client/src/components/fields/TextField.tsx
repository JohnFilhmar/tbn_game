import type { ComponentProps, ReactNode } from 'react';
import { Field, inputClasses } from './Field';

interface Common {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: ReactNode;
  error?: string | undefined;
  hideLabel?: boolean;
  className?: string;
}

/** Props of `TextField`. */
export type TextFieldProps = Common &
  Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'id' | 'className'>;

/** A labelled one-line text input. */
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  hideLabel,
  className,
  ...rest
}: TextFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={inputClasses(invalid)}
          {...rest}
        />
      )}
    </Field>
  );
}

/** Props of `TextAreaField`. */
export type TextAreaFieldProps = Common &
  Omit<ComponentProps<'textarea'>, 'value' | 'onChange' | 'id' | 'className'> & {
    /** Monospace text, for templates, code and Markdown. */
    isCode?: boolean;
  };

/** A labelled text area. */
export function TextAreaField({
  label,
  value,
  onChange,
  hint,
  error,
  hideLabel,
  className,
  isCode = false,
  rows = 4,
  ...rest
}: TextAreaFieldProps) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          value={value}
          rows={rows}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={`${inputClasses(invalid)} ${isCode ? 'font-mono' : ''}`}
          {...rest}
        />
      )}
    </Field>
  );
}
