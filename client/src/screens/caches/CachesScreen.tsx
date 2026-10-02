import { CacheStatsSchema } from '@tbn/contracts';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { DetailList } from '@/components/DetailList';
import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { QueryStatus } from '@/components/states/QueryStatus';
import { queryKeys } from '@/lib/data/collections';
import { formatBytes, formatMoney, formatNumber, formatPercent } from '@/lib/format/numbers';
import { useApi } from '@/providers/SessionProvider';

/**
 * What the search and page caches saved since the start. The figures are not events, so they load
 * each time the screen opens and on Refresh.
 */
export function CachesScreen() {
  const api = useApi();
  const stats = useQuery({
    queryKey: queryKeys.cacheStats(),
    queryFn: () => api.get('/caches/stats', CacheStatsSchema),
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const header = (
    <PageHeader
      title="Cache savings"
      description="Agents reuse recent searches and pages instead of asking again."
      actions={
        <Button isBusy={stats.isFetching} onClick={() => void stats.refetch()}>
          Refresh
        </Button>
      }
    />
  );
  if (stats.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[stats]} label="cache figures" />
      </>
    );
  }
  const { search, fetch } = stats.data;
  return (
    <>
      {header}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Search" description="Results of web_search, by query.">
          <DetailList
            items={[
              { term: 'Hit rate', detail: formatPercent(search.hit_rate) },
              {
                term: 'Hits and misses',
                detail: `${formatNumber(search.hits)} / ${formatNumber(search.misses)}`,
              },
              { term: 'Requests saved', detail: formatNumber(search.requests_saved) },
              { term: 'Money saved', detail: formatMoney(search.money_saved) },
            ]}
          />
        </Panel>
        <Panel title="Pages" description="Pages read with fetch_url, by address.">
          <DetailList
            items={[
              { term: 'Hit rate', detail: formatPercent(fetch.hit_rate) },
              {
                term: 'Hits and misses',
                detail: `${formatNumber(fetch.hits)} / ${formatNumber(fetch.misses)}`,
              },
              { term: 'Downloads saved', detail: formatBytes(fetch.bytes_saved) },
            ]}
          />
        </Panel>
      </div>
    </>
  );
}
