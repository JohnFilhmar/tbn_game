import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AppConfig } from '@/config/config.schema';
import { load_config } from '@/config/load_config';
import { configure_web_app } from '@/lib/http/configure_web_app';
import { LOG_DESTINATION } from '@/lib/logging/log_destination';
import { WebModule } from '@/web.module';

/** A PostgreSQL URL with nothing listening behind it, for the unavailable path. */
export const UNREACHABLE_DATABASE_URL = 'postgresql://tbn@127.0.0.1:9/tbn';

/**
 * Configuration for tests: the real environment, so `DATABASE_URL` must point at a disposable
 * PostgreSQL database, with silent logs and ephemeral ports.
 */
export function load_test_config(): AppConfig {
  const config = load_config();
  return {
    ...config,
    log_level: 'silent',
    web: { ...config.web, port: 0 },
    worker: { ...config.worker, port: 0 },
  };
}

/** Options for `create_test_web_app`. */
export interface TestWebAppOptions {
  /** Receives every log line instead of stdout. */
  log_destination?: NodeJS.WritableStream;
}

/**
 * Starts the web application the way `web.ts` does, without binding a port. Callers close it.
 *
 * @param config - Configuration for this instance.
 * @param options - Test seams.
 */
export async function create_test_web_app(
  config: AppConfig,
  options: TestWebAppOptions = {},
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({ imports: [WebModule.register(config)] });
  if (options.log_destination !== undefined) {
    builder.overrideProvider(LOG_DESTINATION).useValue(options.log_destination);
  }
  const module_ref = await builder.compile();
  const app = module_ref.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configure_web_app(app, config);
  await app.init();
  return app;
}
