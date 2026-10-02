/** The name of a thrown value, read without `instanceof`, which fails across realms for a DOMException. */
export function error_name(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
}

/** The message of a thrown value, or `unknown error`. */
export function error_message(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'unknown error';
}
