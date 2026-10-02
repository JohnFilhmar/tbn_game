import { TimeoutError, with_timeout } from './with_timeout';

function settle_after<T>(delay_ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delay_ms));
}

describe('with_timeout', () => {
  it('resolves with the value when the work finishes in time', async () => {
    await expect(with_timeout(settle_after(5, 'done'), 1_000)).resolves.toBe('done');
  });

  it('passes a rejection through unchanged', async () => {
    const failure = new Error('database refused');
    await expect(with_timeout(Promise.reject(failure), 1_000)).rejects.toBe(failure);
  });

  it('rejects with TimeoutError when the work is too slow', async () => {
    await expect(with_timeout(settle_after(200, 'late'), 10)).rejects.toBeInstanceOf(TimeoutError);
  });
});
