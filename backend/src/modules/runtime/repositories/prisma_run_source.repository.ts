import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { RunSourceRecord, RunSourceWrite } from '@/modules/runtime/types/run_source_record';
import type { RunSourceRepository } from './interface/run_source_repository.interface';

const LIST_LIMIT = 500;

/** `RunSourceRepository` on Prisma. */
@Injectable()
export class PrismaRunSourceRepository implements RunSourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  record(owner_id: string, write: RunSourceWrite): Promise<RunSourceRecord> {
    return this.prisma.runSource.create({ data: { owner_id, ...write } });
  }

  list(owner_id: string, run_id: string): Promise<RunSourceRecord[]> {
    return this.prisma.runSource.findMany({
      where: { owner_id, run_id },
      orderBy: { read_at: 'asc' },
      take: LIST_LIMIT,
    });
  }
}
