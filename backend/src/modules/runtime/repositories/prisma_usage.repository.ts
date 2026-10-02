import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import type { UsageRecordWrite, UsageTotals } from '@/modules/runtime/types/usage_record';
import type { ModelUsageTotals, UsageRepository } from './interface/usage_repository.interface';

/** `UsageRepository` on Prisma. */
@Injectable()
export class PrismaUsageRepository implements UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: UsageRecordWrite): Promise<void> {
    await this.prisma.usageRecord.create({ data: record });
  }

  async summarize_by_model(owner_id: string, provider_id: string): Promise<ModelUsageTotals[]> {
    const groups = await this.prisma.usageRecord.groupBy({
      by: ['model_id'],
      where: { owner_id, provider_id },
      _count: { _all: true },
      _sum: {
        input_tokens: true,
        output_tokens: true,
        cache_read_tokens: true,
        cache_write_tokens: true,
        cost: true,
      },
      orderBy: { model_id: 'asc' },
    });
    return groups.map((group) => ({
      model_id: group.model_id,
      requests: group._count._all,
      input_tokens: group._sum.input_tokens ?? 0,
      output_tokens: group._sum.output_tokens ?? 0,
      cache_read_tokens: group._sum.cache_read_tokens ?? 0,
      cache_write_tokens: group._sum.cache_write_tokens ?? 0,
      cost: group._sum.cost ?? 0,
    }));
  }

  async summarize_for_run(owner_id: string, run_id: string): Promise<UsageTotals> {
    const totals = await this.prisma.usageRecord.aggregate({
      where: { owner_id, run_id },
      _count: { _all: true },
      _sum: {
        input_tokens: true,
        output_tokens: true,
        cache_read_tokens: true,
        cache_write_tokens: true,
        cost: true,
      },
    });
    return {
      requests: totals._count._all,
      input_tokens: totals._sum.input_tokens ?? 0,
      output_tokens: totals._sum.output_tokens ?? 0,
      cache_read_tokens: totals._sum.cache_read_tokens ?? 0,
      cache_write_tokens: totals._sum.cache_write_tokens ?? 0,
      cost: totals._sum.cost ?? 0,
    };
  }
}
