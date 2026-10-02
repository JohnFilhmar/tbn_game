import { KeyedSemaphore } from './keyed_semaphore';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('KeyedSemaphore', () => {
  it('runs at most `limit` tasks per key at once, the rest in arrival order', async () => {
    const semaphore = new KeyedSemaphore();
    const order: string[] = [];
    let peak = 0;
    const gates = [deferred(), deferred(), deferred()];
    const runs = gates.map((gate, index) =>
      semaphore.run('provider', 1, async () => {
        order.push(`start ${index}`);
        peak = Math.max(peak, semaphore.active('provider'));
        await gate.promise;
        order.push(`end ${index}`);
      }),
    );
    await flush();
    expect(order).toEqual(['start 0']);
    gates[1]?.resolve();
    gates[2]?.resolve();
    gates[0]?.resolve();
    await Promise.all(runs);
    expect(order).toEqual(['start 0', 'end 0', 'start 1', 'end 1', 'start 2', 'end 2']);
    expect(peak).toBe(1);
    expect(semaphore.active('provider')).toBe(0);
  });

  it('keeps keys apart, runs everything when the limit is null, and frees a slot on error', async () => {
    const semaphore = new KeyedSemaphore();
    const gate = deferred();
    const held = semaphore.run('a', 1, () => gate.promise);
    await expect(semaphore.run('b', 1, () => Promise.resolve('other key'))).resolves.toBe(
      'other key',
    );
    await expect(semaphore.run('a', null, () => Promise.resolve('no limit'))).resolves.toBe(
      'no limit',
    );
    gate.resolve();
    await held;
    await expect(semaphore.run('a', 1, () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    await expect(semaphore.run('a', 1, () => Promise.resolve('freed'))).resolves.toBe('freed');
  });
});
