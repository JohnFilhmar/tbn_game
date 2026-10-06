import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  PrincipalSchema,
  PreferencesSchema,
  WorldLayoutResponseSchema,
  WorldPropStatesResponseSchema,
  type EnvironmentName,
  type Preferences,
  type Principal,
  type WorldLayout,
  type WorldPropState,
} from '@tbn/contracts';
import { useApi, useSession } from '@/providers/SessionProvider';
import { queryKeys, type CollectionSpec } from './collections';

/** Every row of a collection, loaded once and then kept live by events. */
export function useCollection<Row extends { id: string }>(
  spec: CollectionSpec<Row>,
): UseQueryResult<Row[]> {
  const api = useApi();
  const { isSignedIn } = useSession();
  return useQuery({
    queryKey: spec.key,
    queryFn: () => api.get(spec.path, spec.schema),
    enabled: isSignedIn,
  });
}

/** The owner's preferences, kept live by events. */
export function usePreferences(): UseQueryResult<Preferences> {
  const api = useApi();
  const { isSignedIn } = useSession();
  return useQuery({
    queryKey: queryKeys.preferences(),
    queryFn: () => api.get('/preferences', PreferencesSchema),
    enabled: isSignedIn,
  });
}

/**
 * An environment as the owner saved it, or null while the pack default applies; kept live by
 * events, so a save in another tab rearranges this one too.
 */
export function useWorldLayout(environment: EnvironmentName): UseQueryResult<WorldLayout | null> {
  const api = useApi();
  const { isSignedIn } = useSession();
  return useQuery({
    queryKey: queryKeys.world(environment),
    queryFn: async () => (await api.get(`/world/${environment}`, WorldLayoutResponseSchema)).layout,
    enabled: isSignedIn,
  });
}

/**
 * The saved state of every prop of an environment that keeps one (blinds, lamps, whiteboards),
 * kept live by events. A prop with no state is in its kind's first one.
 */
export function useWorldPropStates(environment: EnvironmentName): UseQueryResult<WorldPropState[]> {
  const api = useApi();
  const { isSignedIn } = useSession();
  return useQuery({
    queryKey: queryKeys.worldProps(environment),
    queryFn: async () =>
      (await api.get(`/world/${environment}/props`, WorldPropStatesResponseSchema)).states,
    enabled: isSignedIn,
  });
}

/** The owner's time zone for dates, or the browser's until the preferences load. */
export function useTimeZone(): string {
  const { data } = usePreferences();
  return data?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Who is signed in: the owner, or a guest and whose company they visit. */
export function useMe(): UseQueryResult<Principal> {
  const api = useApi();
  const { isSignedIn } = useSession();
  return useQuery({
    queryKey: queryKeys.me(),
    queryFn: () => api.get('/auth/me', PrincipalSchema),
    enabled: isSignedIn,
  });
}
