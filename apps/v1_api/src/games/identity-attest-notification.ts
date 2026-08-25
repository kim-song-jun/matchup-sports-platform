import type { Prisma } from '@prisma/client';
import { notificationCopyFor } from '../notifications/notifications.service';

/**
 * 내 기록 연결(claim) 신청이 들어왔을 때 **승인(attest)할 수 있는 사람들**에게 인앱
 * 알림을 남긴다 (2026-08-26, attest UI C안). 요청은 24시간 뒤 만료되는데, 알림이 없으면
 * 확인자는 신청 사실 자체를 알 수 없다.
 *
 * ## 왜 NotificationsService 가 아니라 tx 직접 쓰기인가
 * GamesModule → NotificationsServiceModule → RealtimeModule → GamesModule 이 순환이라
 * games 쪽에서 NotificationsService 를 주입할 수 없다. 그래서
 * team-match-completion-notification.service.ts 선례를 그대로 따른다: V1Notification
 * row 를 호출자의 tx 로 직접 쓰고(신청 커밋 = 알림 존재), 문구·딥링크는
 * `notificationCopyFor()`(notifications.service.ts 단일 소스)에서 읽으며,
 * `businessKey` 로 (요청, 수신자) 쌍마다 정확히 한 번만 배달한다 — 커맨드 재시도
 * (idempotency REPLAY)에도 재알림하지 않는다. 웹 푸시 즉시 발송은 이 경로에 없다
 * (인앱 알림함·미읽음 뱃지로 도달) — 필요해지면 outbox 핸들러로 옮겨 워커의
 * WebPushService 를 쓰는 것이 다음 단계다.
 *
 * ## 수신자 = 승인 자격자(assertAttestorAuthority)와 정렬하되, 대회는 리더로 좁힌다
 * - TEAM_MATCH(리그 대진 포함): 참가자가 속한 사이드 팀의 owner/manager — 승인 자격
 *   그 자체다.
 * - TOURNAMENT_FIXTURE: 승인 자격은 두 등록팀의 활성 멤버 **전원**이지만, 전원 발송은
 *   소음이다(양 팀 수십 명). 알림은 두 등록팀의 owner/manager 에게만 보낸다 — 자격
 *   범위는 그대로 두고 도달 채널만 좁히는 것이라 새 인가 규칙이 아니다.
 * - 신청자 본인은 제외한다(스스로 승인할 수 없다 — 서비스 + DB 트리거).
 */
export async function writeIdentityAttestRequestNotifications(
  tx: Prisma.TransactionClient,
  input: {
    gameId: string;
    participantId: string;
    requestId: string;
    requesterUserId: string;
  },
): Promise<void> {
  const game = await tx.v1Game.findUnique({
    where: { id: input.gameId },
    select: {
      sourceType: true,
      teamMatchId: true,
      tournamentFixture: {
        select: {
          id: true,
          tournamentId: true,
          homeRegistration: { select: { teamId: true } },
          awayRegistration: { select: { teamId: true } },
        },
      },
    },
  });
  if (game === null) return;

  const participant = await tx.v1GameParticipant.findFirst({
    where: { id: input.participantId, gameId: input.gameId },
    select: { displayNameSnapshot: true, sideId: true },
  });
  if (participant === null) return;

  const isTournament = game.sourceType === 'TOURNAMENT_FIXTURE';
  let recipientTeamIds: string[];
  if (isTournament) {
    recipientTeamIds = [
      game.tournamentFixture?.homeRegistration?.teamId,
      game.tournamentFixture?.awayRegistration?.teamId,
    ].filter((teamId): teamId is string => typeof teamId === 'string');
  } else {
    const side = await tx.v1GameSide.findUnique({
      where: { id: participant.sideId },
      select: { teamId: true },
    });
    recipientTeamIds = side?.teamId ? [side.teamId] : [];
  }
  if (recipientTeamIds.length === 0) return;

  const memberships = await tx.v1TeamMembership.findMany({
    where: {
      teamId: { in: recipientTeamIds },
      status: 'active',
      role: { in: ['owner', 'manager'] },
    },
    select: { userId: true },
  });
  const recipients = [...new Set(memberships.map((m) => m.userId))].filter(
    (userId) => userId !== input.requesterUserId,
  );
  if (recipients.length === 0) return;

  // 선호도 필터 — NotificationsService.createNotificationWithPrefCheck 와 동일하게
  // 선호도 행이 없으면 기본 활성으로 취급한다. 게이트 필드는 preferenceFieldForEvent 의
  // 매핑(팀매치·리그 = teamMatchEnabled, 대회 = activityEnabled)과 같아야 한다.
  const preferences = await tx.v1NotificationPreference.findMany({
    where: { userId: { in: recipients } },
    select: { userId: true, activityEnabled: true, teamMatchEnabled: true },
  });
  const enabledByUser = new Map(
    preferences.map(
      (preference) =>
        [preference.userId, isTournament ? preference.activityEnabled : preference.teamMatchEnabled] as const,
    ),
  );
  const enabledRecipients = recipients.filter((userId) => enabledByUser.get(userId) !== false);
  if (enabledRecipients.length === 0) return;

  const type = isTournament
    ? ('tournament_identity_attest_requested' as const)
    : ('team_match_identity_attest_requested' as const);
  const targetType = isTournament ? ('tournament' as const) : ('team_match' as const);
  const targetId = isTournament
    ? game.tournamentFixture
      ? `${game.tournamentFixture.tournamentId}:${game.tournamentFixture.id}`
      : null
    : game.teamMatchId;
  if (targetId === null) return;

  const copy = notificationCopyFor(type, targetType, targetId);
  const body = `"${participant.displayNameSnapshot}" 참가자의 기록 연결 요청이 도착했어요. 24시간 안에 확인해 주세요.`;
  const businessKeyFor = (userId: string) => `identity-attest:${input.requestId}:${userId}`;

  await tx.v1Notification.createMany({
    data: enabledRecipients.map((userId) => ({
      recipientUserId: userId,
      targetType,
      targetId,
      title: copy.title,
      body,
      deepLink: copy.deepLink,
      businessKey: businessKeyFor(userId),
    })),
    skipDuplicates: true,
  });
}
