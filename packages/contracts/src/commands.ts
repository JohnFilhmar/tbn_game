import { z } from 'zod';

/** The request header that carries a command's id. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** The response header set on an answer replayed for a command id that already ran. */
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';

/**
 * A command id: a UUID the client generates once per command and sends again with every retry of
 * it, so the command runs at most once. Any authenticated `POST`, `PUT`, `PATCH` or `DELETE`
 * accepts one.
 */
export const IdempotencyKeySchema = z.uuid();

/** A command id. */
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;
