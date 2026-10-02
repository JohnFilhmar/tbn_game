import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { IdSchema } from '@tbn/contracts';
import { z } from 'zod';
import {
  run_scripted_session,
  type ScriptedSessionResult,
} from '@/lib/realtime_client/scripted_session';

const USAGE = `usage: realtime_client.js --agent <id> --task <id> [--url <base url>] [--cursor <seq>]
         [--drop_after_replies <n>] [--away_seconds <seconds>] [--message <text>]
         [--timeout_seconds <seconds>]
Reads the owner's session token from stdin.`;

const ArgsSchema = z.strictObject({
  url: z.url().default('http://127.0.0.1:3000'),
  agent: IdSchema,
  task: IdSchema,
  cursor: z.coerce.number().int().min(0).optional(),
  drop_after_replies: z.coerce.number().int().min(1).default(1),
  away_seconds: z.coerce.number().min(0).default(3),
  message: z.string().min(1).default('A note from the owner while you work: keep each part short.'),
  timeout_seconds: z.coerce.number().int().min(1).default(900),
});

function parse_flags(): Record<string, string | undefined> {
  try {
    return parseArgs({
      options: {
        url: { type: 'string' },
        agent: { type: 'string' },
        task: { type: 'string' },
        cursor: { type: 'string' },
        drop_after_replies: { type: 'string' },
        away_seconds: { type: 'string' },
        message: { type: 'string' },
        timeout_seconds: { type: 'string' },
      },
      strict: true,
    }).values;
  } catch (error: unknown) {
    throw new Error(`${error instanceof Error ? error.message : 'Bad arguments'}\n${USAGE}`, {
      cause: error,
    });
  }
}

function read_args(): z.infer<typeof ArgsSchema> {
  const args = ArgsSchema.safeParse(parse_flags());
  if (!args.success) {
    const issue = args.error.issues[0];
    throw new Error(
      `${issue?.path.join('.') ?? 'arguments'}: ${issue?.message ?? 'invalid'}\n${USAGE}`,
    );
  }
  return args.data;
}

function yes(value: boolean): string {
  return value ? 'yes' : 'NO';
}

function list(values: number[]): string {
  return values.length === 0 ? 'none' : values.slice(0, 20).join(', ');
}

function summary(result: ScriptedSessionResult): string[] {
  const { comparison, message } = result;
  return [
    `Events received: ${comparison.received} after ${result.start}, up to ${result.last_seq}; the log holds ${comparison.expected}`,
    `  every sequence once and in order: ${yes(comparison.matches && result.faults.length === 0)}`,
    `  missing: ${list(comparison.missing)}; repeated: ${list(comparison.repeated)}`,
    `Connections: ${result.connections}, resyncs: ${result.resyncs}`,
    `Message sent twice under one command id: ${message.statuses.join(' then ')}, second replayed: ${yes(message.replayed)}, same entry: ${yes(message.same_entry)}, stored ${message.stored} time(s)`,
    `Streamed replies: ${result.replies.checked} complete with text, ${result.replies.matching} equal their stored entries`,
    `Task: ${result.task_status}`,
    result.passed ? 'Exit criteria met' : 'Exit criteria NOT met',
  ];
}

/**
 * The scripted realtime client of the phase 2 demo, run inside the web image so the owner needs
 * nothing installed. It prints its progress and a summary, and exits 1 when a check fails.
 */
async function main(): Promise<void> {
  const args = read_args();
  const token = readFileSync(0, 'utf8').trim();
  if (token.length === 0) throw new Error(`No session token on stdin\n${USAGE}`);
  const result = await run_scripted_session({
    url: args.url,
    token,
    agent_id: args.agent,
    task_id: args.task,
    cursor: args.cursor ?? null,
    drop_after_replies: args.drop_after_replies,
    away_ms: args.away_seconds * 1_000,
    message: args.message,
    timeout_ms: args.timeout_seconds * 1_000,
    log: (line) => process.stdout.write(`${line}\n`),
  });
  for (const line of summary(result)) process.stdout.write(`${line}\n`);
  process.exitCode = result.passed ? 0 : 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unknown error'}\n`);
  process.exit(1);
});
