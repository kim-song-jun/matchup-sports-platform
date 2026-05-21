'use client';

import {
  useV1ApplyMatch,
  useV1ApproveMatchApplication,
  useV1Match,
  useV1MatchApplicationEligibility,
  useV1MatchApplications,
  useV1Matches,
  useV1RejectMatchApplication,
  useV1WithdrawMatchApplication,
} from '@/hooks/use-v1-api';
import type { V1Match, V1MatchApiStatus, V1ViewerState } from '@/types/api';
import { MatchDetailPageView, MatchListPageView, MatchStatePageView } from './matches-page';
import type { MatchCardModel, MatchDetailViewModel, MatchListViewModel } from './matches.types';
import { getMatchDetailViewModel, getMatchListViewModel, getMatchStateViewModel } from './matches.view-model';

export function MatchListPageClient() {
  const query = useV1Matches();

  if (query.isError) return <MatchStatePageView model={getMatchStateViewModel('error')} />;

  const base = getMatchListViewModel();
  const items = query.data?.items;
  const model: MatchListViewModel = items
    ? {
        ...base,
        matches: items.map((item, index) => toMatchCard(item, base.matches[index] ?? base.matches[0])),
        sports: buildSportSummary(items, base),
        summary: {
          ...base.summary,
          count: items.length,
          today: countToday(items),
          urgent: items.filter((item) => statusToCardStatus(getStatus(item)) === 'open').length,
        },
      }
    : base;

  if (items && items.length === 0) return <MatchStatePageView model={getMatchStateViewModel('empty')} />;

  return <MatchListPageView model={model} />;
}

export function MatchDetailPageClient({ matchId }: { matchId: string }) {
  const query = useV1Match(matchId);
  const eligibility = useV1MatchApplicationEligibility(matchId, { enabled: Boolean(query.data) });
  const viewerState = query.data ? getViewerState(query.data, eligibility.data?.viewerState) : 'none';
  const applications = useV1MatchApplications(matchId, { status: 'requested', limit: 10 }, { enabled: viewerState === 'host' });
  const applyMatch = useV1ApplyMatch(matchId);
  const approveApplication = useV1ApproveMatchApplication(matchId);
  const rejectApplication = useV1RejectMatchApplication(matchId);
  const withdrawMatch = useV1WithdrawMatchApplication(matchId, eligibility.data?.applicationId ?? query.data?.viewer?.applicationId);
  const fallback = getMatchDetailViewModel();

  if (query.isError) {
    return <MatchStatePageView model={getMatchStateViewModel('error')} />;
  }

  const model: MatchDetailViewModel = query.data
    ? {
        ...fallback,
        match: {
          ...fallback.match,
          ...toMatchCard(query.data, fallback.match),
          description: query.data.description ?? query.data.descriptionPreview ?? fallback.match.description,
          address: query.data.place?.addressText ?? query.data.placeName ?? fallback.match.address,
          rules: query.data.rulesText ? [query.data.rulesText] : fallback.match.rules,
          participants: toParticipants(query.data, fallback.match.participants, applications.data?.items, {
            pending: approveApplication.isPending || rejectApplication.isPending,
            approve: (applicationId) => approveApplication.mutate({ applicationId }),
            reject: (applicationId) => rejectApplication.mutate({ applicationId, reason: 'host_rejected_from_v1_web' }),
          }),
        },
        mode: toDetailMode(viewerState, getStatus(query.data)),
        applyLabel: applyLabel(viewerState, getStatus(query.data), eligibility.data?.message),
        applyPending: applyMatch.isPending || withdrawMatch.isPending,
        onApply: getApplyAction({
          viewerState,
          eligible: eligibility.data?.eligible,
          applicationId: eligibility.data?.applicationId ?? query.data.viewer?.applicationId,
          apply: () => applyMatch.mutate({ message: null }),
          withdraw: () => withdrawMatch.mutate({ reason: 'applicant_withdrawn_from_v1_web' }),
        }),
      }
    : fallback;

  return <MatchDetailPageView model={model} />;
}

function toMatchCard(match: V1Match, fallback: MatchCardModel): MatchCardModel {
  const capacity = getCapacity(match, fallback);
  const status = statusToCardStatus(getStatus(match), getViewerState(match));

  return {
    ...fallback,
    id: match.matchId ?? match.id ?? fallback.id,
    title: match.title,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    region: match.region?.name ?? match.regionName ?? fallback.region,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    current: capacity.current,
    capacity: capacity.capacity,
    level: match.levelLabel ?? fallback.level,
    host: match.host?.displayName ?? fallback.host,
    image: match.imageUrl ?? fallback.image,
    status,
    deadline: status === 'open' ? '신청 가능' : status === 'pending' ? '승인 대기' : status === 'approved' ? '승인 완료' : fallback.deadline,
    actionLabel: actionLabel(status),
  };
}

