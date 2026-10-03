/**
 * Whether a browser on `origin` may open the realtime socket: no origin at all (a scripted
 * client), an origin on the CORS list (the Vite dev server, the shells), or the page's own
 * origin, which serves the client under `/app` on the same host as the API.
 */
export function is_allowed_origin(
  origin: string | undefined,
  host: string | undefined,
  allowed: ReadonlySet<string>,
): boolean {
  if (origin === undefined || allowed.has(origin)) return true;
  if (host === undefined) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
