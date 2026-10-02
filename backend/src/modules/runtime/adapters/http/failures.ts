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

/** A short, safe excerpt of an error body for messages and logs. */
export function error_excerpt(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 300);
}
