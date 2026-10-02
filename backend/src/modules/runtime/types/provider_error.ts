/** What went wrong with a provider call. */
export type ProviderErrorKind =
  | 'authentication'
  | 'rate_limited'
  | 'out_of_credit'
  | 'bad_request'
  | 'server'
  | 'timeout'
  | 'network';

const RETRYABLE_KINDS: ReadonlySet<ProviderErrorKind> = new Set([
  'rate_limited',
  'server',
  'timeout',
  'network',
]);

/** Options for `ProviderError`. */
export interface ProviderErrorOptions {
  status?: number;
  retry_after_ms?: number;
}

/** A failed provider call, classified so the client knows whether to retry. */
export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly status: number | undefined;
  readonly retry_after_ms: number | undefined;

  constructor(kind: ProviderErrorKind, message: string, options: ProviderErrorOptions = {}) {
    super(message);
    this.name = 'ProviderError';
    this.kind = kind;
    this.status = options.status;
    this.retry_after_ms = options.retry_after_ms;
  }

  /** True for rate limits, server errors, timeouts and network errors. */
  get retryable(): boolean {
    return RETRYABLE_KINDS.has(this.kind);
  }
}
