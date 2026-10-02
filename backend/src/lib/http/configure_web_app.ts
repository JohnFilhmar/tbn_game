import type { NestExpressApplication } from '@nestjs/platform-express';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from '@tbn/contracts';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { AppConfig } from '@/config/config.schema';

/**
 * Applies the HTTP settings every web app instance shares: JSON logging, security headers, the
 * explicit CORS origin list with the headers a browser client may send and read, and request body
 * size limits. Tests call it too, so they exercise the
 * same stack as production.
 *
 * @param app - The Nest application created from `WebModule`.
 * @param config - Parsed configuration.
 */
export function configure_web_app(app: NestExpressApplication, config: AppConfig): void {
  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.web.cors_origins.length > 0 ? config.web.cors_origins : false,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', IDEMPOTENCY_KEY_HEADER],
    exposedHeaders: [IDEMPOTENT_REPLAYED_HEADER],
  });
  app.useBodyParser('json', { limit: config.web.body_limit_bytes });
  app.useBodyParser('urlencoded', { limit: config.web.body_limit_bytes, extended: false });
}
