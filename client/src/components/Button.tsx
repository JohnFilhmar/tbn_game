import type { ComponentProps } from 'react';
import { cx } from '@/lib/ui/cx';
import { useIsReadOnly } from './readOnly';

/** How much a button stands out: the one main action, the others, a destructive one, a quiet one. */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** `md` for forms and headers, `sm` inside lists and tables. */
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400',
  secondary:
    'border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
  danger:
    'bg-red-700 text-white hover:bg-red-800 dark:bg-red-500 dark:text-slate-950 dark:hover:bg-red-400',
  ghost:
    'text-slate-700 shadow-none hover:bg-slate-200 dark:text-slate-200 dark:hover:bg-slate-800',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-sm',
};

/** The classes of a button, for a link that looks like one. */
export function buttonClasses(
  variant: ButtonVariant = 'secondary',
  size: ButtonSize = 'md',
): string {
  return cx(
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold tracking-wide shadow-chunk transition active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
    VARIANTS[variant],
    SIZES[size],
  );
}

/** Props of `Button`. */
export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the action is running and blocks a second press. */
  isBusy?: boolean;
}

/**
 * A button; `type` defaults to `button` so only an explicit submit sends a form. On a read-only
 * screen a submit, primary or danger button turns itself off, since those change something.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  isBusy = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isLocked =
    useIsReadOnly() && (type === 'submit' || variant === 'primary' || variant === 'danger');
  return (
    <button
      type={type}
      className={cx(buttonClasses(variant, size), className)}
      disabled={disabled === true || isBusy || isLocked}
      aria-busy={isBusy || undefined}
      {...(isLocked && { title: 'Guests can look but not change anything' })}
      {...rest}
    >
      {isBusy && (
        <span
          aria-hidden="true"
          className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
}
