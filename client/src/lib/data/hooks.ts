import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { PreferencesSchema, type Preferences } from '@tbn/contracts';
import { useCallback, useState } from 'react';
import { newCommandId, type ApiClient } from '@/lib/api/apiClient';
import { removeRow, upsertRow } from '@/lib/realtime/applyChanges';
import { useApi, useSession } from '@/providers/SessionProvider';
import { queryKeys, type CollectionSpec } from './collections';

/** Every row of a collection, loaded once and then kept live by events. */
export function useCollection<Row extends { id: string }>(
  spec: CollectionSpec<Row>,
): UseQueryResult<Row[]> {
  const api = useApi();
  const { token } = useSession();
  return useQuery({
    queryKey: spec.key,
    queryFn: () => api.get(spec.path, spec.schema),
    enabled: token !== null,
  });
}

/** The owner's preferences, kept live by events. */
export function usePreferences(): UseQueryResult<Preferences> {
  const api = useApi();
  const { token } = useSession();
  return useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: () => api.get('/preferences', PreferencesSchema),
    enabled: token !== null,
  });
}

/** Writes a row a command returned into its collection, before its event arrives. */
export function putRow<Row extends { id: string }>(
  client: QueryClient,
  spec: CollectionSpec<Row>,
  row: Row,
): void {
  client.setQueryData<Row[]>(spec.key, (rows) =>
    rows === undefined ? rows : upsertRow(rows, row),
  );
}

/** Removes a row a command deleted from its collection, before its event arrives. */
export function dropRow<Row extends { id: string }>(
  client: QueryClient,
  spec: CollectionSpec<Row>,
  id: string,
): void {
  client.setQueryData<Row[]>(spec.key, (rows) => (rows === undefined ? rows : removeRow(rows, id)));
}

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
