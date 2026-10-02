import { Injectable } from '@nestjs/common';
import { SandboxJobSpecSchema, type SandboxJobSpec, type SandboxJobStatus } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';

/** A job the launcher claimed: its id, owner and parsed spec. */
export interface ClaimedJob {
  id: string;
  owner_id: string;
  spec: SandboxJobSpec;
}

/** How a job ended. */
export interface JobOutcome {
  status: Extract<SandboxJobStatus, 'done' | 'failed' | 'timed_out'>;
  exit_code: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

/**
 * The launcher's side of the `sandbox_jobs` table: it claims queued jobs and reports how they
 * ended. The worker creates and reads the rows through the runtime module's repository; this
 * table is the contract between the two processes.
 */
@Injectable()
export class SandboxJobStore {
  constructor(private readonly prisma: PrismaService) {}

  /** Moves a queued job to running and returns its spec, or null when it is not queued. */
  async claim(id: string): Promise<ClaimedJob | null> {
    const claimed = await this.prisma.sandboxJob.updateMany({
      where: { id, status: 'queued' },
      data: { status: 'running', started_at: new Date() },
    });
    if (claimed.count === 0) return null;
    const row = await this.prisma.sandboxJob.findUnique({ where: { id } });
    if (row === null) return null;
    const spec = SandboxJobSpecSchema.safeParse(row.spec);
    if (!spec.success) {
      await this.finish(id, {
        status: 'failed',
        exit_code: null,
        stdout: '',
        stderr: '',
        error: `Invalid spec: ${spec.error.message}`,
      });
      return null;
    }
    return { id: row.id, owner_id: row.owner_id, spec: spec.data };
  }

  /** Records how a running job ended. */
  async finish(id: string, outcome: JobOutcome): Promise<void> {
    await this.prisma.sandboxJob.updateMany({
      where: { id, status: 'running' },
      data: { ...outcome, finished_at: new Date() },
    });
  }

  /**
   * Marks every running job lost. Called at boot: a launcher that restarted left no container of
   * its own behind, so no running job can still end.
   *
   * Ceiling: one launcher process. A second one would mark the first one's jobs lost at boot.
   */
  async mark_running_lost(): Promise<number> {
    const result = await this.prisma.sandboxJob.updateMany({
      where: { status: 'running' },
      data: {
        status: 'lost',
        error: 'The sandbox launcher restarted while the job ran',
        finished_at: new Date(),
      },
    });
    return result.count;
  }
}
