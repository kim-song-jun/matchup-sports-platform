import type { GameOperationClaim, GameOperationHandler } from '../jobs/v1-game-operations-worker.service';
import { escapeSlackText, postSlackWebhook, requireSlackWebhookUrl } from '../common/slack/slack-webhook';
import type { WithdrawalFinalizationReportPayload, WithdrawalSkipReason } from './withdrawal-finalization-report';

type WithdrawalFinalizationSlackNotifierOptions = {
  webhookUrl?: string;
  /** Short environment label shown in the first line; see `securityEnvironmentLabel`. */
  environment: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

const SKIP_REASON_LABELS: Record<WithdrawalSkipReason, string> = {
  no_request_log: '탈퇴 신청 기록이 없어요',
  active_admin: '운영자 권한이 남아 있어요',
  team_authority: '팀 소유자·매니저 권한이 남아 있어요',
  finalization_failed: '삭제 처리 중 오류가 났어요 (서버 로그 확인)',
};

/** Longest list of accounts the message spells out; the rest is a count. */
const MAX_LISTED_ACCOUNTS = 20;

/**
 * Delivers the report of one auto-deletion run. It shares the inquiry Slack webhook like the other operational
 * alerts and throws on every failure so the outbox retry and poison policy applies. The message names accounts
 * by id only — never an email, phone number or name.
 */
export class WithdrawalFinalizationSlackNotifier {
  private readonly webhookUrl: string | undefined;
  private readonly environment: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number | undefined;

  constructor(options: WithdrawalFinalizationSlackNotifierOptions) {
    this.webhookUrl = options.webhookUrl?.trim() || undefined;
    this.environment = options.environment;
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs;
  }

  readonly handler: GameOperationHandler = async (claim) => {
    await this.send(parsePayload(claim));
  };

  async send(payload: WithdrawalFinalizationReportPayload): Promise<void> {
    const webhookUrl = requireSlackWebhookUrl(this.webhookUrl, 'SLACK_INQUIRY_WEBHOOK_URL');
    await postSlackWebhook({
      webhookUrl,
      body: buildMessage(payload, this.environment),
      label: 'withdrawal-finalization',
      fetchFn: this.fetchFn,
      timeoutMs: this.timeoutMs,
    });
  }
}

function parsePayload(claim: GameOperationClaim): WithdrawalFinalizationReportPayload {
  if (!claim.payload || typeof claim.payload !== 'object' || Array.isArray(claim.payload)) {
    throw new Error(`Invalid withdrawal finalization payload for outbox ${claim.id}`);
  }
  const raw = claim.payload as Record<string, unknown>;
  const runAt = raw.runAt;
  if (typeof runAt !== 'string' || runAt !== claim.aggregateId || Number.isNaN(Date.parse(runAt))) {
    throw new Error(`Withdrawal finalization payload runAt does not match outbox ${claim.id}`);
  }
  const finalizedCount = raw.finalizedCount;
  if (typeof finalizedCount !== 'number' || !Number.isInteger(finalizedCount) || finalizedCount < 0) {
    throw new Error('Withdrawal finalization payload finalizedCount must be a non-negative integer');
  }
  if (!Array.isArray(raw.skipped)) {
    throw new Error('Withdrawal finalization payload skipped must be an array');
  }
  const skipped = raw.skipped.map((entry: unknown) => {
    const item = entry as { userId?: unknown; reason?: unknown } | null;
    if (typeof item?.userId !== 'string' || !item.userId) {
      throw new Error('Withdrawal finalization payload skipped.userId must be a non-empty string');
    }
    if (typeof item.reason !== 'string' || !(item.reason in SKIP_REASON_LABELS)) {
      throw new Error('Withdrawal finalization payload skipped.reason is not a known reason');
    }
    return { userId: item.userId, reason: item.reason as WithdrawalSkipReason };
  });
  return { runAt, finalizedCount, skipped };
}

function buildMessage(payload: WithdrawalFinalizationReportPayload, environment: string) {
  const title = `[탈퇴] 30일이 지난 계정 삭제 (${environment})`;
  const summary = [
    `삭제 ${payload.finalizedCount}건`,
    payload.skipped.length > 0 ? `사람이 확인할 계정 ${payload.skipped.length}건` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const listed = payload.skipped
    .slice(0, MAX_LISTED_ACCOUNTS)
    .map((entry) => `• ${entry.userId} — ${SKIP_REASON_LABELS[entry.reason]}`);
  const hidden = payload.skipped.length - listed.length;
  if (hidden > 0) listed.push(`• 그 밖에 ${hidden}건`);

  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: title, emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: escapeSlackText(summary) } },
  ];
  if (listed.length > 0) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: escapeSlackText(listed.join('\n')) } });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: escapeSlackText(
          '건너뛴 계정은 자동으로 삭제되지 않아요. 사유를 해결하거나 어드민에서 직접 처리해 주세요. 같은 내용은 하루에 한 번만 알려요.',
        ),
      },
    });
  }
  blocks.push({
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `실행 시각 ${escapeSlackText(payload.runAt)}` }],
  });
  return { text: `${title}\n${summary}`, blocks };
}
