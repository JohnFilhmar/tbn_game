import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { TranscriptEntrySchema, type TranscriptEntry } from '@tbn/contracts';
import type { ApiClient } from '@/lib/api/apiClient';
import { queryKeys } from '@/lib/data/collections';
import { useApi } from '@/providers/SessionProvider';

const PAGE = 500;
const PageSchema = TranscriptEntrySchema.array();

/** Reads an agent's whole transcript, a page at a time, oldest first. */
export async function loadTranscript(api: ApiClient, agentId: string): Promise<TranscriptEntry[]> {
  const entries: TranscriptEntry[] = [];
  let afterSeq = 0;
  for (;;) {
    const page = await api.get(`/agents/${agentId}/transcript`, PageSchema, {
      after_seq: afterSeq,
      limit: PAGE,
    });
    entries.push(...page);
    const last = page.at(-1);
    if (last === undefined || page.length < PAGE) return entries;
    afterSeq = last.seq;
  }
}

/** An agent's transcript, loaded once and then kept live by events. */
export function useTranscript(agentId: string): UseQueryResult<TranscriptEntry[]> {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.transcript(agentId),
    queryFn: () => loadTranscript(api, agentId),
  });
}
