import type {
  V1Match,
  V1MyTeam,
  V1MyTeamMatch,
  V1Notification,
  V1Profile,
  V1ReviewListItem,
  V1TeamJoinApplication,
} from '@/types/api';
import type {
  AdminDashboardModel,
  AdminLoadState,
  AdminQueueItemModel,
  AdminTeamModel,
  AdminWorkItemModel,
} from './admin.types';
import {
  combinedState,
  formatDateTime,
  isRecruitingStatus,
  metric,
  runtimeOperationHref,
  serviceErrorMessage,
  statusLabel,
  sum,
  teamMatchEditHref,
} from './admin.view-model-utils';

export { adminEmptyActivityModel, toAdminActivityModel } from './admin.activity-view-model';

type AdminDashboardInput = {
  readonly profile?: V1Profile | null;
  readonly teams: readonly V1MyTeam[];
  readonly createdMatches: readonly V1Match[];
  readonly teamMatches: readonly V1MyTeamMatch[];
  readonly joinRequests: readonly V1TeamJoinApplication[];
  readonly notifications: readonly V1Notification[];
  readonly unreadNotificationCount: number;
  readonly pendingReviews: readonly V1ReviewListItem[];
  readonly states: readonly AdminLoadState[];
  readonly errorMessage?: string;
};

export function toAdminDashboardModel(input: AdminDashboardInput): AdminDashboardModel {
  const state = combinedState(input.states);
  const managedTeams = input.teams.filter((team) => team.canManage);
  const operatorName = input.profile?.profile.displayName ?? input.profile?.displayName ?? '운영자';
  const reviewRemaining = sum(input.pendingReviews.map((review) => review.remainingCount));
  const queue = toQueueItems({
    joinRequests: input.joinRequests,
    notifications: input.notifications,
    pendingReviews: input.pendingReviews,
    primaryTeamId: managedTeams[0]?.teamId ?? null,
  });

  return {
    state,
    operatorName,
    workspaceLabel: managedTeams.length > 0 ? `${managedTeams[0].name} 외 ${Math.max(managedTeams.length - 1, 0)}팀` : '개인 운영',
    profileMeta: profileMeta(input.profile),
    metrics: [
      metric('teams', '팀', managedTeams.length, '권한 있는 팀', managedTeams.length > 0 ? 'positive' : 'neutral'),
      metric('matches', '내 매치', input.createdMatches.length, '내가 만든 개인 매치', input.createdMatches.length > 0 ? 'positive' : 'neutral'),
      metric('teamMatches', '팀 매치', input.teamMatches.length, '호스트/신청 팀매치', input.teamMatches.length > 0 ? 'positive' : 'neutral'),
      metric('queue', '오늘 업무', queue.length, '처리할 항목', queue.length > 0 ? 'warning' : 'positive'),
      metric('reviews', '리뷰 대기', reviewRemaining, '아직 남은 리뷰', reviewRemaining > 0 ? 'warning' : 'positive'),
    ],
    primaryActions: [
      { label: '개인 매치 만들기', href: '/matches/new', tone: 'primary' },
      { label: '팀 매치 만들기', href: '/team-matches/new', tone: 'neutral' },
      { label: '팀 만들기', href: '/teams/new', tone: 'neutral' },
    ],
    queue,
    personalMatches: input.createdMatches.slice(0, 4).map(toPersonalMatchItem),
    teamMatches: input.teamMatches.slice(0, 4).map(toTeamMatchItem),
    teams: managedTeams.slice(0, 4).map(toTeamModel),
    communication: toCommunicationItems(input.notifications, input.pendingReviews, input.unreadNotificationCount),
    errorMessage: serviceErrorMessage(input.errorMessage),
  };
}

function toQueueItems(input: {
  readonly joinRequests: readonly V1TeamJoinApplication[];
  readonly notifications: readonly V1Notification[];
  readonly pendingReviews: readonly V1ReviewListItem[];
  readonly primaryTeamId: string | null;
}): readonly AdminQueueItemModel[] {
  const teamJoinItems = input.joinRequests.slice(0, 3).map((request) => ({
    id: `join:${request.applicationId}`,
    title: `${request.applicant.displayName} 가입 요청`,
    body: request.message ?? '가입 요청 메시지를 확인하고 승인 여부를 결정하세요.',
    href: input.primaryTeamId ? `/my/teams/${input.primaryTeamId}/members` : '/my/teams',
    sourceLabel: '팀',
    actionLabel: '요청 검토',
    tone: 'warning' as const,
  }));
  const reviewItems = input.pendingReviews.filter((review) => review.remainingCount > 0).slice(0, 2).map((review) => ({
    id: `review:${review.sourceType}:${review.sourceId}`,
    title: `${review.title} 리뷰 미작성`,
    body: `${review.remainingCount.toLocaleString('ko-KR')}개 리뷰가 남아 있습니다.`,
    href: `/my/reviews/${review.sourceType}/${review.sourceId}`,
    sourceLabel: '리뷰',
    actionLabel: '리뷰 작성',
    tone: 'warning' as const,
  }));
  const notificationItems = input.notifications.filter((notice) => notice.status !== 'read').slice(0, 2).map((notice) => ({
    id: `notification:${notice.notificationId}`,
    title: notice.title,
    body: notice.body ?? '새 운영 알림이 도착했습니다.',
    href: runtimeOperationHref(notice.target.route, '/notifications'),
    sourceLabel: '알림',
    actionLabel: '확인',
    tone: 'neutral' as const,
  }));
  return [...teamJoinItems, ...reviewItems, ...notificationItems].slice(0, 6);
}

