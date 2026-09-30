import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1NotificationTargetType } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { V1AuthUser } from '../auth/v1-auth-user';
import { isQuietHour, nightPushAllowed } from '../common/quiet-hours';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationsQueryDto,
  ReadAllNotificationsDto,
  UpdateNotificationPreferencesDto,
} from './dto/notifications.dto';
import { REALTIME_NOTIFIER, RealtimeNotifierPort } from './realtime-notifier.port';
import { WebPushService } from './web-push.service';

/** Notification event types emitted by domain services. */
export type NotificationEventType =
  | 'match_application_received'
  | 'match_application_approved'
  | 'match_application_rejected'
  | 'match_cancelled'
  | 'match_closed'
  | 'match_completed'
  | 'team_join_application_received'
  | 'team_join_application_accepted'
  | 'team_join_application_rejected'
  | 'team_match_application_received'
  | 'team_match_application_withdrawn'
  | 'team_match_application_approved'
  | 'team_match_application_rejected'
  | 'team_match_closed'
  | 'team_match_cancelled'
  | 'team_match_completed'
  | 'tournament_registration_confirmed'
  | 'tournament_registration_waitlisted'
  | 'tournament_registration_cancelled'
  | 'tournament_registration_submitted'
  | 'tournament_record_consent_invite'
  | 'tournament_payment_confirmed'
  | 'tournament_announcement_published'
  | 'tournament_completed_review_request'
  /**
   * 대회 개인 수상자 본인에게 보내는 알림. 1차 대회(2026-08-15~16) 회고
   * "시상식에 딱 1,2,3등 팀만 남음" — 실은 통지 문제였다. 수상자가 저장돼도
   * 본인이 알 방법이 없어서, 자리를 뜬 사람은 자기가 받았다는 사실조차 몰랐다.
   */
  | 'tournament_award_received'
  | 'team_invitation_received'
  | 'team_invitation_accepted'
  // 팀 역할 변경(Task 180 H1-roles): 바뀐 본인에게, 팀장이 바뀌면 나머지 매니저에게도.
  | 'team_manager_assigned'
  | 'team_manager_revoked'
  | 'team_owner_received'
  | 'team_owner_changed'
  // 내보내진 본인에게(이유는 싣지 않는다) — Task 180 H1-removed.
  | 'team_membership_removed'
  // 스스로 나간 멤버를 팀장·매니저에게(H1-left). 팀 채팅의 '나갔어요' 줄은 chat-system-line.ts 가 쓴다.
  | 'team_member_left'
  // 초대한 사람에게(H1-invite-declined). 이유·다시 초대 권유는 싣지 않는다.
  | 'team_invitation_declined'
  // 팀 일정 생성·취소(H1-schedule-*). 워커(jobs/schedule-reminders)가 outbox 로 받아 쓴다 — targetId "${teamId}:${scheduleId}".
  | 'team_schedule_created'
  | 'team_schedule_cancelled'
  | 'team_contact_received'
  | 'team_contact_accepted'
  | 'team_contact_declined'
  | 'inquiry_answered'
  // Task 12, reminders lane: fired by the durable worker (jobs/schedule-reminders/schedule-reminder.service.ts)
  // once the reminder's outbox row (inserted by TeamSchedulesService.triggerReminder) is claimed.
  // (P1-4 fix: 'schedule_guest_application_received' — the interactive, GuestRecruitmentService-
  // emitted sibling of these two — was removed from this union entirely. That event's own delivery
  // moved to the same durable-outbox-worker pattern as these two (see
  // guest-recruitment.service.ts's createApplication and schedule-reminder.service.ts's new
  // guestApplicationManagerNotificationHandler), so nothing calls emitNotification*() with it
  // anymore; keeping a permanently-unreachable literal (and its EVENT_TITLES/EVENT_BODIES/
  // preferenceFieldForEvent/targetTypeForEvent entries) around would have been exactly the kind of
  // tech debt this repo's Core Engineering Principle #1 forbids leaving behind.)
  | 'schedule_rsvp_deadline_reminder'
  | 'schedule_guest_recruitment_close_reminder'
  // 리그 감사 그룹 A / R2, R3: 리그 생애주기 알림. 팀에 리그 대진이 배정된 순간과
  // 승격·강등·잔류가 확정된 순간을 팀장에게 알린다(league-match-admin.service.ts,
  // league-series-admin.service.ts). 결과 확정(team_match_completed)은 리그 전용이 아니라서
  // 이 그룹에 넣지 않았다 — 위 team_match_completed 항목이 이미 있다.
  | 'league_fixture_scheduled'
  // 그룹 B 감사 결함 4: 팀 제외(removeTeam)·대진 단건 취소(cancelFixture)·재생성
  // (regenerateFixtures)로 예정 대진이 취소되면 관련 팀(들)의 owner/manager에게 알린다.
  // 이전에는 이 세 경로 모두 알림이 전혀 없었다 — 일반 팀매치 취소(team_match_cancelled)와
  // 달리 리그 대진은 leagueId가 있으면 team-matches.service.ts의 cancel()이 하드 거부하므로
  // (LEAGUE_FIXTURE_HOST_CANCEL_FORBIDDEN) 그 알림 코드에 절대 도달하지 못했다.
  | 'league_fixture_cancelled'
  | 'league_promotion_promoted'
  | 'league_promotion_relegated'
  | 'league_promotion_stayed'
  | 'league_promotion_withdrawn'
  // 리그 알림 문구 전용화(2026-08-25): 위 team_match_completed는 일반 팀매치 문구
  // ("팀매치가 완료됐어요. 리뷰를 남겨보세요!")로 고정돼 있어 리그 대진에는 맞지 않는다
  // (리그는 순위에 반영되는 확정 결과지, 리뷰를 남기는 흐름이 아니다 — Task 166 이
  // 이의 경로를 없애면서 "이의 제기 기간" 서술도 함께 정정했다).
  // team-match-completion-notification.service.ts가 leagueId 유무로 갈라 이 타입과
  // team_match_completed 중 하나를 골라 쓴다 — 실제 발송은 그 파일이 outbox tx 안에서
  // 직접 V1Notification을 쓰므로(top of team-match-completion-notification.service.ts
  // 참조) 여기 title/deepLink는 그 문구의 단일 소스다. 본문은 스코어·승패·개인 기록이 받는
  // 사람마다 달라 game-operations/official-result-notice.ts 가 조립한다(Task 180 G7).
  | 'league_team_match_completed'
  // 대회 경기 결과 확정(tournament-fixture-completion-notification.service.ts). targetId 는
  // "${tournamentId}:${teamMatchId}" 복합 — 경기 상세가 2계층 경로라서다.
  | 'tournament_match_completed'
  // 경기 전 알림(Task 180 G7): 출전자에게 전날 한 번(대회·리그 팀장·매니저는 기존 "명단 확인"을 받는다),
  // 킥오프 2시간 전에 출전자와 팀장·매니저에게 한 번. 발송은 jobs/lineup-reminders 워커가 tx 로 직접 쓴다.
  // 대회 경기는 targetType 'tournament' + "${tournamentId}:${teamMatchId}", 나머지는 'team_match' + teamMatchId.
  | 'game_day_before_reminder'
  | 'game_kickoff_reminder'
  // 내 기록 연결(claim) 승인 요청 (2026-08-26, attest UI C안): 신청이 들어오면 확인자
  // 후보에게 알린다 — 요청이 24시간 뒤 만료되는데 알림 없이는 확인자가 신청 사실
  // 자체를 알 수 없었다. 소스별로 딥링크·게이트가 달라 두 타입으로 나눈다.
  // 발송은 games/identity-attest-notification.ts 가 tx 안에서 V1Notification 을 직접
  // 쓴다(team-match-completion-notification.service.ts 선례 — GamesModule 이
  // NotificationsServiceModule 을 import 하면 RealtimeModule 경유 순환이 생겨서다).
  // 여기 title/body/deepLink 는 그 문구의 단일 소스다.
  | 'team_match_identity_attest_requested'
  | 'tournament_identity_attest_requested'
  // 만료 통보(2026-08-26): 24시간 안에 아무도 확인하지 않으면 **신청자에게** 알린다.
  // 예전에는 만료가 다음 attest 시도 때에야 기록되는 lazy 처리라, 신청자는 자기 요청이
  // 끝났는지 알 방법이 없었다(화면에서도 조용히 사라진다). 예약 잡
  // (jobs/identity-link/identity-link-expiry.service.ts)이 발송한다.
  | 'team_match_identity_attest_expired'
  | 'tournament_identity_attest_expired'
  // 승인/거절 결정 통보(2026-08-27 감사 결함 수정): attestIdentityLink 가 REQUESTED 를
  // ATTESTED/REJECTED 로 종결해도 신청자에게는 어떤 알림도 나가지 않았다 — 승인함
  // 목록도 `event.userId !== user.id` 로 신청자 본인을 명시적으로 제외해서 신청자가
  // 자기 요청의 결과를 확인할 방법 자체가 없었다. 특히 거절은 만료 잡(위 *_expired)의
  // 대상도 아니라서(종결 이벤트가 이미 있으면 lazy expiry 가 no-op) 완전한 침묵이었다.
  // 발송은 games/identity-attest-notification.ts 가 attestIdentityLink 의 같은 tx 안에서
  // V1Notification 을 직접 쓴다(위 *_requested 와 동일한 이유·패턴).
  | 'team_match_identity_attest_approved'
  | 'tournament_identity_attest_approved'
  | 'team_match_identity_attest_rejected'
  | 'tournament_identity_attest_rejected';

