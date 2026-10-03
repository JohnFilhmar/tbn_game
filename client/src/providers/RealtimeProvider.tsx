import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { applyChanges } from '@/lib/realtime/applyChanges';
import { publishChanges } from '@/lib/realtime/changeFeed';
import { connectRealtime, type ConnectionStatus } from '@/lib/realtime/realtimeConnection';
import { useStreamStore } from '@/lib/stores/streamStore';
import { API_BASE_URL, useSession } from './SessionProvider';

const RealtimeContext = createContext<ConnectionStatus>('offline');

/**
 * Keeps the desktop and the world live while the owner is signed in: every change from the
 * gateway is written into the query cache and then published to the change feed the world watches,
 * streamed output goes to the stream store, and a resync reloads what is loaded. Nothing polls.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { token, signOut } = useSession();
  const queryClient = useQueryClient();
  const receive = useStreamStore((state) => state.receive);
  const settle = useStreamStore((state) => state.settle);
  const [status, setStatus] = useState<ConnectionStatus>('offline');

  useEffect(() => {
    if (token === null) return undefined;
    const connection = connectRealtime({
      baseUrl: API_BASE_URL,
      token,
      handlers: {
        onChanges: (events) => {
          applyChanges(queryClient, events);
          for (const event of events) {
            if (event.entity === 'transcript_entry' && event.data !== null) settle(event.data);
          }
          publishChanges(events);
        },
        onStream: receive,
        onResync: () => void queryClient.invalidateQueries(),
        onStatus: setStatus,
        onUnauthorized: () => void signOut('Your session ended. Sign in again.'),
      },
    });
    return () => connection.close();
  }, [token, queryClient, receive, settle, signOut]);

  return <RealtimeContext value={status}>{children}</RealtimeContext>;
}

/** How the live connection is doing. */
export function useConnectionStatus(): ConnectionStatus {
  return useContext(RealtimeContext);
}
