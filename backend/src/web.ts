import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { load_config } from '@/config/load_config';
import { configure_web_app } from '@/lib/http/configure_web_app';
import { handle_shutdown_signals } from '@/lib/process/handle_shutdown_signals';
import { report_fatal } from '@/lib/process/report_fatal';
import { WebModule } from '@/web.module';

async function bootstrap(): Promise<void> {
  const config = load_config();
  const app = await NestFactory.create<NestExpressApplication>(WebModule.register(config), {
    bufferLogs: true,
  });
  configure_web_app(app, config);
  handle_shutdown_signals({
    app,
    logger: app.get(Logger),
    timeout_ms: config.shutdown_timeout_ms,
  });
  await app.listen(config.web.port, '0.0.0.0');
}

bootstrap().catch((error: unknown) => report_fatal('web', error));