/** V1NotificationPreference 컬럼 중 이벤트 발송을 게이트하는 필드들. */
type NotificationPrefField = keyof Pick<
  {
    matchEnabled: boolean;
    teamEnabled: boolean;
    teamMatchEnabled: boolean;
    chatEnabled: boolean;
    activityEnabled: boolean;
    importantEnabled: boolean;
    noticeEnabled: boolean;
    marketingEnabled: boolean;
  },
  'matchEnabled' | 'teamEnabled' | 'teamMatchEnabled' | 'activityEnabled' | 'importantEnabled'
>;

/**
 * 밤(KST 21~9시)에는 알림함에만 쌓고 푸시를 보내지 않는 축 — 팀·팀매치 사건 알림(Task 180 H1-night).
 * 아침에 몰아 보내지 않는다. 그 밤이 끝나기 전에 시작하는 일정·경기에 관한 알림만 예외로 밤에도 푸시한다.
 */
const NIGHT_HELD_PREF_FIELDS: ReadonlySet<NotificationPrefField> = new Set(['teamEnabled', 'teamMatchEnabled']);

/** 팀 멤버십이 바뀐 사건 알림(Task 180 H1). targetType 'team' · targetId teamId · 수신 설정 teamEnabled. */
const TEAM_MEMBERSHIP_EVENTS: ReadonlySet<NotificationEventType> = new Set([
  'team_manager_assigned',
  'team_manager_revoked',
  'team_owner_received',
  'team_owner_changed',
  'team_membership_removed',
  'team_member_left',
  'team_invitation_declined',
]);

/** targetId 가 "${teamId}:${scheduleId}" 인 일정 알림 — 야간 예외 판정에 일정 시작 시각을 읽는다. */
const SCHEDULE_TARGET_EVENTS: ReadonlySet<NotificationEventType> = new Set([
  'schedule_rsvp_deadline_reminder',
  'schedule_guest_recruitment_close_reminder',
  'team_schedule_created',
  'team_schedule_cancelled',
]);

/**
 * 문구 표(EVENT_TITLES·EVENT_BODIES)의 `{name}` 같은 자리에 들어갈 값. 호출부는 값만 넘기고 문장은 표가 정한다.
 * 채우지 못한 자리가 남으면 그 알림은 만들지 않는다(`{team}` 이 사용자에게 보이면 안 된다).
 */
export type NotificationCopyVars = Readonly<
  Partial<Record<'name' | 'team' | 'count' | 'others' | 'title' | 'when' | 'reason' | 'matchup', string>>
>;

export interface NotificationEmitOptions {
  readonly vars?: NotificationCopyVars;
}

/** 알림 문구에 넣을 사람 이름 — 화면의 멤버 목록과 같은 우선순위(닉네임 → 표시 이름). */
export function notificationPersonName(profile: { nickname: string | null; displayName: string | null } | null | undefined): string {
  return profile?.nickname ?? profile?.displayName ?? '팀원';
}

export function renderNotificationCopy(template: string, vars: NotificationCopyVars = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = vars[key as keyof NotificationCopyVars];
    if (value === undefined) throw new Error(`notification copy var missing: ${key}`);
    return value;
  });
}

/** Preference field in V1NotificationPreference that gates the event type. */
function preferenceFieldForEvent(type: NotificationEventType): NotificationPrefField {
  // 사용자가 직접 접수한 1:1 문의의 답변은 놓치면 안 되는 알림이므로
  // 활동 알림(activityEnabled)이 아니라 중요 알림(importantEnabled)으로 게이트한다.
  if (type === 'inquiry_answered') {
    return 'importantEnabled';
  }
  if (
    type === 'match_application_received' ||
    type === 'match_application_approved' ||
    type === 'match_application_rejected' ||
    type === 'match_cancelled' ||
    type === 'match_closed' ||
    type === 'match_completed'
  ) {
    return 'matchEnabled';
  }
  if (TEAM_MEMBERSHIP_EVENTS.has(type)) return 'teamEnabled';
  if (
    type === 'team_join_application_received' ||
    type === 'team_join_application_accepted' ||
    type === 'team_join_application_rejected' ||
    type === 'team_invitation_received' ||
    type === 'team_invitation_accepted' ||
    SCHEDULE_TARGET_EVENTS.has(type) ||
    type === 'team_contact_received' ||
    type === 'team_contact_accepted' ||
    type === 'team_contact_declined'
  ) {
    return 'teamEnabled';
  }
  if (
    type === 'team_match_application_received' ||
    type === 'team_match_application_withdrawn' ||
    type === 'team_match_application_approved' ||
    type === 'team_match_application_rejected' ||
    type === 'team_match_closed' ||
    type === 'team_match_cancelled' ||
    type === 'team_match_completed' ||
    type === 'league_fixture_scheduled' ||
    type === 'league_fixture_cancelled' ||
    type === 'league_team_match_completed' ||
    type === 'game_day_before_reminder' ||
    type === 'game_kickoff_reminder' ||
    type === 'team_match_identity_attest_requested' ||
    type === 'team_match_identity_attest_expired' ||
    type === 'team_match_identity_attest_approved' ||
    type === 'team_match_identity_attest_rejected'
  ) {
    return 'teamMatchEnabled';
  }
  if (
    type === 'tournament_registration_confirmed' ||
    type === 'tournament_registration_waitlisted' ||
    type === 'tournament_registration_cancelled' ||
    type === 'tournament_registration_submitted' ||
    type === 'tournament_record_consent_invite' ||
    type === 'tournament_payment_confirmed' ||
    type === 'tournament_announcement_published' ||
    type === 'tournament_completed_review_request' ||
    // 수상 알림도 대회 활동이다 — 나머지 대회 알림 7종과 같은 축으로 게이트한다.
    // importantEnabled 는 "놓치면 안 되는 1:1 문의 답변" 전용이라 성격이 다르고,
    // 새 preference 컬럼을 만들면 마이그레이션이 붙는데 그럴 이유가 없다.
    type === 'tournament_award_received' ||
    type === 'tournament_match_completed' ||
    // 신원 연결 승인 요청·만료·승인·거절(대회 판)도 대회 활동 축이다.
    type === 'tournament_identity_attest_requested' ||
    type === 'tournament_identity_attest_expired' ||
    type === 'tournament_identity_attest_approved' ||
    type === 'tournament_identity_attest_rejected'
  ) {
    return 'activityEnabled';
  }
  // league_promotion_* — 특정 경기가 아니라 팀의 시즌 소속(승격/강등/잔류) 자체가 바뀌는
  // 이벤트라 teamMatchEnabled가 아니라 team_join/invitation과 같은 teamEnabled로 게이트한다.
  if (
    type === 'league_promotion_promoted' ||
    type === 'league_promotion_relegated' ||
    type === 'league_promotion_stayed' ||
    type === 'league_promotion_withdrawn'
  ) {
    return 'teamEnabled';
  }
  return 'activityEnabled';
}

