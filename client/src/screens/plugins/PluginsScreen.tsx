import type { Plugin } from '@tbn/contracts';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { Dialog } from '@/components/Dialog';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { errorMessage } from '@/lib/api/apiError';
import { dropRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';
import { useCommand } from '@/lib/data/useCommand';
import { PluginForm } from './PluginForm';
import { PluginTools } from './PluginTools';

/** MCP servers whose tools agents can be given, each attached per agent on its Tools tab. */
export function PluginsScreen() {
  const plugins = useCollection(COLLECTIONS.plugins);
  const [editing, setEditing] = useState<Plugin | 'new' | null>(null);
  const [listing, setListing] = useState<Plugin | null>(null);
  const [deleting, setDeleting] = useState<Plugin | null>(null);
  const remove = useCommand(
    (api, id: string, commandId) => api.sendNoContent('DELETE', `/plugins/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.plugins, id),
  );
  const header = (
    <PageHeader
      title="Plugins"
      description="Model Context Protocol servers. What their tools return is data and taints the run that reads it."
      actions={
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add a plugin
        </Button>
      }
    />
  );
  const dialogs = (
    <>
      <Dialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' || editing === null ? 'Add a plugin' : `Edit ${editing.name}`}
      >
        {editing !== null && (
          <PluginForm
            plugin={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog
        isOpen={listing !== null}
        onClose={() => setListing(null)}
        title={`Tools of ${listing?.name ?? 'the plugin'}`}
      >
        {listing !== null && <PluginTools plugin={listing} />}
      </Dialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete ${deleting?.name ?? 'the plugin'}?`}
        message="It is detached from every agent and its token is erased."
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
    </>
  );
  if (plugins.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[plugins]} label="plugins" />
        {dialogs}
      </>
    );
  }
  return (
    <>
      {header}
      {plugins.data.length === 0 ? (
        <EmptyState title="No plugins" description="Add an MCP server to give agents its tools." />
      ) : (
        <DataTable
          caption="Plugins"
          rows={plugins.data}
          rowKey={(plugin) => plugin.id}
          searchText={(row) => `${row.name} ${row.url}`}
          columns={[
            {
              header: 'Name',
              cell: (plugin) => (
                <span className="flex flex-col">
                  <span className="font-medium">{plugin.name}</span>
                  <span className="text-xs break-all text-slate-600 dark:text-slate-400">
                    {plugin.url}
                  </span>
                </span>
              ),
            },
            {
              header: 'State',
              cell: (plugin) => (
                <StatusBadge
                  status={plugin.enabled ? 'ok' : 'cancelled'}
                  label={plugin.enabled ? 'Enabled' : 'Disabled'}
                />
              ),
            },
            {
              header: 'Token',
              isWide: true,
              cell: (plugin) => (plugin.token_set ? 'Saved' : 'None'),
            },
            {
              header: 'Actions',
              cell: (plugin) => (
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setListing(plugin)}>
                    Tools<span className="sr-only"> of {plugin.name}</span>
                  </Button>
                  <Button size="sm" onClick={() => setEditing(plugin)}>
                    Edit<span className="sr-only"> {plugin.name}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(plugin)}>
                    Delete<span className="sr-only"> {plugin.name}</span>
                  </Button>
                </span>
              ),
            },
          ]}
        />
      )}
      {dialogs}
    </>
  );
}
