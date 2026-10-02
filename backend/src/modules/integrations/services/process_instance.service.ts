import { hostname } from 'node:os';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { PROCESS_TYPE } from '@/config/config.tokens';
import {
  PROCESS_INSTANCE_REPOSITORY,
  type ProcessInstanceRepository,
} from '@/modules/integrations/repositories/interface/integration_repository.interface';
import { NotificationService } from './notification.service';

/**
 * Restart detection: every process with a database writes a row at boot and marks it stopped on
 * a clean shutdown. A process that finds unstopped rows of its own type at boot knows its
 * previous instance died, tells the owner with `process_restarted`, and closes those rows.
 */
@Injectable()
export class ProcessInstanceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProcessInstanceService.name);
  private readonly instance_id = `${hostname()}:${process.pid}`;
  private row_id: string | null = null;

  constructor(
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    @Inject(PROCESS_INSTANCE_REPOSITORY) private readonly instances: ProcessInstanceRepository,
    private readonly notifications: NotificationService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.process_type === 'egress_proxy') return;
    try {
      await this.register_boot();
    } catch (error: unknown) {
      this.logger.error(
        `Could not record the boot: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.row_id === null) return;
    await this.instances.mark_stopped([this.row_id], new Date()).catch(() => undefined);
  }

  /** Records this boot, and reports the unclean stop of a previous instance when it finds one. */
  async register_boot(): Promise<boolean> {
    const unstopped = await this.instances.find_unstopped(this.process_type);
    const row = await this.instances.create(this.process_type, this.instance_id);
    this.row_id = row.id;
    if (unstopped.length === 0) return false;
    await this.instances.mark_stopped(
      unstopped.map((item) => item.id),
      new Date(),
    );
    this.logger.warn(
      `${unstopped.length} ${this.process_type} instance(s) stopped without a clean shutdown before this boot`,
    );
    await this.notifications.emit_to_listeners({
      event_type: 'process_restarted',
      title: `The ${this.process_type} process restarted`,
      message: `A previous ${this.process_type} instance (${unstopped.map((item) => item.instance_id).join(', ')}) stopped without a clean shutdown. This one took over.`,
      priority: 'high',
      values: { process_type: this.process_type },
    });
    return true;
  }
}
