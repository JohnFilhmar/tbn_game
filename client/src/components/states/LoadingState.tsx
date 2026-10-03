/** Props of `LoadingState`. */
export interface LoadingStateProps {
  /** What is loading, as in `Loading agents`. */
  label: string;
}

/** A quiet placeholder while data loads, announced to screen readers. */
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400"
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-teal-600 border-t-transparent"
      />
      Loading {label}…
    </div>
  );
}
