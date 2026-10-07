import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_foreign_key_violation, is_record_not_found } from '@/lib/database/prisma_errors';
import type {
  ProviderCreate,
  ProviderModelRecord,
  ProviderRecord,
  ProviderState,
  ProviderWrite,
} from '@/modules/runtime/types/provider_record';
import {
  ProviderInUseError,
  type ProviderRepository,
} from './interface/provider_repository.interface';

const with_models = { models: { orderBy: { created_at: 'asc' as const } } };

const state_fields = {
  breaker_failures: true,
  breaker_open_until: true,
  out_of_credit_since: true,
} as const;

function to_model_rows(owner_id: string, models: ProviderModelRecord[]) {
  return models.map((model) => ({ owner_id, ...model }));
}

/** `ProviderRepository` on Prisma. */
@Injectable()
export class PrismaProviderRepository implements ProviderRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(owner_id: string): Promise<ProviderRecord[]> {
    return this.prisma.provider.findMany({
      where: { owner_id },
      include: with_models,
      orderBy: { created_at: 'asc' },
    });
  }

  find(owner_id: string, id: string): Promise<ProviderRecord | null> {
    return this.prisma.provider.findFirst({ where: { id, owner_id }, include: with_models });
  }

  find_by_name(owner_id: string, name: string): Promise<ProviderRecord | null> {
    return this.prisma.provider.findFirst({ where: { owner_id, name }, include: with_models });
  }

  find_local(owner_id: string): Promise<ProviderRecord | null> {
    return this.prisma.provider.findFirst({
      where: { owner_id, is_local: true },
      include: with_models,
      orderBy: { updated_at: 'desc' },
    });
  }

  create(owner_id: string, data: ProviderCreate): Promise<ProviderRecord> {
    const { models, cap_windows, ...fields } = data;
    return this.prisma.$transaction(async (tx) => {
      if (fields.is_local) {
        await tx.provider.updateMany({
          where: { owner_id, is_local: true },
          data: { is_local: false },
        });
      }
      return tx.provider.create({
        data: {
          owner_id,
          ...fields,
          models: { create: to_model_rows(owner_id, models) },
          cap_windows: { create: cap_windows.map((window) => ({ owner_id, ...window })) },
        },
        include: with_models,
      });
    });
  }

  async update(
    owner_id: string,
    id: string,
    data: Partial<ProviderWrite>,
  ): Promise<ProviderRecord | null> {
    const { models, ...fields } = data;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.provider.findFirst({ where: { id, owner_id } });
      if (existing === null) return null;
      if (models !== undefined) {
        await tx.providerModel.deleteMany({ where: { provider_id: id } });
        await tx.providerModel.createMany({
          data: to_model_rows(owner_id, models).map((row) => ({ provider_id: id, ...row })),
        });
      }
      if (fields.is_local === true) {
        await tx.provider.updateMany({
          where: { owner_id, is_local: true, id: { not: id } },
          data: { is_local: false },
        });
      }
      return tx.provider.update({ where: { id }, data: fields, include: with_models });
    });
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    try {
      await this.prisma.provider.delete({ where: { id, owner_id } });
      return true;
    } catch (error: unknown) {
      if (is_record_not_found(error)) return false;
      if (is_foreign_key_violation(error)) throw new ProviderInUseError();
      throw error;
    }
  }

  async record_failure(
    owner_id: string,
    id: string,
    threshold: number,
    open_until: Date,
  ): Promise<ProviderState | null> {
    const counted = await this.prisma.provider.updateMany({
      where: { id, owner_id },
      data: { breaker_failures: { increment: 1 } },
    });
    if (counted.count === 0) return null;
    await this.prisma.provider.updateMany({
      where: { id, owner_id, breaker_failures: { gte: threshold } },
      data: { breaker_open_until: open_until },
    });
    return this.prisma.provider.findFirst({ where: { id, owner_id }, select: state_fields });
  }

  async hold_until(owner_id: string, id: string, until: Date): Promise<void> {
    await this.prisma.provider.updateMany({
      where: {
        id,
        owner_id,
        OR: [{ breaker_open_until: null }, { breaker_open_until: { lt: until } }],
      },
      data: { breaker_open_until: until },
    });
  }

  async record_success(owner_id: string, id: string): Promise<void> {
    await this.prisma.provider.updateMany({
      where: {
        id,
        owner_id,
        OR: [{ breaker_failures: { gt: 0 } }, { breaker_open_until: { not: null } }],
      },
      data: { breaker_failures: 0, breaker_open_until: null },
    });
  }

  async mark_out_of_credit(owner_id: string, id: string, at: Date): Promise<void> {
    await this.prisma.provider.updateMany({
      where: { id, owner_id, out_of_credit_since: null },
      data: { out_of_credit_since: at },
    });
  }

  async clear_state(owner_id: string, id: string): Promise<boolean> {
    const result = await this.prisma.provider.updateMany({
      where: { id, owner_id },
      data: { breaker_failures: 0, breaker_open_until: null, out_of_credit_since: null },
    });
    return result.count === 1;
  }
}
