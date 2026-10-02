import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '@/lib/database/prisma.service';
import type { UsageRecordWrite, UsageTotals } from '@/modules/runtime/types/usage_record';
import type {
  ModelUsageTotals,
  ProviderUsageTotals,
  UsageRepository,
  UsageScope,
} from './interface/usage_repository.interface';

const OldestRowsSchema = z.array(z.object({ created_at: z.date() }));

const sum_fields = {
  input_tokens: true,
  output_tokens: true,
  cache_read_tokens: true,
  cache_write_tokens: true,
  cost: true,
} as const;

function scope_where(scope: UsageScope) {
  return {
    owner_id: scope.owner_id,
    provider_id: scope.provider_id,
    ...(scope.model_id !== null && { model_id: scope.model_id }),
    created_at: { gt: scope.after },
  };
}

/** `UsageRepository` on Prisma. */
@Injectable()
export class PrismaUsageRepository implements UsageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(record: UsageRecordWrite): Promise<void> {
    await this.prisma.usageRecord.create({ data: record });
  }

  async totals_by_provider(): Promise<ProviderUsageTotals[]> {
    const groups = await this.prisma.usageRecord.groupBy({
      by: ['provider_id'],
      _count: { _all: true },
      _sum: sum_fields,
      orderBy: { provider_id: 'asc' },
    });
    const providers = await this.prisma.provider.findMany({
      where: { id: { in: groups.map((group) => group.provider_id) } },
      select: { id: true, name: true },
    });
    const names = new Map(providers.map((provider) => [provider.id, provider.name]));
    return groups.map((group) => ({
      provider_id: group.provider_id,
      provider_name: names.get(group.provider_id) ?? group.provider_id,
      requests: group._count._all,
      input_tokens: group._sum.input_tokens ?? 0,
      output_tokens: group._sum.output_tokens ?? 0,
      cache_read_tokens: group._sum.cache_read_tokens ?? 0,
      cache_write_tokens: group._sum.cache_write_tokens ?? 0,
      cost: group._sum.cost ?? 0,
    }));
  }

  async summarize_by_model(owner_id: string, provider_id: string): Promise<ModelUsageTotals[]> {
    const groups = await this.prisma.usageRecord.groupBy({
      by: ['model_id'],
      where: { owner_id, provider_id },
      _count: { _all: true },
      _sum: sum_fields,
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

  summarize_for_run(owner_id: string, run_id: string): Promise<UsageTotals> {
    return this.summarize_for_runs(owner_id, [run_id]);
  }

  async summarize_for_runs(owner_id: string, run_ids: string[]): Promise<UsageTotals> {
    const totals = await this.prisma.usageRecord.aggregate({
      where: { owner_id, run_id: { in: run_ids } },
      _count: { _all: true },
      _sum: sum_fields,
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

  async amount(scope: UsageScope): Promise<number> {
    const totals = await this.prisma.usageRecord.aggregate({
      where: scope_where(scope),
      _count: { _all: true },
      _sum: { input_tokens: true, output_tokens: true, cost: true },
    });
    switch (scope.unit) {
      case 'requests':
        return totals._count._all;
      case 'tokens':
        return (totals._sum.input_tokens ?? 0) + (totals._sum.output_tokens ?? 0);
      case 'money':
        return totals._sum.cost ?? 0;
    }
  }

  async oldest_beyond(scope: UsageScope, excess: number): Promise<Date | null> {
    const rows: unknown = await this.prisma.$queryRaw`
      SELECT created_at FROM (
        SELECT created_at, SUM(
          CASE ${scope.unit}::text
            WHEN 'requests' THEN 1::float8
            WHEN 'tokens' THEN (input_tokens + output_tokens)::float8
            ELSE cost
          END
        ) OVER (ORDER BY created_at, id ROWS UNBOUNDED PRECEDING) AS aged
        FROM usage_records
        WHERE owner_id = ${scope.owner_id}
          AND provider_id = ${scope.provider_id}
          AND (${scope.model_id}::text IS NULL OR model_id = ${scope.model_id})
          AND created_at > ${scope.after}
      ) AS ordered
      WHERE aged > ${excess}
      ORDER BY created_at
      LIMIT 1`;
    return OldestRowsSchema.parse(rows)[0]?.created_at ?? null;
  }
}
