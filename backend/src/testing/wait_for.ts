/** Options for `wait_for`. */
export interface WaitForOptions {
  /** Give up after this many milliseconds. */
  timeout_ms?: number;
  /** Pause between checks. */
  interval_ms?: number;
}

/**
 * Polls `check` until it returns a value other than `undefined`, then returns it.
 *
 * @throws Error with `description` when the timeout passes first.
 */
export async function wait_for<T>(
  description: string,
  check: () => Promise<T | undefined> | T | undefined,
  options: WaitForOptions = {},
): Promise<T> {
  const timeout_ms = options.timeout_ms ?? 15_000;
  const interval_ms = options.interval_ms ?? 100;
  const deadline = Date.now() + timeout_ms;
  for (;;) {
    const value = await check();
    if (value !== undefined) return value;
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, interval_ms));
  }
}
