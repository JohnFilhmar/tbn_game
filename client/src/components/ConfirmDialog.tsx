import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { FormError } from './FormError';

/** Props of `ConfirmDialog`. */
export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isBusy?: boolean;
  error?: string | null;
}

/** Asks before a destructive command, such as dismissing an agent or deleting a repository. */
export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
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
        <Button onClick={onCancel}>Keep it</Button>
        <Button variant="danger" isBusy={isBusy} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}
