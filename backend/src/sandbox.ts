import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { load_config } from '@/config/load_config';
import { handle_shutdown_signals } from '@/lib/process/handle_shutdown_signals';
import { report_fatal } from '@/lib/process/report_fatal';
import { SandboxLauncherModule } from '@/lib/sandbox_launcher/sandbox_launcher.module';

async function bootstrap(): Promise<void> {
  const config = load_config();
  const app = await NestFactory.createApplicationContext(SandboxLauncherModule.register(config), {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  handle_shutdown_signals({ app, logger, timeout_ms: config.shutdown_timeout_ms });
}

bootstrap().catch((error: unknown) => report_fatal('sandbox', error));
