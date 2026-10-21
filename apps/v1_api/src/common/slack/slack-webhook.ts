const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

export const DEFAULT_SLACK_TIMEOUT_MS = 5_000;

/** Incoming Webhook URLs are secrets; only an exact hooks.slack.com URL is ever called. */
export function requireSlackWebhookUrl(webhookUrl: string | undefined, envName: string): string {
  if (!webhookUrl || !SLACK_WEBHOOK_PATTERN.test(webhookUrl)) {
    throw new Error(`${envName} must be a valid Slack Incoming Webhook URL`);
  }
  return webhookUrl;
}

/**
 * Posts one message and throws on any transport or Slack-side failure, so the outbox worker's retry and
 * poison policy owns delivery instead of a failed alert turning into a silent success.
 */
export async function postSlackWebhook(options: {
  webhookUrl: string;
  body: unknown;
  /** Names the caller in the failure message, e.g. `inquiry`. */
  label: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(options.webhookUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_SLACK_TIMEOUT_MS),
  });
  const responseBody = await response.text();
  if (!response.ok || responseBody.trim() !== 'ok') {
    throw new Error(
      `Slack ${options.label} webhook failed (${response.status}): ${responseBody.trim().slice(0, 300) || 'empty response'}`,
    );
  }
}

export function escapeSlackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
