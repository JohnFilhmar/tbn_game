import { Injectable, Logger } from '@nestjs/common';
import type { CapWindowState } from '@tbn/contracts';
import { NotificationService } from '@/modules/integrations/services/notification.service';
import { PreferenceService } from '@/modules/knowledge/services/preference.service';
import { ProviderService } from '@/modules/runtime/services/provider.service';
import { CapService } from './cap.service';
import { threshold_defaults } from './cap_window.service';

/**
 * Tells the owner once when a cap window passes its threshold or reaches its limit, and again
 * only after it went back under. The last state of each window lives in this process.
 *
 * Ceiling: one worker. A second worker would notify the same crossing once more.
 */
@Injectable()
export class CapNotifierService {
  private readonly logger = new Logger(CapNotifierService.name);
  private readonly seen = new Map<string, CapWindowState>();

  constructor(
    private readonly caps: CapService,
    private readonly providers: ProviderService,
    private readonly preferences: PreferenceService,
    private readonly notifications: NotificationService,
  ) {}

  /** Checks every window of the key after usage was counted on it. */
  async after_usage(owner_id: string, provider_id: string): Promise<void> {
    try {
      const preferences = await this.preferences.get(owner_id);
      const statuses = await this.caps.statuses(
        owner_id,
        provider_id,
        threshold_defaults(preferences),
      );
      for (const status of statuses) {
        const before = this.seen.get(status.id) ?? 'ok';
        this.seen.set(status.id, status.state);
        if (status.state === 'ok' || status.state === before) continue;
        const provider = await this.providers.require(owner_id, provider_id);
        await this.notifications.emit(owner_id, {
          event_type: 'cap_threshold_passed',
          title: `Cap window ${status.name} on ${provider.name} is ${status.state === 'at_limit' ? 'at its limit' : 'past its threshold'}`,
          message: `${status.used} of ${status.limit} ${status.unit} used in the ${status.name} window of ${provider.name}.`,
          priority: status.state === 'at_limit' ? 'high' : 'normal',
          values: {
            provider_name: provider.name,
            window_name: status.name,
            state: status.state,
          },
        });
      }
    } catch (error: unknown) {
      this.logger.warn(
        `Cap check after usage failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
