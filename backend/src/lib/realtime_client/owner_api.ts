import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from '@tbn/contracts';
import type { z } from 'zod';

/** One answer of the owner's API. */
export interface ApiAnswer {
  status: number;
  /** True when the answer was replayed for a command id that already ran. */
  replayed: boolean;
  body: unknown;
}

/**
 * A small HTTP client of the owner's API for the scripted client, which runs outside the
 * application with nothing but a session token.
 */
export class OwnerApi {
  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  /**
   * Reads `path` and parses its JSON body with `schema`.
   *
   * @throws Error when the answer is not a 2xx or its body does not fit `schema`.
   */
  async get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const response = await fetch(`${this.url}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
    return schema.parse(await response.json());
  }

  /** Sends a JSON body, under a command id when one is given, and returns whatever comes back. */
  async post(path: string, body: unknown, command_id?: string): Promise<ApiAnswer> {
    const response = await fetch(`${this.url}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(command_id !== undefined && { [IDEMPOTENCY_KEY_HEADER]: command_id }),
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const parsed: unknown = text.length > 0 ? JSON.parse(text) : null;
    return {
      status: response.status,
      replayed: response.headers.get(IDEMPOTENT_REPLAYED_HEADER) === 'true',
      body: parsed,
    };
  }
}
