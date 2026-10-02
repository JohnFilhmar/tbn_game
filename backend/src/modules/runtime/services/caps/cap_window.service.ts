import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CapWindowStatus,
  CreateCapWindow,
  Preferences,
  UpdateCapWindow,
} from '@tbn/contracts';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import {
  CapService,
  type CapWindowStatusRecord,
  type ThresholdDefaults,
} from '@/modules/runtime/services/caps/cap.service';

/** The owner's threshold defaults, as `CapService` takes them. */
export function threshold_defaults(preferences: Preferences): ThresholdDefaults {
  return {
    longest_percent: preferences.cap_threshold_longest_percent,
    shorter_percent: preferences.cap_threshold_shorter_percent,
  };
}

/** Maps a measured cap window to the API shape. */
export function to_cap_window_status_view(record: CapWindowStatusRecord): CapWindowStatus {
  return {
    id: record.id,
    provider_id: record.provider_id,
    name: record.name,
    length_count: record.length_count,
    length_unit: record.length_unit,
    reset_mode: record.reset_mode,
    anchor_at: record.anchor_at?.toISOString() ?? null,
    unit: record.unit,
    limit: record.limit,
    threshold_percent: record.threshold_percent,
    enforced: record.enforced,
    model_id: record.model_id,
    created_at: record.created_at.toISOString(),
    updated_at: record.updated_at.toISOString(),
    effective_threshold_percent: record.effective_threshold_percent,
    used: record.used,
    window_start: record.window_start.toISOString(),
    resets_at: record.resets_at?.toISOString() ?? null,
    state: record.state,
  };
}

/**
 * The owner's cap windows with their live usage. It sits in the runtime module because the
 * effective thresholds come from the owner's preferences.
 */
@Injectable()
export class CapWindowService {
  constructor(
    private readonly caps: CapService,
    private readonly preferences: PreferenceService,
  ) {}

  /** Every window of a key with its usage now. */
  async list(owner_id: string, provider_id: string): Promise<CapWindowStatus[]> {
    const defaults = threshold_defaults(await this.preferences.get(owner_id));
    const statuses = await this.caps.statuses(owner_id, provider_id, defaults);
    return statuses.map(to_cap_window_status_view);
  }

  async create(
    owner_id: string,
    provider_id: string,
    input: CreateCapWindow,
  ): Promise<CapWindowStatus> {
    const created = await this.caps.create(owner_id, provider_id, input);
    return this.status_of(owner_id, provider_id, created.id);
  }

  async update(
    owner_id: string,
    provider_id: string,
    id: string,
    input: UpdateCapWindow,
  ): Promise<CapWindowStatus> {
    await this.caps.update(owner_id, provider_id, id, input);
    return this.status_of(owner_id, provider_id, id);
  }

  delete(owner_id: string, provider_id: string, id: string): Promise<void> {
    return this.caps.delete(owner_id, provider_id, id);
  }

  private async status_of(
    owner_id: string,
    provider_id: string,
    id: string,
  ): Promise<CapWindowStatus> {
    const status = (await this.list(owner_id, provider_id)).find((window) => window.id === id);
    if (status === undefined) throw new NotFoundException('Cap window not found');
    return status;
  }
}