function targetTypeForEvent(type: NotificationEventType): V1NotificationTargetType {
  if (type === 'inquiry_answered') {
    return 'inquiry';
  }
  if (
    type === 'match_application_received' ||
    type === 'match_application_approved' ||
    type === 'match_application_rejected' ||
    type === 'match_cancelled' ||
    type === 'match_closed' ||
    type === 'match_completed'
  ) {
    return 'match';
  }
  // team_contact_* — 컨택 = 채팅방(스펙 §1 결정 1). targetId 가 이제 contactId 가 아니라
  // roomId 라 targetType 도 'team' 이 아니라 'chat' 이어야 GET /chat/rooms/:id 로 바로
  // 이어진다(팀 목록/상세 API 는 아래 §3.2 에서 삭제됨). 'team' 분기보다 먼저 검사한다.
  if (
    type === 'team_contact_received' ||
    type === 'team_contact_accepted' ||
    type === 'team_contact_declined'
  ) {
    return 'chat';
  }
  if (
    TEAM_MEMBERSHIP_EVENTS.has(type) ||
    type === 'team_join_application_received' ||
    type === 'team_join_application_accepted' ||
    type === 'team_join_application_rejected' ||
    type === 'team_invitation_received' ||
    type === 'team_invitation_accepted' ||
    SCHEDULE_TARGET_EVENTS.has(type)
  ) {
    return 'team';
  }
  if (
    type === 'tournament_registration_confirmed' ||
    type === 'tournament_registration_waitlisted' ||
    type === 'tournament_registration_cancelled' ||
    type === 'tournament_registration_submitted' ||
    type === 'tournament_record_consent_invite' ||
    type === 'tournament_payment_confirmed' ||
    type === 'tournament_announcement_published' ||
    type === 'tournament_completed_review_request' ||
    type === 'tournament_award_received' ||
    type === 'tournament_match_completed' ||
    // targetId 는 "${tournamentId}:${fixtureId}" 복합 문자열 — 경기 상세가 2계층 경로라서다.
    // schedule_rsvp_deadline_reminder 의 기존 복합 targetId 선례를 따르고, 딥링크는
    // deepLinkForEvent 에서 명시적으로 파싱한다.
    type === 'tournament_identity_attest_requested' ||
    type === 'tournament_identity_attest_expired' ||
    type === 'tournament_identity_attest_approved' ||
    type === 'tournament_identity_attest_rejected'
  ) {
    return 'tournament';
  }
  // league_promotion_* — 새 V1NotificationTargetType 값을 추가하려면 마이그레이션이
  // 필요하다(DB enum). 기존 'team' 타입으로 의미가 충분하다: 승격/강등/잔류는 결국
  // "이 팀의 시즌 소속이 바뀌었다"는 팀 단위 사실이라 team_join/invitation과 같은 부류다.
  // 실제 목적지(리그 상세 페이지)는 deepLinkForEvent에서 targetType과 무관하게
  // 명시적으로 오버라이드한다(team_contact_* 항목의 기존 선례와 동일한 패턴).
  if (
    type === 'league_promotion_promoted' ||
    type === 'league_promotion_relegated' ||
    type === 'league_promotion_stayed' ||
    type === 'league_promotion_withdrawn'
  ) {
    return 'team';
  }
  // league_fixture_scheduled/league_fixture_cancelled도 여기 fallthrough로 떨어진다 —
  // 팀매치(리그 대진) 배정·취소 이벤트라 'team_match'가 맞다. targetId는 리그당 배치
  // 발송이라 leagueId를 쓴다(특정 team_match id가 아니라 리그 전체를 가리킴 —
  // deepLinkForEvent에서 명시적으로 처리한다).
  // league_team_match_completed(리그 알림 문구 전용화)도 여기로 떨어진다 — 특정
  // 팀매치(경기)에 대한 것이라 같은 이유로 'team_match'이고, targetId 로 teamMatchId 를
  // 그대로 쓴다.
  return 'team_match';
}

/**
 * Maps a notification targetType to its consumer route base. Naive pluralization
 * (`targetType + 's'`) breaks for 'match'/'team_match' → '/matchs'/'/team-matchs',
 * so map explicitly to the real Next.js routes.
 */
const ROUTE_BASE_BY_TARGET_TYPE: Partial<Record<V1NotificationTargetType, string>> = {
  match: '/matches',
  team: '/teams',
  team_match: '/team-matches',
  tournament: '/tournaments',
  inquiry: '/my/inquiries',
};

function deepLinkForTarget(
  targetType: V1NotificationTargetType,
  targetId: string | null,
): string | null {
  if (!targetId) return null;
  const base = ROUTE_BASE_BY_TARGET_TYPE[targetType] ?? `/${targetType.replace(/_/g, '-')}s`;
  return `${base}/${targetId}`;
}

/**
 * 알림 문구·딥링크의 단일 소스 조회 — NotificationsService 를 거치지 않고 자체
 * 트랜잭션 안에서 v1_notifications 에 직접 쓰는 발송 경로(아웃박스 핸들러 등)가
 * 문구를 **복사하지 않고 여기서 읽게** 하기 위해 둔다. 적대 리뷰(2026-08-25)가
 * league_team_match_completed 의 문구가 테이블과 발송 경로에 두 벌로 존재해
 * 조용히 갈라질 수 있음을 지적했다 — 이 헬퍼가 그 두 번째 사본을 없앤다.
 * body 는 호출부가 동적 본문(경기 제목 인용 등)으로 덮는 관례라 기본값만 준다.
 */
export function notificationCopyFor(
  type: NotificationEventType,
  targetType: V1NotificationTargetType,
  targetId: string | null,
  vars?: NotificationCopyVars,
): { title: string; defaultBody: string; deepLink: string | null } {
  return {
    title: renderNotificationCopy(EVENT_TITLES[type], vars),
    defaultBody: renderNotificationCopy(EVENT_BODIES[type], vars),
    deepLink: deepLinkForEvent(type, targetType, targetId),
  };
}

/** 초대받은 사람이 수락·거절하는 내 초대함. 초대 도착 알림의 도착지이자, 그 알림을 찾는 열쇠다. */
const TEAM_INVITATION_INBOX_LINK = '/my/invitations';

