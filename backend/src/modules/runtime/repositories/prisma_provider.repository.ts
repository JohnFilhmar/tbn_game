import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/lib/database/prisma.service';
import { is_foreign_key_violation, is_record_not_found } from '@/lib/database/prisma_errors';
import type {
  ProviderModelRecord,
  ProviderRecord,
  ProviderWrite,
} from '@/modules/runtime/types/provider_record';
import {
  ProviderInUseError,
  type ProviderRepository,
} from './interface/provider_repository.interface';

const with_models = { models: { orderBy: { created_at: 'asc' as const } } };

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

  create(owner_id: string, data: ProviderWrite): Promise<ProviderRecord> {
    const { models, ...fields } = data;
    return this.prisma.provider.create({
      data: { owner_id, ...fields, models: { create: to_model_rows(owner_id, models) } },
      include: with_models,
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
}
