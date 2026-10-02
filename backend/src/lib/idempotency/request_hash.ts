import { createHash } from 'node:crypto';
import { z } from 'zod';

const JsonSchema = z.json();

type Json = z.infer<typeof JsonSchema>;

function by_key([left]: [string, Json], [right]: [string, Json]): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(by_key)
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}

/**
 * A SHA-256 over the method, the URL with its query and the parsed body with its keys sorted, so
 * a retry of the same command matches however its client ordered the fields.
 */
export function request_hash(method: string, url: string, body: unknown): string {
  const parsed = JsonSchema.safeParse(body ?? null);
  const content = JSON.stringify([
    method.toUpperCase(),
    url,
    parsed.success ? canonical(parsed.data) : JSON.stringify(body),
  ]);
  return createHash('sha256').update(content).digest('hex');
}
