import { Inject, Injectable } from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import { Counter, Gauge, Registry, collectDefaultMetrics } from '@prometheus-io/client';
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

  /**
   * Registers a counter of this process.
   *
   * @param name - The series name, prefixed `tbn_`.
   * @param help - What it counts.
   * @param label_names - The labels every increment carries.
   */
  counter<Label extends string>(name: string, help: string, label_names: Label[]): Counter<Label> {
    return new Counter<Label>({
      name,
      help,
      labelNames: label_names,
      registers: [this.registry],
    });
  }

  /**
   * Registers a gauge of this process.
   *
   * @param name - The series name, prefixed `tbn_`.
   * @param help - What it measures.
   * @param label_names - The labels every value carries.
   */
  gauge<Label extends string>(name: string, help: string, label_names: Label[]): Gauge<Label> {
    return new Gauge<Label>({
      name,
      help,
      labelNames: label_names,
      registers: [this.registry],
    });
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
