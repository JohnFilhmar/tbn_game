import { z } from 'zod';

const ErrorBodySchema = z.looseObject({
  message: z.union([z.string(), z.array(z.string())]).optional(),
  issues: z.array(z.looseObject({ path: z.string(), message: z.string() })).optional(),
});

/** A field the server rejected, with its reason. */
export interface FieldIssue {
  path: string;
  message: string;
}

/**
 * An answer outside 2xx, or a request that never got one (`status` 0). `message` is the server's
 * own reason when it gave one, and `issues` the fields its validation rejected.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the request never reached the server or the connection dropped. */
  get isNetwork(): boolean {
    return this.status === 0;
  }
}

/** Builds an `ApiError` from a failed response's status and body. */
export function apiErrorFrom(status: number, body: unknown): ApiError {
  const parsed = ErrorBodySchema.safeParse(body);
  const raw = parsed.success ? parsed.data.message : undefined;
  const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? `The server answered ${status}`);
  return new ApiError(status, message, parsed.success ? (parsed.data.issues ?? []) : []);
}

/** A sentence for the owner from any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isNetwork
      ? 'The server could not be reached. Check the connection.'
      : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}
