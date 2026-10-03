import type { SearchProvider } from '@tbn/contracts';
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
import { formatMoney } from '@/lib/format/numbers';
import { SearchProviderForm } from './SearchProviderForm';

/** The web search providers agents search with, in the order they are tried. */
export function SearchProvidersScreen() {
  const providers = useCollection(COLLECTIONS.searchProviders);
  const [editing, setEditing] = useState<SearchProvider | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SearchProvider | null>(null);
  const remove = useCommand(
    (api, id: string, commandId) =>
      api.sendNoContent('DELETE', `/search_providers/${id}`, { commandId }),
    (cache, _output, id) => dropRow(cache, COLLECTIONS.searchProviders, id),
  );
  const header = (
    <PageHeader
      title="Search"
      description="Where web_search goes, in priority order. Results are cached, and what an agent reads from the web taints its run."
      actions={
        <Button variant="primary" onClick={() => setEditing('new')}>
          Add a search provider
        </Button>
      }
    />
  );
  const dialogs = (
    <>
      <Dialog
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={
          editing === 'new' || editing === null ? 'Add a search provider' : `Edit ${editing.name}`
        }
      >
        {editing !== null && (
          <SearchProviderForm
            provider={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Dialog>
      <ConfirmDialog
        isOpen={deleting !== null}
        title={`Delete ${deleting?.name ?? 'the search provider'}?`}
        message="Its key is erased. Cached results stay."
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
  if (providers.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[providers]} label="search providers" />
        {dialogs}
      </>
    );
  }
  const sorted = [...providers.data].sort(
    (left, right) => left.priority - right.priority || left.name.localeCompare(right.name),
  );
  return (
    <>
      {header}
      {sorted.length === 0 ? (
        <EmptyState
          title="No search providers"
          description="Without one, agents cannot search the web. The stack's SearXNG works without a key."
        />
      ) : (
        <DataTable
          caption="Search providers"
          rows={sorted}
          rowKey={(provider) => provider.id}
          columns={[
            { header: 'Priority', cell: (provider) => provider.priority },
            {
              header: 'Name',
              cell: (provider) => (
                <span className="flex flex-col">
                  <span className="font-medium">{provider.name}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {provider.type === 'brave' ? 'Brave' : 'SearXNG'} · {provider.base_url}
                  </span>
                </span>
              ),
            },
            {
              header: 'State',
              cell: (provider) => (
                <StatusBadge
                  status={provider.enabled ? 'ok' : 'cancelled'}
                  label={provider.enabled ? 'Enabled' : 'Disabled'}
                />
              ),
            },
            {
              header: 'Price',
              isWide: true,
              cell: (provider) =>
                provider.price_per_thousand_requests === null
                  ? 'Not set'
                  : `${formatMoney(provider.price_per_thousand_requests)} per 1000`,
            },
            {
              header: 'Actions',
              cell: (provider) => (
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => setEditing(provider)}>
                    Edit<span className="sr-only"> {provider.name}</span>
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(provider)}>
                    Delete<span className="sr-only"> {provider.name}</span>
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
