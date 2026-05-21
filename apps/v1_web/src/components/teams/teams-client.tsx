'use client';

import { useRouter } from 'next/navigation';
import {
  useV1ApproveTeamJoinApplication,
  useV1ChangeTeamMembershipRole,
  useV1CreateTeamJoinApplication,
  useV1RejectTeamJoinApplication,
  useV1RemoveTeamMembership,
  useV1TeamDetail,
  useV1TeamJoinEligibility,
  useV1TeamJoinApplications,
  useV1TeamMembers,
  useV1Teams,
  useV1WithdrawTeamJoinApplication,
} from '@/hooks/use-v1-api';
import type { V1Team, V1TeamDetail, V1TeamJoinApplication, V1TeamMember } from '@/types/api';
import { TeamDetailPageView, TeamListPageView, TeamMembersPageView, TeamStatePageView } from './teams-page';
import type { TeamDetailViewModel, TeamListViewModel, TeamMembersViewModel, TeamModel } from './teams.types';
import { getTeamDetailViewModel, getTeamListViewModel, getTeamMembersViewModel, getTeamStateViewModel } from './teams.view-model';

export function TeamListPageClient() {
  const query = useV1Teams();

  if (query.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;

  const base = getTeamListViewModel();
  const items = query.data?.items;
  const model: TeamListViewModel = items
    ? {
        ...base,
        teams: items.map((item, index) => toTeam(item, base.teams[index] ?? base.teams[0])),
        summary: {
          ...base.summary,
          total: items.length,
          recruiting: items.filter((item) => item.joinPolicy === 'approval_required').length,
        },
      }
    : base;

  if (items && items.length === 0) return <TeamStatePageView model={getTeamStateViewModel('empty')} />;

  return <TeamListPageView model={model} />;
}

export function TeamSearchPageClient({ queryText = '' }: { queryText?: string }) {
  const query = useV1Teams(queryText ? { query: queryText, limit: 20 } : { limit: 20 });
  const base = getTeamStateViewModel('search');

  if (query.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;

  const items = query.data?.items;
  const model = items
    ? {
        ...base,
        query: queryText || base.query,
        teams: items.map((item, index) => toTeam(item, base.teams[index] ?? base.teams[0])),
        summary: {
          ...base.summary,
          total: items.length,
          recruiting: items.filter((item) => item.joinPolicy === 'approval_required').length,
        },
      }
    : base;

  return <TeamStatePageView model={model} />;
}

export function TeamFilterPageClient() {
  const query = useV1Teams({ joinPolicy: 'approval_required', sort: 'recommended', limit: 20 });
  const base = getTeamStateViewModel('filter');

  if (query.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;

  const items = query.data?.items;
  const model = items
    ? {
        ...base,
        teams: items.map((item, index) => toTeam(item, base.teams[index] ?? base.teams[0])),
        summary: {
          ...base.summary,
          total: items.length,
          recruiting: items.filter((item) => item.joinPolicy === 'approval_required').length,
        },
      }
    : base;

  return <TeamStatePageView model={model} />;
}

export function TeamDetailPageClient({ teamId }: { teamId: string }) {
  const router = useRouter();
  const query = useV1TeamDetail(teamId);
  const eligibility = useV1TeamJoinEligibility(teamId, { enabled: Boolean(query.data) });
  const join = useV1CreateTeamJoinApplication(teamId);
  const withdraw = useV1WithdrawTeamJoinApplication(teamId, eligibility.data?.applicationId);
  const fallback = getTeamDetailViewModel();

  if (query.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;

  const model: TeamDetailViewModel = query.data
    ? {
        ...fallback,
        team: {
          ...fallback.team,
          ...toTeamDetail(query.data, fallback.team),
          description: query.data.profile.introduction ?? fallback.team.description,
          activity: query.data.profile.activityAreaText ?? fallback.team.activity,
          condition: query.data.profile.skillLevelText ?? fallback.team.condition,
          trustNote: `${query.data.trust.trustState} · ${query.data.trust.score ?? '평가 전'}`,
          schedule: fallback.team.schedule,
          city: fallback.team.city,
          county: query.data.region?.name ?? fallback.team.county,
          level: query.data.profile.skillLevelText ?? fallback.team.level,
          contact: fallback.team.contact,
          links: fallback.team.links,
          images: fallback.team.images,
          membersList: query.data.membersPreview.map((member) => ({
            name: member.displayName,
            role: roleLabel(member.role),
            meta: member.role,
            status: member.role === 'owner' || member.role === 'manager' ? '관리자' : '활동중',
          })),
        },
        mode: toDetailMode(query.data),
        ctaLabel: ctaLabel(query.data, eligibility.data),
        ctaPending: join.isPending || withdraw.isPending,
        onCta: ctaAction({
          team: query.data,
          eligibility: eligibility.data,
          manage: () => router.push(`/teams/${teamId}/members`),
          myTeam: () => router.push(`/my/teams/${teamId}`),
          join: () => join.mutate({ message: null }),
          withdraw: () => withdraw.mutate({ reason: 'team_join_withdrawn_from_v1_web' }),
        }),
      }
    : fallback;

  return <TeamDetailPageView model={model} />;
}

export function TeamMembersPageClient({ teamId }: { teamId: string }) {
  const team = useV1TeamDetail(teamId);
  const members = useV1TeamMembers(teamId, { limit: 50 });
  const canReviewApplications = team.data?.viewer.role === 'owner' || team.data?.viewer.role === 'manager';
  const applications = useV1TeamJoinApplications(teamId, { status: 'requested', limit: 50 }, { enabled: canReviewApplications });
  const changeRole = useV1ChangeTeamMembershipRole(teamId);
  const removeMember = useV1RemoveTeamMembership(teamId);
  const approveApplication = useV1ApproveTeamJoinApplication(teamId);
  const rejectApplication = useV1RejectTeamJoinApplication(teamId);
  const fallback = getTeamMembersViewModel();

  const memberItems = members.data?.items ?? [];
  const requestItems = applications.data?.items ?? [];
  const actionPending = changeRole.isPending || removeMember.isPending || approveApplication.isPending || rejectApplication.isPending;

  const model: TeamMembersViewModel = {
    ...fallback,
    teamName: team.data?.name ?? fallback.teamName,
    summary: {
      total: members.data?.summary.memberCount ?? memberItems.length,
      managers: members.data ? members.data.summary.ownerCount + members.data.summary.managerCount : fallback.summary.managers,
      pending: requestItems.length,
    },
    members: memberItems.length
      ? memberItems.map((member) =>
          toMemberModel(member, {
            actionPending,
            promote: () => changeRole.mutate({ membershipId: member.membershipId, role: 'manager' }),
            demote: () => changeRole.mutate({ membershipId: member.membershipId, role: 'member' }),
            remove: () => removeMember.mutate({ membershipId: member.membershipId, reason: 'removed_from_v1_web_member_page' }),
          }),
        )
      : fallback.members,
    requests: requestItems.map((application) =>
      toRequestModel(application, {
        actionPending,
        approve: () => approveApplication.mutate({ applicationId: application.applicationId, note: null }),
        reject: () => rejectApplication.mutate({ applicationId: application.applicationId, reason: 'rejected_from_v1_web_member_page' }),
      }),
    ),
  };

  if (team.isError || members.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;

  return <TeamMembersPageView model={model} />;
}

function toTeam(team: V1Team, fallback: TeamModel): TeamModel {
  const id = team.teamId ?? team.id;
  const sportName = team.sport?.name ?? team.sportName;
  const regionName = team.region?.name ?? team.regionName ?? '지역 미정';

  return {
    ...fallback,
    id,
    name: team.name,
    logo: team.name.slice(0, 1),
    sport: sportName,
    sports: [sportName],
    region: regionName,
    members: team.memberCount,
    status: team.joinPolicy === 'closed' ? 'closed' : 'open',
    statusLabel: team.joinPolicy === 'closed' ? '마감' : '모집중',
    trust: toTrustBadge(team.trustState),
    intro: team.introductionPreview ?? `${regionName}에서 활동하는 ${sportName} 팀입니다. 가입은 팀 운영 정책에 따라 처리됩니다.`,
  };
}

function toTeamDetail(team: V1TeamDetail, fallback: TeamModel): TeamModel {
  return {
    ...fallback,
    id: team.teamId,
    name: team.name,
    logo: team.name.slice(0, 1),
    sport: team.sport.name,
    sports: [team.sport.name],
    region: team.region?.name ?? '지역 미정',
    members: team.memberCount,
    status: team.profile.joinPolicy === 'closed' ? 'closed' : team.viewer.joinState === 'requested' ? 'reviewing' : team.viewer.role !== 'none' ? 'mine' : 'open',
    statusLabel: team.profile.joinPolicy === 'closed' ? '마감' : team.viewer.joinState === 'requested' ? '검토중' : team.viewer.role !== 'none' ? '내 팀' : '모집중',
    trust: toTrustBadge(team.trustState ?? team.trust.trustState),
    intro: team.profile.introduction ?? fallback.intro,
    manner: team.trust.score ?? fallback.manner,
  };
}

function toDetailMode(team: V1TeamDetail): TeamDetailViewModel['mode'] {
  if (team.viewer.role === 'owner' || team.viewer.role === 'manager' || team.viewer.role === 'member') return 'mine';
  if (team.viewer.joinState === 'requested') return 'pending';
  if (team.profile.joinPolicy === 'closed') return 'closed';
  return 'default';
}

function ctaLabel(team: V1TeamDetail, eligibility?: { message: string; joinState: string; eligible: boolean }) {
  if (team.viewer.role === 'owner' || team.viewer.role === 'manager') return '팀 관리';
  if (team.viewer.role === 'member') return '내 팀';
  if (eligibility?.joinState === 'requested') return '가입 신청 취소';
  if (eligibility?.eligible) return '가입 신청';
  return eligibility?.message ?? '가입 불가';
}

function ctaAction({
  team,
  eligibility,
  manage,
  myTeam,
  join,
  withdraw,
}: {
  team: V1TeamDetail;
  eligibility?: { eligible: boolean; joinState: string };
  manage: () => void;
  myTeam: () => void;
  join: () => void;
  withdraw: () => void;
}) {
  if (team.viewer.role === 'owner' || team.viewer.role === 'manager') return manage;
  if (team.viewer.role === 'member') return myTeam;
  if (eligibility?.joinState === 'requested') return withdraw;
  if (eligibility?.eligible) return join;
  return undefined;
}

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager') return '운영진';
  return '멤버';
}

function toTrustBadge(state: V1Team['trustState'] | V1TeamDetail['trustState']): TeamModel['trust'] {
  if (!state || state === 'none') return 'sample';
  return state;
}

function toMemberModel(
  member: V1TeamMember,
  actions: {
    actionPending: boolean;
    promote: () => void;
    demote: () => void;
    remove: () => void;
  },
): TeamMembersViewModel['members'][number] {
  return {
    name: member.displayName,
    role: roleLabel(member.role),
    meta: `가입 ${formatDate(member.joinedAt)}`,
    status: member.status === 'active' ? '활동중' : member.status,
    locked: member.role === 'owner',
    onPromote: member.canChangeRole && member.role === 'member' ? actions.promote : undefined,
    onDemote: member.canChangeRole && member.role === 'manager' ? actions.demote : undefined,
    onRemove: member.canRemove ? actions.remove : undefined,
    actionPending: actions.actionPending,
  };
}

function toRequestModel(
  application: V1TeamJoinApplication,
  actions: {
    actionPending: boolean;
    approve: () => void;
    reject: () => void;
  },
): TeamMembersViewModel['requests'][number] {
  return {
    name: application.applicant.displayName,
    meta: application.message ?? `신청 ${formatDate(application.createdAt)}`,
    status: application.status === 'requested' ? '검토중' : application.status,
    onApprove: actions.approve,
    onReject: actions.reject,
    actionPending: actions.actionPending,
  };
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
