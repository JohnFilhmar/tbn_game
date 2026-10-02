import type { Provider } from '@tbn/contracts';
import { Link } from 'react-router';
import { buttonClasses } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { StatusBadge } from '@/components/StatusBadge';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

/** Whether a provider takes calls now: its breaker and its credit. */
export function ProviderHealth({ provider }: { provider: Provider }) {
  if (provider.out_of_credit_since !== null) {
    return <StatusBadge status="failed" label="Out of credit" />;
  }
  if (provider.breaker_open_until !== null && new Date(provider.breaker_open_until) > new Date()) {
    return <StatusBadge status="paused" label="Breaker open" />;
  }
  return <StatusBadge status="ok" label="Taking calls" />;
}

/** Every model provider with its models and whether it takes calls now. */
export function ProvidersScreen() {
  const providers = useCollection(COLLECTIONS.providers);
  const header = (
    <PageHeader
      title="Providers"
      description="The model APIs your agents think with, their usage caps and what they cost."
      actions={
        <Link to="/providers/new" className={buttonClasses('primary')}>
          Add a provider
        </Link>
      }
    />
  );
  if (providers.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[providers]} label="providers" />
      </>
    );
  }
  return (
    <>
      {header}
      {providers.data.length === 0 ? (
        <EmptyState
          title="No providers yet"
          description="Add the API of a model provider, or a local model, before you recruit."
          action={
            <Link to="/providers/new" className={buttonClasses('primary')}>
              Add a provider
            </Link>
          }
        />
      ) : (
        <DataTable
          caption="Providers"
          rows={providers.data}
          rowKey={(provider) => provider.id}
          columns={[
            {
              header: 'Name',
              cell: (provider) => (
                <Link
                  to={`/providers/${provider.id}`}
                  className="font-medium text-teal-800 hover:underline dark:text-teal-300"
                >
                  {provider.name}
                </Link>
              ),
            },
            {
              header: 'Models',
              cell: (provider) => provider.models.map((model) => model.model_id).join(', '),
            },
            {
              header: 'Kind',
              isWide: true,
              cell: (provider) => (provider.is_local ? 'Local' : 'Hosted'),
            },
            { header: 'State', cell: (provider) => <ProviderHealth provider={provider} /> },
          ]}
        />
      )}
    </>
  );
}
