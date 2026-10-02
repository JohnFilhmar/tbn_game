import { Inject, Injectable } from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { Gauge, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';

/** Prometheus registry of this process. Every series carries a `process_type` label. */
@Injectable()
export class MetricsService {
  private readonly registry = new Registry();

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(PROCESS_TYPE) process_type: ProcessType,
  ) {
    this.registry.setDefaultLabels({ process_type });
    collectDefaultMetrics({ register: this.registry });
    new Gauge({
      name: 'tbn_build_info',
      help: 'Build metadata of the running process. The value is always 1.',
      labelNames: ['commit_sha'],
      registers: [this.registry],
    }).set({ commit_sha: config.git_commit_sha }, 1);
  }

  /** Content type of the Prometheus text exposition format. */
  get content_type(): string {
    return this.registry.contentType;
  }

  /** Renders every metric in the Prometheus text exposition format. */
  render(): Promise<string> {
    return this.registry.metrics();
  }
}
