import { Injectable } from '@nestjs/common';
import type { TranscriptEntryWrite, TranscriptQuery } from '@tbn/contracts';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_unique_violation } from '@/lib/database/prisma_errors';
import type { TranscriptEntryRecord } from '@/modules/runtime/types/run_record';
import {
  INBOUND_KINDS,
  type TranscriptRepository,
} from './interface/transcript_repository.interface';

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
    dedupe_key?: string,
  ): Promise<TranscriptEntryRecord> {
    for (let attempt = 1; ; attempt += 1) {
      if (dedupe_key !== undefined) {
        const existing = await this.prisma.transcriptEntry.findFirst({
          where: { owner_id, agent_id, dedupe_key },
        });
        if (existing !== null) return existing;
      }
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
            dedupe_key: dedupe_key ?? null,
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

  list_by_ids(owner_id: string, ids: string[]): Promise<TranscriptEntryRecord[]> {
    return this.prisma.transcriptEntry.findMany({
      where: { owner_id, id: { in: ids } },
      orderBy: { created_at: 'asc' },
    });
  }

  async has_unread(owner_id: string, agent_id: string): Promise<boolean> {
    const last_answer = await this.prisma.transcriptEntry.findFirst({
      where: { owner_id, agent_id, kind: 'assistant' },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    const pending = await this.prisma.transcriptEntry.findFirst({
      where: {
        owner_id,
        agent_id,
        kind: { in: [...INBOUND_KINDS] },
        seq: { gt: last_answer?.seq ?? 0 },
      },
      select: { id: true },
    });
    return pending !== null;
  }
}
