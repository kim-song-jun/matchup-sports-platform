import { within } from '@testing-library/react';
import { expect } from 'vitest';

import { toAdminActivityModel, toAdminDashboardModel } from '@/components/community/admin.view-model';
import type {
  V1Match,
  V1MyTeam,
  V1MyTeamMatch,
  V1Notification,
  V1Profile,
  V1ReviewListItem,
  V1TeamJoinApplication,
} from '@/types/api';

export const profile: V1Profile = {
  userId: 'user-1',
  accountStatus: 'active',
  email: 'host@teameet.v1',
  authProvider: 'email',
  regionName: '서울 강동',
  sports: [{ sportId: 'sport-futsal', sportName: '풋살', levelId: 'level-1', levelName: '중수', primary: true }],
  regions: [{ regionId: 'region-gangdong', regionName: '서울 강동', primary: true }],
  profile: {
    displayName: '송준',
    profileImageUrl: null,
    bio: '풋살 팀과 개인 매치를 운영합니다.',
    visibilityStatus: 'public',
  },
  reputation: {
    trustState: 'verified',
    mannerScore: 4.8,
    activityCount: 12,
    reviewCount: 5,
  },
};

export const teams: readonly V1MyTeam[] = [
  {
    teamId: 'team-1',
    membershipId: 'membership-1',
    name: '성수 볼러즈',
    role: 'owner',
    status: 'active',
    logoUrl: null,
    sport: { sportId: 'sport-futsal', name: '풋살' },
    region: { regionId: 'region-gangdong', name: '서울 강동' },
    trust: { trustState: 'verified', score: 4.8 },
    memberCount: 18,
    canManage: true,
    canCreateTeamMatch: true,
    detailRoute: '/teams/team-1',
    manageRoute: '/teams/team-1/manage',
  },
];

export const createdMatches: readonly V1Match[] = [
  {
    id: 'match-1',
    matchId: 'match-1',
    title: '성수 풋살장 동네 5:5',
    sportName: '풋살',
    sport: { sportId: 'sport-futsal', name: '풋살' },
    regionName: '서울 강동',
    region: { regionId: 'region-gangdong', name: '서울 강동' },
    placeName: '성수 실내풋살장',
    place: { name: '성수 실내풋살장', addressText: null },
    startsAt: '2026-05-18T20:00:00.000Z',
    capacityText: '7/10명',
    capacity: 10,
    participantCount: 7,
    status: 'open',
  },
];

export const teamMatches: readonly V1MyTeamMatch[] = [
  {
    teamMatchId: 'team-match-1',
    title: '마포 FC 상대팀 모집',
    sportName: '축구',
    startsAt: '2026-05-22T21:00:00.000Z',
    status: 'recruiting',
    relation: 'host_team',
    teamId: 'team-1',
    teamName: '성수 볼러즈',
    applicationId: null,
    manageRoute: '/team-matches/team-match-1/manage',
    detailRoute: '/team-matches/team-match-1',
  },
];

export const joinRequests: readonly V1TeamJoinApplication[] = [
  {
    applicationId: 'join-1',
    status: 'requested',
    message: '주말 경기 참여를 희망합니다.',
    createdAt: '2026-05-18T09:00:00.000Z',
    applicant: {
      userId: 'user-2',
      displayName: '민준',
      profileImageUrl: null,
      trustState: 'verified',
    },
  },
];

export const notifications: readonly V1Notification[] = [
  {
    notificationId: 'notification-1',
    type: 'team_match',
    title: '팀매치 신청 도착',
    body: '상대팀 신청이 들어왔습니다.',
    target: { type: 'team_match', id: 'team-match-1', route: '/team-matches/team-match-1' },
    status: 'created',
    readAt: null,
    createdAt: '2026-05-24T07:50:00.000Z',
  },
  {
    notificationId: 'notification-2',
    type: 'system',
    title: '지원 알림',
    body: '지원 요청 내용을 확인하세요.',
    target: { type: 'user', id: 'user-2', route: '/admin/users/user-2' },
    status: 'created',
    readAt: null,
    createdAt: '2026-05-25T08:00:00.000Z',
  },
];

export const pendingReviews: readonly V1ReviewListItem[] = [
  {
    sourceType: 'team_match',
    sourceId: 'team-match-completed-1',
    title: '성수 볼러즈 vs 마포 FC',
    completedAt: '2026-05-19T21:30:00.000Z',
    targetType: 'team',
    targetCount: 1,
    reviewedCount: 0,
    remainingCount: 1,
    reviewerTeam: { teamId: 'team-1', name: '성수 볼러즈' },
    targetTeam: { teamId: 'team-2', name: '마포 FC' },
    state: 'ready',
  },
];

export function dashboardModel(state: 'ready' | 'error' = 'ready') {
  return toAdminDashboardModel({
    profile: state === 'error' ? null : profile,
    teams: state === 'error' ? [] : teams,
    createdMatches: state === 'error' ? [] : createdMatches,
    teamMatches: state === 'error' ? [] : teamMatches,
    joinRequests: state === 'error' ? [] : joinRequests,
    notifications: state === 'error' ? [] : notifications,
    unreadNotificationCount: state === 'error' ? 0 : 1,
    pendingReviews: state === 'error' ? [] : pendingReviews,
    states: [state],
    errorMessage: state === 'error' ? 'Unauthorized' : undefined,
  });
}

export function activityModel(state: 'ready' | 'error' = 'ready') {
  return toAdminActivityModel({
    profile: state === 'error' ? null : profile,
    createdMatches: state === 'error' ? [] : createdMatches,
    teamMatches: state === 'error' ? [] : teamMatches,
    notifications: state === 'error' ? [] : notifications,
    pendingReviews: state === 'error' ? [] : pendingReviews,
    states: [state],
    errorMessage: state === 'error' ? 'Unauthorized' : undefined,
  });
}

export function loadingDashboardModel() {
  return toAdminDashboardModel({
    profile,
    teams: [],
    createdMatches: [],
    teamMatches: [],
    joinRequests: [],
    notifications: [],
    unreadNotificationCount: 0,
    pendingReviews: [],
    states: ['loading'],
  });
}

export function loadingActivityModel() {
  return toAdminActivityModel({
    profile,
    createdMatches: [],
    teamMatches: [],
    notifications: [],
    pendingReviews: [],
    states: ['loading'],
  });
}

export function expectRuntimeLinksOnly(container: HTMLElement) {
  const links = within(container).queryAllByRole('link');
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    const href = link.getAttribute('href') ?? '';
    expect(href).not.toContain('.html');
    expect(href).not.toBe('#');
    expect(href).not.toContain('/manage');
  }
}

export function expectCustomerErpCopy(container: HTMLElement) {
  const visibleText = container.textContent ?? '';
  expect(visibleText).not.toMatch(/관리자 권한|감사 로그|상태 변경|정산|분쟁|개발자|root|API|route|contract|mutation|seed|fixture|status:write|overview:read|logs:read|admin:owner|준비 중/);
}
