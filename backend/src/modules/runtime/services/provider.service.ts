import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateProvider, Provider, UpdateProvider, UsageSummary } from '@tbn/contracts';
import { SecretBoxService } from '@/lib/crypto/secret_box.service';
import {
  PROVIDER_REPOSITORY,
  ProviderInUseError,
  type ProviderRepository,
} from '@/modules/runtime/repositories/interface/provider_repository.interface';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import type {
  ProviderConnection,
  ProviderModelRecord,
  ProviderRecord,
} from '@/modules/runtime/types/provider_record';
import type { UsageTotals } from '@/modules/runtime/types/usage_record';

const DEFAULT_MAX_OUTPUT_TOKENS = 8_192;

function to_model_record(model: CreateProvider['models'][number]): ProviderModelRecord {
  return {
    model_id: model.model_id,
    cost_tier: model.cost_tier,
    input_price_per_million: model.input_price_per_million ?? null,
    output_price_per_million: model.output_price_per_million ?? null,
    cache_read_price_per_million: model.cache_read_price_per_million ?? null,
    cache_write_price_per_million: model.cache_write_price_per_million ?? null,
    max_output_tokens: model.max_output_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
  };
}

/** Maps a provider row to the API shape. The key never appears. */
export function to_provider_view(record: ProviderRecord): Provider {
  return {
    id: record.id,
    name: record.name,
    api_format: record.api_format,
    base_url: record.base_url,
    api_key_set: true,
    models: record.models.map((model) => ({
      model_id: model.model_id,
      cost_tier: model.cost_tier,
      input_price_per_million: model.input_price_per_million,
      output_price_per_million: model.output_price_per_million,
      cache_read_price_per_million: model.cache_read_price_per_million,
      cache_write_price_per_million: model.cache_write_price_per_million,
      max_output_tokens: model.max_output_tokens,
    })),
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
  };
}

function sum_totals(rows: UsageTotals[]): UsageTotals {
  return rows.reduce<UsageTotals>(
    (total, row) => ({
      requests: total.requests + row.requests,
      input_tokens: total.input_tokens + row.input_tokens,
      output_tokens: total.output_tokens + row.output_tokens,
      cache_read_tokens: total.cache_read_tokens + row.cache_read_tokens,
      cache_write_tokens: total.cache_write_tokens + row.cache_write_tokens,
      cost: total.cost + row.cost,
    }),
    {
      requests: 0,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      cost: 0,
    },
  );
}

/** LLM connections: the owner's providers, their models and the sealed keys. */
@Injectable()
export class ProviderService {
  constructor(
    @Inject(PROVIDER_REPOSITORY) private readonly providers: ProviderRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    private readonly secret_box: SecretBoxService,
  ) {}

  async list(owner_id: string): Promise<Provider[]> {
    return (await this.providers.list(owner_id)).map(to_provider_view);
  }

  async get(owner_id: string, id: string): Promise<Provider> {
    return to_provider_view(await this.require(owner_id, id));
  }

  /** @throws ConflictException when the name is taken. */
  async create(owner_id: string, input: CreateProvider): Promise<Provider> {
    if ((await this.providers.find_by_name(owner_id, input.name)) !== null) {
      throw new ConflictException('Provider name is taken');
    }
    const record = await this.providers.create(owner_id, {
      name: input.name,
      api_format: input.api_format,
      base_url: input.base_url,
      api_key_ciphertext: this.secret_box.seal(input.api_key),
      models: input.models.map(to_model_record),
    });
    return to_provider_view(record);
  }

  async update(owner_id: string, id: string, input: UpdateProvider): Promise<Provider> {
    if (input.name !== undefined) {
      const same_name = await this.providers.find_by_name(owner_id, input.name);
      if (same_name !== null && same_name.id !== id) {
        throw new ConflictException('Provider name is taken');
      }
    }
    const record = await this.providers.update(owner_id, id, {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.api_format !== undefined && { api_format: input.api_format }),
      ...(input.base_url !== undefined && { base_url: input.base_url }),
      ...(input.api_key !== undefined && {
        api_key_ciphertext: this.secret_box.seal(input.api_key),
      }),
      ...(input.models !== undefined && { models: input.models.map(to_model_record) }),
    });
    if (record === null) throw new NotFoundException('Provider not found');
    return to_provider_view(record);
  }

  /** @throws ConflictException when an agent still uses the provider. */
  async delete(owner_id: string, id: string): Promise<void> {
    try {
      if (!(await this.providers.delete(owner_id, id))) {
        throw new NotFoundException('Provider not found');
      }
    } catch (error: unknown) {
      if (error instanceof ProviderInUseError) {
        throw new ConflictException('Provider is used by an agent');
      }
      throw error;
    }
  }

  /** Usage the runtime counted for this provider key. */
  async usage_summary(owner_id: string, id: string): Promise<UsageSummary> {
    await this.require(owner_id, id);
    const by_model = await this.usage.summarize_by_model(owner_id, id);
    return { ...sum_totals(by_model), provider_id: id, by_model };
  }

  /** True when the provider belongs to the owner and offers the model. */
  async has_model(owner_id: string, provider_id: string, model_id: string): Promise<boolean> {
    const record = await this.providers.find(owner_id, provider_id);
    return record !== null && record.models.some((model) => model.model_id === model_id);
  }

  /**
   * The connection details for one model call, with the key opened. Only the provider client
   * calls this, right before the request.
   *
   * @throws NotFoundException when the provider or the model is unknown.
   */
  async open_connection(
    owner_id: string,
    provider_id: string,
    model_id: string,
  ): Promise<ProviderConnection> {
    const record = await this.require(owner_id, provider_id);
    const model = record.models.find((candidate) => candidate.model_id === model_id);
    if (model === undefined) throw new NotFoundException('Model not found on provider');
    return {
      provider_id: record.id,
      api_format: record.api_format,
      base_url: record.base_url,
      api_key: this.secret_box.open(record.api_key_ciphertext),
      model,
    };
  }

  private async require(owner_id: string, id: string): Promise<ProviderRecord> {
    const record = await this.providers.find(owner_id, id);
    if (record === null) throw new NotFoundException('Provider not found');
    return record;
  }
}
