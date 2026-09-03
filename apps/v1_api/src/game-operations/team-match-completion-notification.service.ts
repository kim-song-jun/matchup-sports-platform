import { Prisma } from '@prisma/client';
import { notificationCopyFor } from '../notifications/notifications.service';
import type { WebPushService } from '../notifications/web-push.service';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
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
 *
 * **리그 알림 문구 전용화(2026-08-25)**: 리그 대진(`teamMatch.leagueId !== null`)은
 * 일반 팀매치와 문구·딥링크가 다르다 — 일반 팀매치는 "완료됐어요, 리뷰를 남겨보세요"로
 * 후기 작성 화면으로 보내지만, 리그는 순위에 반영되는 "확정" 이벤트라 결과 영수증
 * 화면(`/team-matches/:id/result`)으로 보낸다. 이
 * 갈림은 `notifications.service.ts`의 `NotificationEventType`
 * `team_match_completed` vs `league_team_match_completed` 두 항목의 title/body/
 * deepLink와 정확히 같은 문구를 쓴다(그 파일이 단일 소스) — 여기서 문구를 고치면
 * 그 파일도 같은 커밋에서 고친다. 일반 팀매치 쪽 문구·링크는 이 갈림으로 인해
 * 한 글자도 바뀌지 않는다(기존 리비전 정정 재알림 회피 등 나머지 로직은 두 경로가
 * 공유한다 — businessKey 형식도 그대로: 팀매치 하나는 생애주기 내내 리그 아니면
 * 일반 중 하나로 고정이라 리그 여부로 businessKey 네임스페이스를 나눌 이유가 없다).
 *
 * **afterCommit 경계 (2026-08-27 감사 41/44)**: 이 project()는 워커의 outbox
 * 트랜잭션(`tx`) 안에서 돈다. 예전에는 `tx.v1Notification.createMany` 직후 같은
 * 스코프에서 바로 웹 푸시를 던졌는데, 그 뒤로도 handler가 대회 픽스처 프로젝션·
 * 워터마크 기록 등을 계속 이어가다 실패하면(리스 CAS 경합·데드락·트랜잭션 타임아웃)
 * 트랜잭션 전체가 롤백된다 — 이미 나간 푸시는 되돌릴 수 없으니 "확정되지 않은
 * 결과"의 "확정됐어요" 푸시가 팀장 폰에 남고, 재시도마다 alreadyDelivered 조회가
 * 롤백으로 다시 비어 있어 같은 푸시가 반복된다. identity-link-expiry.service.ts가
 * 이미 쓰는 `claim.afterCommit` 훅으로 옮겨 커밋이 실제로 확정된 뒤에만 나가게
 * 한다. `claim`은 옵셔널로 둔다 — 이 클래스를 직접 `new`해 project()를 호출하는
 * 유닛 스펙(claim 없이 (tx, revision) 두 인자만 넘김)은 그대로 컴파일되고, claim이
 * 없거나 claim.afterCommit이 없으면 즉시 발송으로 폴백해 기존 스펙의 동작을 보존한다.
 */
export class TeamMatchCompletionNotificationService {
  constructor(private readonly webPush?: WebPushService) {}

  async project(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    claim?: GameOperationClaim,
  ): Promise<void> {
    if (revision.sourceType !== 'TEAM_MATCH') return;

    const game = await tx.v1Game.findUnique({
      where: { id: revision.gameId },
      select: {
        teamMatchId: true,
        teamMatch: {
          select: { title: true, hostTeamId: true, approvedApplicantTeamId: true, leagueId: true },
        },
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

    const isLeagueFixture = teamMatch.leagueId !== null;
    // 제목·딥링크는 notifications.service.ts 의 단일 소스에서 읽는다 — 처음엔 여기 주석으로
    // "그 파일이 단일 소스다"라고만 적고 문자열을 복사해 뒀는데, 적대 리뷰가 그 복사본이
    // 컴파일·테스트 어느 것으로도 결속되지 않아 조용히 갈라질 수 있음을 지적했다.
    // body 만 동적(경기 제목 인용)이라 여기서 만든다 — 호출부 body 덮어쓰기는
    // notifications.service.ts 가 문서화한 관례다. Task 166 이 이의 경로를 없애면서
    // "N일 안에 이의를 제기할 수 있어요" 를 뺐다 — 없는 기능을 안내하면 안 된다.
    const copy = notificationCopyFor(
      isLeagueFixture ? 'league_team_match_completed' : 'team_match_completed',
      'team_match',
      teamMatchId,
    );
    const title = copy.title;
    const body = isLeagueFixture
      ? `"${teamMatch.title}" 경기 결과가 확정됐어요.`
      : `"${teamMatch.title}" 팀매치 리뷰를 남겨보세요.`;
    const deepLink = copy.deepLink;
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
      const send = () =>
        void this.webPush
          ?.sendToUser(userId, { title, body, url: deepLink ?? undefined })
          .catch(() => {
            // Best-effort — 실패해도 이미 커밋된 알림 row는 그대로 유지된다.
          });
      // 커밋 확정 뒤에만 보낸다(위 클래스 docblock 참조). claim이 없거나
      // afterCommit 훅이 없는 호출부(유닛 스펙)는 즉시 실행으로 폴백한다.
      if (claim?.afterCommit === undefined) {
        send();
      } else {
        claim.afterCommit.push(send);
      }
    }
  }
}
