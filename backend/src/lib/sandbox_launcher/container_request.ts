import { posix } from 'node:path';
import type { SandboxJobSpec } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import type { ContainerCreateRequest, MountRequest } from '@/lib/docker_engine/docker_engine_types';

/** The label every sandbox container carries, so the launcher can find its own containers. */
export const SANDBOX_LABEL = 'com.tbn.sandbox';

const MB = 1_048_576;

/** Where the sandbox image keeps the agent user's home, a tmpfs sized by the scratch limit. */
const HOME_DIR = '/home/agent';

/** Raised when a spec asks for something the launcher refuses, such as a mount outside the volume. */
export class SandboxSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxSpecError';
  }
}

/** A mount subpath stays inside the workspace: relative, normalised, never climbing out. */
export function safe_subpath(subpath: string): string {
  const normalised = posix.normalize(subpath).replace(/^\/+/, '').replace(/\/+$/, '');
  if (
    normalised.length === 0 ||
    normalised === '.' ||
    normalised.startsWith('../') ||
    normalised === '..' ||
    normalised.split('/').includes('..')
  ) {
    throw new SandboxSpecError(`Mount subpath ${subpath} leaves the workspace`);
  }
  return normalised;
}

function mount_of(
  workspace_volume: string,
  subpath: string,
  target: string,
  read_only: boolean,
): MountRequest {
  const safe = safe_subpath(subpath);
  if (workspace_volume.startsWith('/')) {
    return {
      Type: 'bind',
      Source: posix.join(workspace_volume, safe),
      Target: target,
      ReadOnly: read_only,
    };
  }
  return {
    Type: 'volume',
    Source: workspace_volume,
    Target: target,
    ReadOnly: read_only,
    VolumeOptions: { Subpath: safe },
  };
}

/**
 * Turns a job spec into the Engine API request for one hardened container: read-only root, no
 * capabilities, no new privileges, the limits the spec asks for capped by the launcher's maxima,
 * the workspace mounts by subpath, tmpfs scratch space, and either the sandbox network or none.
 *
 * @param spec - The job's spec, as the worker wrote it.
 * @param config - The launcher's configuration: image, network, volume and maxima.
 * @param labels - Labels that identify the job, besides the sandbox label.
 */
export function build_container_request(
  spec: SandboxJobSpec,
  config: AppConfig,
  labels: Record<string, string>,
): ContainerCreateRequest {
  const { sandbox } = config;
  const cpus = Math.min(spec.limits.cpus, sandbox.max_cpus);
  const memory_mb = Math.min(spec.limits.memory_mb, sandbox.max_memory_mb);
  const scratch_mb = Math.min(spec.limits.scratch_mb, sandbox.max_scratch_mb);
  const working_dir = posix.normalize(spec.working_dir);
  if (!working_dir.startsWith('/')) throw new SandboxSpecError('working_dir must be absolute');
  const targets = new Set<string>();
  const mounts = spec.mounts.map((mount) => {
    if (targets.has(mount.target))
      throw new SandboxSpecError(`Mount target ${mount.target} repeats`);
    targets.add(mount.target);
    return mount_of(sandbox.workspace_volume, mount.subpath, mount.target, mount.read_only);
  });
  return {
    Image: sandbox.image,
    Cmd: spec.argv,
    Env: Object.entries(spec.env).map(([name, value]) => `${name}=${value}`),
    User: `${sandbox.uid}:${sandbox.uid}`,
    WorkingDir: working_dir,
    Labels: { [SANDBOX_LABEL]: '1', ...labels },
    OpenStdin: false,
    AttachStdin: false,
    AttachStdout: false,
    AttachStderr: false,
    ...(spec.network === 'none' && { NetworkDisabled: true }),
    HostConfig: {
      NetworkMode: spec.network === 'proxy' ? sandbox.network : 'none',
      ReadonlyRootfs: true,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      Init: true,
      Mounts: mounts,
      Tmpfs: {
        '/tmp': `rw,nosuid,size=${scratch_mb}m`,
        [HOME_DIR]: `rw,nosuid,size=${scratch_mb}m,uid=${sandbox.uid},gid=${sandbox.uid}`,
      },
      NanoCpus: Math.round(cpus * 1e9),
      Memory: memory_mb * MB,
      MemorySwap: memory_mb * MB,
      PidsLimit: spec.limits.pids,
      Ulimits: [{ Name: 'nofile', Soft: 4_096, Hard: 4_096 }],
      // Only the last megabyte of output is kept on disk; the launcher reads and caps it.
      LogConfig: { Type: 'json-file', Config: { 'max-size': '1m', 'max-file': '1' } },
    },
  };
}

/**
 * Keeps the start and the end of an output that is longer than `max_bytes`, with a marker where
 * the middle was dropped.
 */
export function cap_output(output: Buffer, max_bytes: number): string {
  if (output.length <= max_bytes) return output.toString('utf8');
  const half = Math.floor(max_bytes / 2);
  const dropped = output.length - 2 * half;
  return `${output.subarray(0, half).toString('utf8')}\n... ${dropped} bytes dropped ...\n${output.subarray(output.length - half).toString('utf8')}`;
}
