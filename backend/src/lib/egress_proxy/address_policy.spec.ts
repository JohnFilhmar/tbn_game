import { host_allowed, refused_address, refused_host } from './address_policy';
import { RequestWindow } from './request_window';

describe('refused_address', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['0.0.0.0', 'this network'],
    ['10.1.2.3', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.169.254', 'metadata'],
    ['100.64.0.1', 'VPN'],
    ['100.127.255.255', 'VPN'],
    ['192.0.0.1', 'reserved'],
    ['198.18.0.1', 'benchmarking'],
    ['203.0.113.9', 'documentation'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'reserved'],
    ['::', 'unspecified'],
    ['::1', 'loopback'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:10.0.0.1', 'private'],
    ['::ffff:7f00:1', 'loopback'],
    ['::10.0.0.1', 'IPv4-compatible'],
    ['64:ff9b::a00:1', 'embeds'],
    ['2002:c0a8:101::', 'embeds'],
    ['2001:0:1::1', 'embeds'],
    ['2001:db8::1', 'documentation'],
    ['fe80::1', 'link-local'],
    ['fe80::1%eth0', 'link-local'],
    ['febf::1', 'link-local'],
    ['fc00::1', 'private'],
    ['fd12:3456::1', 'private'],
    ['ff02::1', 'multicast'],
    ['not-an-address', 'not an address'],
  ])('refuses %s', (address, reason) => {
    expect(refused_address(address)).toContain(reason);
  });

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '93.184.216.34',
    '100.63.255.255',
    '100.128.0.1',
    '172.15.255.255',
    '172.32.0.1',
    '192.169.0.1',
    '2606:4700::1111',
    '2a00:1450:4001:80b::200e',
    '::ffff:8.8.8.8',
  ])('allows %s', (address) => {
    expect(refused_address(address)).toBeNull();
  });
});

describe('refused_host', () => {
  it.each([
    'localhost',
    'LOCALHOST.',
    'api.localhost',
    'postgres',
    'web',
    'egress_proxy',
    'host.docker.internal',
    'metadata.internal',
    'printer.local',
    'router.home.arpa',
    '1.0.0.127.in-addr.arpa',
    '',
  ])('refuses %s before resolving it', (host) => {
    expect(refused_host(host)).not.toBeNull();
  });

  it.each(['example.com', 'api.github.com', 'deb.debian.org.', '1.1.1.1', '2606:4700::1111'])(
    'lets %s through to the address policy',
    (host) => {
      expect(refused_host(host)).toBeNull();
    },
  );
});

describe('host_allowed', () => {
  it('allows every host when the list is empty, and a host and its subdomains otherwise', () => {
    expect(host_allowed('anything.example', [])).toBe(true);
    const allowed = ['example.com', '.docs.rs', '*.github.com'];
    expect(host_allowed('example.com', allowed)).toBe(true);
    expect(host_allowed('api.example.com', allowed)).toBe(true);
    expect(host_allowed('EXAMPLE.COM.', allowed)).toBe(true);
    expect(host_allowed('docs.rs', allowed)).toBe(true);
    expect(host_allowed('crate.docs.rs', allowed)).toBe(true);
    expect(host_allowed('api.github.com', allowed)).toBe(true);
    expect(host_allowed('notexample.com', allowed)).toBe(false);
    expect(host_allowed('example.com.evil.net', allowed)).toBe(false);
    expect(host_allowed('example.org', allowed)).toBe(false);
  });
});

describe('RequestWindow', () => {
  it('admits up to the limit per key within the window, then again once it slides', () => {
    const window = new RequestWindow(2, 1_000);
    expect(window.admit('run_a', 0)).toBe(true);
    expect(window.admit('run_a', 100)).toBe(true);
    expect(window.admit('run_a', 200)).toBe(false);
    expect(window.admit('run_b', 200)).toBe(true);
    expect(window.admit('run_a', 1_050)).toBe(true);
    expect(window.admit('run_a', 1_060)).toBe(false);
    expect(window.admit('run_a', 1_150)).toBe(true);
  });
});
