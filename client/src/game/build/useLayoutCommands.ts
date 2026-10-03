import { useQueryClient } from '@tanstack/react-query';
import { WorldLayoutSchema, type EnvironmentName, type WorldLayout } from '@tbn/contracts';
import { useCallback, useMemo } from 'react';
import { newCommandId } from '@/lib/api/apiClient';
import { ApiError } from '@/lib/api/apiError';
import { queryKeys } from '@/lib/data/collections';
import { useApi } from '@/providers/SessionProvider';
import type { Draft } from './draft';

/** What saving and resetting an environment's layout do for build mode. */
export interface LayoutCommands {
  /** Saves the draft over `revision`; null when it was saved elsewhere since (409). */
  save: (draft: Draft, revision: number) => Promise<WorldLayout | null>;
  /** Forgets the saved layout, so the pack default applies again. */
  reset: () => Promise<void>;
}

/**
 * Saves or resets one environment's layout and writes the answer into the cache, so the world
 * shows it at once; other tabs learn of it from the change event.
 */
export function useLayoutCommands(environment: EnvironmentName): LayoutCommands {
  const api = useApi();
  const client = useQueryClient();
  const save = useCallback(
    async (draft: Draft, revision: number): Promise<WorldLayout | null> => {
      try {
        const saved = await api.send('PUT', `/world/${environment}`, WorldLayoutSchema, {
          body: { revision, theme: draft.theme, placements: draft.placements },
          commandId: newCommandId(),
        });
        client.setQueryData(queryKeys.world(environment), saved);
        return saved;
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 409) return null;
        throw error;
      }
    },
    [api, client, environment],
  );
  const reset = useCallback(async () => {
    await api.sendNoContent('DELETE', `/world/${environment}`, { commandId: newCommandId() });
    client.setQueryData(queryKeys.world(environment), null);
  }, [api, client, environment]);
  return useMemo(() => ({ save, reset }), [save, reset]);
}
