import { config_schema, type AppConfig } from './config.schema';

/** Raised when the environment does not match the config schema. Never carries values. */
export class ConfigError extends Error {
  /** One entry per invalid variable, as `NAME: reason`. */
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`Invalid configuration: ${problems.join('; ')}`);
    this.name = 'ConfigError';
    this.problems = problems;
  }
}

/**
 * Parses environment variables into the typed configuration.
 *
 * @param env - Variables to read, usually `process.env`.
 * @throws ConfigError naming each invalid variable and the reason, without echoing any value.
 */
export function parse_config(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const result = config_schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    );
  }
  return result.data;
}
