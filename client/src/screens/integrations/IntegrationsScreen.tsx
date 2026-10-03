import { Link } from 'react-router';
import { buttonClasses } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { EmptyState } from '@/components/states/EmptyState';
import { QueryStatus } from '@/components/states/QueryStatus';
import { COLLECTIONS } from '@/lib/data/collections';
import { useCollection } from '@/lib/data/queries';

/** Every integration, each a request template an agent can be given as a tool. */
export function IntegrationsScreen() {
  const integrations = useCollection(COLLECTIONS.integrations);
  const add = (
    <Link to="/integrations/new" className={buttonClasses('primary')}>
      Add an integration
    </Link>
  );
  if (integrations.data === undefined) {
    return <QueryStatus queries={[integrations]} label="integrations" />;
  }
  if (integrations.data.length === 0) {
    return (
      <EmptyState
        title="No integrations yet"
        description="An integration is one HTTP request with placeholders: a webhook, a ticket, a chat message. Attach it to agents, or use it as a notification channel."
        action={add}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">{add}</div>
      <DataTable
        caption="Integrations"
        rows={integrations.data}
        rowKey={(integration) => integration.id}
        columns={[
          {
            header: 'Name',
            cell: (integration) => (
              <Link
                to={`/integrations/${integration.id}`}
                className="font-medium text-teal-800 hover:underline dark:text-teal-300"
              >
                {integration.name}
              </Link>
            ),
          },
          {
            header: 'Request',
            cell: (integration) => (
              <span className="font-mono text-xs break-all">
                {integration.method} {integration.url}
              </span>
            ),
          },
          {
            header: 'Token',
            isWide: true,
            cell: (integration) => (integration.token_set ? 'Saved' : 'None'),
          },
        ]}
      />
    </div>
  );
}
