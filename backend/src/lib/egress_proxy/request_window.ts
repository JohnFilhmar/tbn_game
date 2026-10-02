/** How many requests a key made in the last minute, for the per-run rate limit. */
export class RequestWindow {
  private readonly stamps = new Map<string, number[]>();

  /**
   * @param limit - Requests a key may make per window.
   * @param window_ms - The sliding window.
   */
  constructor(
    private readonly limit: number,
    private readonly window_ms = 60_000,
  ) {}

  /** Records a request for the key and returns false when the key is over its limit. */
  admit(key: string, now = Date.now()): boolean {
    const recent = (this.stamps.get(key) ?? []).filter((stamp) => now - stamp < this.window_ms);
    if (recent.length >= this.limit) {
      this.stamps.set(key, recent);
      return false;
    }
    recent.push(now);
    this.stamps.set(key, recent);
    if (this.stamps.size > 10_000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, stamps] of this.stamps) {
      if (stamps.every((stamp) => now - stamp >= this.window_ms)) this.stamps.delete(key);
    }
  }
}
