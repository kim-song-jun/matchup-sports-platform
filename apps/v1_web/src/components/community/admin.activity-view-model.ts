import type { V1Match, V1MyTeamMatch, V1Notification, V1Profile, V1ReviewListItem } from '@/types/api';
import type { AdminActivityItemModel, AdminActivityModel, AdminLoadState } from './admin.types';
import { combinedState, formatDateTime, serviceErrorMessage, statusLabel, runtimeOperationHref } from './admin.view-model-utils';

type AdminActivityInput = {
  readonly profile?: V1Profile | null;
  readonly createdMatches: readonly V1Match[];
  readonly teamMatches: readonly V1MyTeamMatch[];
  readonly notifications: readonly V1Notification[];
  readonly pendingReviews: readonly V1ReviewListItem[];
  readonly states: readonly AdminLoadState[];
  readonly errorMessage?: string;
};

type AdminActivityDraft = AdminActivityItemModel & {
  readonly sortAt: number;
};

const emptyLabel = '0';

export function toAdminActivityModel(input: AdminActivityInput): AdminActivityModel {
  const items = [
    ...input.createdMatches.map(matchActivity),
    ...input.teamMatches.map(teamMatchActivity),
    ...input.notifications.map(notificationActivity),
    ...input.pendingReviews.map(reviewActivity),
  ].sort((left, right) => right.sortAt - left.sortAt).map(toActivityItem);

  return {
    state: combinedState(input.states),
    operatorName: input.profile?.profile.displayName ?? input.profile?.displayName ?? '운영자',
    summaryLabel: `${items.length.toLocaleString('ko-KR')}개 업무 흐름`,
    items,
    errorMessage: serviceErrorMessage(input.errorMessage),
  };
}

function matchActivity(match: V1Match): AdminActivityDraft {
  const id = match.matchId ?? match.id;
  return {
    id: `match:${id}`,
    title: match.title,
    sourceLabel: '개인 매치 운영',
    detail: `${statusLabel(match.status)} · ${match.place?.name ?? match.placeName}`,
    occurredAt: formatDateTime(match.startsAt),
    sortAt: sortTime(match.startsAt),
    href: `/matches/${id}`,
    tone: 'neutral',
  };
}

function teamMatchActivity(match: V1MyTeamMatch): AdminActivityDraft {
  return {
    id: `team-match:${match.teamMatchId}`,
    title: match.title,
    sourceLabel: '팀 매치 운영',
    detail: `${statusLabel(match.status)} · ${match.teamName ?? '팀'}`,
    occurredAt: formatDateTime(match.startsAt),
    sortAt: sortTime(match.startsAt),
    href: runtimeOperationHref(match.detailRoute, `/team-matches/${match.teamMatchId}`),
    tone: match.relation === 'host_team' ? 'positive' : 'neutral',
  };
}

function notificationActivity(notification: V1Notification): AdminActivityDraft {
  return {
    id: `notification:${notification.notificationId}`,
    title: notification.title,
    sourceLabel: '알림',
    detail: notification.body ?? '알림 본문 없음',
    occurredAt: formatDateTime(notification.createdAt),
    sortAt: sortTime(notification.createdAt),
    href: runtimeOperationHref(notification.target.route, '/notifications'),
    tone: notification.status === 'read' ? 'neutral' : 'warning',
  };
}

function reviewActivity(review: V1ReviewListItem): AdminActivityDraft {
  return {
    id: `review:${review.sourceType}:${review.sourceId}`,
    title: review.title,
    sourceLabel: '리뷰',
    detail: review.remainingCount > 0 ? `${review.remainingCount.toLocaleString('ko-KR')}개 미작성` : '작성 완료',
    occurredAt: formatDateTime(review.completedAt ?? ''),
    sortAt: sortTime(review.completedAt),
    href: `/my/reviews/${review.sourceType}/${review.sourceId}`,
    tone: review.remainingCount > 0 ? 'warning' : 'positive',
  };
}

function sortTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function toActivityItem({ sortAt: _sortAt, ...item }: AdminActivityDraft): AdminActivityItemModel {
  return item;
}

export const adminEmptyActivityModel: AdminActivityModel = {
  state: 'ready',
  operatorName: '운영자',
  summaryLabel: `${emptyLabel}개 업무 흐름`,
  items: [],
};
