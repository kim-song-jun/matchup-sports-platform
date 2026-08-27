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
 * row 를 호출자의 tx 로 직접 쓰고(신청 커밋 = 알림 존재), **제목·딥링크**는
 * `notificationCopyFor()`(notifications.service.ts 단일 소스)에서 읽고 body 만 여기서
 * 동적으로 만들며(참가자 이름 인용 — 호출부 body 오버라이드는 그 파일이 문서화한 관례),
 * `businessKey` 로 (요청, 수신자) 쌍마다 정확히 한 번만 배달한다 — 커맨드 재시도
 * (idempotency REPLAY)에도 재알림하지 않는다.
 *
 * ## 웹 푸시는 커밋 뒤에 (2026-08-26)
 * 푸시는 롤백할 수 없으므로 트랜잭션 안에서 보내면 안 된다 — 이 함수는 **누구에게 무엇을
 * 보낼지**만 돌려주고, 실제 발송은 커맨드가 커밋된 뒤 호출부(GamesService)가
 * fire-and-forget 으로 한다. 발송이 실패해도 이미 커밋된 인앱 알림은 그대로 남는다.
 *
 * ## 수신자 = 승인 자격자(assertAttestorAuthority)와 정렬하되, 대회는 리더로 좁힌다
 * - TEAM_MATCH(리그 대진 포함): 참가자가 속한 사이드 팀의 owner/manager — 승인 자격
 *   그 자체다.
 * - TOURNAMENT_FIXTURE: 승인 자격은 두 등록팀의 활성 멤버 **전원**이지만, 전원 발송은
 *   소음이다(양 팀 수십 명). 알림은 두 등록팀의 owner/manager 에게만 보낸다 — 자격
 *   범위는 그대로 두고 도달 채널만 좁히는 것이라 새 인가 규칙이 아니다.
 * - 신청자 본인은 제외한다(스스로 승인할 수 없다 — 서비스 + DB 트리거).
 */
/** 커밋 뒤 웹 푸시로 보낼 내용. 보낼 대상이 없으면 null. */
export type IdentityAttestPushPlan = {
  recipients: string[];
  title: string;
  body: string;
  url: string | null;
};

export async function writeIdentityAttestRequestNotifications(
  tx: Prisma.TransactionClient,
  input: {
    gameId: string;
    participantId: string;
    requestId: string;
    requesterUserId: string;
  },
): Promise<IdentityAttestPushPlan | null> {
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
  if (game === null) return null;

  const participant = await tx.v1GameParticipant.findFirst({
    where: { id: input.participantId, gameId: input.gameId },
    select: { displayNameSnapshot: true, sideId: true },
  });
  if (participant === null) return null;

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
  if (recipientTeamIds.length === 0) return null;

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
  if (recipients.length === 0) return null;

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
  if (enabledRecipients.length === 0) return null;

  const type = isTournament
    ? ('tournament_identity_attest_requested' as const)
    : ('team_match_identity_attest_requested' as const);
  const targetType = isTournament ? ('tournament' as const) : ('team_match' as const);
  const targetId = isTournament
    ? game.tournamentFixture
      ? `${game.tournamentFixture.tournamentId}:${game.tournamentFixture.id}`
      : null
    : game.teamMatchId;
  if (targetId === null) return null;

  const copy = notificationCopyFor(type, targetType, targetId);
  const body = `"${participant.displayNameSnapshot}" 참가자의 기록 연결 요청이 도착했어요. 24시간 안에 확인해 주세요.`;
  const businessKeyFor = (userId: string) => `identity-attest:${input.requestId}:${userId}`;

  // 이미 배달된 수신자는 푸시에서도 뺀다 — 커맨드가 재시도돼 같은 businessKey 가
  // skipDuplicates 로 걸리는 경우, 인앱은 중복되지 않는데 푸시만 두 번 가면 안 된다.
  const alreadyDelivered = await tx.v1Notification.findMany({
    where: { businessKey: { in: enabledRecipients.map(businessKeyFor) } },
    select: { businessKey: true },
  });
  const alreadyDeliveredKeys = new Set(alreadyDelivered.map((row) => row.businessKey));

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

  const newlyDelivered = enabledRecipients.filter(
    (userId) => !alreadyDeliveredKeys.has(businessKeyFor(userId)),
  );
  if (newlyDelivered.length === 0) return null;
  return { recipients: newlyDelivered, title: copy.title, body, url: copy.deepLink };
}

