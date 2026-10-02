import type { SandboxJobSpec } from '@tbn/contracts';
import { demux_logs } from '@/lib/docker_engine/docker_engine_client';
import { load_test_config } from '@/testing/test_app';
import {
  SandboxSpecError,
  build_container_request,
  cap_output,
  safe_subpath,
} from './container_request';

const work_mount = { subpath: 'checkouts/o/a', target: '/work', read_only: false };
const files_mount = { subpath: 'owners/o', target: '/files', read_only: true };

const spec: SandboxJobSpec = {
  argv: ['bash', '-lc', 'echo hi'],
  env: { HOME: '/home/agent', http_proxy: 'http://run:agent@egress_proxy:3128' },
  working_dir: '/work/project',
  mounts: [work_mount, files_mount],
  limits: { cpus: 8, memory_mb: 65_536, scratch_mb: 4_096, timeout_seconds: 30, pids: 100 },
  network: 'proxy',
};

describe('build_container_request', () => {
  const config = load_test_config();

  it('hardens the container, caps the limits and mounts the volume by subpath', () => {
    const request = build_container_request(spec, config, { 'com.tbn.sandbox_job': 'j1' });
    expect(request).toMatchObject({
      Image: config.sandbox.image,
      Cmd: ['bash', '-lc', 'echo hi'],
      User: `${config.sandbox.uid}:${config.sandbox.uid}`,
      WorkingDir: '/work/project',
      Labels: { 'com.tbn.sandbox': '1', 'com.tbn.sandbox_job': 'j1' },
      HostConfig: {
        NetworkMode: config.sandbox.network,
        ReadonlyRootfs: true,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        Privileged: false,
        Init: true,
        NanoCpus: config.sandbox.max_cpus * 1e9,
        Memory: config.sandbox.max_memory_mb * 1_048_576,
        MemorySwap: config.sandbox.max_memory_mb * 1_048_576,
        PidsLimit: 100,
      },
    });
    expect(request.Env).toEqual([
      'HOME=/home/agent',
      'http_proxy=http://run:agent@egress_proxy:3128',
    ]);
    expect(request.HostConfig.Tmpfs['/tmp']).toContain(`size=${config.sandbox.max_scratch_mb}m`);
    expect(request.HostConfig.Mounts).toEqual([
      {
        Type: 'volume',
        Source: config.sandbox.workspace_volume,
        Target: '/work',
        ReadOnly: false,
        VolumeOptions: { Subpath: 'checkouts/o/a' },
      },
      {
        Type: 'volume',
        Source: config.sandbox.workspace_volume,
        Target: '/files',
        ReadOnly: true,
        VolumeOptions: { Subpath: 'owners/o' },
      },
    ]);
  });

  it('binds host paths when the workspace is a directory, and disables the network when asked', () => {
    const bound = {
      ...config,
      sandbox: { ...config.sandbox, workspace_volume: '/srv/workspace' },
    };
    const request = build_container_request({ ...spec, network: 'none' }, bound, {});
    expect(request.HostConfig.Mounts[0]).toEqual({
      Type: 'bind',
      Source: '/srv/workspace/checkouts/o/a',
      Target: '/work',
      ReadOnly: false,
    });
    expect(request.HostConfig.NetworkMode).toBe('none');
    expect(request.NetworkDisabled).toBe(true);
  });

  it('refuses a mount that leaves the workspace or repeats a target', () => {
    expect(() => safe_subpath('../etc')).toThrow(SandboxSpecError);
    expect(() => safe_subpath('checkouts/../../x')).toThrow(SandboxSpecError);
    expect(safe_subpath('/checkouts/o//a/')).toBe('checkouts/o/a');
    expect(() =>
      build_container_request(
        { ...spec, mounts: [work_mount, { ...files_mount, target: '/work' }] },
        config,
        {},
      ),
    ).toThrow(SandboxSpecError);
  });
});

describe('cap_output and demux_logs', () => {
  it('keeps the start and the end of a long output', () => {
    const capped = cap_output(Buffer.from('a'.repeat(100) + 'b'.repeat(100)), 50);
    expect(capped.startsWith('a'.repeat(25))).toBe(true);
    expect(capped.endsWith('b'.repeat(25))).toBe(true);
    expect(capped).toContain('150 bytes dropped');
    expect(cap_output(Buffer.from('short'), 50)).toBe('short');
  });

  it('splits the engine stream into stdout and stderr', () => {
    const frame = (kind: number, text: string): Buffer => {
      const header = Buffer.alloc(8);
      header[0] = kind;
      header.writeUInt32BE(Buffer.byteLength(text), 4);
      return Buffer.concat([header, Buffer.from(text)]);
    };
    const logs = demux_logs(
      Buffer.concat([frame(1, 'out1\n'), frame(2, 'err\n'), frame(1, 'out2')]),
    );
    expect(logs.stdout.toString()).toBe('out1\nout2');
    expect(logs.stderr.toString()).toBe('err\n');
  });
});
