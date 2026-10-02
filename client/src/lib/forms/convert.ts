/** Trimmed text, or undefined when the field is empty, so an optional field is left out. */
export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Trimmed text, or null when the field is empty, for a field the owner may clear. */
export function nullableText(value: string): string | null {
  return optionalText(value) ?? null;
}

/**
 * A number field's value: null when empty, the number when it reads as one, and the text itself
 * otherwise, so the schema rejects it with its own message.
 */
export function numberOrNull(value: string): number | string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : trimmed;
}

/** A number field's value, or undefined when it is empty, so the server's default applies. */
export function optionalNumber(value: string): number | string | undefined {
  return numberOrNull(value) ?? undefined;
}

/** The text of a number for a field: empty for null. */
export function numberText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}
