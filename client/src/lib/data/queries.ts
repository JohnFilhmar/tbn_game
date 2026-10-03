import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  OwnerSchema,
  PreferencesSchema,
  WorldLayoutResponseSchema,
  type EnvironmentName,
  type Preferences,
  type WorldLayout,
} from '@tbn/contracts';
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

/**
 * An environment as the owner saved it, or null while the pack default applies; kept live by
 * events, so a save in another tab rearranges this one too.
 */
export function useWorldLayout(environment: EnvironmentName): UseQueryResult<WorldLayout | null> {
  const api = useApi();
  const { token } = useSession();
  return useQuery({
    queryKey: queryKeys.world(environment),
    queryFn: async () => (await api.get(`/world/${environment}`, WorldLayoutResponseSchema)).layout,
    enabled: token !== null,
  });
}

/** The owner's time zone for dates, or the browser's until the preferences load. */
export function useTimeZone(): string {
  const { data } = usePreferences();
  return data?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The signed-in owner's name. */
export function useMe(): UseQueryResult<{ id: string; username: string }> {
  const api = useApi();
  const { token } = useSession();
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api.get('/auth/me', OwnerSchema.pick({ id: true, username: true })),
    enabled: token !== null,
  });
}
