'use client';

import {
  useV1ApplyTeamMatch,
  useV1ApproveTeamMatchApplication,
  useV1RejectTeamMatchApplication,
  useV1TeamMatch,
  useV1TeamMatchApplications,
  useV1TeamMatchEligibility,
  useV1TeamMatches,
  useV1WithdrawTeamMatchApplication,
} from '@/hooks/use-v1-api';
import type { V1TeamMatch, V1TeamMatchApiStatus, V1TeamMatchViewerState } from '@/types/api';
import { TeamMatchDetailPageView, TeamMatchListPageView, TeamMatchStatePageView } from './team-matches-page';
import type { TeamMatchDetailViewModel, TeamMatchListViewModel, TeamMatchModel } from './team-matches.types';
import {
  getTeamMatchDetailViewModel,
  getTeamMatchListViewModel,
  getTeamMatchStateViewModel,
} from './team-matches.view-model';

export function TeamMatchListPageClient() {
  const query = useV1TeamMatches();

  if (query.isError) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;

  const base = getTeamMatchListViewModel();
  const items = query.data?.items;
  const model: TeamMatchListViewModel = items
    ? {
        ...base,
        matches: items.map((item, index) => toTeamMatch(item, base.matches[index] ?? base.matches[0])),
        summary: { ...base.summary, count: items.length, today: items.length },
      }
    : base;

  if (items && items.length === 0) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('empty')} />;

  return <TeamMatchListPageView model={model} />;
}

export function TeamMatchDetailPageClient({ teamMatchId }: { teamMatchId: string }) {
  const query = useV1TeamMatch(teamMatchId);
  const viewerState = query.data ? getViewerState(query.data) : 'none';
  const eligibility = useV1TeamMatchEligibility(teamMatchId, undefined, { enabled: Boolean(query.data) && viewerState !== 'host_team' });
  const applications = useV1TeamMatchApplications(teamMatchId, { status: 'requested', limit: 10 }, { enabled: viewerState === 'host_team' });
  const applyTeamMatch = useV1ApplyTeamMatch(teamMatchId);
  const approveApplication = useV1ApproveTeamMatchApplication(teamMatchId);
  const rejectApplication = useV1RejectTeamMatchApplication(teamMatchId);
  const selectedEligibility = eligibility.data?.teams.find((team) => team.eligible) ?? eligibility.data?.teams[0] ?? null;
  const withdrawTeamMatch = useV1WithdrawTeamMatchApplication(teamMatchId, selectedEligibility?.applicationId);
  const fallback = getTeamMatchDetailViewModel();

  if (query.isError) return <TeamMatchStatePageView model={getTeamMatchStateViewModel('error')} />;

  const model: TeamMatchDetailViewModel = query.data
    ? {
        ...fallback,
        match: {
          ...fallback.match,
          ...toTeamMatch(query.data, fallback.match),
          description: query.data.description ?? query.data.descriptionPreview ?? fallback.match.description,
          address: query.data.place?.addressText ?? query.data.placeName ?? fallback.match.address,
          applicantTeams: toApplicantTeams(query.data, fallback.match.applicantTeams, applications.data?.items, {
            pending: approveApplication.isPending || rejectApplication.isPending,
            approve: (applicationId) => approveApplication.mutate({ applicationId }),
            reject: (applicationId) => rejectApplication.mutate({ applicationId, reason: 'host_rejected_from_v1_web' }),
          }),
        },
        mode: toDetailMode(viewerState, getStatus(query.data)),
        applyLabel: applyLabel(viewerState, getStatus(query.data), selectedEligibility),
        applyPending: applyTeamMatch.isPending || withdrawTeamMatch.isPending,
        onApply: getApplyAction({
          viewerState,
          selectedTeamId: selectedEligibility?.teamId,
          applicationId: selectedEligibility?.applicationId,
          eligible: selectedEligibility?.eligible,
          apply: (teamId) => applyTeamMatch.mutate({ applicantTeamId: teamId, message: null }),
          withdraw: () => withdrawTeamMatch.mutate({ reason: 'applicant_team_withdrawn_from_v1_web' }),
        }),
      }
    : fallback;

  return <TeamMatchDetailPageView model={model} />;
}

