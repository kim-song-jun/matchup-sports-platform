import { Prisma } from '@prisma/client';
import { Logger } from '@nestjs/common';
import type { WebPushService } from '../notifications/web-push.service';
import type { GameOperationClaim } from '../jobs/v1-game-operations-worker.service';
import type { OfficialRevisionRow } from './game-result-official-projection.types';
import { parseOfficialScore } from './parse-official-score';
import { findTournamentOnSurface, ALL_COMPETITION_KINDS } from '../tournaments/tournament-surface-lookup';

/**
 * 1차 대회 회고 REACH-4: 대회 알림은 등록·대기·취소·결제·공지·후기요청·수상까지
 * 실제로 발송되고, '경기 임박'도 lineup-reminder 워커가 커버하는데 — 정작
 * **"경기 결과가 확정됐어요"만 비어 있었다.** `TeamMatchCompletionNotificationService`
 * (리그 감사 R1)가 팀매치 쪽 같은 구멍을 메우면서 헤더에 "TOURNAMENT_FIXTURE에는
 * 완전히 no-op"이라고 스스로 문서화해 둔 그 갭이 이것이다. 참가팀 운영진은 확정
 * 여부를 앱을 스스로 열어 확인하는 것 외엔 알 방법이 없었다.
 *
 * 설계는 그 sibling 을 그대로 따른다(다른 점만 기록):
 * - 수신자: 양 참가팀의 owner/manager active 멤버십 — 임박 알림
 *   (`jobs/lineup-reminders`)과 같은 "팀 운영진 대상" 축이다. 로스터 전원이 아니다.
 * - 선호도: 대회 알림 7종+수상과 같은 `activityEnabled` 축
 *   (`preferenceFieldForEvent`의 tournament 그룹). 팀매치의 `teamMatchEnabled`가 아니다.
 * - businessKey는 (픽스처, 수신자) 쌍마다 한 번 — CORRECTION 리비전이 같은 픽스처를
 *   다시 OFFICIAL로 만들어도(오심 정정) 재알림하지 않는다. sibling과 같은 판단이다.
 * - 알림 row는 outbox 트랜잭션(`tx`)으로 직접 쓴다. `NotificationsService.emit*`는
 *   별도 커넥션 fire-and-forget이라 outbox 커밋과 원자성이 없다
 *   (sibling 헤더의 W1 관례 설명 참조). Web Push는 커밋 밖 best-effort.
 * - 본문에 확정 스코어를 싣는다. `parseOfficialScore`는 핸들러 선두에서 같은
 *   리비전으로 이미 성공한 뒤라 여기서 다시 던질 수 없다.
 *
 * **afterCommit 경계 (2026-08-27 감사 41/44)**: sibling(`TeamMatchCompletionNotificationService`)과
 * 같은 이유로 웹 푸시를 `claim.afterCommit`에 담아 커밋 확정 뒤에만 보낸다 — 자세한
 * 근거는 그 클래스의 docblock 참조. `claim`도 같은 이유로 옵셔널이다(유닛 스펙 폴백).
 */
export class TournamentFixtureCompletionNotificationService {
  private readonly logger = new Logger(TournamentFixtureCompletionNotificationService.name);

  constructor(private readonly webPush?: WebPushService) {}