function deepLinkForEvent(
  type: NotificationEventType,
  targetType: V1NotificationTargetType,
  targetId: string | null,
): string | null {
  if (type === 'team_join_application_received' && targetId) {
    return `/teams/${targetId}/members?tab=requests`;
  }
  if (type === 'team_invitation_declined' && targetId) {
    return `/teams/${targetId}/members?tab=invitations`;
  }
  // 새 팀장·나간 멤버 알림은 멤버 관리(멤버 탭)로 — 나머지 역할 알림은 기본 팀 상세로 간다.
  if ((type === 'team_owner_received' || type === 'team_member_left') && targetId) {
    return `/teams/${targetId}/members`;
  }
  // 초대받은 사람이 수락·거절하는 곳은 팀 상세가 아니라 내 초대함이다. targetId 는 팀 id 그대로다.
  if (type === 'team_invitation_received') {
    return TEAM_INVITATION_INBOX_LINK;
  }
  // team_contact_* — 컨택 = 채팅방(스펙 §1 결정 1). targetId 는 이제 contactId 가 아니라
  // roomId 다(TeamContactsService.notifyTeamManagers 가 roomId 를 넘긴다). targetType 도
  // 'chat' 으로 바뀌었지만 ROUTE_BASE_BY_TARGET_TYPE 에 'chat' 항목이 없어 폴백하면
  // `/${targetType}s` = '/chats' 라는 404 링크가 만들어진다 — 명시적으로 보낸다.
  if (
    (type === 'team_contact_received' ||
      type === 'team_contact_accepted' ||
      type === 'team_contact_declined') &&
    targetId
  ) {
    return `/chat/${targetId}`;
  }
  // 완료 알림은 본문이 "리뷰를 남겨보세요!"인데 링크는 매치 상세로 보내고 있었다 — 그 화면엔
  // 후기 CTA가 없어서 알림을 눌러도 후기를 쓸 수 없는 막다른 길이었다. 작성 화면으로 바로 보낸다.
  if (type === 'match_completed' && targetId) {
    return `/my/reviews/match/${targetId}`;
  }
  if (type === 'team_match_completed' && targetId) {
    return `/my/reviews/team_match/${targetId}`;
  }
  // 대회 후기는 상호 후기(/my/reviews)가 아니라 대회별 시상·후기 화면에서 쓴다.
  if (
    (type === 'tournament_completed_review_request' || type === 'tournament_award_received') &&
    targetId
  ) {
    return `/tournaments/${targetId}/awards`;
  }
  // 기록 공개 동의 안내는 대회 상세가 아니라 동의를 실제로 켤 수 있는 화면으로 보낸다 --
  // 대회 상세로 보내면 알림을 눌러도 동의를 켤 방법이 없는 막다른 길이 된다
  // (match_completed 가 같은 이유로 후기 작성 화면으로 가는 것과 같은 판단).
  if (type === 'tournament_record_consent_invite') {
    // 동의를 켤 수 있는 화면으로 보내되, 어느 대회 때문에 왔는지도 실어 보낸다 --
    // 설정 화면은 원래 맥락 없는 토글이라, 알림에서 온 사람에게 "왜 지금 이걸 보고
    // 있는지" 를 설명해 줄 근거가 없으면 그냥 나가버린다. 착지 화면이 이 값으로
    // 대회 이름을 띄운다. targetId 가 없으면 파라미터 없이 기본 화면으로 간다.
    return targetId
      ? `/my/settings/record-consent?from=tournament&tournamentId=${encodeURIComponent(targetId)}`
      : '/my/settings/record-consent';
  }
  // Task 12, reminders lane: targetId is the compound "${teamId}:${scheduleId}" string (see
  // schedule-reminder.service.ts) — parsed only here, never used for authorization anywhere in
  // this service.
  if (SCHEDULE_TARGET_EVENTS.has(type) && targetId) {
    const [teamId, scheduleId] = targetId.split(':');
    if (teamId && scheduleId) {
      return `/teams/${teamId}/schedules/${scheduleId}`;
    }
  }
  // 신원 연결 승인 요청·승인·거절(대회 판): targetId 는 "${tournamentId}:${fixtureId}" 복합 —
  // 승인 카드/내 연결 상태가 실리는 경기 상세로 보낸다(위 schedule 복합 targetId 와 같은 패턴).
  // 팀매치·리그 판(team_match_identity_attest_*)은 기본 /team-matches/:id 로 충분하다 —
  // 리그 대진이면 그 라우트의 서버 redirect 가 리그 경기 상세로 보낸다.
  if (
    (type === 'tournament_identity_attest_requested' ||
      type === 'tournament_identity_attest_expired' ||
      type === 'tournament_identity_attest_approved' ||
      type === 'tournament_identity_attest_rejected' ||
      type === 'tournament_match_completed') &&
    targetId
  ) {
    const [tournamentId, fixtureId] = targetId.split(':');
    if (tournamentId && fixtureId) {
      return `/tournaments/${tournamentId}/matches/${fixtureId}`;
    }
  }
  // league_fixture_scheduled/league_promotion_* 는 targetType이 'team_match'/'team'이라
  // ROUTE_BASE_BY_TARGET_TYPE 기본값을 쓰면 각각 /team-matches/{leagueId}, /teams/{leagueId}
  // 로 잘못 라우팅된다(targetId가 team_match/team의 id가 아니라 leagueId이기 때문 —
  // team_contact_* 항목의 기존 선례와 동일한 이유). 리그 상세 화면으로 명시적으로 보낸다.
  if (
    (type === 'league_fixture_scheduled' ||
      type === 'league_fixture_cancelled' ||
      type === 'league_promotion_promoted' ||
      type === 'league_promotion_relegated' ||
      type === 'league_promotion_stayed' ||
      type === 'league_promotion_withdrawn') &&
    targetId
  ) {
    return `/league-matches/${targetId}`;
  }
  // 리그 알림 문구 전용화(2026-08-25): 결과 확정/이의 접수/이의 처리 4종은 전부 결과
  // 결과 영수증 화면(경기 상세가 아니라 확정된 결과를 보여주는 화면)으로 보낸다 —
  // team-match-completion-notification.service.ts 가 이 문자열을 직접 구성할 때도 같은
  // 목적지를 쓴다(단일 소스 동기화 대상). Task 166 이 이의 알림 4종을 없애 남은 것은
  // 완료 알림 하나다.
  if (type === 'league_team_match_completed' && targetId) {
    return `/team-matches/${targetId}/result`;
  }
  // 경기 전 알림은 받는 사람 누구나 열 수 있는 공개 경기 상세로 보낸다. /team-matches/:id 는 리그 대진이면
  // 리그 경기 상세로 서버 redirect 된다. 대회 경기는 복합 targetId 를 파싱한다(위 신원 연결 알림과 같은 패턴).
  if ((type === 'game_day_before_reminder' || type === 'game_kickoff_reminder') && targetId) {
    if (targetType !== 'tournament') return `/team-matches/${targetId}`;
    const [tournamentId, teamMatchId] = targetId.split(':');
    if (tournamentId && teamMatchId) return `/tournaments/${tournamentId}/matches/${teamMatchId}`;
  }
  return deepLinkForTarget(targetType, targetId);
}

