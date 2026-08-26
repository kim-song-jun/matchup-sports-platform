import { randomUUID } from 'node:crypto';
import { Prisma, V1IdentityActorType, V1IdentityLinkAction } from '@prisma/client';
import { notificationCopyFor } from '../../notifications/notifications.service';
import type { WebPushService } from '../../notifications/web-push.service';
import type { GameOperationHandler } from '../v1-game-operations-worker.service';

export const IDENTITY_LINK_EXPIRY_TYPE = 'IDENTITY_LINK_EXPIRY';

/** 신원 연결 요청의 수명. GamesService 의 lazy expiry 판정과 반드시 같은 값이어야 한다. */
export const IDENTITY_LINK_REQUEST_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * 신청 시각 +24시간에 만료를 **능동으로** 확정하는 예약 잡을 건다 (2026-08-26).
 *
 * 이전에는 만료가 lazy 였다 — 누군가 그 요청에 attest 를 시도할 때에야 EXPIRED 이벤트가
 * 쓰였다. 아무도 손대지 않으면 원장에는 REQUESTED 만 남고, 화면(승인함·목록)에서는 24시간
 * 경과 필터로 조용히 사라질 뿐이라 **신청자는 자기 요청이 끝났는지 알 수 없었다.**
 * 이 잡은 만료를 실제 이벤트로 확정하고 신청자에게 통보한다.
 *
 * 스케줄 패턴은 league-result-entry-reminder.service.ts 와 같다: 같은 트랜잭션에서
 * outbox 행을 하나 넣고, business key(요청 id)로 중복을 막는다. 요청이 만료 전에
 * 승인·거절되면 발화 시점에 종결 이벤트를 보고 스스로 no-op 한다.
 */
export async function scheduleIdentityLinkExpiry(
  tx: Prisma.TransactionClient,
  input: { gameId: string; participantId: string; requestId: string; requestedAt: Date },
): Promise<void> {
  const businessKey = `identity-link-expiry:${input.requestId}`;
  const availableAt = new Date(input.requestedAt.getTime() + IDENTITY_LINK_REQUEST_TTL_MS);
  const payload = JSON.stringify({
    gameId: input.gameId,
    participantId: input.participantId,
    requestId: input.requestId,
  });
  await tx.$executeRaw`
    INSERT INTO v1_outbox_events (id, business_key, aggregate_type, aggregate_id, type, payload, available_at, status, attempts, retry_generation, version, created_at, updated_at)
    VALUES (${randomUUID()}, ${businessKey}, 'GAME', ${input.gameId}, ${IDENTITY_LINK_EXPIRY_TYPE}, ${payload}::jsonb, ${availableAt}, 'PENDING'::"V1OutboxStatus", 0, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (business_key) DO NOTHING
  `;
}

type ExpiryPayload = { gameId: string; participantId: string; requestId: string };

export class IdentityLinkExpiryService {
  constructor(private readonly webPush?: WebPushService) {}

  readonly handler: GameOperationHandler = async (claim, tx) => {
    const { gameId, participantId, requestId } = this.payload(claim.payload);

    const events = await tx.v1ParticipantIdentityLinkEvent.findMany({
      where: { participantId, requestId },
      orderBy: { eventVersion: 'asc' },
    });
    const requested = events.find((event) => event.action === V1IdentityLinkAction.REQUESTED);
    // 요청 자체가 없으면(데이터 정리 등) 할 일이 없다.
    if (requested === undefined) return;
    const terminal = events.find(
      (event) =>
        event.action === V1IdentityLinkAction.ATTESTED ||
        event.action === V1IdentityLinkAction.REJECTED ||
        event.action === V1IdentityLinkAction.EXPIRED,
    );
    // 이미 승인·거절됐거나(정상 종결) lazy expiry 가 먼저 기록했으면 no-op.
    if (terminal !== undefined) return;
    // 잡이 이르게 깨어난 경우(시계 오차·재시도)는 아직 만료가 아니다 — 다음 기회에 맡긴다.
    if (Date.now() - requested.effectiveAt.getTime() < IDENTITY_LINK_REQUEST_TTL_MS) return;

    const last = await tx.v1ParticipantIdentityLinkEvent.findFirst({
      where: { participantId },
      orderBy: { eventVersion: 'desc' },
      select: { eventVersion: true },
    });
    await tx.v1ParticipantIdentityLinkEvent.create({
      data: {
        participantId,
        linkId: requested.linkId,
        eventVersion: (last?.eventVersion ?? 0) + 1,
        requestId,
        action: V1IdentityLinkAction.EXPIRED,
        userId: requested.userId,
        actorType: V1IdentityActorType.SYSTEM,
        // GamesService 의 lazy expiry 와 같은 시스템 액터 — 원장에서 두 경로가 같은 모양이다.
        systemActor: 'IDENTITY_LINK_EXPIRY',
      },
    });
    // 게임 버전을 올려 두면 목록·화면이 들고 있던 낙관적 버전이 낡았음을 알아챈다
    // (lazy expiry 경로와 동일).
    await tx.v1Game.update({ where: { id: gameId }, data: { version: { increment: 1 } } });

    await this.notifyRequester(tx, { gameId, participantId, requestId, requesterUserId: requested.userId });
  };

