import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ProcessType } from '@tbn/contracts';
import type { Gauge } from '@prometheus-io/client';
import type { AppConfig } from '@/config/config.schema';
import { APP_CONFIG, PROCESS_TYPE } from '@/config/config.tokens';
import { disk_used_percent } from '@/lib/disk/disk_usage';
import { MetricsService } from '@/lib/metrics/metrics.service';
import { QueueService } from '@/lib/queue/queue.service';
import {
  RUN_REPOSITORY,
  type RunRepository,
} from '@/modules/runtime/repositories/interface/run_repository.interface';
import {
  USAGE_REPOSITORY,
  type UsageRepository,
} from '@/modules/runtime/repositories/interface/usage_repository.interface';
import {
  WEB_CACHE_REPOSITORY,
  type WebCacheRepository,
} from '@/modules/runtime/repositories/interface/web_cache_repository.interface';
import { error_message } from '@/utils/error_details';

/** How often the worker reads the figures again. Prometheus scrapes on its own schedule. */
const REFRESH_MS = 30_000;

/**
 * The figures behind the operations dashboards, as gauges on the worker's `/metrics`: queue depth,
 * runs by status, usage and spend by provider, cache hits and misses, and how full the workspace
 * volume is. The worker reads them from the database every 30 seconds; Grafana turns the running
 * totals into rates. Proxy refusals already count on the proxy itself.
 *
 * Ceiling: each worker process reports the same totals, so a dashboard over several workers takes
 * the maximum, not the sum.
 */
@Injectable()
export class DashboardMetricsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DashboardMetricsService.name);
  private readonly queue_jobs: Gauge<'queue' | 'state'>;
  private readonly runs_by_status: Gauge<'status'>;
  private readonly usage_cost: Gauge<'provider'>;
  private readonly usage_tokens: Gauge<'provider' | 'kind'>;
  private readonly usage_requests: Gauge<'provider'>;
  private readonly cache_events: Gauge<'cache' | 'outcome'>;
  private readonly disk_used: Gauge<never>;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PROCESS_TYPE) private readonly process_type: ProcessType,
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(USAGE_REPOSITORY) private readonly usage: UsageRepository,
    @Inject(WEB_CACHE_REPOSITORY) private readonly caches: WebCacheRepository,
    private readonly queue: QueueService,
    metrics: MetricsService,
  ) {
    this.queue_jobs = metrics.gauge('tbn_queue_jobs', 'Jobs in each queue, by state.', [
      'queue',
      'state',
    ]);
    this.runs_by_status = metrics.gauge('tbn_runs', 'Runs ever started, by status.', ['status']);
    this.usage_cost = metrics.gauge('tbn_usage_cost', 'Money spent so far, by provider.', [
      'provider',
    ]);
    this.usage_tokens = metrics.gauge(
      'tbn_usage_tokens',
      'Tokens used so far, by provider and kind.',
      ['provider', 'kind'],
    );
    this.usage_requests = metrics.gauge(
      'tbn_usage_requests',
      'Model calls made so far, by provider.',
      ['provider'],
    );
    this.cache_events = metrics.gauge(
      'tbn_cache_events',
      'Cache lookups so far, by cache and outcome.',
      ['cache', 'outcome'],
    );
    this.disk_used = metrics.gauge(
      'tbn_workspace_disk_used_percent',
      'How full the file system holding the workspace is.',
      [],
    );
  }

  onApplicationBootstrap(): void {
    if (this.process_type !== 'worker') return;
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref();
    void this.refresh();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Reads every figure again. Each one logs and keeps its last value when its read fails. */
  async refresh(): Promise<void> {
    const steps: Array<[string, () => Promise<void>]> = [
      ['queue depth', () => this.refresh_queues()],
      ['runs', () => this.refresh_runs()],
      ['usage', () => this.refresh_usage()],
      ['caches', () => this.refresh_caches()],
      ['disk', () => this.refresh_disk()],
    ];
    for (const [name, step] of steps) {
      try {
        await step();
      } catch (error: unknown) {
        this.logger.warn(`Dashboard figure ${name} not refreshed: ${error_message(error)}`);
      }
    }
  }

  private async refresh_queues(): Promise<void> {
    const depths = await this.queue.depths();
    this.queue_jobs.reset();
    for (const depth of depths) {
      for (const state of ['ready', 'deferred', 'active', 'failed'] as const) {
        this.queue_jobs.set({ queue: depth.queue, state }, depth[state]);
      }
    }
  }

  private async refresh_runs(): Promise<void> {
    const counts = await this.runs.count_by_status();
    this.runs_by_status.reset();
    for (const { status, count } of counts) this.runs_by_status.set({ status }, count);
  }

  private async refresh_usage(): Promise<void> {
    const totals = await this.usage.totals_by_provider();
    this.usage_cost.reset();
    this.usage_tokens.reset();
    this.usage_requests.reset();
    for (const total of totals) {
      const provider = total.provider_name;
      this.usage_cost.set({ provider }, total.cost);
      this.usage_requests.set({ provider }, total.requests);
      this.usage_tokens.set({ provider, kind: 'input' }, total.input_tokens);
      this.usage_tokens.set({ provider, kind: 'output' }, total.output_tokens);
      this.usage_tokens.set({ provider, kind: 'cache_read' }, total.cache_read_tokens);
      this.usage_tokens.set({ provider, kind: 'cache_write' }, total.cache_write_tokens);
    }
  }

  private async refresh_caches(): Promise<void> {
    const totals = await this.caches.event_totals_by_kind();
    this.cache_events.reset();
    for (const total of totals) {
      this.cache_events.set({ cache: total.kind, outcome: 'hit' }, total.hits);
      this.cache_events.set({ cache: total.kind, outcome: 'miss' }, total.misses);
    }
  }

  private async refresh_disk(): Promise<void> {
    this.disk_used.set(await disk_used_percent(this.config.workspace.dir));
  }
}