const EVENT_TITLES: Record<NotificationEventType, string> = {
  match_application_received: '매치 신청이 도착했어요',
  match_application_approved: '매치 신청이 승인됐어요',
  match_application_rejected: '매치 신청이 거절됐어요',
  match_cancelled: '매치가 취소됐어요',
  match_closed: '매치 모집이 마감됐어요',
  match_completed: '매치가 완료됐어요. 리뷰를 남겨보세요!',
  team_join_application_received: '{name}님이 가입을 신청했어요',
  team_join_application_accepted: '팀 가입 신청이 수락됐어요',
  team_join_application_rejected: '팀 가입 신청이 거절됐어요',
  team_contact_received: '새 팀 컨택이 도착했어요',
  team_contact_accepted: '팀 컨택이 수락됐어요',
  team_contact_declined: '팀 컨택이 거절됐어요',
  team_match_application_received: '팀매치 신청이 도착했어요',
  team_match_application_withdrawn: '팀매치 신청이 취소됐어요',
  team_match_application_approved: '팀매치 신청이 승인됐어요',
  team_match_application_rejected: '팀매치 신청이 거절됐어요',
  team_match_closed: '팀매치 모집이 마감됐어요',
  team_match_cancelled: '팀매치가 취소됐어요',
  team_match_completed: '팀매치가 완료됐어요. 리뷰를 남겨보세요!',
  tournament_completed_review_request: '대회가 끝났어요. 후기를 남겨주세요!',
  tournament_award_received: '수상을 축하해요! 🏆',
  tournament_registration_confirmed: '대회 참가가 확정됐어요',
  tournament_registration_waitlisted: '대기자 명단에 등록됐어요',
  tournament_registration_cancelled: '대회 참가가 취소됐어요',
  tournament_registration_submitted: '대회 신청이 접수됐어요',
  tournament_record_consent_invite: '내 경기 기록을 공개할까요?',
  tournament_payment_confirmed: '입금이 확인됐어요',
  tournament_announcement_published: '대회 공지가 올라왔어요',
  team_invitation_received: '팀 초대가 도착했어요',
  team_invitation_accepted: '{name}님이 초대를 수락했어요',
  team_manager_assigned: '매니저가 되었어요',
  team_manager_revoked: '매니저에서 멤버로 바뀌었어요',
  team_owner_received: '팀장이 되었어요',
  team_owner_changed: '팀장이 바뀌었어요',
  team_membership_removed: '팀에서 제외됐어요',
  team_member_left: '{name}님이 팀을 나갔어요',
  team_invitation_declined: '{name}님이 초대를 거절했어요',
  team_schedule_created: '새 일정이 올라왔어요',
  team_schedule_cancelled: '일정이 취소됐어요',
  inquiry_answered: '문의에 답변이 등록됐어요',
  schedule_rsvp_deadline_reminder: '참석 여부를 알려주세요',
  schedule_guest_recruitment_close_reminder: '용병 모집이 곧 마감돼요',
  league_fixture_scheduled: '리그 대진이 확정됐어요',
  league_fixture_cancelled: '리그 대진이 취소됐어요',
  league_promotion_promoted: '축하해요! 다음 시즌 상위 리그로 승격했어요',
  league_promotion_relegated: '다음 시즌 하위 리그로 강등됐어요',
  league_promotion_stayed: '다음 시즌에도 같은 리그예요',
  league_promotion_withdrawn: '리그 참가가 종료됐어요',
  league_team_match_completed: '경기 결과가 확정됐어요',
  tournament_match_completed: '대회 경기 결과가 확정됐어요',
  // 발송 경로가 앞에 "9/30 (수) 01:10 " 을 붙인다 — 자정을 넘긴 경기가 "내일"로 읽히지 않게 날짜를 쓴다.
  game_day_before_reminder: '경기가 있어요',
  game_kickoff_reminder: '2시간 뒤 경기가 시작돼요',
  team_match_identity_attest_requested: '기록 연결 승인 요청이 도착했어요',
  tournament_identity_attest_requested: '기록 연결 승인 요청이 도착했어요',
  team_match_identity_attest_expired: '기록 연결 요청이 만료됐어요',
  tournament_identity_attest_expired: '기록 연결 요청이 만료됐어요',
  team_match_identity_attest_approved: '기록 연결이 승인됐어요',
  tournament_identity_attest_approved: '기록 연결이 승인됐어요',
  team_match_identity_attest_rejected: '기록 연결이 거절됐어요',
  tournament_identity_attest_rejected: '기록 연결이 거절됐어요',
};

/**
 * 알림 본문(body) 기본값 — 호출부가 body를 넘기지 않아도 항상 title+body 구조를 보장하는 fallback.
 * 문체 규칙: 상태 통보성 이벤트(신청 승인/거절/취소 등 이미 벌어진 일을 알림)는 평서형("~됐어요.")을,
 * 사용자 행동이 필요한 이벤트(입금 확인 대기, 신청 검토, 공지 확인 등)는 청유형("~해주세요."/"~해 보세요.")을
 * 쓴다. 초대한 팀 이름·상대팀명·대회명처럼 의미 있는 변수가 있으면 호출부에서 `"${value}" ...` 형태로
 * 따옴표에 감싸 본문 앞에 삽입한 문자열을 명시적으로 전달해 이 기본값을 오버라이드한다.
 */
const EVENT_BODIES: Record<NotificationEventType, string> = {
  match_application_received: '매치 신청을 확인해 주세요.',
  match_application_approved: '매치 참가가 확정됐어요.',
  match_application_rejected: '매치 신청이 거절됐어요.',
  match_cancelled: '매치가 취소됐어요.',
  match_closed: '모집이 마감되어 대기 중인 신청이 종료됐어요.',
  match_completed: '함께한 매치의 리뷰를 남겨보세요.',
  team_join_application_received: '"{team}" · 승인하거나 거절해 주세요.',
  team_join_application_accepted: '팀 가입이 승인됐어요.',
  team_join_application_rejected: '팀 가입 신청이 거절됐어요.',
  team_contact_received: '상대 팀이 보낸 컨택을 확인해 주세요.',
  team_contact_accepted: '이제 상대 팀과 대화할 수 있어요.',
  team_contact_declined: '아쉽지만 이번에는 성사되지 않았어요.',
  team_match_application_received: '팀매치 신청을 확인해 주세요.',
  team_match_application_withdrawn: '상대팀 신청이 취소됐어요.',
  team_match_application_approved: '팀매치 신청이 승인됐어요.',
  team_match_application_rejected: '팀매치 신청이 거절됐어요.',
  team_match_closed: '모집이 마감되어 대기 중인 신청이 종료됐어요.',
  team_match_cancelled: '팀매치가 취소됐어요.',
  team_match_completed: '팀매치 리뷰를 남겨보세요.',
  tournament_completed_review_request: '함께한 대회는 어땠나요? 참가팀 후기를 남겨주세요.',
  tournament_award_received: '대회 시상 결과가 공개됐어요. 눌러서 확인해 보세요.',
  tournament_registration_confirmed: '대회 참가가 확정됐어요.',
  tournament_registration_waitlisted: '대기자 명단에 등록됐어요.',
  tournament_registration_cancelled: '대회 참가 신청이 취소됐어요.',
  tournament_registration_submitted: '입금 안내를 확인해 주세요.',
  tournament_record_consent_invite: '공개를 켜면 내 출전·득점 기록이 프로필에 표시돼요.',
  tournament_payment_confirmed: '운영진 확정을 기다려 주세요.',
  tournament_announcement_published: '공지를 확인해 보세요.',
  team_invitation_received: '팀 초대를 확인해 보세요.',
  team_invitation_accepted: '"{team}" 멤버가 됐어요.',
  team_manager_assigned: '"{team}" · 가입 신청과 팀 일정을 관리할 수 있어요.',
  team_manager_revoked: '"{team}" · 팀 관리 메뉴는 더 보이지 않아요.',
  team_owner_received: '"{team}" · 팀장을 넘겨받았어요. 멤버 관리와 팀 정보를 바꿀 수 있어요.',
  team_owner_changed: '"{team}" · 새 팀장은 {name}님이에요.',
  // 착지는 권한이 없어도 열리는 공개 팀 상세(기본 경로) — 다시 가입 신청할 수 있다.
  team_membership_removed: '"{team}" · 이 팀의 일정과 채팅은 더 볼 수 없어요.',
  team_member_left: '"{team}" · 지금 멤버는 {count}명이에요.',
  team_invitation_declined: '"{team}" 팀 초대가 거절됐어요.',
  team_schedule_created: '"{team}" · {title} · {when}. 참석 여부를 알려 주세요.',
  // 취소 사유는 팀장·매니저가 적은 문장 그대로다.
  team_schedule_cancelled: '"{team}" · {title}({when}) · {reason}',
  inquiry_answered: '답변 내용을 확인해 주세요.',
  schedule_rsvp_deadline_reminder: 'RSVP 마감 전에 참석 여부를 남겨주세요.',
  schedule_guest_recruitment_close_reminder: '모집 마감 전에 신청 현황을 확인해 주세요.',
  league_fixture_scheduled: '리그 대진 일정을 확인해 주세요.',
  league_fixture_cancelled: '취소된 대진을 확인해 주세요.',
  league_promotion_promoted: '다음 시즌 상위 리그에서 시작해요.',
  league_promotion_relegated: '아쉽지만 다음 시즌은 하위 리그에서 시작해요.',
  league_promotion_stayed: '현재 리그에서 다음 시즌을 계속해요.',
  league_promotion_withdrawn: '이번 시즌을 끝으로 리그 참가가 종료됐어요.',
  league_team_match_completed: '확정된 경기 결과를 확인해 보세요.',
  tournament_match_completed: '확정된 경기 결과를 확인해 보세요.',
  // 두 경기 전 알림의 본문 끝 문장이다 — 발송 경로가 "vs 상대 · 장소." 뒤에 붙인다.
  game_day_before_reminder: '출전 명단은 경기 전까지 바뀔 수 있어요.',
  game_kickoff_reminder: '지금 출전 명단에 있어요.',
  team_match_identity_attest_requested: '경기 명단의 기록 연결 요청을 24시간 안에 확인해 주세요.',
  tournament_identity_attest_requested: '경기 명단의 기록 연결 요청을 24시간 안에 확인해 주세요.',
  team_match_identity_attest_expired: '24시간 안에 확인되지 않아 만료됐어요. 다시 신청할 수 있어요.',
  tournament_identity_attest_expired: '24시간 안에 확인되지 않아 만료됐어요. 다시 신청할 수 있어요.',
  team_match_identity_attest_approved: '연결이 승인됐어요. 내 활동 기록에 이 경기가 표시돼요.',
  tournament_identity_attest_approved: '연결이 승인됐어요. 내 활동 기록에 이 경기가 표시돼요.',
  team_match_identity_attest_rejected: '연결 요청이 거절됐어요. 다시 신청할 수 있어요.',
  tournament_identity_attest_rejected: '연결 요청이 거절됐어요. 다시 신청할 수 있어요.',
};

