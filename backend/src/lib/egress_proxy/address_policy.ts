import { isIPv4, isIPv6 } from 'node:net';

/**
 * IPv4 ranges the proxy never connects to: this host, private networks, link-local and the cloud
 * metadata service, the carrier NAT range the VPN uses, and the reserved ranges nothing public
 * lives in.
 */
const REFUSED_IPV4: ReadonlyArray<readonly [string, number, string]> = [
  ['0.0.0.0', 8, 'this network'],
  ['10.0.0.0', 8, 'a private network'],
  ['100.64.0.0', 10, 'the carrier NAT range, where the VPN lives'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local, where the metadata service lives'],
  ['172.16.0.0', 12, 'a private network'],
  ['192.0.0.0', 24, 'a reserved range'],
  ['192.0.2.0', 24, 'a documentation range'],
  ['192.88.99.0', 24, 'a reserved range'],
  ['192.168.0.0', 16, 'a private network'],
  ['198.18.0.0', 15, 'a benchmarking range'],
  ['198.51.100.0', 24, 'a documentation range'],
  ['203.0.113.0', 24, 'a documentation range'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'a reserved range'],
];

/** Host names and suffixes that only ever name this host, this stack or a private network. */
const REFUSED_HOST_SUFFIXES = ['localhost', 'internal', 'local', 'home.arpa', 'arpa'];

function ipv4_number(address: string): number {
  return address.split('.').reduce((total, part) => total * 256 + Number(part), 0);
}

function in_ipv4_range(address: number, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits);
  return Math.floor(address / size) === Math.floor(ipv4_number(base) / size);
}

/** The 8 groups of an IPv6 address, with an embedded IPv4 tail turned into its two groups. */
function ipv6_groups(address: string): number[] {
  let text = address;
  const last_colon = text.lastIndexOf(':');
  const tail = text.slice(last_colon + 1);
  if (tail.includes('.')) {
    const ipv4 = ipv4_number(tail);
    text = `${text.slice(0, last_colon + 1)}${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const [head = '', rest = ''] = text.split('::');
  const head_groups = head.length > 0 ? head.split(':') : [];
  const rest_groups = rest.length > 0 ? rest.split(':') : [];
  const missing = text.includes('::') ? 8 - head_groups.length - rest_groups.length : 0;
  return [...head_groups, ...Array<string>(missing).fill('0'), ...rest_groups].map((group) =>
    parseInt(group, 16),
  );
}

function refused_ipv4(address: string): string | null {
  const value = ipv4_number(address);
  for (const [base, bits, reason] of REFUSED_IPV4) {
    if (in_ipv4_range(value, base, bits)) return `${address} is ${reason}`;
  }
  return null;
}

function refused_ipv6(address: string): string | null {
  const groups = ipv6_groups(address);
  const first = groups[0] ?? 0;
  if (groups.every((group) => group === 0)) return `${address} is unspecified`;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) {
    return `${address} is loopback`;
  }
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const ipv4 = `${(groups[6] ?? 0) >>> 8}.${(groups[6] ?? 0) & 0xff}.${(groups[7] ?? 0) >>> 8}.${(groups[7] ?? 0) & 0xff}`;
    return refused_ipv4(ipv4) ?? null;
  }
  if (groups.slice(0, 6).every((group) => group === 0)) return `${address} is IPv4-compatible`;
  if (first === 0x64 && groups[1] === 0xff9b) return `${address} embeds an IPv4 address`;
  if (first === 0x2002 || (first === 0x2001 && groups[1] === 0)) {
    return `${address} embeds an IPv4 address`;
  }
  if (first === 0x2001 && groups[1] === 0xdb8) return `${address} is a documentation range`;
  if ((first & 0xffc0) === 0xfe80) return `${address} is link-local`;
  if ((first & 0xfe00) === 0xfc00) return `${address} is a private network`;
  if ((first & 0xff00) === 0xff00) return `${address} is multicast`;
  return null;
}

/**
 * Why the proxy refuses to connect to an address, or null when the address is public. Every
 * resolved address of a destination goes through this, so a public name that resolves to a
 * private address is refused too.
 *
 * @param address - An IPv4 or IPv6 address, with or without a zone.
 */
export function refused_address(address: string): string | null {
  const plain = address.split('%')[0] ?? address;
  if (isIPv4(plain)) return refused_ipv4(plain);
  if (isIPv6(plain)) return refused_ipv6(plain);
  return `${address} is not an address`;
}

/**
 * Why the proxy refuses a host name before resolving it, or null. Names without a dot belong to
 * this stack's networks, and the listed suffixes never name a public host.
 */
export function refused_host(host: string): string | null {
  const name = host.toLowerCase().replace(/\.$/, '');
  if (name.length === 0) return 'the host is empty';
  if (isIPv4(name) || isIPv6(name)) return null;
  if (!name.includes('.')) return `${host} is not a public name`;
  for (const suffix of REFUSED_HOST_SUFFIXES) {
    if (name === suffix || name.endsWith(`.${suffix}`)) return `${host} is not a public name`;
  }
  return null;
}

/**
 * True when the host matches the owner's allowlist: an entry names a host and its subdomains. An
 * empty list allows every public host.
 */
export function host_allowed(host: string, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const name = host.toLowerCase().replace(/\.$/, '');
  return allowed.some((entry) => {
    const pattern = entry
      .toLowerCase()
      .replace(/^\*?\./, '')
      .replace(/\.$/, '');
    return name === pattern || name.endsWith(`.${pattern}`);
  });
}
