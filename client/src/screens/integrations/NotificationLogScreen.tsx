import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeStamp } from '@/components/TimeStamp';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { byId, newestFirst } from '@/lib/data/rows';
import { humanize } from '@/lib/format/labels';

/** The notices the system sent, or tried to: the newest 200. */
export function NotificationLogScreen() {
  const notifications = useCollection(COLLECTIONS.notifications);
  const integrations = useCollection(COLLECTIONS.integrations);
  if (notifications.data === undefined) {
    return <QueryStatus queries={[notifications]} label="notifications" />;
  }
  if (notifications.data.length === 0) {
    return (
      <EmptyState
        title="No notices sent yet"
        description="Each notice the system sends through a channel shows here with how it went."
      />
    );
  }
  const integrationById = byId(integrations.data);
  return (
    <DataTable
      caption="Notification log"
      rows={newestFirst(notifications.data, (notification) => notification.created_at)}
      rowKey={(notification) => notification.id}
      searchText={(row) => `${row.title} ${row.message} ${row.event_type} ${row.status}`}
      columns={[
        {
          header: 'Notice',
          cell: (notification) => (
            <span className="flex flex-col">
              <span className="font-medium">
                {notification.title}
                {notification.priority === 'high' && (
                  <span className="ml-2 text-xs font-semibold text-red-700 dark:text-red-400">
                    high
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-600 dark:text-slate-400">
                {humanize(notification.event_type)}
                {notification.integration_id !== null &&
                  ` via ${integrationById.get(notification.integration_id)?.name ?? 'a deleted integration'}`}
              </span>
            </span>
          ),
        },
        {
          header: 'Status',
          cell: (notification) => (
            <span className="flex flex-col items-start gap-1">
              <StatusBadge status={notification.status} />
              {notification.error !== null && (
                <span className="text-xs text-red-700 dark:text-red-400">{notification.error}</span>
              )}
            </span>
          ),
        },
        {
          header: 'Attempts',
          isWide: true,
          cell: (notification) =>
            `${notification.attempts}${notification.response_status === null ? '' : `, answered ${notification.response_status}`}`,
        },
        {
          header: 'When',
          isWide: true,
          cell: (notification) => <TimeStamp iso={notification.created_at} />,
        },
      ]}
    />
  );
}
