import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AppConfig } from '@/config/config.schema';
import { load_config } from '@/config/load_config';
import { configure_web_app } from '@/lib/http/configure_web_app';
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

/**
 * Starts the web application the way `web.ts` does, without binding a port. Callers close it.
 *
 * @param config - Configuration for this instance.
 */
export async function create_test_web_app(config: AppConfig): Promise<NestExpressApplication> {
  const module_ref = await Test.createTestingModule({
    imports: [WebModule.register(config)],
  }).compile();
  const app = module_ref.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configure_web_app(app, config);
  await app.init();
  return app;
}
