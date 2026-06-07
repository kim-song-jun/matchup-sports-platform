import type {
  V1Match,
  V1MyTeam,
  V1MyTeamMatch,
  V1Notification,
  V1Profile,
  V1ReviewListItem,
  V1TeamJoinApplication,
} from '@/types/api';
import type { AdminFunctionPageModel, AdminLoadState, AdminTone } from './admin.types';
import { matchRow, notificationRow, reviewRow, teamMatchRow, teamRequestItems, teamRow } from './admin.function-row-view-model';
import {
  combinedState,
  isRecruitingStatus,
  serviceErrorMessage,
  sum,
} from './admin.view-model-utils';

type CommonInput = {
  readonly profile?: V1Profile | null;
  readonly states: readonly AdminLoadState[];
  readonly errorMessage?: string;
};

export function toAdminMatchesPageModel(input: CommonInput & { readonly matches: readonly V1Match[] }): AdminFunctionPageModel {
  return pageModel(input, {
    activeTab: 'matches',
    eyebrow: '개인 매치',
    title: '개설한 개인 매치',
    description: '내가 만든 매치의 모집 상태, 상세 확인, 수정 경로를 한 화면에서 정리합니다.',
    testId: 'admin-matches-open-design',
    summaryLabel: '개인 매치 목록',
    summaryDetail: `${input.matches.length.toLocaleString('ko-KR')}개 매치 · 모집 상태와 수정 경로`,
    loadingTitle: '개인 매치 목록을 확인하고 있습니다',
    loadingBody: '내가 개설한 매치와 수정 가능한 작업을 불러오고 있습니다.',
    stats: [
      stat('total', '전체', input.matches.length, '내가 만든 매치', 'neutral'),
      stat('open', '모집 중', input.matches.filter((match) => isRecruitingStatus(match.status)).length, '현재 모집', 'positive'),
      stat('closed', '마감/종료', input.matches.filter((match) => !isRecruitingStatus(match.status)).length, '후속 확인', 'warning'),
    ],
    primaryActions: [{ label: '개인 매치 만들기', href: '/matches/new', tone: 'primary' }],
    rows: input.matches.map(matchRow),
    emptyTitle: '개설한 개인 매치가 없습니다.',
    sideTitle: '개인 매치 바로가기',
    sideItems: [
      side('created', '생성한 매치', '내가 만든 매치만 이 화면에서 수정 대상으로 표시합니다.', '/my/matches/created', 'neutral'),
      side('create', '새 매치 등록', '시간, 장소, 모집 조건을 입력하는 실제 생성 화면으로 이동합니다.', '/matches/new', 'positive'),
    ],
  });
}

export function toAdminTeamMatchesPageModel(input: CommonInput & { readonly teamMatches: readonly V1MyTeamMatch[] }): AdminFunctionPageModel {
  const hosted = input.teamMatches.filter((match) => match.relation === 'host_team');
  return pageModel(input, {
    activeTab: 'teamMatches',
    eyebrow: '팀매치',
    title: '팀매치 처리',
    description: '우리 팀이 주최하거나 신청한 팀매치를 비교하고 필요한 후속 작업으로 이동합니다.',
    testId: 'admin-team-matches-open-design',
    summaryLabel: '팀매치 처리 흐름',
    summaryDetail: `${input.teamMatches.length.toLocaleString('ko-KR')}개 팀매치 · 주최와 신청 상태`,
    loadingTitle: '팀매치 흐름을 확인하고 있습니다',
    loadingBody: '우리 팀의 주최 건과 신청 건을 구분해 정리하고 있습니다.',
    stats: [
      stat('total', '전체', input.teamMatches.length, '호스트/신청 포함', 'neutral'),
      stat('hosted', '주최', hosted.length, '수정 가능', hosted.length > 0 ? 'positive' : 'neutral'),
      stat('requested', '신청', input.teamMatches.length - hosted.length, '상세 확인', 'neutral'),
    ],
    primaryActions: [{ label: '팀매치 만들기', href: '/team-matches/new', tone: 'primary' }],
    rows: input.teamMatches.map(teamMatchRow),
    emptyTitle: '확인할 팀매치가 없습니다.',
    sideTitle: '팀매치 바로가기',
    sideItems: [
      side('create', '팀매치 등록', '팀 권한을 확인한 뒤 실제 팀매치 생성 화면으로 이동합니다.', '/team-matches/new', 'positive'),
      side('browse', '팀매치 찾기', '상대팀 모집 목록으로 이동합니다.', '/team-matches', 'neutral'),
    ],
  });
}

