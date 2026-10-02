import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { SandboxMount } from '@tbn/contracts';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG } from '@/config/config.tokens';
import type { AgentRecord } from '@/modules/company/types/company_records';
import type { RepositoryRecord } from '@/modules/company/types/git_records';
import {
  SandboxJobService,
  checkouts_subpath,
  repo_subpath,
  type JobOrigin,
} from '@/modules/runtime/services/sandbox/sandbox_job.service';
import type { SandboxJobRecord } from '@/modules/runtime/types/sandbox_job_record';
import { slugify } from './branch_rules';

/** The fixed script every git job runs, baked into the sandbox image. */
const GIT_JOB = '/opt/tbn/git_job.sh';

/** How a git job ended. The script's exit codes: 0 done, 2 refused, 3 conflict. */
export type GitJobResult =
  | { outcome: 'done'; stdout: string; job: SandboxJobRecord }
  | { outcome: 'refused' | 'conflict' | 'failed'; message: string; job: SandboxJobRecord };

/** The agent a job works for, when it works for one. */
export interface GitJobAgent {
  origin: JobOrigin;
  agent: AgentRecord;
}

function message_of(job: SandboxJobRecord): string {
  const stderr = job.stderr.trim();
  if (stderr.length > 0)
    return stderr
      .split('\n')
      .slice(-3)
      .join(' ')
      .replace(/^refused: |^conflict: /, '');
  return job.error ?? `exit code ${job.exit_code ?? 'unknown'}`;
}

function to_result(job: SandboxJobRecord): GitJobResult {
  if (job.status === 'done') return { outcome: 'done', stdout: job.stdout.trim(), job };
  if (job.status === 'failed' && job.exit_code === 2) {
    return { outcome: 'refused', message: message_of(job), job };
  }
  if (job.status === 'failed' && job.exit_code === 3) {
    return { outcome: 'conflict', message: message_of(job), job };
  }
  return { outcome: 'failed', message: message_of(job), job };
}

/**
 * Every operation on a canonical repository, as a system job: the sandbox image runs the fixed
 * git script with the bare repository at `/repo` and, when the operation touches an agent's
 * checkout, that checkout at `/work`. No agent container ever mounts a canonical repository.
 */