/**
 * 몰림 줄(H1-join-burst)의 두 건 이상 문구. 한 건일 때는 위 표의 문구를 그대로 쓴다.
 * 가입 신청은 지금 남은 대기 건수, 초대 수락은 그 줄을 안 읽은 동안 쌓인 수락 수다.
 */
const BURST_TITLES = {
  team_join_application_received: '가입 신청 {count}건이 기다려요',
  team_invitation_accepted: '{name}님 외 {others}명이 초대를 수락했어요',
} as const satisfies Partial<Record<NotificationEventType, string>>;
const BURST_BODIES = {
  team_join_application_received: '"{team}" · {name}님 외 {others}명 · 승인하거나 거절해 주세요.',
  team_invitation_accepted: '"{team}" 멤버가 됐어요.',
} as const satisfies Partial<Record<NotificationEventType, string>>;

type BurstEvent = keyof typeof BURST_TITLES;

function burstCopy(type: BurstEvent, count: number, team: string, name: string): { title: string; body: string } {
  const vars = { team, name, count: String(count), others: String(count - 1) };
  return count > 1
    ? { title: renderNotificationCopy(BURST_TITLES[type], vars), body: renderNotificationCopy(BURST_BODIES[type], vars) }
    : { title: renderNotificationCopy(EVENT_TITLES[type], vars), body: renderNotificationCopy(EVENT_BODIES[type], vars) };
}

