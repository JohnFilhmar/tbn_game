import type { INestApplicationContext, LoggerService } from '@nestjs/common';

/** Options for `handle_shutdown_signals`. */
export interface ShutdownOptions {
  /** The application to close. */
  app: INestApplicationContext;
  /** Logger for the shutdown lines. */
  logger: LoggerService;
  /** Exit with code 1 when closing takes longer than this. */
  timeout_ms: number;
}

/**
 * On SIGTERM or SIGINT, closes the application, which runs every shutdown hook, then exits 0. Exits
 * 1 when closing fails or takes longer than `timeout_ms`, before the container runtime kills it.
 *
 * @param options - The application, a logger and the timeout.
 */
export function handle_shutdown_signals(options: ShutdownOptions): void {
  const { app, logger, timeout_ms } = options;
  let is_shutting_down = false;

  const shut_down = (signal: NodeJS.Signals): void => {
    if (is_shutting_down) return;
    is_shutting_down = true;
    logger.log(`Received ${signal}, shutting down`);
    setTimeout(() => {
      logger.error(`Shutdown took longer than ${timeout_ms} ms, exiting`);
      process.exit(1);
    }, timeout_ms).unref();
    app.close().then(
      () => {
        logger.log('Shutdown complete');
        process.exit(0);
      },
      (error: unknown) => {
        logger.error(
          `Shutdown failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
        process.exit(1);
      },
    );
  };

  process.once('SIGTERM', shut_down);
  process.once('SIGINT', shut_down);
}