@Injectable()
export class GitJobService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jobs: SandboxJobService,
  ) {}

  /** The checkout of a repository in an agent's checkout directory, relative to the volume. */
  checkout_subpath(owner_id: string, agent_id: string, repository: RepositoryRecord): string {
    return `${checkouts_subpath(owner_id, agent_id)}/${repository.name}`;
  }

  /** Creates the directory of a new canonical repository, empty. */
  async prepare_repository_dir(owner_id: string, repository: RepositoryRecord): Promise<void> {
    await mkdir(join(this.config.workspace.dir, repo_subpath(owner_id, repository.name)), {
      recursive: true,
    });
  }

  /** Removes a canonical repository from the volume. */
  async remove_repository_dir(owner_id: string, repository: RepositoryRecord): Promise<void> {
    await rm(join(this.config.workspace.dir, repo_subpath(owner_id, repository.name)), {
      recursive: true,
      force: true,
    });
  }

  /** `init <default>`: an empty canonical repository with the default branch and development. */
  init(owner_id: string, repository: RepositoryRecord): Promise<GitJobResult> {
    return this.run(owner_id, ['init', repository.default_branch], {
      mounts: [this.repo_mount(owner_id, repository, false)],
      network: 'none',
    });
  }

  /** `clone_remote <url> <default>`: a mirror of the owner's public remote, through the proxy. */
  clone_remote(owner_id: string, repository: RepositoryRecord): Promise<GitJobResult> {
    return this.run(
      owner_id,
      ['clone_remote', repository.remote_url ?? '', repository.default_branch],
      {
        mounts: [this.repo_mount(owner_id, repository, false)],
        network: 'proxy',
      },
    );
  }

  /** `fetch_remote <default>`: refreshes the default branch from the remote. */
  fetch_remote(owner_id: string, repository: RepositoryRecord): Promise<GitJobResult> {
    return this.run(owner_id, ['fetch_remote', repository.default_branch], {
      mounts: [this.repo_mount(owner_id, repository, false)],
      network: 'proxy',
    });
  }

  /** `checkout <branch> <base>`: the agent's clone on the branch, created from base if new. */
  async checkout(
    owner_id: string,
    repository: RepositoryRecord,
    worker: GitJobAgent,
    branch: string,
    base: string,
  ): Promise<GitJobResult> {
    const subpath = this.checkout_subpath(owner_id, worker.agent.id, repository);
    await mkdir(join(this.config.workspace.dir, subpath), { recursive: true });
    return this.run(owner_id, ['checkout', branch, base], {
      mounts: [
        this.repo_mount(owner_id, repository, true),
        { subpath, target: '/work', read_only: false },
      ],
      network: 'none',
      worker,
    });
  }

  /** `publish <branch> <allowed>...`: fast-forwards a canonical branch to the checkout's. */
  publish(
    owner_id: string,
    repository: RepositoryRecord,
    worker: GitJobAgent,
    branch: string,
    allowed: string[],
  ): Promise<GitJobResult> {
    return this.run(owner_id, ['publish', branch, ...allowed], {
      mounts: [
        this.repo_mount(owner_id, repository, false),
        {
          subpath: this.checkout_subpath(owner_id, worker.agent.id, repository),
          target: '/work',
          read_only: true,
        },
      ],
      network: 'none',
      worker,
    });
  }

  /** `rev <branch>`: the commit a canonical branch is at. */
  rev(
    owner_id: string,
    repository: RepositoryRecord,
    branch: string,
    worker?: GitJobAgent,
  ): Promise<GitJobResult> {
    return this.read(owner_id, repository, ['rev', branch], worker);
  }

  /** `log <base> <head>`: the commits head has that base lacks. */
  log(
    owner_id: string,
    repository: RepositoryRecord,
    base: string,
    head: string,
    worker?: GitJobAgent,
  ): Promise<GitJobResult> {
    return this.read(owner_id, repository, ['log', base, head], worker);
  }

  /** `diff <base> <head>`: the change head makes on base, capped by the script. */
  diff(
    owner_id: string,
    repository: RepositoryRecord,
    base: string,
    head: string,
    worker?: GitJobAgent,
  ): Promise<GitJobResult> {
    return this.read(owner_id, repository, ['diff', base, head], worker);
  }

  /** `merge_feature <feature> <manager_branch> <reviewed_sha>`: a reviewed feature into the manager branch. */
  merge_feature(
    owner_id: string,
    repository: RepositoryRecord,
    worker: GitJobAgent,
    feature: string,
    manager_branch: string,
    reviewed_sha: string,
  ): Promise<GitJobResult> {
    return this.run(owner_id, ['merge_feature', feature, manager_branch, reviewed_sha], {
      mounts: [this.repo_mount(owner_id, repository, false)],
      network: 'none',
      worker,
      message: `Merge ${feature} into ${manager_branch}`,
    });
  }

  /** `merge_to_development <manager_branch> <head_sha>`: the owner merges a merge request. */
  merge_to_development(
    owner_id: string,
    repository: RepositoryRecord,
    manager_branch: string,
    head_sha: string,
  ): Promise<GitJobResult> {
    return this.run(owner_id, ['merge_to_development', manager_branch, head_sha], {
      mounts: [this.repo_mount(owner_id, repository, false)],
      network: 'none',
      message: `Merge ${manager_branch} into development`,
    });
  }

  private read(
    owner_id: string,
    repository: RepositoryRecord,
    args: string[],
    worker: GitJobAgent | undefined,
  ): Promise<GitJobResult> {
    return this.run(owner_id, args, {
      mounts: [this.repo_mount(owner_id, repository, true)],
      network: 'none',
      worker,
    });
  }

  private repo_mount(
    owner_id: string,
    repository: RepositoryRecord,
    read_only: boolean,
  ): SandboxMount {
    return { subpath: repo_subpath(owner_id, repository.name), target: '/repo', read_only };
  }

  private async run(
    owner_id: string,
    args: string[],
    options: {
      mounts: SandboxMount[];
      network: 'proxy' | 'none';
      worker?: GitJobAgent;
      message?: string;
    },
  ): Promise<GitJobResult> {
    const name = options.worker?.agent.name ?? 'owner';
    const job = await this.jobs.run_system({
      owner_id,
      argv: [GIT_JOB, ...args],
      env: {
        TBN_GIT_NAME: name,
        TBN_GIT_EMAIL: `${slugify(name)}@tbn.local`,
        ...(options.message !== undefined && { TBN_MESSAGE: options.message }),
      },
      mounts: options.mounts,
      network: options.network,
      origin: options.worker?.origin,
    });
    return to_result(job);
  }
}
