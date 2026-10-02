import { UsageSummarySchema, type Provider } from '@tbn/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { DetailList } from '@/components/DetailList';
import { Panel } from '@/components/Panel';
import { QueryStatus } from '@/components/states/QueryStatus';
import { queryKeys } from '@/lib/data/collections';
import { formatMoney, formatNumber } from '@/lib/format/numbers';
import { useApi } from '@/providers/SessionProvider';

/**
 * What the runtime counted on this key since the start. Usage is not an event, so it loads each
 * time the screen opens and on Refresh.
 */
export function UsagePanel({ provider }: { provider: Provider }) {
  const api = useApi();
  const usage = useQuery({
    queryKey: queryKeys.usage(provider.id),
    queryFn: () => api.get(`/providers/${provider.id}/usage`, UsageSummarySchema),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  return (
    <Panel
      title="Usage"
      description="Counted by the runtime from its own records, priced at the prices of each model."
      actions={
        <Button size="sm" isBusy={usage.isFetching} onClick={() => void usage.refetch()}>
          Refresh
        </Button>
      }
    >
      {usage.data === undefined ? (
        <QueryStatus queries={[usage]} label="usage" />
      ) : (
        <>
          <DetailList
            items={[
              { term: 'Requests', detail: formatNumber(usage.data.requests) },
              { term: 'Spend', detail: formatMoney(usage.data.cost) },
              { term: 'Input tokens', detail: formatNumber(usage.data.input_tokens) },
              { term: 'Output tokens', detail: formatNumber(usage.data.output_tokens) },
              { term: 'Cache reads', detail: formatNumber(usage.data.cache_read_tokens) },
              { term: 'Cache writes', detail: formatNumber(usage.data.cache_write_tokens) },
            ]}
          />
          {usage.data.by_model.length > 0 && (
            <DataTable
              caption="Usage by model"
              rows={usage.data.by_model}
              rowKey={(row) => row.model_id}
              columns={[
                { header: 'Model', cell: (row) => row.model_id },
                { header: 'Requests', cell: (row) => formatNumber(row.requests) },
                {
                  header: 'Tokens in / out',
                  cell: (row) =>
                    `${formatNumber(row.input_tokens, true)} / ${formatNumber(row.output_tokens, true)}`,
                },
                { header: 'Spend', cell: (row) => formatMoney(row.cost) },
              ]}
            />
          )}
        </>
      )}
    </Panel>
  );
}
