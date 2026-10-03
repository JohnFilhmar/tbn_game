import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/apiError';
import type { ApiClient } from '@/lib/api/apiClient';
import { RealtimeProvider } from './RealtimeProvider';
import { SessionProvider } from './SessionProvider';
import { ThemeProvider } from './ThemeProvider';

/**
 * A query client for the desktop. Rows stay fresh through events, so nothing goes stale on a
 * timer or on focus; a read that failed to reach the server tries twice more.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        retry: (count, error) => count < 2 && error instanceof ApiError && error.isNetwork,
      },
    },
  });
}

/** Props of `AppProviders`. */
export interface AppProvidersProps {
  children: ReactNode;
  /** Tests pass their own query client and API client. */
  queryClient?: QueryClient;
  api?: ApiClient;
}

/** The one root provider: server state, the session, the live connection and the theme. */
export function AppProviders({ children, queryClient, api }: AppProvidersProps) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <QueryClientProvider client={client}>
      <SessionProvider api={api}>
        <RealtimeProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </RealtimeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