function toTeamMatch(match: V1TeamMatch, fallback: TeamMatchModel): TeamMatchModel {
  const status = statusToCardStatus(getStatus(match), getViewerState(match));

  return {
    ...fallback,
    id: match.teamMatchId ?? match.id ?? fallback.id,
    title: match.title,
    sport: match.sport?.name ?? match.sportName ?? fallback.sport,
    hostTeam: match.hostTeam?.name ?? match.hostTeamName ?? fallback.hostTeam,
    venue: match.place?.name ?? match.placeName ?? fallback.venue,
    date: formatDate(match.startsAt),
    time: formatTime(match.startsAt),
    grade: match.levelLabel ?? fallback.grade,
    cost: parseMoney(match.costNote, fallback.cost),
    opponentCost: parseMoney(match.costNote, fallback.opponentCost),
    uniform: match.rulesText ?? fallback.uniform,
    status,
  };
}

function toApplicantTeams(
  match: V1TeamMatch,
  fallback: TeamMatchDetailViewModel['match']['applicantTeams'],
  applications?: Array<{
    applicationId: string;
    status: string;
    message: string | null;
    applicantTeam: { name: string; score: number | null; matchCount: number };
  }>,
  actions?: { pending: boolean; approve: (applicationId: string) => void; reject: (applicationId: string) => void },
) {
  if (applications?.length) {
    return applications.map((application) => ({
      name: application.applicantTeam.name,
      meta: `${application.applicantTeam.score ?? '평가 전'} · ${application.applicantTeam.matchCount}경기${application.message ? ` · ${application.message}` : ''}`,
      status: application.status === 'requested' ? '신청대기' : application.status,
      actionPending: actions?.pending,
      onApprove: application.status === 'requested' && actions ? () => actions.approve(application.applicationId) : undefined,
      onReject: application.status === 'requested' && actions ? () => actions.reject(application.applicationId) : undefined,
    }));
  }

  if (match.approvedOpponentTeam) {
    return [{ name: match.approvedOpponentTeam.name, meta: '승인된 상대팀', status: '승인완료' }];
  }

  return fallback;
}

function getStatus(match: V1TeamMatch): V1TeamMatchApiStatus {
  return (match.displayState as V1TeamMatchApiStatus | undefined) ?? (match.status as V1TeamMatchApiStatus);
}

function getViewerState(match: V1TeamMatch): V1TeamMatchViewerState {
  return match.viewer?.state ?? match.viewerState ?? 'none';
}

function statusToCardStatus(status: V1TeamMatchApiStatus, viewerState: V1TeamMatchViewerState = 'none'): TeamMatchModel['status'] {
  if (viewerState === 'host_team') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || status === 'matched') return 'approved';
  return 'open';
}

function toDetailMode(viewerState: V1TeamMatchViewerState, status: V1TeamMatchApiStatus): TeamMatchDetailViewModel['mode'] {
  if (viewerState === 'host_team') return 'mine';
  if (viewerState === 'requested') return 'pending';
  if (viewerState === 'approved' || status === 'matched') return 'approved';
  return 'default';
}

function applyLabel(
  viewerState: V1TeamMatchViewerState,
  status: V1TeamMatchApiStatus,
  team?: { eligible: boolean; reasonCode: string; applicationId: string | null; name: string } | null,
) {
  if (viewerState === 'host_team') return '매치 관리';
  if (viewerState === 'requested' || team?.reasonCode === 'ALREADY_REQUESTED') return '신청 취소';
  if (viewerState === 'approved' || status === 'matched') return '승인 완료';
  if (status !== 'recruiting') return '신청 불가';
  if (team?.eligible) return `${team.name}으로 신청`;
  return reasonLabel(team?.reasonCode);
}

function getApplyAction({
  viewerState,
  selectedTeamId,
  applicationId,
  eligible,
  apply,
  withdraw,
}: {
  viewerState: V1TeamMatchViewerState;
  selectedTeamId?: string;
  applicationId?: string | null;
  eligible?: boolean;
  apply: (teamId: string) => void;
  withdraw: () => void;
}) {
  if ((viewerState === 'requested' || applicationId) && applicationId) return withdraw;
  if (eligible && selectedTeamId) return () => apply(selectedTeamId);
  return undefined;
}

function reasonLabel(reasonCode?: string) {
  if (reasonCode === 'HOST_TEAM_CANNOT_APPLY') return '호스트 팀은 신청 불가';
  if (reasonCode === 'ALREADY_APPROVED') return '승인 완료';
  if (reasonCode === 'MATCHED_ALREADY') return '매칭 완료';
  if (reasonCode === 'NOT_RECRUITING') return '신청 불가';
  return '신청할 팀 없음';
}

function parseMoney(value: string | null | undefined, fallback: number) {
  const amount = value?.match(/\d[\d,]*/)?.[0]?.replace(/,/g, '');
  return amount ? Number(amount) : fallback;
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
