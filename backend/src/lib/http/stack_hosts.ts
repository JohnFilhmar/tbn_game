/**
 * The stack's own services, by their compose names. A provider's base URL never points at one:
 * it would receive the provider's key, and it lets an LLM connection reach the database or the
 * metrics. Loopback, LAN and VPN addresses stay allowed, since local models live there.
 */
const STACK_HOSTS = new Set([
  'postgres',
  'web',
  'worker',
  'sandbox',
  'egress_proxy',
  'searxng',
  'prometheus',
  'grafana',
]);

/** True when `url` names one of the stack's own services as its host. */
export function is_stack_host(url: string): boolean {
  try {
    return STACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}
