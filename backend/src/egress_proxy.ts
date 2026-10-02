import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { load_config } from '@/config/load_config';
import { EgressProxyModule } from '@/lib/egress_proxy/egress_proxy.module';
import { handle_shutdown_signals } from '@/lib/process/handle_shutdown_signals';
import { report_fatal } from '@/lib/process/report_fatal';

async function bootstrap(): Promise<void> {
  const config = load_config();
  const app = await NestFactory.createApplicationContext(EgressProxyModule.register(config), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  handle_shutdown_signals({ app, logger, timeout_ms: config.shutdown_timeout_ms });
}

bootstrap().catch((error: unknown) => report_fatal('egress_proxy', error));
