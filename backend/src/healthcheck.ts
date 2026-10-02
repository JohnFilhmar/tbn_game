import { ProcessTypeSchema } from '@tbn/contracts';
import { load_config } from '@/config/load_config';

/** How long the probe waits for `/health` before it reports failure. */
const PROBE_TIMEOUT_MS = 4_000;

/**
 * Container healthcheck: `node dist/healthcheck.js <web|worker>`. Exits 0 when the process answers
 * `GET /health` with 200 and 1 otherwise. Runs inside the container, so it reads the same
 * environment as the process it probes.
 */
async function probe(): Promise<boolean> {
  const process_type = ProcessTypeSchema.parse(process.argv[2]);
  const config = load_config();
  const port = process_type === 'web' ? config.web.port : config.worker.port;
  const response = await fetch(`http://127.0.0.1:${port}/health`, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  return response.ok;
}

probe().then(
  (is_healthy) => {
    process.exitCode = is_healthy ? 0 : 1;
  },
  () => {
    process.exitCode = 1;
  },
);
