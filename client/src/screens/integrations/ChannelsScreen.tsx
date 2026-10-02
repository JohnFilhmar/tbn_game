import type { NotificationChannel } from '@tbn/contracts';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { errorMessage } from '@/lib/api/apiError';
import { dropRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { byId } from '@/lib/data/rows';
import { useCommand } from '@/lib/data/useCommand';
import { humanize } from '@/lib/format/labels';
import { ChannelForm } from './ChannelForm';
import { useNotificationEvents } from './useNotificationEvents';

/** Which integration each system event is sent through. Alerts reach the owner only this way. */
export function ChannelsScreen() {
  const channels = useCollection(COLLECTIONS.notificationChannels);
  const integrations = useCollection(COLLECTIONS.integrations);
  const events = useNotificationEvents();
  const [editing, setEditing] = useState<NotificationChannel | 'new' | null>(null);
  const [deleting, setDeleting] = useState<NotificationChannel | null>(null);
  const remove = useCommand(
    (api, id: string, commandId) =>
      api.sendNoContent('DELETE', `/notification_channels/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.notificationChannels, id),
  );
  if (channels.data === undefined || integrations.data === undefined || events.data === undefined) {
    return <QueryStatus queries={[channels, integrations, events]} label="notification channels" />;
  }
  const integrationById = byId(integrations.data);
  const sorted = [...channels.data].sort((left, right) =>
    left.event_type.localeCompare(right.event_type),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add a channel
        </Button>
      </div>
      {sorted.length === 0 ? (
        <EmptyState
          title="No notification channels"
          description="Without one, the system has no way to tell you about a failed run, a waiting approval or a failed backup."
        />
      ) : (
        <DataTable
          caption="Notification channels"
          rows={sorted}
          rowKey={(channel) => channel.id}
          columns={[
            { header: 'Event', cell: (channel) => humanize(channel.event_type) },
            {
              header: 'Through',
              cell: (channel) => integrationById.get(channel.integration_id)?.name ?? 'Unknown',
            },
            {
              header: 'Body',
              isWide: true,
              cell: (channel) => (channel.body_template === null ? 'Default' : 'Its own'),
            },
            {
              header: 'State',
              cell: (channel) => (
                <StatusBadge
                  status={channel.enabled ? 'ok' : 'cancelled'}
                  label={channel.enabled ? 'Enabled' : 'Disabled'}
                />
              ),
            },
            {
              header: 'Actions',
              cell: (channel) => (
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setEditing(channel)}>
                    Edit<span className="sr-only"> {humanize(channel.event_type)} channel</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(channel)}>
                    Delete<span className="sr-only"> {humanize(channel.event_type)} channel</span>
                  </Button>
                </span>
              ),
            },
          ]}
        />
      )}
      <Dialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'Add a channel' : 'Edit the channel'}
      >
        {editing !== null && (
          <ChannelForm
            channel={editing === 'new' ? undefined : editing}
            events={events.data}
            integrations={integrations.data}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        title="Delete the channel?"
        message="Notices of this event stop going through this integration."
        confirmLabel="Delete"
        isBusy={remove.isPending}
        error={remove.error === null ? null : errorMessage(remove.error)}
        onCancel={() => {
          setDeleting(null);
          remove.reset();
        }}
        onConfirm={() => {
          if (deleting === null) return;
          remove
            .submit(deleting.id)
            .then(() => setDeleting(null))
            .catch(() => undefined);
        }}
      />
    </div>
  );
}
