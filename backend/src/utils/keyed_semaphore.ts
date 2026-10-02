interface Slots {
  active: number;
  waiting: Array<() => void>;
}

/**
 * Limits how many tasks run at once per key, for example per provider. Tasks over the limit wait
 * in arrival order. A null limit runs the task at once.
 *
 * Ceiling: the slots live in this process, so a limit holds per process.
 */
export class KeyedSemaphore {
  private readonly slots = new Map<string, Slots>();

  /**
   * Runs `work` once a slot for `key` is free.
   *
   * @param limit - How many tasks may run at once for `key`, or null for no limit.
   */
  async run<T>(key: string, limit: number | null, work: () => Promise<T>): Promise<T> {
    if (limit === null) return work();
    await this.acquire(key, limit);
    try {
      return await work();
    } finally {
      this.release(key);
    }
  }

  /** How many tasks run for `key` right now. */
  active(key: string): number {
    return this.slots.get(key)?.active ?? 0;
  }

  private async acquire(key: string, limit: number): Promise<void> {
    let slots = this.slots.get(key);
    if (slots === undefined) {
      slots = { active: 0, waiting: [] };
      this.slots.set(key, slots);
    }
    if (slots.active < limit) {
      slots.active += 1;
      return;
    }
    const entry = slots;
    await new Promise<void>((resolve) => entry.waiting.push(resolve));
  }

  private release(key: string): void {
    const slots = this.slots.get(key);
    if (slots === undefined) return;
    const next = slots.waiting.shift();
    if (next !== undefined) {
      next();
      return;
    }
    slots.active -= 1;
    if (slots.active === 0) this.slots.delete(key);
  }
}
