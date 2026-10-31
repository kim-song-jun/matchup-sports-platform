import type { GameOperationClaim, GameOperationHandler } from '../../jobs/v1-game-operations-worker.service';
import { escapeSlackText, postSlackWebhook, requireSlackWebhookUrl } from '../../common/slack/slack-webhook';
import type { EmailDeliveryFailedPayload } from './email-delivery-failure';
import type { OtpEmailPurpose } from './otp-email-template';

type EmailDeliveryFailureSlackNotifierOptions = {
  webhookUrl?: string;
  /** Short environment label shown in the first line; see `securityEnvironmentLabel`. */
  environment: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

const PURPOSE_LABELS: Record<OtpEmailPurpose, string> = {
  verify: '이메일 인증',
  password_reset: '비밀번호 재설정',
  login_step_up: '로그인 추가 인증',
  login_email_link: '로그인 이메일 연결',
};

/**
 * Delivers the one alert per hour-long window in which a verification mail failed to send. It shares the
 * inquiry Slack webhook like the login-anomaly alert, and throws on every failure so the outbox retry and
 * poison policy applies. The message carries counts, purposes and the error class name only — never a
 * recipient address or a code.
 */
export class EmailDeliveryFailureSlackNotifier {
  private readonly webhookUrl: string | undefined;
  private readonly environment: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number | undefined;

  constructor(options: EmailDeliveryFailureSlackNotifierOptions) {
    this.webhookUrl = options.webhookUrl?.trim() || undefined;
    this.environment = options.environment;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  readonly handler: GameOperationHandler = async (claim) => {
    await this.send(parsePayload(claim));
  };

  async send(payload: EmailDeliveryFailedPayload): Promise<void> {
    const webhookUrl = requireSlackWebhookUrl(this.webhookUrl, 'SLACK_INQUIRY_WEBHOOK_URL');
    await postSlackWebhook({
      webhookUrl,
      body: buildMessage(payload, this.environment),
      label: 'email-delivery',
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
    });
  }
}

function parsePayload(claim: GameOperationClaim): EmailDeliveryFailedPayload {
  if (!claim.payload || typeof claim.payload !== 'object' || Array.isArray(claim.payload)) {
    throw new Error(`Invalid email delivery payload for outbox ${claim.id}`);
  }
  const raw = claim.payload as Record<string, unknown>;
  const windowStart = raw.windowStart;
  if (typeof windowStart !== 'string' || windowStart !== claim.aggregateId || Number.isNaN(Date.parse(windowStart))) {
    throw new Error(`Email delivery payload windowStart does not match outbox ${claim.id}`);
  }
  const failureCount = raw.failureCount;
  if (typeof failureCount !== 'number' || !Number.isInteger(failureCount) || failureCount < 1) {
    throw new Error('Email delivery payload failureCount must be a positive integer');
  }
  const errorName = raw.errorName;
  if (typeof errorName !== 'string' || !errorName.trim()) {
    throw new Error('Email delivery payload errorName must be a non-empty string');
  }
  const purposes: EmailDeliveryFailedPayload['purposes'] = {};
  for (const purpose of Object.keys(PURPOSE_LABELS) as OtpEmailPurpose[]) {
    const count = (raw.purposes as Record<string, unknown> | undefined)?.[purpose];
    if (count === undefined) continue;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      throw new Error(`Email delivery payload purposes.${purpose} must be a positive integer`);
    }
    purposes[purpose] = count;
  }
  return { windowStart, failureCount, errorName: errorName.trim(), purposes };
}

function buildMessage(payload: EmailDeliveryFailedPayload, environment: string) {
  const title = `[메일] 인증 메일 발송 실패 (${environment})`;
  const summary = `인증 메일 발송 실패 ${payload.failureCount}건 · SES 오류 ${payload.errorName}`;
  const byPurpose = (Object.keys(PURPOSE_LABELS) as OtpEmailPurpose[])
    .filter((purpose) => payload.purposes[purpose])
    .map((purpose) => `${PURPOSE_LABELS[purpose]} ${payload.purposes[purpose]}건`)
    .join(' · ');
  const guidance =
    '비밀번호 재설정과 로그인 추가 인증 메일이 나가지 않으면 사용자가 로그인하거나 계정을 되찾을 수 없어요. ' +
    'SES 발송 권한과 발신 주소·샌드박스 상태를 확인해 주세요. 같은 문제가 이어져도 이 알림은 1시간에 한 번만 와요.';
  return {
    text: `${title}\n${summary}`,
    blocks: [
      { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: escapeSlackText(byPurpose ? `${summary}\n용도: ${byPurpose}` : summary) },
      },
      { type: 'section', text: { type: 'mrkdwn', text: escapeSlackText(guidance) } },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: `집계 시작 ${escapeSlackText(payload.windowStart)}` }],
      },
    ],
  };
}
