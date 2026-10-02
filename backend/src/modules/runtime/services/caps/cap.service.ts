import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { CapWindowState, CreateCapWindow, UpdateCapWindow } from '@tbn/contracts';
import {
  CAP_WINDOW_REPOSITORY,
  type CapWindowRepository,
} from '@/modules/runtime/repositories/interface/cap_window_repository.interface';
import {
  PROVIDER_REPOSITORY,
  type ProviderRepository,
} from '@/modules/runtime/repositories/interface/provider_repository.interface';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import type { CapWindowRecord, CapWindowWrite } from '@/modules/runtime/types/cap_window_record';
import type { ProviderRecord } from '@/modules/runtime/types/provider_record';
import { nominal_ms, shift, window_span } from './window_math';

/** The owner's default thresholds, read from preferences by the caller. */
export interface ThresholdDefaults {
  /** For the longest window of a key. */
  longest_percent: number;
  /** For every shorter window. */
  shorter_percent: number;
}

/** A cap window with its usage at one instant. */
export interface CapWindowStatusRecord extends CapWindowRecord {
  effective_threshold_percent: number;
  used: number;
  window_start: Date;
  /** The next reset of a fixed window, or for a rolling window at its limit, when it drops below. */
  resets_at: Date | null;
  state: CapWindowState;
}

/** Enforced windows at their limit stop calls on a key until `resume_at`. */
export interface CapBlock {
  window_names: string[];
  resume_at: Date;
}

/** A rolling window whose reset cannot be computed is checked again after this long. */
const RECHECK_MS = 60_000;

interface Measured {
  window: CapWindowRecord;
  used: number;
  window_start: Date;
  resets_at: Date | null;
}

/** True when the window counts calls to `model_id`. */
function counts_model(window: CapWindowRecord, model_id: string): boolean {
  return window.model_id === null || window.model_id === model_id;
}

/**
 * Usage caps on provider keys, counted from the runtime's own usage records and never from the
 * provider. Display-only windows are measured like the others; only the callers that enforce
 * caps skip them.
 */
@Injectable()
export class CapService {
  constructor(
    @Inject(CAP_WINDOW_REPOSITORY) private readonly windows: CapWindowRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    @Inject(PROVIDER_REPOSITORY) private readonly providers: ProviderRepository,
  ) {}

  /** Every window of a key with its usage, effective threshold and state at `now`. */
  async statuses(
    owner_id: string,
    provider_id: string,
    defaults: ThresholdDefaults,
    now = new Date(),
  ): Promise<CapWindowStatusRecord[]> {
    await this.require_provider(owner_id, provider_id);
    const windows = await this.windows.list(owner_id, provider_id);
    const longest = Math.max(0, ...windows.map((window) => nominal_ms(window)));
    const measured = await Promise.all(
      windows.map((window) => this.measure(owner_id, window, now)),
    );
    return measured.map((item) => {
      const threshold =
        item.window.threshold_percent ??
        (nominal_ms(item.window) === longest ? defaults.longest_percent : defaults.shorter_percent);
      let state: CapWindowState = 'ok';
      if (item.used >= item.window.limit) state = 'at_limit';
      else if (item.used >= (item.window.limit * threshold) / 100) state = 'past_threshold';
      return {
        ...item.window,
        effective_threshold_percent: threshold,
        used: item.used,
        window_start: item.window_start,
        resets_at: item.resets_at,
        state,
      };
    });
  }

  /**
   * The enforced windows of a key that count `model_id` and are past their threshold or at their
   * limit. A manager hands no new work to interns on such a key.
   */
  async past_threshold(
    owner_id: string,
    provider_id: string,
    model_id: string,
    defaults: ThresholdDefaults,
    now = new Date(),
  ): Promise<CapWindowStatusRecord[]> {
    const statuses = await this.statuses(owner_id, provider_id, defaults, now);
    return statuses.filter(
      (status) => status.enforced && status.state !== 'ok' && counts_model(status, model_id),
    );
  }

  /**
   * Whether enforced windows that count `model_id` are at their limit, and when the last of them
   * frees up again. Null when a call may go ahead.
   */
  async limit_block(
    owner_id: string,
    provider_id: string,
    model_id: string,
    now = new Date(),
  ): Promise<CapBlock | null> {
    const enforced = (await this.windows.list(owner_id, provider_id)).filter(
      (window) => window.enforced && counts_model(window, model_id),
    );
    const measured = await Promise.all(
      enforced.map((window) => this.measure(owner_id, window, now)),
    );
    const full = measured.filter((item) => item.used >= item.window.limit);
    if (full.length === 0) return null;
    const resume_at = Math.max(
      ...full.map((item) => (item.resets_at ?? new Date(now.getTime() + RECHECK_MS)).getTime()),
    );
    return { window_names: full.map((item) => item.window.name), resume_at: new Date(resume_at) };
  }

