import { Prisma } from '@prisma/client';
import type { WebPushService } from '../notifications/web-push.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';

/**
 * 리그 감사 그룹 A / R1: `team_match_completed` 알림 타입은
 * `notifications.service.ts`에 제목·본문·딥링크(라우팅)까지 이미 완성돼 있었는데, 그
 * 이벤트를 실제로 emit하는 프로덕션 호출부가 저장소 전체에 0건이었다(유일한 참조가
 * `notifications.service.spec.ts`의 단위 테스트 한 줄 — 실제로 아무도 부르지 않는 죽은
 * 이벤트였다). 팀장은 자기 팀의 팀매치가 "결과 확정"됐다는 사실을 앱을 스스로 열어
 * 확인하는 것 외엔 알 방법이 없었다.
 *
 * **리그 전용이 아니다.** `GameResultOfficialProjectionService.handler`는 TEAM_MATCH
 * 소스타입 게임 전부(리그 대진 + 일반 팀매치)를 통과하므로, 여기 걸면 둘 다 함께
 * 해결된다(sourceType이 TOURNAMENT_FIXTURE인 대회 픽스처에는 완전히 no-op).
 *
 * 알림 생성 관례는 `ScheduleReminderService.deliverDurableReminder`
 * (`jobs/schedule-reminders/schedule-reminder.service.ts`)의 W1 수정을 그대로 따른다:
 * `NotificationsService.emitNotification*()`는 별도 Prisma 커넥션에서 fire-and-forget으로
 * 도는 HTTP 요청 경로 전용이고, 이 워커의 outbox 트랜잭션(`tx`) 커밋 전에 알림 row가
 * 실제로 존재한다는 보장이 없다 — 그 메서드가 던져도 outbox 클레임은 COMPLETED로
 * 넘어갈 수 있어 알림이 조용히 유실될 수 있다. 그래서 여기서는 V1Notification row를
 * 캐스터의 `tx`로 직접 쓰고, `businessKey`로 (팀매치, 수신자) 쌍마다 정확히 한 번만
 * 배달되게 한다 — CORRECTION 리비전이 같은 팀매치를 다시 OFFICIAL로 만들어도(예:
 * 오심 정정) 재알림하지 않는다. "완료됐어요" 알림은 팀매치 생애주기에서 한 번만
 * 의미가 있다. Web Push는 그 이후 best-effort로 붙는다(실패해도 이미 커밋된
 * 알림 row는 그대로 유지된다).
 */
export class TeamMatchCompletionNotificationService {
  constructor(private readonly webPush?: WebPushService) {}

  async project(tx: Prisma.TransactionClient, revision: OfficialRevisionRow): Promise<void> {
    if (revision.sourceType !== 'TEAM_MATCH') return;

    const game = await tx.v1Game.findUnique({
      where: { id: revision.gameId },
      select: {
        teamMatchId: true,
        teamMatch: { select: { title: true, hostTeamId: true, approvedApplicantTeamId: true } },
      },
    });
    const teamMatchId = game?.teamMatchId ?? null;
    const teamMatch = game?.teamMatch ?? null;
    if (teamMatchId === null || teamMatch === null) return;

    const teamIds = [teamMatch.hostTeamId, teamMatch.approvedApplicantTeamId].filter(
      (id): id is string => id !== null,
    );
    if (teamIds.length === 0) return;

    const memberships = await tx.v1TeamMembership.findMany({
      where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    const recipients = [...new Set(memberships.map((m) => m.userId))];
    if (recipients.length === 0) return;

    // 선호도 필터: NotificationsService.createNotificationWithPrefCheck와 동일하게
    // 선호도 행이 없으면 기본 활성으로 취급한다.
    const preferences = await tx.v1NotificationPreference.findMany({
      where: { userId: { in: recipients } },
      select: { userId: true, teamMatchEnabled: true },
    });
    const teamMatchEnabledByUser = new Map(preferences.map((p) => [p.userId, p.teamMatchEnabled] as const));
    const enabledRecipients = recipients.filter((userId) => teamMatchEnabledByUser.get(userId) !== false);
    if (enabledRecipients.length === 0) return;

    const title = '팀매치가 완료됐어요. 리뷰를 남겨보세요!';
    const body = `"${teamMatch.title}" 팀매치 리뷰를 남겨보세요.`;
    // notifications.service.ts의 deepLinkForEvent가 'team_match_completed' 이벤트에
    // 이미 라우팅해 둔 것과 동일한 목적지 — 매치 상세가 아니라 리뷰 작성 화면으로 바로 보낸다.
    const deepLink = `/my/reviews/team_match/${teamMatchId}`;
    const businessKeyFor = (userId: string) => `team-match-completed:${teamMatchId}:${userId}`;

    const alreadyDelivered = await tx.v1Notification.findMany({
      where: { businessKey: { in: enabledRecipients.map(businessKeyFor) } },
      select: { businessKey: true },
    });
    const alreadyDeliveredKeys = new Set(alreadyDelivered.map((n) => n.businessKey));

    await tx.v1Notification.createMany({
      data: enabledRecipients.map((userId) => ({
        recipientUserId: userId,
        targetType: 'team_match' as const,
        targetId: teamMatchId,
        title,
        body,
        deepLink,
        businessKey: businessKeyFor(userId),
      })),
      skipDuplicates: true,
    });

    const newlyDelivered = enabledRecipients.filter((userId) => !alreadyDeliveredKeys.has(businessKeyFor(userId)));
    for (const userId of newlyDelivered) {
      void this.webPush
        ?.sendToUser(userId, { title, body, url: deepLink })
        .catch(() => {
          // Best-effort — 실패해도 이미 커밋된 알림 row는 그대로 유지된다.
        });
    }
  }
}
