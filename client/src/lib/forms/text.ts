/** Trimmed text, or undefined when the field is empty, so an optional field is left out. */
export function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Trimmed text, or null when the field is empty, for a field the owner may clear. */
export function nullableText(value: string): string | null {
  return optionalText(value) ?? null;
}
