import type { ReactNode } from 'react';
import { Field, inputClasses } from './Field';

/** One choice of a select. */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Props of `SelectField`. */
export interface SelectFieldProps {
  label: string;
  labelSuffix?: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** A first, empty choice, such as `Choose a provider`. */
  placeholder?: string;
  hint?: ReactNode;
  error?: string | undefined;
  hideLabel?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

/** A labelled select. */
export function SelectField({
  label,
  labelSuffix,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  hideLabel,
  disabled,
  required,
  className,
}: SelectFieldProps) {
  return (
    <Field
      label={label}
      labelSuffix={labelSuffix}
      hint={hint}
      error={error}
      hideLabel={hideLabel}
      className={className}
    >
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(event) => onChange(event.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          className={inputClasses(invalid)}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Choices from a list of machine names, each shown as words. */
export function optionsOf(
  values: readonly string[],
  label: (value: string) => string,
): SelectOption[] {
  return values.map((value) => ({ value, label: label(value) }));
}
