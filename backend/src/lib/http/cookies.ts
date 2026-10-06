/**
 * The value of one cookie in a `Cookie` header, or null. Values are percent-decoded; a malformed
 * value reads as null.
 *
 * @param header - The raw `Cookie` request header.
 * @param name - The cookie's name.
 */
export function read_cookie(header: string | undefined, name: string): string | null {
  if (header === undefined) return null;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}
