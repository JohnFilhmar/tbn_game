import { rate_limit_wait_ms } from './failures';

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const HOUR = 3_600_000;

describe('how long a rate limit lasts', () => {
  it('reads retry-after first, then an x-ratelimit-reset header in any of its units', () => {
    expect(rate_limit_wait_ms(new Headers({ 'retry-after': '30' }), null, NOW)).toBe(30_000);
    const in_ms = new Headers({ 'x-ratelimit-reset': String(NOW + HOUR) });
    expect(rate_limit_wait_ms(in_ms, null, NOW)).toBe(HOUR);
    const in_seconds = new Headers({ 'x-ratelimit-reset': String((NOW + HOUR) / 1_000) });
    expect(rate_limit_wait_ms(in_seconds, null, NOW)).toBe(HOUR);
    expect(rate_limit_wait_ms(new Headers({ 'x-ratelimit-reset': '12' }), null, NOW)).toBe(12_000);
  });

  it('reads the reset OpenRouter puts in its error body, and nothing from a body without one', () => {
    const body = {
      error: {
        message: 'Rate limit exceeded: free-models-per-day',
        code: 429,
        metadata: {
          headers: {
            'X-RateLimit-Limit': '50',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(NOW + 8 * HOUR),
          },
        },
      },
    };
    expect(rate_limit_wait_ms(new Headers(), body, NOW)).toBe(8 * HOUR);
    expect(rate_limit_wait_ms(new Headers(), { error: { message: 'slow down' } }, NOW)).toBe(
      undefined,
    );
    expect(rate_limit_wait_ms(new Headers({ 'x-ratelimit-reset': 'soon' }), null, NOW)).toBe(
      undefined,
    );
  });
});
