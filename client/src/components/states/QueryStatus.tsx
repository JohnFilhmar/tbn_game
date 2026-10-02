import type { UseQueryResult } from '@tanstack/react-query';
import { errorMessage } from '@/lib/api/apiError';
import { ErrorState } from './ErrorState';
import { LoadingState } from './LoadingState';

/** Props of `QueryStatus`. */
export interface QueryStatusProps {
  queries: ReadonlyArray<UseQueryResult<unknown>>;
  /** What the queries load, as in `agents`. */
  label: string;
}

/**
 * The loading or error state of the queries a screen waits for. A screen renders it until every
 * query has data: `if (agents.data === undefined) return <QueryStatus ... />`.
 */
export function QueryStatus({ queries, label }: QueryStatusProps) {
  const failed = queries.filter((query) => query.isError);
  const first = failed[0];
  if (first !== undefined) {
    return (
      <ErrorState
        title={`The ${label} could not be loaded`}
        message={errorMessage(first.error)}
        onRetry={() => {
          for (const query of failed) void query.refetch();
        }}
      />
    );
  }
  return <LoadingState label={label} />;
}
