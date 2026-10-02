import { IdSchema, StreamChunkSchema } from '@tbn/contracts';
import { z } from 'zod';

/** The channel on which the event trigger names the owner whose log grew. */
export const CHANGES_CHANNEL = 'tbn_changes';

/** The channel on which the worker publishes model output while it streams. */
export const STREAM_CHANNEL = 'tbn_stream';

/**
 * The most text one stream notice carries. PostgreSQL caps a notification at 8,000 bytes, and JSON
 * escaping can grow text sixfold, so this leaves room for the worst case and the ids around it.
 */
export const STREAM_TEXT_MAX_BYTES = 1_000;

/** One notice on `STREAM_CHANNEL`: a chunk of an owner's agent's output. */
export const StreamNoticeSchema = z.strictObject({ owner_id: IdSchema, chunk: StreamChunkSchema });

/** A notice on `STREAM_CHANNEL`. */
export type StreamNotice = z.infer<typeof StreamNoticeSchema>;
