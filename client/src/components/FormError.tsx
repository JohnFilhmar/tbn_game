/** Props of `FormError`. */
export interface FormErrorProps {
  message: string | null | undefined;
}

/** Why a command failed, announced as soon as it appears. Renders nothing without a message. */
export function FormError({ message }: FormErrorProps) {
  if (message === null || message === undefined || message.length === 0) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </p>
  );
}
