import type { AppConfig } from './config.schema';
import { parse_config } from './parse_config';

/**
 * Reads the configuration from `process.env`. Entry points call this once at bootstrap. No other
 * application code reads `process.env`.
 */
export function load_config(): AppConfig {
  return parse_config(process.env);
}
