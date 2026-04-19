/** Rolling window (ms) used by WebPushAlertService to count failures. */
export const PUSH_ALERT_WINDOW_MS = 5 * 60_000;

/** Absolute failure count within the window that triggers an alert. */
export const PUSH_ALERT_COUNT_THRESHOLD = 10;

/** Failure rate (0–1) within the window that triggers an alert. */
export const PUSH_ALERT_RATE_THRESHOLD = 0.05;

/** Set this env var to any truthy string to disable the ops alert cron. */
export const PUSH_ALERT_CRON_DISABLED_ENV = 'DISABLE_OPS_ALERT_CRON';

/** Byte length of the endpoint suffix stored in WebPushFailureLog. */
export const ENDPOINT_SUFFIX_LENGTH = 6;