function toParticipants(
  match: V1Match,
  fallback: MatchDetailViewModel['match']['participants'],
  applications?: Array<{ applicationId: string; displayName: string; message: string | null; status: string }>,
  actions?: { pending: boolean; approve: (applicationId: string) => void; reject: (applicationId: string) => void },
) {
  if (applications?.length) {
    return applications.map((application) => ({
      name: application.displayName,
      meta: application.message ? `신청 메시지 · ${application.message}` : '신청자',
      status: application.status === 'requested' ? '승인 대기' : application.status,
      actionPending: actions?.pending,
      onApprove: actions ? () => actions.approve(application.applicationId) : undefined,
      onReject: actions ? () => actions.reject(application.applicationId) : undefined,
    }));
  }

  if (!match.participantsPreview?.length) return fallback;

  return match.participantsPreview.map((participant) => ({
    name: participant.displayName,
    meta: participant.role === 'host' ? '호스트' : '참가자',
    status: participant.status === 'confirmed' ? '승인완료' : participant.status,
  }));
}

function buildSportSummary(items: V1Match[], fallback: MatchListViewModel) {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const name = item.sport?.name ?? item.sportName ?? '기타';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  });

  return [
    { label: '전체', count: items.length, active: true },
    ...Array.from(counts.entries()).map(([label, count]) => ({ label, count })),
  ].slice(0, Math.max(fallback.sports.length, 1));
}

function countToday(items: V1Match[]) {
  const today = new Date();
  return items.filter((item) => {
    const date = new Date(item.startsAt);
    return (
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()
    );
  }).length;
}

function getCapacity(match: V1Match, fallback: MatchCardModel) {
  if (typeof match.participantCount === 'number' && typeof match.capacity === 'number') {
    return { current: match.participantCount, capacity: match.capacity };
  }

  const [current, capacity] = match.capacityText?.match(/\d+/g)?.map(Number) ?? [];
  return {
    current: current ?? fallback.current,
    capacity: capacity ?? match.capacity ?? fallback.capacity,
  };
}

function getStatus(match: V1Match): V1MatchApiStatus {
  return (match.displayState as V1MatchApiStatus | undefined) ?? (match.status as V1MatchApiStatus);
}

function getViewerState(match: V1Match, preflight?: Exclude<V1ViewerState, 'guest'>): V1ViewerState {
  return preflight ?? match.viewer?.state ?? match.viewerState ?? 'none';
}

function statusToCardStatus(status: V1MatchApiStatus, viewerState: V1ViewerState = 'none'): MatchCardModel['status'] {
  if (viewerState === 'host') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || viewerState === 'participant') return 'approved';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return 'full';
  return 'open';
}

function toDetailMode(viewerState: V1ViewerState, status: V1MatchApiStatus): MatchDetailViewModel['mode'] {
  if (viewerState === 'host') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || viewerState === 'participant') return 'approved';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return 'approved';
  return 'default';
}

function applyLabel(viewerState: V1ViewerState, status: V1MatchApiStatus, message?: string) {
  if (viewerState === 'host') return '매치 관리';
  if (viewerState === 'requested') return '신청 취소';
  if (viewerState === 'approved' || viewerState === 'participant') return '승인 완료';
  if (status === 'closed' || status === 'cancelled' || status === 'completed' || status === 'expired' || status === 'full') return '신청 불가';
  return message && message !== '신청할 수 있습니다.' ? message : '참가 신청';
}

function actionLabel(status: MatchCardModel['status']) {
  if (status === 'pending') return '승인 대기';
  if (status === 'approved') return '승인 완료';
  if (status === 'full') return '신청 마감';
  if (status === 'mine') return '내 매치';
  return '승인제 신청';
}

function getApplyAction({
  viewerState,
  eligible,
  applicationId,
  apply,
  withdraw,
}: {
  viewerState: V1ViewerState;
  eligible?: boolean;
  applicationId?: string | null;
  apply: () => void;
  withdraw: () => void;
}) {
  if (viewerState === 'requested' && applicationId) return withdraw;
  if (eligible) return apply;
  return undefined;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}
