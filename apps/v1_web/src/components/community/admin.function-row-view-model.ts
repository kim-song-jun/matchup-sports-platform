import type { V1Match, V1MyTeam, V1MyTeamMatch, V1Notification, V1ReviewListItem, V1TeamJoinApplication } from '@/types/api';
import type { AdminFunctionRowModel, AdminFunctionSideItemModel, AdminTone } from './admin.types';
import { formatDateTime, isRecruitingStatus, runtimeOperationHref, statusLabel, teamMatchEditHref } from './admin.view-model-utils';

export function matchRow(match: V1Match): AdminFunctionRowModel {
  const id = match.matchId ?? match.id;
  return row({
    id,
    title: match.title,
    meta: [match.sport?.name ?? match.sportName, match.region?.name ?? match.regionName, formatDateTime(match.startsAt)].filter(Boolean).join(' · '),
    statusLabel: statusLabel(match.status),
    href: `/matches/${id}`,
    tone: isRecruitingStatus(match.status) ? 'positive' : 'neutral',
    editHref: `/matches/${id}/edit`,
  });
}

export function teamMatchRow(match: V1MyTeamMatch): AdminFunctionRowModel {
  const href = runtimeOperationHref(match.detailRoute, `/team-matches/${match.teamMatchId}`);
  return row({
    id: match.teamMatchId,
    title: match.title,
    meta: [match.teamName, match.sportName, formatDateTime(match.startsAt)].filter(Boolean).join(' · '),
    statusLabel: `${statusLabel(match.status)} · ${relationLabel(match.relation)}`,
    href,
    tone: match.relation === 'host_team' ? 'positive' : 'neutral',
    editHref: match.relation === 'host_team' ? teamMatchEditHref(match.teamMatchId) : undefined,
  });
}

export function teamRow(team: V1MyTeam): AdminFunctionRowModel {
  return {
    id: team.teamId,
    title: team.name,
    meta: [team.sport.name, team.region?.name, `${team.memberCount.toLocaleString('ko-KR')}명`].filter(Boolean).join(' · '),
    statusLabel: roleLabel(team.role),
    href: `/my/teams/${team.teamId}`,
    tone: team.canManage ? 'positive' : 'neutral',
    actions: [
      { label: '팀 홈', href: `/my/teams/${team.teamId}`, tone: 'neutral', ariaLabel: `${team.name} 팀 홈` },
      { label: '멤버/요청', href: `/my/teams/${team.teamId}/members`, tone: 'neutral', ariaLabel: `${team.name} 멤버/요청` },
    ],
  };
}

export function reviewRow(review: V1ReviewListItem): AdminFunctionRowModel {
  const href = `/my/reviews/${review.sourceType}/${review.sourceId}`;
  return {
    id: `${review.sourceType}:${review.sourceId}`,
    title: review.title,
    meta: [sourceLabel(review.sourceType), review.completedAt ? formatDateTime(review.completedAt) : null].filter(Boolean).join(' · '),
    statusLabel: review.remainingCount > 0 ? `${review.remainingCount.toLocaleString('ko-KR')}개 대기` : '작성 완료',
    href,
    tone: review.remainingCount > 0 ? 'warning' : 'positive',
    actions: [{ label: '리뷰 작성', href, tone: 'neutral', ariaLabel: `${review.title} 리뷰 작성` }],
  };
}

export function notificationRow(notification: V1Notification): AdminFunctionRowModel {
  const href = runtimeOperationHref(notification.target.route, '/notifications');
  return {
    id: notification.notificationId,
    title: notification.title,
    meta: [notification.body, formatDateTime(notification.createdAt)].filter(Boolean).join(' · '),
    statusLabel: notification.status === 'read' ? '확인 완료' : '미확인',
    href,
    tone: notification.status === 'read' ? 'neutral' : 'warning',
    actions: [{ label: '확인', href, tone: 'neutral', ariaLabel: `${notification.title} 확인` }],
  };
}

export function teamRequestItems(joinRequests: readonly V1TeamJoinApplication[], teamId: string | null): readonly AdminFunctionSideItemModel[] {
  if (joinRequests.length === 0) return [side('empty', '가입 요청 없음', '검토 대기 중인 가입 요청이 없습니다.', '/my/teams', 'positive')];
  return joinRequests.slice(0, 4).map((request) => side(
    request.applicationId,
    `${request.applicant.displayName} 가입 요청`,
    request.message ?? '가입 요청 메시지를 확인하세요.',
    teamId ? `/my/teams/${teamId}/members` : '/my/teams',
    'warning',
  ));
}

function row(input: {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
  readonly statusLabel: string;
  readonly href: string;
  readonly tone: AdminTone;
  readonly editHref?: string;
}): AdminFunctionRowModel {
  const actions = [
    { label: '상세', href: input.href, tone: 'neutral' as const, ariaLabel: `${input.title} 상세` },
    input.editHref ? { label: '수정', href: input.editHref, tone: 'neutral' as const, ariaLabel: `${input.title} 수정` } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  return { ...input, actions };
}

function side(id: string, title: string, body: string, href: string, tone: AdminTone): AdminFunctionSideItemModel {
  return { id, title, body, href, tone };
}

function relationLabel(value: V1MyTeamMatch['relation']) {
  if (value === 'host_team') return '주최';
  if (value === 'approved') return '승인';
  if (value === 'rejected') return '반려';
  if (value === 'withdrawn') return '철회';
  return '신청';
}

function roleLabel(role: V1MyTeam['role']) {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '운영진';
  return '멤버';
}

function sourceLabel(sourceType: V1ReviewListItem['sourceType']) {
  return sourceType === 'team_match' ? '팀매치' : '개인 매치';
}
