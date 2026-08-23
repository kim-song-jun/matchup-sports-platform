import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, V1NotificationTargetType } from '@prisma/client';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { V1AuthUser } from '../auth/v1-auth-user';
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
  | 'team_invitation_received'
  | 'team_invitation_accepted'
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
  | 'league_promotion_promoted'
  | 'league_promotion_relegated'
  | 'league_promotion_stayed'
  | 'league_promotion_withdrawn';

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
    type === 'match_completed'
  ) {
    return 'matchEnabled';
  }
  if (
    type === 'team_join_application_received' ||
    type === 'team_join_application_accepted' ||
    type === 'team_join_application_rejected' ||
    type === 'team_invitation_received' ||
    type === 'team_invitation_accepted' ||
    type === 'schedule_rsvp_deadline_reminder' ||
    type === 'schedule_guest_recruitment_close_reminder' ||
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
    type === 'league_fixture_scheduled'
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
    type === 'tournament_completed_review_request'
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
    type === 'match_completed'
  ) {
    return 'match';
  }
  if (
    type === 'team_join_application_received' ||
    type === 'team_join_application_accepted' ||
    type === 'team_join_application_rejected' ||
    type === 'team_invitation_received' ||
    type === 'team_invitation_accepted' ||
    type === 'schedule_rsvp_deadline_reminder' ||
    type === 'schedule_guest_recruitment_close_reminder' ||
    type === 'team_contact_received' ||
    type === 'team_contact_accepted' ||
    type === 'team_contact_declined'
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
    type === 'tournament_completed_review_request'
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
  // league_fixture_scheduled도 여기 fallthrough로 떨어진다 — 팀매치(리그 대진) 배정
  // 이벤트라 'team_match'가 맞다. targetId는 리그당 배치 발송이라 leagueId를 쓴다
  // (특정 team_match id가 아니라 리그 전체를 가리킴 — deepLinkForEvent에서 명시적으로
  // 처리한다).
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

function deepLinkForEvent(
  type: NotificationEventType,
  targetType: V1NotificationTargetType,
  targetId: string | null,
): string | null {
  if (type === 'team_join_application_received' && targetId) {
    return `/teams/${targetId}/members`;
  }
  // team_contact_* targetType은 'team' 이라 ROUTE_BASE_BY_TARGET_TYPE['team']='/teams' 로 폴백하면
  // /teams/{contactId} 가 되어 404 링크가 만들어진다 — 컨택 상세 화면으로 명시적으로 보낸다.
  if (
    (type === 'team_contact_received' ||
      type === 'team_contact_accepted' ||
      type === 'team_contact_declined') &&
    targetId
  ) {
    return `/my/team-contacts/${targetId}`;
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
  if (type === 'tournament_completed_review_request' && targetId) {
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
  if (
    (type === 'schedule_rsvp_deadline_reminder' || type === 'schedule_guest_recruitment_close_reminder') &&
    targetId
  ) {
    const [teamId, scheduleId] = targetId.split(':');
    if (teamId && scheduleId) {
      return `/teams/${teamId}/schedules/${scheduleId}`;
    }
  }
  // league_fixture_scheduled/league_promotion_* 는 targetType이 'team_match'/'team'이라
  // ROUTE_BASE_BY_TARGET_TYPE 기본값을 쓰면 각각 /team-matches/{leagueId}, /teams/{leagueId}
  // 로 잘못 라우팅된다(targetId가 team_match/team의 id가 아니라 leagueId이기 때문 —
  // team_contact_* 항목의 기존 선례와 동일한 이유). 리그 상세 화면으로 명시적으로 보낸다.
  if (
    (type === 'league_fixture_scheduled' ||
      type === 'league_promotion_promoted' ||
      type === 'league_promotion_relegated' ||
      type === 'league_promotion_stayed' ||
      type === 'league_promotion_withdrawn') &&
    targetId
  ) {
    return `/league-matches/${targetId}`;
  }
  return deepLinkForTarget(targetType, targetId);
}

const EVENT_TITLES: Record<NotificationEventType, string> = {
  match_application_received: '매치 신청이 도착했어요',
  match_application_approved: '매치 신청이 승인됐어요',
  match_application_rejected: '매치 신청이 거절됐어요',
  match_cancelled: '매치가 취소됐어요',
  match_completed: '매치가 완료됐어요. 리뷰를 남겨보세요!',
  team_join_application_received: '팀 가입 신청이 도착했어요',
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
  tournament_registration_confirmed: '대회 참가가 확정됐어요',
  tournament_registration_waitlisted: '대기자 명단에 등록됐어요',
  tournament_registration_cancelled: '대회 참가가 취소됐어요',
  tournament_registration_submitted: '대회 신청이 접수됐어요',
  tournament_record_consent_invite: '내 경기 기록을 공개할까요?',
  tournament_payment_confirmed: '입금이 확인됐어요',
  tournament_announcement_published: '대회 공지가 올라왔어요',
  team_invitation_received: '팀 초대가 도착했어요',
  team_invitation_accepted: '팀 초대를 수락했어요',
  inquiry_answered: '문의에 답변이 등록됐어요',
  schedule_rsvp_deadline_reminder: '참석 여부를 알려주세요',
  schedule_guest_recruitment_close_reminder: '용병 모집이 곧 마감돼요',
  league_fixture_scheduled: '리그 대진이 확정됐어요',
  league_promotion_promoted: '축하해요! 다음 시즌 상위 리그로 승격했어요',
  league_promotion_relegated: '다음 시즌 하위 리그로 강등됐어요',
  league_promotion_stayed: '다음 시즌에도 같은 리그예요',
  league_promotion_withdrawn: '리그 참가가 종료됐어요',
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
  match_completed: '함께한 매치의 리뷰를 남겨보세요.',
  team_join_application_received: '팀 가입 신청을 확인해 주세요.',
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
  tournament_registration_confirmed: '대회 참가가 확정됐어요.',
  tournament_registration_waitlisted: '대기자 명단에 등록됐어요.',
  tournament_registration_cancelled: '대회 참가 신청이 취소됐어요.',
  tournament_registration_submitted: '입금 안내를 확인해 주세요.',
  tournament_record_consent_invite: '공개를 켜면 내 출전·득점 기록이 프로필에 표시돼요.',
  tournament_payment_confirmed: '운영진 확정을 기다려 주세요.',
  tournament_announcement_published: '공지를 확인해 보세요.',
  team_invitation_received: '팀 초대를 확인해 보세요.',
  team_invitation_accepted: '팀 초대를 수락했어요.',
  inquiry_answered: '답변 내용을 확인해 주세요.',
  schedule_rsvp_deadline_reminder: 'RSVP 마감 전에 참석 여부를 남겨주세요.',
  schedule_guest_recruitment_close_reminder: '모집 마감 전에 신청 현황을 확인해 주세요.',
  league_fixture_scheduled: '리그 대진 일정을 확인해 주세요.',
  league_promotion_promoted: '다음 시즌 상위 리그에서 시작해요.',
  league_promotion_relegated: '아쉽지만 다음 시즌은 하위 리그에서 시작해요.',
  league_promotion_stayed: '현재 리그에서 다음 시즌을 계속해요.',
  league_promotion_withdrawn: '이번 시즌을 끝으로 리그 참가가 종료됐어요.',
};

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
  ): Promise<void> {
    const targetType = targetTypeForEvent(type);
    const deepLink = deepLinkForEvent(type, targetType, targetId);
    const title = EVENT_TITLES[type];
    const prefField = preferenceFieldForEvent(type);

    this.emitNotificationFireAndForget(
      userId,
      targetType,
      targetId,
      title,
      body ?? EVENT_BODIES[type],
      deepLink,
      prefField,
    );
  }

  /**
   * Emit to multiple users. Each user's preference is checked individually.
   */
  async emitNotificationToMany(
    userIds: string[],
    type: NotificationEventType,
    targetId: string | null,
    body?: string,
  ): Promise<void> {
    if (userIds.length === 0) return;
    for (const userId of userIds) {
      this.emitNotificationFireAndForget(
        userId,
        targetTypeForEvent(type),
        targetId,
        EVENT_TITLES[type],
        body ?? EVENT_BODIES[type],
        deepLinkForEvent(type, targetTypeForEvent(type), targetId),
        preferenceFieldForEvent(type),
      );
    }
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
  ): void {
    void (async () => {
      const userIds = await resolveUserIds();
      await this.emitNotificationToMany(userIds, type, targetId, body);
    })().catch((e: unknown) => this.logger.warn({ type, err: e }, '알림 발송 실패'));
  }

  private emitNotificationFireAndForget(
    userId: string,
    targetType: V1NotificationTargetType,
    targetId: string | null,
    title: string,
    body: string | null,
    deepLink: string | null,
    prefField: NotificationPrefField,
  ): void {
    this.createNotificationWithPrefCheck(userId, targetType, targetId, title, body, deepLink, prefField).catch(
      (err: unknown) => {
        this.logger.warn({ userId, targetType, targetId, err }, '알림 생성 실패');
      },
    );
  }

  private async createNotificationWithPrefCheck(
    userId: string,
    targetType: V1NotificationTargetType,
    targetId: string | null,
    title: string,
    body: string | null,
    deepLink: string | null,
    prefField: NotificationPrefField,
  ): Promise<void> {
    const pref = await this.prisma.v1NotificationPreference.findUnique({
      where: { userId },
      select: { [prefField]: true },
    });
    // If no preference row, default is enabled (treat as true).
    const enabled = pref ? (pref as Record<string, boolean>)[prefField] !== false : true;
    if (!enabled) return;

    const notification = await this.prisma.v1Notification.create({
      data: {
        recipientUserId: userId,
        targetType,
        targetId,
        title,
        body,
        deepLink,
      },
    });

    // emitToUser와 sendToUser는 서로 독립적인 채널이다 — 하나가 던져도 다른 하나의
    // 시도는 계속되어야 한다(ChatService.sendMessage의 개별 try/catch 격리 패턴과 동일).
    // realtimeNotifier는 REALTIME_NOTIFIER 포트(realtime-notifier.port.ts)를 통해 주입되며,
    // 구현체는 호출 측(HTTP 앱 vs 워커)마다 다르다 — 자세한 내용은 그 파일 참조.
    try {
      this.realtimeNotifier.emitToUser(userId, 'notification:new', notification);
    } catch (err) {
      this.logger.warn({ userId, targetType, targetId, err }, '실시간 알림 전송 실패');
    }

    void this.webPushService
      .sendToUser(userId, { title, body: body ?? undefined, url: deepLink ?? undefined })
      .catch((err: unknown) => {
        this.logger.warn({ userId, targetType, targetId, err }, '웹 푸시 발송 실패');
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
