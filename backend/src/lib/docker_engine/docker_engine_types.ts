/** A volume or bind mount as the Engine API's `HostConfig.Mounts` takes it. */
export interface MountRequest {
  Type: 'volume' | 'bind' | 'tmpfs';
  Source?: string;
  Target: string;
  ReadOnly?: boolean;
  VolumeOptions?: { Subpath?: string };
  BindOptions?: { CreateMountpoint?: boolean };
}

/** The part of `POST /containers/create` the launcher uses. */
export interface ContainerCreateRequest {
  Image: string;
  Cmd: string[];
  Env: string[];
  User: string;
  WorkingDir: string;
  Labels: Record<string, string>;
  OpenStdin: false;
  AttachStdin: false;
  AttachStdout: false;
  AttachStderr: false;
  NetworkDisabled?: boolean;
  HostConfig: {
    NetworkMode: string;
    ReadonlyRootfs: boolean;
    CapDrop: string[];
    SecurityOpt: string[];
    Privileged: false;
    Init: boolean;
    Mounts: MountRequest[];
    Tmpfs: Record<string, string>;
    NanoCpus: number;
    Memory: number;
    MemorySwap: number;
    PidsLimit: number;
    Ulimits: Array<{ Name: string; Soft: number; Hard: number }>;
    LogConfig: { Type: string; Config: Record<string, string> };
  };
}

/** A container as `GET /containers/json` lists it, reduced to what the launcher reads. */
export interface ContainerSummary {
  id: string;
  name: string;
  state: string;
  labels: Record<string, string>;
}

/** A container's output, split by stream. */
export interface DemuxedLogs {
  stdout: Buffer;
  stderr: Buffer;
}
