import { PreferencesSchema, type PreferenceKey, type Preferences } from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { newCommandId } from '@/lib/api/apiClient';
import { useApi } from '@/providers/SessionProvider';
import { queryKeys } from './collections';

/** Sets one preference and writes the server's answer into the cache. */
export function useSetPreference(): <K extends PreferenceKey>(
  key: K,
  value: Preferences[K],
) => Promise<Preferences> {
  const api = useApi();
  const client = useQueryClient();
  return useCallback(
    async (key: PreferenceKey, value: Preferences[PreferenceKey]) => {
      const next = await api.send('PUT', `/preferences/${key}`, PreferencesSchema, {
        body: { value },
        commandId: newCommandId(),
      });
      client.setQueryData(queryKeys.preferences(), next);
      return next;
    },
    [api, client],
  );
}