const joinLineKey = (teamId: string, userId: string) => `team-join-pending:${teamId}:${userId}`;
const acceptedLinePrefix = (teamId: string, inviterUserId: string) => `team-invite-accepted:${teamId}:${inviterUserId}:`;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REALTIME_NOTIFIER) private readonly realtimeNotifier: RealtimeNotifierPort,
    private readonly webPushService: WebPushService,
    @InjectPinoLogger(NotificationsService.name) private readonly logger: PinoLogger,
  ) {}

  /**
   * Fire-and-forget: creates a V1Notification for userId if the user's preference
   * for this event category is enabled (or no preference row exists → defaults enabled).
   * Notification failures must NEVER propagate to the caller's transaction or response.
   */
  async emitNotification(
    userId: string,
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
    options?: NotificationEmitOptions,
  ): Promise<void> {
    this.dispatch([userId], type, targetId, body, options);
  }

  /** 아직 처리 전인 "팀 초대 도착" 알림 — 사용자·팀이 같고 도착지가 초대함이며 읽지 않은 것. */
  private pendingTeamInvitationNotifications(userId: string, teamId: string) {
    return {
      recipientUserId: userId,
      targetType: 'team' as const,
      targetId: teamId,
      deepLink: TEAM_INVITATION_INBOX_LINK,
      readAt: null,
    };
  }

  /**
   * 초대를 수락·거절하면 그 초대의 도착 알림을 읽음 처리한다 — 처리한 뒤에도 안 읽음으로 남아
   * 아직 할 일이 있는 것처럼 보이던 문제. 알림 실패는 이미 끝난 수락·거절을 깨지 않는다.
   */
  async markTeamInvitationHandled(userId: string, teamId: string): Promise<void> {
    try {
      await this.prisma.v1Notification.updateMany({
        where: this.pendingTeamInvitationNotifications(userId, teamId),
        data: { readAt: new Date() },
      });
    } catch (err) {
      this.logger.warn({ userId, teamId, err }, '팀 초대 알림 읽음 처리 실패');
    }
  }

  /**
   * 초대가 취소되면 받은 사람의 도착 알림을 "취소됐어요"로 바꾸고 읽음 처리한다. 그대로 두면 눌러서
   * 들어간 내 초대함이 "초대가 없어요"만 말한다. 도착지는 초대함 대신 팀 상세로 옮긴다.
   */
  async markTeamInvitationCancelled(userId: string, teamId: string, teamName: string): Promise<void> {
    try {
      await this.prisma.v1Notification.updateMany({
        where: this.pendingTeamInvitationNotifications(userId, teamId),
        data: {
          readAt: new Date(),
          title: '팀 초대가 취소됐어요',
          body: `"${teamName}" 팀이 초대를 취소했어요.`,
          deepLink: `/teams/${teamId}`,
        },
      });
    } catch (err) {
      this.logger.warn({ userId, teamId, err }, '팀 초대 취소 알림 갱신 실패');
    }
  }

  /**
   * Emit to multiple users. Each user's preference is checked individually.
   */
  async emitNotificationToMany(
    userIds: string[],
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
    options?: NotificationEmitOptions,
  ): Promise<void> {
    this.dispatch(userIds, type, targetId, body, options);
  }

  /**
   * Fire-and-forget for recipient sets that need a lookup: resolves the userIds
   * then emits, swallowing ALL errors (including the lookup itself) so that the
   * notification side-effect never breaks the caller's already-committed request.
   */
  emitToManyDeferred(
    resolveUserIds: () => Promise<string[]>,
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
    options?: NotificationEmitOptions,
  ): void {
    void (async () => {
      const userIds = await resolveUserIds();
      this.dispatch(userIds, type, targetId, body, options);
    })().catch((e: unknown) => this.logger.warn({ type, err: e }, '알림 발송 실패'));
  }

  /**
   * 가입 신청 알림을 팀·받는 사람마다 한 줄로 유지한다(H1-join-burst). 새 신청(arrival)은 그 줄을 맨 위로 올리고,
   * 읽은 줄이었으면 다시 안 읽음으로 열어 푸시한다 — 안 읽은 동안의 추가분은 문구만 바꾸고 푸시하지 않는다.
   * 처리(recount)는 남은 건수로 문구를 고치고 0건이면 읽음으로 둔다. 실패해도 가입 신청 처리를 깨지 않는다.
   */
  async refreshTeamJoinApplicationsLine(teamId: string, trigger: 'arrival' | 'recount'): Promise<void> {
    try {
      const [team, pendingCount, latest] = await Promise.all([
        this.prisma.v1Team.findUnique({ where: { id: teamId }, select: { name: true } }),
        this.prisma.v1TeamJoinApplication.count({ where: { teamId, status: 'requested' } }),
        this.prisma.v1TeamJoinApplication.findFirst({
          where: { teamId, status: 'requested' },
          orderBy: [{ updatedAt: 'desc' }],
          select: { applicantUser: { select: { profile: { select: { nickname: true, displayName: true } } } } },
        }),
      ]);
      if (team === null) return;
      const lineWhere = { targetType: 'team' as const, targetId: teamId, businessKey: { startsWith: joinLineKey(teamId, '') } };
      if (pendingCount === 0 || latest === null) {
        await this.prisma.v1Notification.updateMany({ where: { ...lineWhere, readAt: null }, data: { readAt: new Date() } });
        return;
      }
      const copy = burstCopy('team_join_application_received', pendingCount, team.name, notificationPersonName(latest.applicantUser.profile));
      const managers = await this.prisma.v1TeamMembership.findMany({
        where: { teamId, status: 'active', role: { in: ['owner', 'manager'] } },
        select: { userId: true },
      });
      if (trigger === 'recount') {
        // 지금 팀장·매니저의 줄만 고친다 — 역할을 잃은 사람의 옛 줄에 새 신청자 이름을 싣지 않는다.
        const recipientUserId = { in: managers.map((manager) => manager.userId) };
        await this.prisma.v1Notification.updateMany({ where: { ...lineWhere, recipientUserId }, data: copy });
        return;
      }
      const pushAllowed = await this.pushAllowedNow('team_join_application_received', 'team', teamId);
      const deepLink = deepLinkForEvent('team_join_application_received', 'team', teamId);
      for (const { userId } of managers) {
        if (!(await this.preferenceEnabled(userId, 'teamEnabled'))) continue;
        const businessKey = joinLineKey(teamId, userId);
        const existing = await this.prisma.v1Notification.findUnique({ where: { businessKey }, select: { id: true, readAt: true } });
        if (existing !== null) {
          const reopened = await this.prisma.v1Notification.update({
            where: { id: existing.id },
            data: { ...copy, deepLink, readAt: null, createdAt: new Date() },
          });
          this.deliver(userId, reopened, existing.readAt !== null && pushAllowed);
          continue;
        }
        const created = await this.createLineOrNull({ businessKey, recipientUserId: userId, targetType: 'team', targetId: teamId, deepLink, ...copy });
        // 동시에 들어온 다른 신청이 방금 줄을 만들었다 — 그 줄의 건수만 맞춘다(푸시는 그쪽이 했다).
        if (created === null) await this.prisma.v1Notification.update({ where: { businessKey }, data: copy });
        else this.deliver(userId, created, pushAllowed);
      }
    } catch (err) {
      this.logger.warn({ teamId, trigger, err }, '가입 신청 알림 줄 갱신 실패');
    }
  }

  /**
   * 초대 수락 알림을 초대한 사람·팀마다 한 줄로 모은다(H1-join-burst). 안 읽은 줄이 있으면 그 줄에 더하고(푸시 없음),
   * 없으면 새 줄을 열어 푸시한다. 줄의 키에 첫 수락 시각을 박아 두고 그 뒤의 수락만 센다 — 읽은 뒤의 수락은 새 줄이다.
   */
  async recordTeamInvitationAccepted(input: {
    inviterUserId: string;
    teamId: string;
    invitationId: string;
    acceptedAt: Date;
  }): Promise<void> {
    const { inviterUserId, teamId, invitationId, acceptedAt } = input;
    try {
      if (!(await this.preferenceEnabled(inviterUserId, 'teamEnabled'))) return;
      const prefix = acceptedLinePrefix(teamId, inviterUserId);
      const [team, open, invitation] = await Promise.all([
        this.prisma.v1Team.findUnique({ where: { id: teamId }, select: { name: true } }),
        this.prisma.v1Notification.findFirst({
          where: { recipientUserId: inviterUserId, readAt: null, targetType: 'team', targetId: teamId, businessKey: { startsWith: prefix } },
          orderBy: [{ createdAt: 'desc' }],
          select: { id: true, businessKey: true },
        }),
        this.prisma.v1TeamInvitation.findUnique({
          where: { id: invitationId },
          select: { invitedUser: { select: { profile: { select: { nickname: true, displayName: true } } } } },
        }),
      ]);
      if (team === null) return;
      const windowStartMs = open?.businessKey ? Number(open.businessKey.slice(prefix.length).split(':')[0]) : acceptedAt.getTime();
      const count = await this.prisma.v1TeamInvitation.count({
        where: { teamId, invitedByUserId: inviterUserId, status: 'accepted', respondedAt: { gte: new Date(windowStartMs) } },
      });
      const copy = burstCopy('team_invitation_accepted', Math.max(count, 1), team.name, notificationPersonName(invitation?.invitedUser.profile));
      if (open !== null) {
        const updated = await this.prisma.v1Notification.update({ where: { id: open.id }, data: { ...copy, createdAt: new Date() } });
        this.deliver(inviterUserId, updated, false);
        return;
      }
      const created = await this.prisma.v1Notification.create({ data: {
        businessKey: `${prefix}${acceptedAt.getTime()}:${invitationId}`,
        recipientUserId: inviterUserId,
        targetType: 'team',
        targetId: teamId,
        deepLink: deepLinkForEvent('team_invitation_accepted', 'team', teamId),
        ...copy,
      } });
      this.deliver(inviterUserId, created, await this.pushAllowedNow('team_invitation_accepted', 'team', teamId));
    } catch (err) {
      this.logger.warn({ teamId, inviterUserId, err }, '초대 수락 알림 줄 갱신 실패');
    }
  }

  /** businessKey 로 새 줄을 만든다. 동시에 들어온 다른 요청이 같은 줄을 먼저 만들었으면 null. */
  private async createLineOrNull(data: Prisma.V1NotificationUncheckedCreateInput) {
    try {
      return await this.prisma.v1Notification.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return null;
      throw err;
    }
  }

  private dispatch(
    userIds: readonly string[],
    type: NotificationEventType,
    targetId: string | null,
    body: string | undefined,
    options: NotificationEmitOptions | undefined,
  ): void {
    if (userIds.length === 0) return;
    const targetType = targetTypeForEvent(type);
    let message: { targetType: V1NotificationTargetType; targetId: string | null; title: string; body: string; deepLink: string | null };
    try {
      message = {
        targetType,
        targetId,
        title: renderNotificationCopy(EVENT_TITLES[type], options?.vars),
        body: body ?? renderNotificationCopy(EVENT_BODIES[type], options?.vars),
        deepLink: deepLinkForEvent(type, targetType, targetId),
      };
    } catch (err) {
      this.logger.warn({ type, targetId, err }, '알림 문구를 채우지 못해 발송하지 않습니다');
      return;
    }
    const prefField = preferenceFieldForEvent(type);
    void this.pushAllowedNow(type, targetType, targetId).then((pushAllowed) => {
      for (const userId of userIds) {
        this.createNotificationWithPrefCheck(userId, message, prefField, pushAllowed).catch((err: unknown) => {
          this.logger.warn({ userId, targetType, targetId, err }, '알림 생성 실패');
        });
      }
    });
  }

  /**
   * 지금 이 알림을 푸시해도 되는가(H1-night). 밤에는 팀·팀매치 사건 알림의 푸시를 보류하되, 그 밤이
   * 끝나기(다음 9시) 전에 시작하는 일정·경기 알림은 보낸다. 시작 시각을 못 읽으면 보류 쪽으로 둔다 —
   * 알림함 기록은 어느 쪽이든 남는다.
   */
  private async pushAllowedNow(
    type: NotificationEventType,
    targetType: V1NotificationTargetType,
    targetId: string | null,
  ): Promise<boolean> {
    const now = new Date();
    if (!NIGHT_HELD_PREF_FIELDS.has(preferenceFieldForEvent(type)) || !isQuietHour(now)) return true;
    try {
      return nightPushAllowed(now, await this.eventStartsAt(type, targetType, targetId));
    } catch (err) {
      this.logger.warn({ type, targetId, err }, '야간 푸시 판정용 시작 시각 조회 실패 — 푸시를 보류합니다');
      return false;
    }
  }

  /** 알림이 가리키는 일정·경기의 시작 시각. 팀매치 알림은 targetId 가 팀매치 id 다(리그 대진 알림은 리그 id 라 null). */
  private async eventStartsAt(
    type: NotificationEventType,
    targetType: V1NotificationTargetType,
    targetId: string | null,
  ): Promise<Date | null> {
    if (targetId === null) return null;
    const scheduleId = SCHEDULE_TARGET_EVENTS.has(type) ? targetId.split(':')[1] : undefined;
    if (scheduleId !== undefined) {
      const schedule = await this.prisma.v1TeamSchedule.findUnique({ where: { id: scheduleId }, select: { startAt: true } });
      return schedule?.startAt ?? null;
    }
    if (targetType !== 'team_match') return null;
    const teamMatch = await this.prisma.v1TeamMatch.findUnique({ where: { id: targetId }, select: { startAt: true } });
    return teamMatch?.startAt ?? null;
  }

  private async createNotificationWithPrefCheck(
    userId: string,
    message: {
      targetType: V1NotificationTargetType;
      targetId: string | null;
      title: string;
      body: string | null;
      deepLink: string | null;
    },
    prefField: NotificationPrefField,
    pushAllowed: boolean,
  ): Promise<void> {
    if (!(await this.preferenceEnabled(userId, prefField))) return;
    const notification = await this.prisma.v1Notification.create({ data: { recipientUserId: userId, ...message } });
    this.deliver(userId, notification, pushAllowed);
  }

  /** 수신 설정 행이 없으면 켜진 것으로 본다. */
  private async preferenceEnabled(userId: string, prefField: NotificationPrefField): Promise<boolean> {
    const pref = await this.prisma.v1NotificationPreference.findUnique({
      where: { userId },
      select: { [prefField]: true },
    });
    return pref ? (pref as Record<string, boolean>)[prefField] !== false : true;
  }

  /**
   * 이미 저장된 알림 행을 실시간으로 알리고, 허용되면 푸시한다.
   * emitToUser와 sendToUser는 서로 독립적인 채널이다 — 하나가 던져도 다른 하나의 시도는 계속되어야 한다.
   * realtimeNotifier 구현체는 호출 측(HTTP 앱 vs 워커)마다 다르다 — realtime-notifier.port.ts 참조.
   */
  private deliver(
    userId: string,
    notification: { id: string; targetType: V1NotificationTargetType; targetId: string | null; title: string; body: string | null; deepLink: string | null },
    push: boolean,
  ): void {
    const { targetType, targetId } = notification;
    try {
      this.realtimeNotifier.emitToUser(userId, 'notification:new', notification);
    } catch (err) {
      this.logger.warn({ userId, targetType, targetId, err }, '실시간 알림 전송 실패');
    }

    if (!push) return;
    void this.webPushService
      .sendToUser(userId, {
        notificationId: notification.id,
        title: notification.title,
        body: notification.body ?? undefined,
        url: notification.deepLink ?? undefined,
      })
      .catch((err: unknown) => {
        this.logger.warn({ userId, targetType, targetId, err }, '푸시 알림 발송 실패');
      });
  }

  async list(user: V1AuthUser, query: NotificationsQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
    const where: Prisma.V1NotificationWhereInput = {
      recipientUserId: user.id,
      ...(query.status === 'read' ? { readAt: { not: null } } : {}),
      ...(query.status === 'unread' || query.status === 'created' ? { readAt: null } : {}),
      ...(query.type ? { targetType: query.type as never } : {}),
    };
    const [items, unreadCount] = await Promise.all([
      this.prisma.v1Notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      }),
      this.prisma.v1Notification.count({ where: { recipientUserId: user.id, readAt: null } }),
    ]);
    const pageItems = items.slice(0, limit);
    const hasNext = items.length > limit;

    return {
      items: pageItems.map((notification) => ({
        notificationId: notification.id,
        type: notification.targetType,
        title: notification.title,
        body: notification.body,
        target: {
          type: notification.targetType,
          id: notification.targetId,
          route: notification.deepLink,
        },
        status: notification.readAt ? 'read' : 'created',
        readAt: notification.readAt,
        createdAt: notification.createdAt,
      })),
      unreadCount,
      pageInfo: { nextCursor: hasNext ? pageItems.at(-1)?.id ?? null : null, hasNext },
    };
  }

  async read(user: V1AuthUser, notificationId: string) {
    const notification = await this.prisma.v1Notification.findUnique({ where: { id: notificationId } });
    if (!notification) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification was not found' });
    if (notification.recipientUserId !== user.id) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'Notification access is denied' });
    }
    const readAt = notification.readAt ?? new Date();
    const updated = notification.readAt
      ? notification
      : await this.prisma.v1Notification.update({ where: { id: notification.id }, data: { readAt } });
    return { notificationId: updated.id, status: 'read', readAt: updated.readAt ?? readAt };
  }

  async readAll(user: V1AuthUser, dto: ReadAllNotificationsDto) {
    const readAt = new Date();
    const result = await this.prisma.v1Notification.updateMany({
      where: {
        recipientUserId: user.id,
        readAt: null,
        ...(dto.type ? { targetType: dto.type as never } : {}),
      },
      data: { readAt },
    });
    const unreadCount = await this.prisma.v1Notification.count({
      where: { recipientUserId: user.id, readAt: null },
    });
    return { updatedCount: result.count, readAt, unreadCount };
  }

  async preferences(user: V1AuthUser) {
    const preferences = await this.prisma.v1NotificationPreference.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    return toPreferencesResponse(preferences);
  }

  async updatePreferences(user: V1AuthUser, dto: UpdateNotificationPreferencesDto) {
    const preferences = await this.prisma.v1NotificationPreference.upsert({
      where: { userId: user.id },
      update: {
        ...(dto.importantEnabled === undefined ? {} : { importantEnabled: dto.importantEnabled }),
        ...(dto.activityEnabled === undefined ? {} : { activityEnabled: dto.activityEnabled }),
        ...(dto.marketingEnabled === undefined ? {} : { marketingEnabled: dto.marketingEnabled }),
      },
      create: {
        userId: user.id,
        importantEnabled: dto.importantEnabled ?? true,
        activityEnabled: dto.activityEnabled ?? true,
        marketingEnabled: dto.marketingEnabled ?? false,
      },
    });
    return toPreferencesResponse(preferences);
  }
}

function toPreferencesResponse(preferences: {
  importantEnabled: boolean;
  activityEnabled: boolean;
  marketingEnabled: boolean;
  updatedAt: Date;
}) {
  return {
    importantEnabled: preferences.importantEnabled,
    activityEnabled: preferences.activityEnabled,
    marketingEnabled: preferences.marketingEnabled,
    updatedAt: preferences.updatedAt,
  };
}
