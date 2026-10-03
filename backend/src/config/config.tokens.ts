/** Injection token for the parsed `AppConfig`. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Injection token for the `ProcessType` of the running process. */
export const PROCESS_TYPE = Symbol('PROCESS_TYPE');

/**
 * True in one-off commands such as `admin.js`. They run as the web process type to send nothing on
 * their own, and take no part in restart detection.
 */
export const ONE_OFF = Symbol('ONE_OFF');
