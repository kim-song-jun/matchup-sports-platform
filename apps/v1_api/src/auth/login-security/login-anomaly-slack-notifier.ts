import type { GameOperationClaim, GameOperationHandler } from '../../jobs/v1-game-operations-worker.service';
import { escapeSlackText, postSlackWebhook, requireSlackWebhookUrl } from '../../common/slack/slack-webhook';
import { LOGIN_SECURITY_POLICY } from './login-security.policy';
import type { LoginAnomalyOutboxPayload } from './login-security.service';

type LoginAnomalySlackNotifierOptions = {
  webhookUrl?: string;
  frontendUrl?: string;
  /** Short environment label shown in the first line; see `securityEnvironmentLabel`. */
  environment: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Maps the runtime environment variable the workers already receive (`V1_PUSH_ENVIRONMENT`:
 * `alpha` or `production`) to the label used in alerts, so no environment-specific variable is added.
 */
export function securityEnvironmentLabel(pushEnvironment: string | undefined): string {
  if (pushEnvironment === 'alpha') return 'alpha';
  if (pushEnvironment === 'production') return 'prod';
  return 'unknown';
}

/**
 * Delivers the one alert opened per login-spray anomaly. It shares the inquiry Slack webhook, so the
 * first line starts with `[보안]` to tell the two apart at a glance. Like the inquiry handler it throws on
 * every failure so the outbox retry and poison policy applies.
 */
export class LoginAnomalySlackNotifier {
  private readonly webhookUrl: string | undefined;
  private readonly frontendUrl: string | undefined;
  private readonly environment: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number | undefined;

  constructor(options: LoginAnomalySlackNotifierOptions) {
    this.webhookUrl = options.webhookUrl?.trim() || undefined;
    this.frontendUrl = options.frontendUrl?.trim() || undefined;
    this.environment = options.environment;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  readonly handler: GameOperationHandler = async (claim) => {
    await this.send(parseLoginAnomalyPayload(claim));
  };

  async send(payload: LoginAnomalyOutboxPayload): Promise<void> {
    const webhookUrl = requireSlackWebhookUrl(this.webhookUrl, 'SLACK_INQUIRY_WEBHOOK_URL');
    await postSlackWebhook({
      webhookUrl,
      body: buildLoginAnomalyMessage(payload, this.environment, this.adminHubUrl()),
      label: 'security',
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
    });
  }

  private adminHubUrl(): string {
    if (!this.frontendUrl) {
      throw new Error('FRONTEND_URL is required for Slack security admin links');
    }
    const url = new URL('/admin/monitoring', this.frontendUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('FRONTEND_URL must use HTTPS outside localhost');
    }
    return url.toString();
  }
}

function parseLoginAnomalyPayload(claim: GameOperationClaim): LoginAnomalyOutboxPayload {
  if (!claim.payload || typeof claim.payload !== 'object' || Array.isArray(claim.payload)) {
    throw new Error(`Invalid login anomaly payload for outbox ${claim.id}`);
  }
  const payload = claim.payload as Record<string, unknown>;
  const parsed: LoginAnomalyOutboxPayload = {
    anomalyId: requiredString(payload.anomalyId, 'anomalyId'),
    startedAt: requiredString(payload.startedAt, 'startedAt'),
    failedCount: requiredCount(payload.failedCount, 'failedCount'),
    accountCount: requiredCount(payload.accountCount, 'accountCount'),
    ipCount: requiredCount(payload.ipCount, 'ipCount'),
    windowMinutes: requiredCount(payload.windowMinutes, 'windowMinutes'),
  };
  if (parsed.anomalyId !== claim.aggregateId) {
    throw new Error(`Login anomaly payload aggregate mismatch for outbox ${claim.id}`);
  }
  if (Number.isNaN(Date.parse(parsed.startedAt))) {
    throw new Error(`Invalid login anomaly startedAt for outbox ${claim.id}`);
  }
  return parsed;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Login anomaly payload ${field} must be a non-empty string`);
  }
  return value.trim();
}

function requiredCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`Login anomaly payload ${field} must be a non-negative integer`);
  }
  return value;
}

function buildLoginAnomalyMessage(payload: LoginAnomalyOutboxPayload, environment: string, adminUrl: string) {
  const title = `[보안] 로그인 실패 급증 (${environment})`;
  const summary =
    `최근 ${payload.windowMinutes}분 로그인 실패 ${payload.failedCount}건 · ` +
    `서로 다른 계정 ${payload.accountCount}개 · IP ${payload.ipCount}개`;
  return {
    text: `${title}\n${summary}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: escapeSlackText(summary) },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `지금부터 ${LOGIN_SECURITY_POLICY.sprayActiveMs / 60_000}분 동안 이메일 로그인은 인증번호를 한 번 더 받아야 해요. 관리자 모니터링 허브의 「로그인 이상」에서 확인해 주세요.`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `이상 기록 ID: \`${escapeSlackText(payload.anomalyId)}\` · ${escapeSlackText(payload.startedAt)}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '모니터링 허브 열기', emoji: true },
            url: adminUrl,
            action_id: 'open_security_monitoring',
          },
        ],
      },
    ],
  };
}
