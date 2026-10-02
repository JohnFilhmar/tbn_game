import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import { PrismaService } from '@/lib/database/prisma.service';

/** How many times `begin` tries again when the row it collided with was removed meanwhile. */
const BEGIN_ATTEMPTS = 3;

const JsonSchema = z.json();

/** The answer a command got: its status and its JSON body, undefined when it sent none. */
export interface StoredAnswer {
  status: number;
  body: unknown;
}

/** Where a command stands when a request carrying its key arrives. */
export type CommandStart =
  | { state: 'started' }
  | { state: 'running' }
  | { state: 'different_request' }
  | { state: 'answered'; answer: StoredAnswer };

function to_json_column(body: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  const text = JSON.stringify(body);
  if (text === undefined) return Prisma.DbNull;
  const parsed = JsonSchema.safeParse(JSON.parse(text));
  if (!parsed.success || parsed.data === null) return Prisma.DbNull;
  return parsed.data;
}

/**
 * The commands the owner sent with an `Idempotency-Key` and the answers they got, scoped by owner.
 * A key is claimed before its command runs, so a repeat finds it running, answered or claimed by a
 * different request.
 */
@Injectable()
export class CommandStore {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Claims `key` for a request with `request_hash`, or reports what the key already holds.
   */
  async begin(owner_id: string, key: string, request_hash: string): Promise<CommandStart> {
    for (let attempt = 0; attempt < BEGIN_ATTEMPTS; attempt += 1) {
      const claimed = await this.prisma.command.createMany({
        data: [{ owner_id, key, request_hash }],
        skipDuplicates: true,
      });
      if (claimed.count === 1) return { state: 'started' };
      const existing = await this.prisma.command.findUnique({
        where: { owner_id_key: { owner_id, key } },
      });
      if (existing === null) continue;
      if (existing.request_hash !== request_hash) return { state: 'different_request' };
      if (existing.status === 'running' || existing.response_status === null) {
        return { state: 'running' };
      }
      return {
        state: 'answered',
        answer: { status: existing.response_status, body: existing.response_body ?? undefined },
      };
    }
    return { state: 'running' };
  }

  /** Stores the answer of a running command. */
  async finish(owner_id: string, key: string, answer: StoredAnswer): Promise<void> {
    await this.prisma.command.updateMany({
      where: { owner_id, key, status: 'running' },
      data: {
        status: 'done',
        response_status: answer.status,
        response_body: to_json_column(answer.body),
        finished_at: new Date(),
      },
    });
  }

  /** Releases the key of a running command that failed, so a retry runs it again. */
  async forget(owner_id: string, key: string): Promise<void> {
    await this.prisma.command.deleteMany({ where: { owner_id, key, status: 'running' } });
  }

  /**
   * Removes every owner's commands created before `before`. Their keys can then run again.
   *
   * @returns How many were removed.
   */
  async prune(before: Date): Promise<number> {
    const removed = await this.prisma.command.deleteMany({ where: { created_at: { lt: before } } });
    return removed.count;
  }
}
