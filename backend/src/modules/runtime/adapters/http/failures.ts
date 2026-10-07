import { z } from 'zod';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import { error_message, error_name } from '@/utils/error_details';

/**
 * Maps an error thrown while a streamed body is read: a timeout, a connection cut short, or a
 * `ProviderError` the stream itself carried.
 */
export function stream_failure(error: unknown, timeout_ms: number): ProviderError {
  if (error instanceof ProviderError) return error;
  if (error_name(error) === 'TimeoutError' || error_name(error) === 'AbortError') {
    return new ProviderError('timeout', `Provider did not finish within ${timeout_ms} ms`);
  }
  return new ProviderError('network', `The stream broke off: ${error_message(error)}`);
}

/** Reads a `retry-after` header in seconds or as an HTTP date, in milliseconds. */
export function retry_after_ms(headers: Headers): number | undefined {
  const value = headers.get('retry-after');
  if (value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** OpenRouter's rate limit answer, which carries the limit's headers inside the error body. */
const RateLimitBodySchema = z.looseObject({
  error: z.looseObject({
    metadata: z.looseObject({ headers: z.record(z.string(), z.unknown()) }),
  }),
});

/** Milliseconds until a reset given as epoch milliseconds, epoch seconds or seconds from now. */
function reset_wait_ms(value: unknown, now: number): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  if (number > 1e12) return Math.max(0, number - now);
  if (number > 1e9) return Math.max(0, number * 1_000 - now);
  return Math.round(number * 1_000);
}

/**
 * How long a rate limit lasts, in milliseconds: from `retry-after`, an `x-ratelimit-reset` header,
 * or the reset OpenRouter puts in its error body, such as the end of a daily free quota.
 */
export function rate_limit_wait_ms(
  headers: Headers,
  body: unknown,
  now = Date.now(),
): number | undefined {
  const after = retry_after_ms(headers);
  if (after !== undefined) return after;
  const header = headers.get('x-ratelimit-reset');
  if (header !== null) return reset_wait_ms(header, now);
  const parsed = RateLimitBodySchema.safeParse(body);
  if (!parsed.success) return undefined;
  const reset = Object.entries(parsed.data.error.metadata.headers).find(
    ([name]) => name.toLowerCase() === 'x-ratelimit-reset',
  );
  return reset === undefined ? undefined : reset_wait_ms(reset[1], now);
}

/** A short, safe excerpt of an error body for messages and logs. */
export function error_excerpt(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 300);
}
