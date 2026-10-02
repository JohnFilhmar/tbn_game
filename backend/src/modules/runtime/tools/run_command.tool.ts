import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  SandboxJobService,
  SandboxPathError,
} from '@/modules/runtime/services/sandbox/sandbox_job.service';
import type { SandboxJobRecord } from '@/modules/runtime/types/sandbox_job_record';
import type { Tool, ToolContext, ToolOutcome } from './tool.interface';

/** How much of a job's output reaches the model. The job row keeps the rest. */
const OUTPUT_CHARS = 16_000;

const InputSchema = z.strictObject({
  command: z.string().min(1).max(20_000).describe('A bash command line, run with bash -lc'),
  cwd: z
    .string()
    .max(500)
    .optional()
    .describe('A directory inside your checkout directory to run in, relative to it'),
});

type Input = z.infer<typeof InputSchema>;

function excerpt(text: string): string {
  if (text.length <= OUTPUT_CHARS) return text;
  return `${text.slice(0, OUTPUT_CHARS)}\n... ${text.length - OUTPUT_CHARS} more characters in the job record`;
}

/** The text a finished job becomes for the model. */
export function render_job(record: SandboxJobRecord): string {
  const seconds =
    record.started_at !== null && record.finished_at !== null
      ? ((record.finished_at.getTime() - record.started_at.getTime()) / 1_000).toFixed(1)
      : null;
  const header =
    record.status === 'done' || record.status === 'failed'
      ? `Exit code ${record.exit_code ?? 'unknown'}${seconds === null ? '' : ` after ${seconds} s`} (job ${record.id})`
      : record.status === 'timed_out'
        ? `${record.error ?? 'Timed out'}. The command was killed. (job ${record.id})`
        : `The command could not run: ${record.error ?? record.status} (job ${record.id})`;
  const parts = [header];
  if (record.stdout.length > 0) parts.push(`--- stdout ---\n${excerpt(record.stdout)}`);
  if (record.stderr.length > 0) parts.push(`--- stderr ---\n${excerpt(record.stderr)}`);
  return parts.join('\n');
}

/**
 * Runs a shell command in the agent's sandbox: a fresh container on its checkout directory, with
 * the owner's shared files read-only at `/files` and the proxy as the only way to the internet.
 */
@Injectable()
export class RunCommandTool implements Tool<Input> {
  readonly name = 'run_command';
  readonly description =
    'Run a bash command in your sandbox. It runs in a fresh container on /work, your checkout directory, where files you create or install persist between commands; /files holds the company workspace read-only. The internet is reachable through a proxy. Builds, tests, scripts and git commands in your checkout run here.';
  readonly default_policy = 'auto';
  readonly input_schema = InputSchema;

  constructor(private readonly jobs: SandboxJobService) {}

  async execute(input: Input, context: ToolContext): Promise<ToolOutcome> {
    let record: SandboxJobRecord;
    try {
      record = await this.jobs.run_for_agent(
        { run_id: context.run_id, agent: context.agent },
        input.command,
        input.cwd ?? '.',
      );
    } catch (error: unknown) {
      if (error instanceof SandboxPathError) return { content: error.message, is_error: true };
      throw error;
    }
    return { content: render_job(record), is_error: record.status !== 'done' };
  }
}