  async project(
    tx: Prisma.TransactionClient,
    revision: OfficialRevisionRow,
    claim?: GameOperationClaim,
  ): Promise<void> {
    if (revision.sourceType !== 'TOURNAMENT_FIXTURE') return;
    if (revision.tournamentId === null || revision.tournamentFixtureId === null) return;

    const teamIds = [revision.homeTeamId, revision.awayTeamId].filter(
      (id): id is string => id !== null,
    );
    if (teamIds.length === 0) return;

    const memberships = await tx.v1TeamMembership.findMany({
      where: { teamId: { in: teamIds }, status: 'active', role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    const recipients = [...new Set(memberships.map((m) => m.userId))];
    if (recipients.length === 0) return;

    const preferences = await tx.v1NotificationPreference.findMany({
      where: { userId: { in: recipients } },
      select: { userId: true, activityEnabled: true },
    });
    const activityEnabledByUser = new Map(
      preferences.map((p) => [p.userId, p.activityEnabled] as const),
    );
    const enabledRecipients = recipients.filter(
      (userId) => activityEnabledByUser.get(userId) !== false,
    );
    if (enabledRecipients.length === 0) return;

    const [tournament, teams] = await Promise.all([
      // 좁혀 두면 리그 경기의 알림에서 대회명이 `'대회'` 로 폴백된다(아래 `?? '대회'`).
      // 기능이 아니라 **라벨**이 어긋나는 급이지만 조용히 틀리는 것은 같다.
      // 지금은 동작이 안 바뀐다 — 거울 행은 `V1TournamentFixture` 가 없다.
      // (docs/ops/read-swap-preflight.md §1-3)
      findTournamentOnSurface(tx, ALL_COMPETITION_KINDS, {
        where: { id: revision.tournamentId },
        select: { title: true },
      }),
      tx.v1Team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }),
    ]);
    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
    const homeName = (revision.homeTeamId !== null ? teamNameById.get(revision.homeTeamId) : undefined) ?? '홈팀';
    const awayName = (revision.awayTeamId !== null ? teamNameById.get(revision.awayTeamId) : undefined) ?? '원정팀';
    const score = parseOfficialScore(revision.score);
    const scoreline =
      score.penalties === undefined
        ? `${score.home}:${score.away}`
        : `${score.home}:${score.away} (승부차기 ${score.penalties.home}:${score.penalties.away})`;

    const title = '대회 경기 결과가 확정됐어요';
    // `?? '대회'` 는 조용한 폴백이다 — 위 조회를 `ALL_COMPETITION_KINDS` 로 넓혔으므로
    // 리그가 도달해도 제 이름이 나간다. 폴백 자체는 남긴다(행이 정말 없을 수 있다).
    const body = `${tournament?.title ?? '대회'} — ${homeName} ${scoreline} ${awayName} 결과가 공식 확정됐어요.`;
    const deepLink = `/tournaments/${revision.tournamentId}/matches/${revision.tournamentFixtureId}`;
    const businessKeyFor = (userId: string) =>
      `tournament-fixture-completed:${revision.tournamentFixtureId}:${userId}`;

    const alreadyDelivered = await tx.v1Notification.findMany({
      where: { businessKey: { in: enabledRecipients.map(businessKeyFor) } },
      select: { businessKey: true },
    });
    const alreadyDeliveredKeys = new Set(alreadyDelivered.map((n) => n.businessKey));

    await tx.v1Notification.createMany({
      data: enabledRecipients.map((userId) => ({
        recipientUserId: userId,
        targetType: 'tournament' as const,
        targetId: revision.tournamentId!,
        title,
        body,
        deepLink,
        businessKey: businessKeyFor(userId),
      })),
      skipDuplicates: true,
    });

    const newlyDelivered = enabledRecipients.filter(
      (userId) => !alreadyDeliveredKeys.has(businessKeyFor(userId)),
    );
    for (const userId of newlyDelivered) {
      const send = () =>
        void this.webPush
          ?.sendToUser(userId, { title, body, url: deepLink })
          .catch((error: unknown) => {
            // Best-effort — 실패해도 이미 커밋된 알림 row는 그대로 유지되지만,
            // 조용히 삼키면 sendToUser 내부 실패(조회·전송)를 추적할 수 없다
            // (이 저장소의 silent-catch 안티패턴 규칙). warn 한 줄은 남긴다.
            this.logger.warn(
              `web push failed for tournament fixture completion (fixture=${revision.tournamentFixtureId}): ${String(error)}`,
            );
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
