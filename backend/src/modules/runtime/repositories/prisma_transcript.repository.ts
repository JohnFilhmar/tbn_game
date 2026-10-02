import { Injectable } from '@nestjs/common';
import type { TranscriptEntryWrite, TranscriptQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_unique_violation } from '@/lib/database/prisma_errors';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import type { TranscriptRepository } from './interface/transcript_repository.interface';

const DEFAULT_LIMIT = 200;

/** Two writers may race for the same `seq`; the loser retries with the next one. */
const APPEND_ATTEMPTS = 5;

/** `TranscriptRepository` on Prisma. */
@Injectable()
export class PrismaTranscriptRepository implements TranscriptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    owner_id: string,
    agent_id: string,
    run_id: string | null,
    entry: TranscriptEntryWrite,
  ): Promise<TranscriptEntryRecord> {
    for (let attempt = 1; ; attempt += 1) {
      const last = await this.prisma.transcriptEntry.aggregate({
        where: { agent_id },
        _max: { seq: true },
      });
      try {
        return await this.prisma.transcriptEntry.create({
          data: {
            owner_id,
            agent_id,
            run_id,
            seq: (last._max.seq ?? 0) + 1,
            kind: entry.kind,
            content: entry.content,
          },
        });
      } catch (error: unknown) {
        if (!is_unique_violation(error) || attempt >= APPEND_ATTEMPTS) throw error;
      }
    }
  }

  list(
    owner_id: string,
    agent_id: string,
    query: TranscriptQuery,
  ): Promise<TranscriptEntryRecord[]> {
    return this.prisma.transcriptEntry.findMany({
      where: { owner_id, agent_id, seq: { gt: query.after_seq ?? 0 } },
      orderBy: { seq: 'asc' },
      take: query.limit ?? DEFAULT_LIMIT,
    });
  }

  list_all(owner_id: string, agent_id: string): Promise<TranscriptEntryRecord[]> {
    return this.prisma.transcriptEntry.findMany({
      where: { owner_id, agent_id },
      orderBy: { seq: 'asc' },
    });
  }

  async has_unanswered_owner_message(owner_id: string, agent_id: string): Promise<boolean> {
    const last_answer = await this.prisma.transcriptEntry.findFirst({
      where: { owner_id, agent_id, kind: 'assistant' },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const pending = await this.prisma.transcriptEntry.findFirst({
      where: { owner_id, agent_id, kind: 'owner_message', seq: { gt: last_answer?.seq ?? 0 } },
      select: { id: true },
    });
    return pending !== null;
  }
}