  /** 신청자에게 "만료됐어요"를 1회 통보한다. 수신 거부(선호도)는 존중한다. */
  private async notifyRequester(
    tx: Prisma.TransactionClient,
    input: { gameId: string; participantId: string; requestId: string; requesterUserId: string },
  ): Promise<void> {
    const game = await tx.v1Game.findUnique({
      where: { id: input.gameId },
      select: {
        sourceType: true,
        teamMatchId: true,
        tournamentFixture: { select: { id: true, tournamentId: true } },
      },
    });
    if (game === null) return;
    const participant = await tx.v1GameParticipant.findFirst({
      where: { id: input.participantId },
      select: { displayNameSnapshot: true },
    });

    const isTournament = game.sourceType === 'TOURNAMENT_FIXTURE';
    const targetType = isTournament ? ('tournament' as const) : ('team_match' as const);
    const targetId = isTournament
      ? game.tournamentFixture
        ? `${game.tournamentFixture.tournamentId}:${game.tournamentFixture.id}`
        : null
      : game.teamMatchId;
    if (targetId === null) return;

    const preference = await tx.v1NotificationPreference.findUnique({
      where: { userId: input.requesterUserId },
      select: { activityEnabled: true, teamMatchEnabled: true },
    });
    // 선호도 행이 없으면 기본 활성(NotificationsService 와 같은 규칙).
    const enabled = isTournament ? preference?.activityEnabled : preference?.teamMatchEnabled;
    if (enabled === false) return;

    const copy = notificationCopyFor(
      isTournament ? 'tournament_identity_attest_expired' : 'team_match_identity_attest_expired',
      targetType,
      targetId,
    );
    const body =
      participant === null
        ? copy.defaultBody
        : `"${participant.displayNameSnapshot}" 연결 요청이 24시간 안에 확인되지 않아 만료됐어요. 다시 신청할 수 있어요.`;
    const businessKey = `identity-attest-expired:${input.requestId}:${input.requesterUserId}`;

    const existing = await tx.v1Notification.findUnique({ where: { businessKey }, select: { id: true } });
    await tx.v1Notification.createMany({
      data: [
        {
          recipientUserId: input.requesterUserId,
          targetType,
          targetId,
          title: copy.title,
          body,
          deepLink: copy.deepLink,
          businessKey,
        },
      ],
      skipDuplicates: true,
    });
    // 잡이 재시도돼도 푸시는 한 번만 — 이미 알림 row 가 있었으면 보내지 않는다.
    if (existing !== null) return;
    void this.webPush
      ?.sendToUser(input.requesterUserId, { title: copy.title, body, url: copy.deepLink ?? undefined })
      .catch(() => {
        // best-effort — 이미 커밋된 인앱 알림은 그대로 남는다.
      });
  }

  private payload(payload: unknown): ExpiryPayload {
    const value = payload as Partial<ExpiryPayload> | null;
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof value.gameId !== 'string' ||
      value.gameId.trim().length === 0 ||
      typeof value.participantId !== 'string' ||
      value.participantId.trim().length === 0 ||
      typeof value.requestId !== 'string' ||
      value.requestId.trim().length === 0
    ) {
      throw new Error('IDENTITY_LINK_EXPIRY payload requires gameId, participantId and requestId');
    }
    return { gameId: value.gameId, participantId: value.participantId, requestId: value.requestId };
  }
}