export function toAdminTeamsPageModel(input: CommonInput & {
  readonly teams: readonly V1MyTeam[];
  readonly joinRequests: readonly V1TeamJoinApplication[];
}): AdminFunctionPageModel {
  const managedTeams = input.teams.filter((team) => team.canManage);
  return pageModel(input, {
    activeTab: 'teams',
    eyebrow: '팀',
    title: '팀 관리',
    description: '팀장과 운영진 권한이 있는 팀, 멤버, 가입 요청을 빠르게 확인합니다.',
    testId: 'admin-teams-open-design',
    summaryLabel: '팀과 가입 요청',
    summaryDetail: `${managedTeams.length.toLocaleString('ko-KR')}개 팀 · 멤버와 가입 요청`,
    loadingTitle: '팀 관리 화면을 준비하고 있습니다',
    loadingBody: '권한이 있는 팀과 검토할 가입 요청을 확인하고 있습니다.',
    stats: [
      stat('managed', '운영 팀', managedTeams.length, '권한 있는 팀', managedTeams.length > 0 ? 'positive' : 'neutral'),
      stat('requests', '가입 요청', input.joinRequests.length, '검토 대기', input.joinRequests.length > 0 ? 'warning' : 'positive'),
      stat('members', '전체 멤버', sum(managedTeams.map((team) => team.memberCount)), '운영 팀 기준', 'neutral'),
    ],
    primaryActions: [{ label: '팀 만들기', href: '/teams/new', tone: 'primary' }],
    rows: managedTeams.map(teamRow),
    emptyTitle: '관리할 수 있는 팀이 없습니다.',
    sideTitle: '가입 요청',
    sideItems: teamRequestItems(input.joinRequests, managedTeams[0]?.teamId ?? null),
  });
}

export function toAdminReviewsPageModel(input: CommonInput & { readonly pendingReviews: readonly V1ReviewListItem[] }): AdminFunctionPageModel {
  const remaining = sum(input.pendingReviews.map((review) => review.remainingCount));
  return pageModel(input, {
    activeTab: 'reviews',
    eyebrow: '경기 후 리뷰',
    title: '리뷰 관리',
    description: '경기 종료 후 남은 리뷰를 처리해 팀과 매치의 신뢰 기록을 정리합니다.',
    testId: 'admin-reviews-open-design',
    summaryLabel: '리뷰 처리 흐름',
    summaryDetail: `${remaining.toLocaleString('ko-KR')}개 남은 리뷰 · 작성 대상 기준`,
    loadingTitle: '리뷰 관리 화면을 준비하고 있습니다',
    loadingBody: '경기 종료 후 남은 리뷰와 작성 가능한 화면을 확인하고 있습니다.',
    stats: [
      stat('sources', '경기', input.pendingReviews.length, '리뷰 소스', 'neutral'),
      stat('remaining', '대기', remaining, '남은 리뷰', remaining > 0 ? 'warning' : 'positive'),
      stat('done', '완료', input.pendingReviews.filter((review) => review.state === 'done').length, '작성 완료', 'positive'),
    ],
    primaryActions: [{ label: '리뷰 목록', href: '/my/reviews', tone: 'primary' }],
    rows: input.pendingReviews.map(reviewRow),
    emptyTitle: '작성할 리뷰가 없습니다.',
    sideTitle: '리뷰 바로가기',
    sideItems: [
      side('pending', '대기 리뷰', '남은 대상이 있는 경기만 우선 처리합니다.', '/my/reviews', remaining > 0 ? 'warning' : 'positive'),
      side('received', '받은 리뷰', '내가 받은 평가를 확인합니다.', '/my/reviews/received', 'neutral'),
    ],
  });
}

export function toAdminNotificationsPageModel(input: CommonInput & { readonly notifications: readonly V1Notification[] }): AdminFunctionPageModel {
  const unread = input.notifications.filter((notice) => notice.status !== 'read').length;
  return pageModel(input, {
    activeTab: 'notifications',
    eyebrow: '운영 알림함',
    title: '알림 관리',
    description: '신청, 팀매치, 리뷰 알림을 확인하고 필요한 업무로 바로 이동합니다.',
    testId: 'admin-notifications-open-design',
    summaryLabel: '업무 알림',
    summaryDetail: `${input.notifications.length.toLocaleString('ko-KR')}개 알림 · 이동 가능한 업무`,
    loadingTitle: '업무 알림을 확인하고 있습니다',
    loadingBody: '최근 알림과 이동 가능한 업무 화면을 정리하고 있습니다.',
    stats: [
      stat('total', '전체', input.notifications.length, '최근 알림', 'neutral'),
      stat('unread', '미확인', unread, '확인 필요', unread > 0 ? 'warning' : 'positive'),
      stat('read', '확인 완료', input.notifications.length - unread, '읽은 알림', 'positive'),
    ],
    primaryActions: [{ label: '알림 전체 보기', href: '/notifications', tone: 'primary' }],
    rows: input.notifications.map(notificationRow),
    emptyTitle: '확인할 업무 알림이 없습니다.',
    sideTitle: '연결된 업무 화면',
    sideItems: [
      side('all', '전체 알림', '알림 전용 화면에서 읽음 상태를 관리합니다.', '/notifications', 'neutral'),
      side('settings', '알림 설정', '활동/마케팅 알림 수신 방식을 조정합니다.', '/my/settings/notifications', 'neutral'),
    ],
  });
}

function pageModel(input: CommonInput, page: Omit<AdminFunctionPageModel, 'state' | 'operatorName' | 'errorMessage'>): AdminFunctionPageModel {
  return {
    ...page,
    state: combinedState(input.states),
    operatorName: input.profile?.profile.displayName ?? input.profile?.displayName ?? '운영자',
    errorMessage: serviceErrorMessage(input.errorMessage),
  };
}

function stat(id: string, label: string, value: number, sub: string, tone: AdminTone) {
  return { id, label, value: value.toLocaleString('ko-KR'), sub, tone };
}

function side(id: string, title: string, body: string, href: string, tone: AdminTone) {
  return { id, title, body, href, tone };
}