/**
 * 승인/거절 결정 통보 (2026-08-27 감사 결함 수정) — attestIdentityLink 가 REQUESTED 를
 * ATTESTED/REJECTED 로 종결해도 **신청자**에게는 어떤 알림도 나가지 않았다. 승인함
 * 목록(listPendingIdentityLinkRequests)도 `event.userId !== user.id` 로 본인 신청을
 * 명시적으로 제외하므로, 신청자가 자기 요청의 결과를 확인할 조회 경로 자체가 없었다.
 * 특히 거절은 24시간 만료 잡(identity-link-expiry.service.ts)의 대상도 아니다 —
 * 그 잡은 종결 이벤트(ATTESTED/REJECTED/EXPIRED)가 이미 있으면 no-op 하므로, 거절된
 * 요청은 만료 알림으로도 구제되지 않는 완전한 침묵이었다.
 *
 * 위 `writeIdentityAttestRequestNotifications`와 같은 이유로 games 쪽 tx 안에서 직접
 * V1Notification 을 쓰고(GamesModule → NotificationsServiceModule 순환 회피),
 * businessKey 로 (요청, 결정) 쌍마다 정확히 한 번만 배달한다. 승인·거절은 같은 요청을
 * 두 번 결정할 수 없으므로(attestIdentityLink 의 terminal 이벤트 가드) requestId 기준
 * businessKey 하나로 충분하다 — 재시도(idempotency REPLAY)에도 재알림하지 않는다.
 */
export type IdentityAttestDecisionPushPlan = {
  recipientUserId: string;
  title: string;
  body: string;
  url: string | null;
};

export async function writeIdentityAttestDecisionNotification(
  tx: Prisma.TransactionClient,
  input: {
    gameId: string;
    participantId: string;
    requestId: string;
    requesterUserId: string;
    decision: 'approve' | 'reject';
    reason?: string;
  },
): Promise<IdentityAttestDecisionPushPlan | null> {
  const game = await tx.v1Game.findUnique({
    where: { id: input.gameId },
    select: {
      sourceType: true,
      teamMatchId: true,
      tournamentFixture: { select: { id: true, tournamentId: true } },
    },
  });
  if (game === null) return null;

  const participant = await tx.v1GameParticipant.findFirst({
    where: { id: input.participantId, gameId: input.gameId },
    select: { displayNameSnapshot: true },
  });

  const isTournament = game.sourceType === 'TOURNAMENT_FIXTURE';
  const targetType = isTournament ? ('tournament' as const) : ('team_match' as const);
  const targetId = isTournament
    ? game.tournamentFixture
      ? `${game.tournamentFixture.tournamentId}:${game.tournamentFixture.id}`
      : null
    : game.teamMatchId;
  if (targetId === null) return null;

  // 선호도 필터 — 요청 알림과 동일하게 행이 없으면 기본 활성 취급.
  const preference = await tx.v1NotificationPreference.findUnique({
    where: { userId: input.requesterUserId },
    select: { activityEnabled: true, teamMatchEnabled: true },
  });
  const enabled = isTournament ? preference?.activityEnabled : preference?.teamMatchEnabled;
  if (enabled === false) return null;

  const type =
    input.decision === 'approve'
      ? isTournament
        ? ('tournament_identity_attest_approved' as const)
        : ('team_match_identity_attest_approved' as const)
      : isTournament
        ? ('tournament_identity_attest_rejected' as const)
        : ('team_match_identity_attest_rejected' as const);

  const copy = notificationCopyFor(type, targetType, targetId);
  const name = participant?.displayNameSnapshot ?? null;
  const body =
    input.decision === 'approve'
      ? name === null
        ? copy.defaultBody
        : `"${name}" 참가자 기록 연결이 승인됐어요. 이제 내 활동 기록에 이 경기가 표시돼요.`
      : name === null
        ? copy.defaultBody
        : `"${name}" 참가자 기록 연결 요청이 거절됐어요.${
            input.reason ? ` 사유: ${input.reason}` : ''
          } 다시 신청할 수 있어요.`;

  const businessKey = `identity-attest-decision:${input.requestId}:${input.requesterUserId}`;
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
  // 재시도로 이미 배달된 결정이면 푸시는 다시 보내지 않는다 (요청 알림 함수의 동일 원칙).
  if (existing !== null) return null;
  return { recipientUserId: input.requesterUserId, title: copy.title, body, url: copy.deepLink };
}
