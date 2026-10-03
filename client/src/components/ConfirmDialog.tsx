import type { ReactNode } from 'react';
import { Button, type ButtonVariant } from './Button';
import { Dialog } from './Dialog';
import { FormError } from './FormError';

/** Props of `ConfirmDialog`. */
export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** `danger` by default; a command that destroys nothing uses `primary`. */
  confirmVariant?: ButtonVariant;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
  error?: string | null;
}

/** Asks before a command that is hard to undo, such as dismissing an agent or merging a branch. */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  confirmVariant = 'danger',
  cancelLabel = 'Keep it',
  onConfirm,
  onCancel,
  isBusy = false,
  error = null,
}: ConfirmDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="text-sm text-slate-700 dark:text-slate-300">{message}</div>
      <FormError message={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={confirmVariant} isBusy={isBusy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
