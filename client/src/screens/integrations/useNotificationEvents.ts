import { NotificationEventInfoSchema, type NotificationEventInfo } from '@tbn/contracts';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/lib/data/collections';
import { useApi } from '@/providers/SessionProvider';

/** The system events a channel can follow, with their placeholders and default body. */
export function useNotificationEvents(): UseQueryResult<NotificationEventInfo[]> {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.notificationEvents(),
    queryFn: () => api.get('/notification_events', NotificationEventInfoSchema.array()),
  });
}
