import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { newCommandId, type ApiClient } from '@/lib/api/apiClient';
import { useApi } from '@/providers/SessionProvider';

/** One run of a command: what it was given and the id that makes a retry run it once. */
interface Submission<Input> {
  input: Input;
  commandId: string;
}

/** A command a screen can submit, with its state. */
export interface Command<Input, Output> {
  /** Submits with a new command id; resolves with the answer or rejects with an `ApiError`. */
  submit: (input: Input) => Promise<Output>;
  isPending: boolean;
  error: Error | null;
  reset: () => void;
}

/**
 * A command against the API. Each submission gets a new `Idempotency-Key`, and the automatic
 * retry after a dropped connection sends the same one, so it runs once. `onDone` writes the answer
 * into the cache.
 */
export function useCommand<Input, Output>(
  run: (api: ApiClient, input: Input, commandId: string) => Promise<Output>,
  onDone?: (client: QueryClient, output: Output, input: Input) => void,
): Command<Input, Output> {
  const api = useApi();
  const client = useQueryClient();
  const [error, setError] = useState<Error | null>(null);
  const mutation = useMutation({
    mutationFn: ({ input, commandId }: Submission<Input>) => run(api, input, commandId),
    retry: (count, failure) =>
      count < 2 && failure instanceof Error && 'isNetwork' in failure && failure.isNetwork === true,
    onSuccess: (output, { input }) => onDone?.(client, output, input),
  });
  const { mutateAsync, reset: resetMutation } = mutation;
  const submit = useCallback(
    async (input: Input) => {
      setError(null);
      try {
        return await mutateAsync({ input, commandId: newCommandId() });
      } catch (caught: unknown) {
        const failure = caught instanceof Error ? caught : new Error('Something went wrong.');
        setError(failure);
        throw failure;
      }
    },
    [mutateAsync],
  );
  const reset = useCallback(() => {
    setError(null);
    resetMutation();
  }, [resetMutation]);
  return { submit, isPending: mutation.isPending, error, reset };
}