  /**
   * Adds a window to a key.
   *
   * @throws NotFoundException when the provider is missing.
   * @throws BadRequestException for a model the key does not offer or a fixed window without an
   * anchor.
   */
  async create(
    owner_id: string,
    provider_id: string,
    input: CreateCapWindow,
  ): Promise<CapWindowRecord> {
    const write: CapWindowWrite = {
      name: input.name,
      length_count: input.length_count,
      length_unit: input.length_unit,
      reset_mode: input.reset_mode,
      anchor_at:
        input.anchor_at === undefined || input.anchor_at === null
          ? null
          : new Date(input.anchor_at),
      unit: input.unit,
      limit: input.limit,
      threshold_percent: input.threshold_percent ?? null,
      enforced: input.enforced ?? false,
      model_id: input.model_id ?? null,
    };
    await this.check(owner_id, provider_id, write);
    return this.windows.create(owner_id, provider_id, write);
  }

  /**
   * Edits a window.
   *
   * @throws NotFoundException when the provider or the window is missing.
   * @throws BadRequestException as for `create`.
   */
  async update(
    owner_id: string,
    provider_id: string,
    id: string,
    input: UpdateCapWindow,
  ): Promise<CapWindowRecord> {
    const current = await this.windows.find(owner_id, provider_id, id);
    if (current === null) throw new NotFoundException('Cap window not found');
    const patch: Partial<CapWindowWrite> = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.length_count !== undefined && { length_count: input.length_count }),
      ...(input.length_unit !== undefined && { length_unit: input.length_unit }),
      ...(input.reset_mode !== undefined && { reset_mode: input.reset_mode }),
      ...(input.anchor_at !== undefined && {
        anchor_at: input.anchor_at === null ? null : new Date(input.anchor_at),
      }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.limit !== undefined && { limit: input.limit }),
      ...(input.threshold_percent !== undefined && { threshold_percent: input.threshold_percent }),
      ...(input.enforced !== undefined && { enforced: input.enforced }),
      ...(input.model_id !== undefined && { model_id: input.model_id }),
    };
    await this.check(owner_id, provider_id, { ...current, ...patch });
    const updated = await this.windows.update(owner_id, provider_id, id, patch);
    if (updated === null) throw new NotFoundException('Cap window not found');
    return updated;
  }

  /** @throws NotFoundException when the window is missing. */
  async delete(owner_id: string, provider_id: string, id: string): Promise<void> {
    if (!(await this.windows.delete(owner_id, provider_id, id))) {
      throw new NotFoundException('Cap window not found');
    }
  }

  private async measure(owner_id: string, window: CapWindowRecord, now: Date): Promise<Measured> {
    const span = window_span(window, now);
    const scope = {
      owner_id,
      provider_id: window.provider_id,
      model_id: window.model_id,
      unit: window.unit,
      after: span.after,
    };
    const used = await this.usage.amount(scope);
    let resets_at = span.resets_at;
    if (window.reset_mode === 'rolling' && used >= window.limit) {
      const oldest = await this.usage.oldest_beyond(scope, used - window.limit);
      resets_at = oldest === null ? null : shift(oldest, window.length_count, window.length_unit);
    }
    return { window, used, window_start: span.start, resets_at };
  }

  private async check(
    owner_id: string,
    provider_id: string,
    window: CapWindowWrite,
  ): Promise<void> {
    const provider = await this.require_provider(owner_id, provider_id);
    if (window.reset_mode === 'fixed' && window.anchor_at === null) {
      throw new BadRequestException('anchor_at: a fixed window needs an anchor time');
    }
    if (
      window.model_id !== null &&
      !provider.models.some((model) => model.model_id === window.model_id)
    ) {
      throw new BadRequestException('model_id: the provider does not offer this model');
    }
  }

  private async require_provider(owner_id: string, provider_id: string): Promise<ProviderRecord> {
    const provider = await this.providers.find(owner_id, provider_id);
    if (provider === null) throw new NotFoundException('Provider not found');
    return provider;
  }
}
