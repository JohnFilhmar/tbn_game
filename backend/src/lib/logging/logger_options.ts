import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProcessType } from '@tbn/contracts';
import type { Params } from 'nestjs-pino';
import { stdTimeFunctions } from 'pino';
import type { AppConfig } from '@/config/config.schema';

/** Log paths whose values are replaced before a line is written. */
export const REDACTED_LOG_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
];

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

const PROBE_PATHS = new Set(['/health', '/metrics']);

function assign_request_id(request: IncomingMessage, response: ServerResponse): string {
  const incoming = request.headers['x-request-id'];
  const request_id =
    typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  response.setHeader('x-request-id', request_id);
  return request_id;
}

function is_probe(request: IncomingMessage): boolean {
  const path = (request.url ?? '').split('?')[0] ?? '';
  return PROBE_PATHS.has(path);
}

/**
 * Builds the pino options: JSON lines on stdout, ISO timestamps, string levels, redaction, and a
 * request id that is reused from `x-request-id` when the caller sends a safe one.
 *
 * @param config - Parsed configuration.
 * @param process_type - Added to every line so web and worker logs can be told apart.
 */
export function build_logger_options(config: AppConfig, process_type: ProcessType): Params {
  return {
    pinoHttp: {
      level: config.log_level,
      base: { process_type, commit_sha: config.git_commit_sha },
      timestamp: stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      redact: { paths: REDACTED_LOG_PATHS, censor: '[redacted]' },
      genReqId: assign_request_id,
      customLogLevel: (_request, response, error) => {
        if (error !== undefined || response.statusCode >= 500) return 'error';
        if (response.statusCode >= 400) return 'warn';
        return 'info';
      },
      autoLogging: { ignore: is_probe },
    },
  };
}
