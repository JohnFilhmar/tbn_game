import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { PreferenceRecord } from '@/modules/knowledge/types/knowledge_records';
import type { PreferenceRepository } from './interface/preference_repository.interface';

/** `PreferenceRepository` on Prisma. */
@Injectable()
export class PrismaPreferenceRepository implements PreferenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<PreferenceRecord[]> {
    return this.prisma.preference.findMany({
      where: { owner_id },
      select: { key: true, value: true },
    });
  }

  async set(owner_id: string, key: string, value: string | number | boolean): Promise<void> {
    await this.prisma.preference.upsert({
      where: { owner_id_key: { owner_id, key } },
      create: { owner_id, key, value },
      update: { value },
    });
  }
}
