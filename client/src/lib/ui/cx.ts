/** Joins class names, leaving out the empty and false ones. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part) => typeof part === 'string' && part.length > 0).join(' ');
}