function toCommunicationItems(
  notifications: readonly V1Notification[],
  pendingReviews: readonly V1ReviewListItem[],
  unreadNotificationCount: number,
): readonly AdminQueueItemModel[] {
  const unreadText = unreadNotificationCount > 0 ? `${unreadNotificationCount.toLocaleString('ko-KR')}개 안 읽음` : '읽지 않은 알림 없음';
  const reviewRemaining = sum(pendingReviews.map((review) => review.remainingCount));
  return [
    {
      id: 'notifications',
      title: '알림 확인',
      body: unreadText,
      href: '/notifications',
      sourceLabel: '알림',
      actionLabel: '알림 보기',
      tone: unreadNotificationCount > 0 ? 'warning' : 'positive',
    },
    {
      id: 'reviews',
      title: '리뷰 관리',
      body: reviewRemaining > 0 ? `${reviewRemaining.toLocaleString('ko-KR')}개 리뷰가 남아 있습니다.` : '남은 리뷰가 없습니다.',
      href: '/my/reviews',
      sourceLabel: '리뷰',
      actionLabel: '리뷰 보기',
      tone: reviewRemaining > 0 ? 'warning' : 'positive',
    },
  ];
}

function toPersonalMatchItem(match: V1Match): AdminWorkItemModel {
  const id = match.matchId ?? match.id;
  return {
    id,
    title: match.title,
    meta: [match.sport?.name ?? match.sportName, match.region?.name ?? match.regionName, formatDateTime(match.startsAt)].filter(Boolean).join(' · '),
    statusLabel: statusLabel(match.status),
    href: `/matches/${id}`,
    action: { label: '상세/수정', href: `/matches/${id}/edit`, tone: 'neutral' },
    tone: isRecruitingStatus(match.status) ? 'positive' : 'neutral',
  };
}

function toTeamMatchItem(match: V1MyTeamMatch): AdminWorkItemModel {
  const detailHref = runtimeOperationHref(match.detailRoute, `/team-matches/${match.teamMatchId}`);
  const actionHref = match.relation === 'host_team' ? teamMatchEditHref(match.teamMatchId) : detailHref;
  return {
    id: match.teamMatchId,
    title: match.title,
    meta: [match.teamName, match.sportName, formatDateTime(match.startsAt)].filter(Boolean).join(' · '),
    statusLabel: statusLabel(match.status),
    href: detailHref,
    action: { label: match.relation === 'host_team' ? '팀매치 수정' : '상세 보기', href: actionHref, tone: 'neutral' },
    tone: match.relation === 'host_team' ? 'positive' : 'neutral',
  };
}

function toTeamModel(team: V1MyTeam): AdminTeamModel {
  return {
    id: team.teamId,
    name: team.name,
    meta: [team.sport.name, team.region?.name, trustLabel(team.trust?.trustState)].filter(Boolean).join(' · '),
    roleLabel: roleLabel(team.role),
    memberLabel: `${team.memberCount.toLocaleString('ko-KR')}명`,
    href: `/my/teams/${team.teamId}`,
    action: { label: '멤버/요청', href: `/my/teams/${team.teamId}/members`, tone: 'neutral' },
  };
}

function profileMeta(profile?: V1Profile | null) {
  if (!profile) return '프로필 확인 중';
  const sports = profile.sports?.map((sport) => sport.sportName).slice(0, 2).join(', ');
  return [profile.regionName, sports, trustLabel(profile.reputation.trustState)].filter(Boolean).join(' · ') || '운영 프로필';
}

function roleLabel(role: V1MyTeam['role']) {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '운영진';
  return '멤버';
}

function trustLabel(state?: string) {
  if (state === 'verified') return '검증됨';
  if (state === 'estimated') return '추정';
  if (state === 'sample') return '샘플';
  return null;
}

export const adminEmptyDashboardModel: AdminDashboardModel = {
  state: 'ready',
  operatorName: '운영자',
  workspaceLabel: '개인 운영',
  profileMeta: '표시할 운영 데이터가 없습니다.',
  metrics: [
    metric('teams', '팀', 0, '권한 있는 팀', 'neutral'),
    metric('matches', '내 매치', 0, '내가 만든 개인 매치', 'neutral'),
    metric('teamMatches', '팀 매치', 0, '호스트/신청 팀매치', 'neutral'),
    metric('queue', '오늘 업무', 0, '처리할 항목', 'positive'),
    metric('reviews', '리뷰 대기', 0, '아직 남은 리뷰', 'positive'),
  ],
  primaryActions: [
    { label: '개인 매치 만들기', href: '/matches/new', tone: 'primary' },
    { label: '팀 매치 만들기', href: '/team-matches/new', tone: 'neutral' },
    { label: '팀 만들기', href: '/teams/new', tone: 'neutral' },
  ],
  queue: [],
  personalMatches: [],
  teamMatches: [],
  teams: [],
  communication: [],
};
