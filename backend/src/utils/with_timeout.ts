/** Raised by `with_timeout` when the wrapped work does not settle in time. */
export class TimeoutError extends Error {
  constructor(timeout_ms: number) {
    super(`Timed out after ${timeout_ms} ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Settles like `work`, or rejects with `TimeoutError` when `work` takes longer than `timeout_ms`.
 * The work itself is not cancelled.
 *
 * @param work - The promise or thenable to wait for.
 * @param timeout_ms - How long to wait, in milliseconds.
 */
export async function with_timeout<T>(work: PromiseLike<T>, timeout_ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(timeout_ms)), timeout_ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
