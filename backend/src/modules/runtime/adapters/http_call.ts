import { ProviderError } from '@/modules/runtime/types/provider_error';

/** A parsed provider HTTP response. */
export interface HttpCallResult {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
}

/** Options for `post_json`. */
export interface PostJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeout_ms: number;
}

/** The error's name, read without `instanceof`, which fails across realms for a DOMException. */
function error_name(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

function error_message(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'unknown error';
}

function parse_json(text: string): unknown {
  if (text.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Posts JSON and returns the status, headers and parsed body. Timeouts and network failures
 * become `ProviderError`; HTTP error statuses are returned for the adapter to classify.
 */
export async function post_json(options: PostJsonOptions): Promise<HttpCallResult> {
  let response: Response;
  try {
    response = await fetch(options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeout_ms),
    });
  } catch (error: unknown) {
    if (error_name(error) === 'TimeoutError') {
      throw new ProviderError('timeout', `Provider did not answer within ${options.timeout_ms} ms`);
    }
    throw new ProviderError('network', `Provider unreachable: ${error_message(error)}`);
  }
  const text = await response.text();
  const body = parse_json(text);
  return { status: response.status, headers: response.headers, body, text };
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
