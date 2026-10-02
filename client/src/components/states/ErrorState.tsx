import { Button } from '@/components/Button';

/** Props of `ErrorState`. */
export interface ErrorStateProps {
  /** What failed to load, as in `The agents could not be loaded`. */
  title: string;
  message: string;
  onRetry?: () => void;
}

/** A load that failed, with the reason and a way to try again. */
export function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-6 dark:border-red-800 dark:bg-red-950"
    >
      <h2 className="text-base font-semibold text-red-900 dark:text-red-200">{title}</h2>
      <p className="text-sm text-red-800 dark:text-red-300">{message}</p>
      {onRetry !== undefined && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
