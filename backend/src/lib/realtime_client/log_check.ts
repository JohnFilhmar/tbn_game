import { EventsPageSchema } from '@tbn/contracts';
import type { OwnerApi } from './owner_api';

const PAGE_SIZE = 1_000;

/** What a client received, set against the log over the same range. */
export interface LogComparison {
  /** How many events the log holds after the starting cursor, up to the client's last. */
  expected: number;
  /** How many events the client received. */
  received: number;
  /** Sequences in the log the client never received. */
  missing: number[];
  /** Sequences the client received more than once. */
  repeated: number[];
  /** True when the client received each sequence after the one before it. */
  in_order: boolean;
  /** True when the client received exactly the log: every sequence once, in order. */
  matches: boolean;
}

/**
 * Reads the sequences of the owner's events after `after` up to and including `until`, a page at a
 * time from `GET /events`.
 */
export async function read_log_seqs(
  api: OwnerApi,
  after: number,
  until: number,
): Promise<number[]> {
  const seqs: number[] = [];
  let cursor = after;
  while (cursor < until) {
    const page = await api.get(`/events?after=${cursor}&limit=${PAGE_SIZE}`, EventsPageSchema);
    const kept = page.events.map((event) => event.seq).filter((seq) => seq <= until);
    seqs.push(...kept);
    const last = page.events.at(-1)?.seq;
    if (last === undefined || last >= until || page.events.length < PAGE_SIZE) break;
    cursor = last;
  }
  return seqs;
}

/** Sets the sequences a client received against those the log holds. */
export function compare_with_log(received: number[], log: number[]): LogComparison {
  const seen = new Set<number>();
  const repeated: number[] = [];
  for (const seq of received) {
    if (seen.has(seq)) repeated.push(seq);
    seen.add(seq);
  }
  const missing = log.filter((seq) => !seen.has(seq));
  const in_order = received.every((seq, index) => index === 0 || seq > (received[index - 1] ?? 0));
  const matches =
    in_order &&
    repeated.length === 0 &&
    received.length === log.length &&
    received.every((seq, index) => seq === log[index]);
  return { expected: log.length, received: received.length, missing, repeated, in_order, matches };
}
