import type { GameOperationClaim, GameOperationHandler } from '../jobs/v1-game-operations-worker.service';

export const INQUIRY_SLACK_NOTIFICATION_TYPE = 'INQUIRY_SLACK_NOTIFICATION';

export type InquirySlackNotificationPayload = {
  inquiryId: string;
  category: string;
  title: string;
  relatedType: string | null;
  relatedId: string | null;
  createdAt: string;
};

type InquirySlackNotifierOptions = {
  webhookUrl?: string;
  frontendUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

const CATEGORY_LABELS: Record<string, string> = {
  account: '계정',
  match: '매치',
  team: '팀',
  tournament: '대회',
  payment_refund: '결제·환불',
  report: '신고',
  other: '기타',
};

const SLACK_WEBHOOK_PATTERN = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/;

/**
 * Delivers one durable inquiry-created outbox event to Slack.
 *
 * The handler deliberately throws on configuration, transport, and Slack
 * response failures. V1GameOperationsWorkerService then applies its existing
 * retry and poison visibility instead of turning a missing operator alert into
 * a silent success.
 */
export class InquirySlackNotifier {
  private readonly webhookUrl: string | undefined;
  private readonly frontendUrl: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: InquirySlackNotifierOptions = {}) {
    this.webhookUrl = options.webhookUrl?.trim() || undefined;
    this.frontendUrl = options.frontendUrl?.trim() || undefined;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  readonly handler: GameOperationHandler = async (claim) => {
    const payload = parseInquirySlackPayload(claim);
    await this.send(payload);
  };

  async send(payload: InquirySlackNotificationPayload): Promise<void> {
    const webhookUrl = this.requireWebhookUrl();
    const adminUrl = this.adminInquiryUrl(payload.inquiryId);
    const response = await this.fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(buildSlackMessage(payload, adminUrl)),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const responseBody = await response.text();
    if (!response.ok || responseBody.trim() !== 'ok') {
      throw new Error(
        `Slack inquiry webhook failed (${response.status}): ${responseBody.trim().slice(0, 300) || 'empty response'}`,
      );
    }
  }

  private requireWebhookUrl(): string {
    if (!this.webhookUrl || !SLACK_WEBHOOK_PATTERN.test(this.webhookUrl)) {
      throw new Error('SLACK_INQUIRY_WEBHOOK_URL must be a valid Slack Incoming Webhook URL');
    }
    return this.webhookUrl;
  }

  private adminInquiryUrl(inquiryId: string): string {
    if (!this.frontendUrl) {
      throw new Error('FRONTEND_URL is required for Slack inquiry admin links');
    }
    const url = new URL(`/admin/inquiries/${encodeURIComponent(inquiryId)}`, this.frontendUrl);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      throw new Error('FRONTEND_URL must use HTTPS outside localhost');
    }
    return url.toString();
  }
}

function parseInquirySlackPayload(claim: GameOperationClaim): InquirySlackNotificationPayload {
  if (!claim.payload || typeof claim.payload !== 'object' || Array.isArray(claim.payload)) {
    throw new Error(`Invalid inquiry Slack payload for outbox ${claim.id}`);
  }
  const payload = claim.payload as Record<string, unknown>;
  const parsed: InquirySlackNotificationPayload = {
    inquiryId: requiredString(payload.inquiryId, 'inquiryId'),
    category: requiredString(payload.category, 'category'),
    title: requiredString(payload.title, 'title'),
    relatedType: nullableString(payload.relatedType, 'relatedType'),
    relatedId: nullableString(payload.relatedId, 'relatedId'),
    createdAt: requiredString(payload.createdAt, 'createdAt'),
  };
  if (parsed.inquiryId !== claim.aggregateId) {
    throw new Error(`Inquiry Slack payload aggregate mismatch for outbox ${claim.id}`);
  }
  if (Number.isNaN(Date.parse(parsed.createdAt))) {
    throw new Error(`Invalid inquiry Slack createdAt for outbox ${claim.id}`);
  }
  return parsed;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Inquiry Slack payload ${field} must be a non-empty string`);
  }
  return value.trim();
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Inquiry Slack payload ${field} must be null or a non-empty string`);
  }
  return value.trim();
}

function buildSlackMessage(payload: InquirySlackNotificationPayload, adminUrl: string) {
  const category = CATEGORY_LABELS[payload.category] ?? payload.category;
  const related = payload.relatedType && payload.relatedId
    ? `${payload.relatedType} / ${payload.relatedId}`
    : '없음';
  return {
    text: `[새 문의] ${escapeSlackText(category)}: ${escapeSlackText(payload.title)} (${escapeSlackText(payload.inquiryId)})`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '새 문의가 접수됐어요', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${escapeSlackText(payload.title)}*` },
        fields: [
          { type: 'mrkdwn', text: `*유형*\n${escapeSlackText(category)}` },
          { type: 'mrkdwn', text: '*상태*\n접수됨' },
          { type: 'mrkdwn', text: `*관련 대상*\n${escapeSlackText(related)}` },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `문의 ID: \`${escapeSlackText(payload.inquiryId)}\` · ${escapeSlackText(payload.createdAt)}`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '관리자에서 보기', emoji: true },
            url: adminUrl,
            action_id: 'open_inquiry_admin',
          },
        ],
      },
    ],
  };
}

function escapeSlackText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
