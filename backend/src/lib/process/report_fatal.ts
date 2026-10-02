import type { ProcessType } from '@tbn/contracts';

/**
 * Writes a bootstrap failure as one JSON line on stderr and exits 1. Used before the logger exists,
 * for example when the configuration is invalid.
 *
 * @param process_type - The process that failed to start.
 * @param error - What went wrong. Only its message is written.
 */
export function report_fatal(process_type: ProcessType, error: unknown): never {
  const line = {
    level: 'fatal',
    time: new Date().toISOString(),
    process_type,
    msg: error instanceof Error ? error.message : 'Unknown bootstrap error',
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
  process.exit(1);
}
