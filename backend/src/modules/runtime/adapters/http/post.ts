import { is_stack_host } from '@/lib/http/stack_hosts';
import { ProviderError } from '@/modules/runtime/types/provider_error';
import { error_message, error_name } from '@/utils/error_details';

/** A parsed provider HTTP response. */
export interface HttpCallResult {
  status: number;
  headers: Headers;
  body: unknown;
  text: string;
}

/** Options for `post_json` and `post_stream`. */
export interface PostJsonOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeout_ms: number;
}

/** A provider response whose body is read as it arrives. */
export interface StreamCallResult {
  status: number;
  headers: Headers;
  /** The body as it arrives, when the status is 200. */
  body: ReadableStream<Uint8Array> | null;
  /** The parsed error body, when the status is not 200. */
  error_body: unknown;
  /** The raw error body, when the status is not 200. */
  error_text: string;
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

async function send(options: PostJsonOptions, accept: string): Promise<Response> {
  if (is_stack_host(options.url)) {
    throw new ProviderError(
      'bad_request',
      "The base URL points at one of the stack's own services",
    );
  }
  try {
    return await fetch(options.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept, ...options.headers },
      body: JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeout_ms),
    });
  } catch (error: unknown) {
    if (error_name(error) === 'TimeoutError') {
      throw new ProviderError('timeout', `Provider did not answer within ${options.timeout_ms} ms`);
    }
    throw new ProviderError('network', `Provider unreachable: ${error_message(error)}`);
  }
}

/**
 * Posts JSON and returns the status, headers and parsed body. Timeouts and network failures
 * become `ProviderError`; HTTP error statuses are returned for the adapter to classify.
 */
export async function post_json(options: PostJsonOptions): Promise<HttpCallResult> {
  const response = await send(options, 'application/json');
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: parse_json(text), text };
}

/**
 * Posts JSON and asks for server-sent events. Timeouts and network failures before the response
 * become `ProviderError`; an error status comes back with its body read, for the adapter to
 * classify. The timeout covers the whole stream, so reading the body can throw too: see
 * `stream_failure`.
 */
export async function post_stream(options: PostJsonOptions): Promise<StreamCallResult> {
  const response = await send(options, 'text/event-stream');
  if (response.status !== 200 || response.body === null) {
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: null,
      error_body: parse_json(text),
      error_text: text,
    };
  }
  return {
    status: response.status,
    headers: response.headers,
    body: response.body,
    error_body: null,
    error_text: '',
  };
}
