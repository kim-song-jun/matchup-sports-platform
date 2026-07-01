'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  useV1ApproveTeamJoinApplication,
  useV1CancelTeamInvitation,
  useV1ChangeTeamMembershipRole,
  useV1CreateTeamJoinApplication,
  useV1MasterSports,
  useV1RecentSearches,
  useV1RecordSearch,
  useV1RejectTeamJoinApplication,
  useV1RemoveTeamMembership,
  useV1ResolveChatRoom,
  useV1SendTeamInvitation,
  useV1TeamDetail,
  useV1TeamInvitations,
  useV1TeamJoinEligibility,
  useV1TeamJoinApplications,
  useV1TeamMatches,
  useV1TeamMembers,
  useV1Teams,
  useV1WithdrawTeamJoinApplication,
} from '@/hooks/use-v1-api';
import { extractErrorMessage } from '@/lib/error-message';
import { V1ApiError, v1Get } from '@/lib/api-client';
import { formatTournamentDateShort } from '@/lib/date-utils';
import { teamSharePath } from '@/lib/team-share-route';
import { v1Keys } from '@/lib/query-keys';
import { V1_LEVELS, levelRangeMatches, toLevelCodes, toggleLevelCode } from '@/lib/v1-levels';
import { teamJoinApplicationStatusLabel } from '@/lib/v1-status-labels';
import type { V1Team, V1TeamDetail, V1TeamJoinApplication, V1TeamMember } from '@/types/api';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { TeamDetailPageView, TeamListPageView, TeamMembersPageView, TeamStatePageView } from './teams-page';
import type { TeamDetailViewModel, TeamListViewModel, TeamMembersViewModel, TeamModel } from './teams.types';
import { getTeamDetailViewModel, getTeamListViewModel, getTeamMembersViewModel, getTeamStateViewModel } from './teams.view-model';

export function TeamListPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedSportId = searchParams.get('sportId') ?? undefined;
  const selectedSort = toTeamSort(searchParams.get('sort'));
  const selectedGenderRule = toGenderRuleFilter(searchParams.get('genderRule'));
  const selectedLevels = toLevelCodes(searchParams.get('levelCodes') ?? searchParams.get('levels'));
  const filterOpen = searchParams.get('filter') === '1';
  const activeFilterCount = countTeamFilters(selectedSort, selectedGenderRule, selectedLevels);
  const initialQuery = searchParams.get('q') ?? '';
  const [searchValue, setSearchValue] = useState(initialQuery);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    setSearchValue(initialQuery);
    setSubmittedQuery(initialQuery);
  }, [initialQuery]);
  const sports = useV1MasterSports();
  const teamFilters = useMemo(() => {
    const filters: { sportId?: string; query?: string; joinPolicy?: 'approval_required'; sort?: 'recommended' | 'latest'; genderRule?: string; levelCodes?: string } = {};
    if (selectedSportId) filters.sportId = selectedSportId;
    if (selectedGenderRule) filters.genderRule = selectedGenderRule;
    if (selectedLevels.length) filters.levelCodes = selectedLevels.join(',');
    if (submittedQuery.trim()) filters.query = submittedQuery.trim();
    if (selectedSort === 'deadline') filters.joinPolicy = 'approval_required';
    if (selectedSort === 'latest') filters.sort = 'latest';
    if (selectedSort === 'recommended') filters.sort = 'recommended';
    return Object.keys(filters).length ? filters : undefined;
  }, [selectedGenderRule, selectedLevels, selectedSort, selectedSportId, submittedQuery]);
  const listFilters = useMemo(() => ({ ...(teamFilters ?? {}), limit: 50 }), [teamFilters]);
  const sportCountFilters = useMemo(() => {
    const { sportId: _sportId, ...filtersWithoutSport } = teamFilters ?? {};
    return { ...filtersWithoutSport, limit: 50 };
  }, [teamFilters]);
  const query = useV1Teams(listFilters);
  const sportCounts = useV1Teams(sportCountFilters, { enabled: Boolean(selectedSportId) });
  const recentSearches = useV1RecentSearches();
  const recordSearch = useV1RecordSearch();

  const base = getTeamListViewModel();
  const items = query.data?.items;
  const visibleItems = filterTeamsByLevels(items, selectedLevels);
  const activityDetailQueries = useQueries({
    queries: visibleItems.map((item) => {
      const teamId = item.teamId ?? item.id;
      const needsActivityFallback = !item.activitySummary && !item.activityAreaText;
      return {
        queryKey: [...v1Keys.team(teamId), 'detail', 'list-activity'] as const,
        queryFn: () => v1Get<V1TeamDetail>(`/teams/${teamId}`),
        enabled: Boolean(teamId && needsActivityFallback),
        staleTime: 30_000,
      };
    }),
  });
  const visibleTeams = visibleItems.map((item, index) => toTeam(withListActivityFallback(item, activityDetailQueries[index]?.data), base.teams[index] ?? base.teams[0]));

  if (query.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;
  const countItems = selectedSportId ? (sportCounts.data?.items ?? visibleItems) : visibleItems;
  const isListLoading = query.isLoading && !items;
  const searchModel: NonNullable<TeamListViewModel['search']> = {
    value: searchValue,
    placeholder: base.placeholder,
    recentItems: (recentSearches.data?.items ?? []).slice(0, 5).map((item) => ({ id: item.id, query: item.query })),
    isOpen: searchOpen,
    isLoading: recentSearches.isLoading,
    onFocus: () => setSearchOpen(true),
    onBlur: () => setSearchOpen(false),
    onChange: setSearchValue,
    onSubmit: () => submitSearch(searchValue),
    onClear: clearSearch,
    onSelectRecent: (value) => {
      setSearchValue(value);
      submitSearch(value, { source: 'recent' });
    },
  };
  const model: TeamListViewModel = {
    ...base,
    query: submittedQuery,
    filterCount: activeFilterCount,
    search: searchModel,
    filterHref: buildTeamHref(searchParams, { filter: '1' }),
    filterSheet: buildTeamFilterSheet(searchParams, selectedSort, selectedGenderRule, selectedLevels, filterOpen),
    chips: buildTeamSportChips(countItems, base, searchParams, selectedSportId, sports.data),
    teams: visibleTeams,
    listLoading: isListLoading,
    summary: {
      ...base.summary,
      total: visibleTeams.length,
      recruiting: visibleTeams.filter((item) => item.status === 'open').length,
      nearby: undefined,
    },
  };

  return <TeamListPageView model={model} />;

  function submitSearch(value: string, options?: { source?: string }) {
    const nextQuery = value.trim();
    setSearchValue(nextQuery);
    setSubmittedQuery(nextQuery);
    setSearchOpen(false);
    updateTeamUrl(nextQuery);
    if (nextQuery) {
      recordSearch.mutate({ query: nextQuery, filters: { domain: 'teams', source: options?.source ?? 'teams' } });
    }
  }

  function clearSearch() {
    setSearchValue('');
    setSubmittedQuery('');
    setSearchOpen(false);
    updateTeamUrl('');
  }

  function updateTeamUrl(nextQuery: string) {
    router.replace(buildTeamHref(searchParams, { q: nextQuery || null, filter: null }), { scroll: false });
  }
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
  const resolveChat = useV1ResolveChatRoom();
  const openMatchesQuery = useV1TeamMatches(
    { teamId, status: 'recruiting', limit: 5 },
    { enabled: Boolean(query.data) },
  );
  const openMatches = (openMatchesQuery.data?.items ?? []).map((match) => ({
    id: match.teamMatchId ?? match.id,
    title: match.title,
    dateLabel: formatTournamentDateShort(match.startsAt) ?? '',
    venue: match.place?.name ?? match.placeName ?? '',
  }));
  const fallback = getTeamDetailViewModel();

  if (query.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;

  const regionParts = splitTeamRegion(query.data?.region);
  const model: TeamDetailViewModel = query.data
    ? {
        ...fallback,
        team: {
          ...fallback.team,
          ...toTeamDetail(query.data, fallback.team),
          description: query.data.profile.introduction ?? '',
          activity: query.data.profile.activitySummary ?? query.data.profile.activityAreaText ?? '',
          condition: formatTeamDetailLevel(query.data),
          genderRule: query.data.profile.genderRule ?? fallback.team.genderRule,
          schedule: '',
          city: regionParts.city,
          county: regionParts.county,
          level: formatTeamDetailLevel(query.data) || fallback.team.level,
          membersList: query.data.membersPreview.map((member) => ({
            name: member.displayName,
            role: roleLabel(member.role),
            meta: member.role,
            status: member.role === 'owner' || member.role === 'manager' ? '관리자' : '활동중',
            visibility: query.data.membersVisibilityEnabled ? '공개' : '비공개',
          })),
          memberAccess: {
            canView: query.data.canViewMembers,
            enabled: query.data.membersVisibilityEnabled,
            message: '',
          },
        },
        mode: toDetailMode(query.data),
        ctaLabel: teamDetailCtaLabel(query.data, eligibility.data),
        ctaPending: join.isPending || withdraw.isPending || resolveChat.isPending,
        onCta: teamDetailCtaAction({
          team: query.data,
          eligibility: eligibility.data,
          chat: async () => {
            const result = await resolveChat.mutateAsync({ targetType: 'team', targetId: teamId });
            router.push(result.route || `/chat/${result.roomId}`);
          },
          join: () => join.mutateAsync({ message: null }),
          withdraw: () => withdraw.mutateAsync({ reason: 'team_join_withdrawn_from_v1_web' }),
        }),
        ctaSuccessMessage: query.data.viewer.role === 'none'
          ? undefined
          : '팀 채팅으로 이동해요.',
        ctaFailureMessage: query.data.viewer.role === 'none'
          ? undefined
          : '팀 채팅을 열지 못했어요. 잠시 후 다시 시도해 주세요.',
        operations: buildTeamOperations(query.data),
        onShare: () => shareTeam(query.data),
        openMatches,
        openMatchesLoading: openMatchesQuery.isLoading,
      }
    : fallback;

  return <TeamDetailPageView model={model} />;
}

export function TeamMembersPageClient({ teamId }: { teamId: string }) {
  const [activeTab, setActiveTab] = useState<TeamMembersViewModel['activeTab']>('members');
  const team = useV1TeamDetail(teamId);
  const canViewMembers = Boolean(team.data?.canViewMembers);
  const members = useV1TeamMembers(teamId, { limit: 50 }, { enabled: canViewMembers });
  const viewerRole = team.data?.viewer.role;
  const canManageMembers = isTeamOperatorRole(viewerRole);
  const canDelegateOwner = viewerRole === 'owner';
  const canManageInvitations = canManageMembers;
  const canReviewApplications = canManageMembers;
  const applications = useV1TeamJoinApplications(teamId, { status: 'requested', limit: 50 }, { enabled: canReviewApplications });
  const changeRole = useV1ChangeTeamMembershipRole(teamId);
  const removeMember = useV1RemoveTeamMembership(teamId);
  const approveApplication = useV1ApproveTeamJoinApplication(teamId);
  const rejectApplication = useV1RejectTeamJoinApplication(teamId);
  const sendInvitation = useV1SendTeamInvitation(teamId);
  const cancelInvitation = useV1CancelTeamInvitation(teamId);
  const invitationsQuery = useV1TeamInvitations(teamId, { enabled: canManageInvitations });
  const { confirm, ConfirmModal } = useConfirm();
  const fallback = getTeamMembersViewModel();

  // 초대 폼 로컬 상태
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const memberItems = members.data?.items ?? [];
  const requestItems = applications.data?.items ?? [];
  const invitationItems = invitationsQuery.data?.items ?? [];
  const actionPending = changeRole.isPending || removeMember.isPending || approveApplication.isPending || rejectApplication.isPending;

  function handleSendInvitation() {
    const email = inviteEmail.trim();
    // 클라이언트 이메일 형식 검증
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('올바른 이메일 형식을 입력해 주세요.');
      return;
    }
    setInviteError(null);
    setInviteSuccess(null);
    sendInvitation.mutate(
      { invitedEmail: email, message: inviteMessage.trim() || undefined },
      {
        onSuccess: (result) => {
          if (result.alreadyInvited) {
            setInviteSuccess('이미 초대한 사용자예요.');
          } else {
            setInviteSuccess('초대를 보냈어요.');
            setInviteEmail('');
            setInviteMessage('');
          }
        },
        onError: (err) => {
          const responseCode = err instanceof V1ApiError ? err.code : undefined;
          if (responseCode === 'USER_NOT_FOUND') {
            setInviteError('가입된 이메일을 찾을 수 없어요.');
          } else if (responseCode === 'ALREADY_MEMBER') {
            setInviteError('이미 팀 멤버예요.');
          } else {
            const raw = extractErrorMessage(err, '');
            setInviteError(raw || '초대를 보내지 못했어요. 다시 시도해 주세요.');
          }
        },
      },
    );
  }

  const tabs: TeamMembersViewModel['tabs'] = [
    { key: 'members', label: '멤버', count: members.data?.summary.memberCount ?? memberItems.length, onSelect: () => setActiveTab('members') },
    { key: 'requests', label: '가입 신청', count: requestItems.length, onSelect: () => setActiveTab('requests') },
    ...(canManageInvitations
      ? [{ key: 'invitations' as const, label: '초대', count: invitationItems.length, onSelect: () => setActiveTab('invitations') }]
      : []),
  ];

  const model: TeamMembersViewModel = {
    ...fallback,
    activeTab,
    tabs,
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
            canManageMembers,
            canDelegateOwner,
            promote: () => confirmAction(confirm, { title: '운영진 지정', message: `${member.displayName}님을 운영진으로 지정할까요?` }, () => changeRole.mutate({ membershipId: member.membershipId, role: 'manager' })),
            delegateOwner: () => confirmAction(confirm, { title: '팀장 위임', message: `${member.displayName}님에게 팀장을 위임할까요? 위임 후 현재 팀장은 운영진이 돼요.`, tone: 'danger' }, () => changeRole.mutate({ membershipId: member.membershipId, role: 'owner' })),
            demote: () => confirmAction(confirm, { title: '멤버 강등', message: `${member.displayName}님을 멤버로 강등할까요?` }, () => changeRole.mutate({ membershipId: member.membershipId, role: 'member' })),
            remove: () => confirmAction(confirm, { title: '멤버 내보내기', message: `${member.displayName}님을 팀에서 내보낼까요?`, tone: 'danger' }, () => removeMember.mutate({ membershipId: member.membershipId, reason: 'removed_from_v1_web_member_page' })),
          }),
        )
      : fallback.members,
    requests: requestItems.map((application) =>
      toRequestModel(application, {
        actionPending,
        approve: () => confirmAction(confirm, { title: '가입 신청 승인', message: `${application.applicant.displayName}님의 가입 신청을 승인할까요?`, confirmLabel: '승인' }, () => approveApplication.mutate({ applicationId: application.applicationId, note: null })),
        reject: () => confirmAction(confirm, { title: '가입 신청 거절', message: `${application.applicant.displayName}님의 가입 신청을 거절할까요?`, confirmLabel: '거절', tone: 'danger' }, () => rejectApplication.mutate({ applicationId: application.applicationId, reason: 'rejected_from_v1_web_member_page' })),
      }),
    ),
    invitations: canManageInvitations
      ? {
          form: {
            email: inviteEmail,
            message: inviteMessage,
            onEmailChange: (value) => {
              setInviteEmail(value);
              setInviteError(null);
              setInviteSuccess(null);
            },
            onMessageChange: setInviteMessage,
            onSubmit: handleSendInvitation,
            submitting: sendInvitation.isPending,
            error: inviteError,
            successMessage: inviteSuccess,
          },
          items: invitationItems.map((inv) => ({
            invitationId: inv.invitationId,
            displayName: inv.invitedUser.displayName,
            createdAt: inv.createdAt,
            message: inv.message,
            cancelPending: cancelInvitation.isPending,
            onCancel: () =>
              confirmAction(
                confirm,
                { title: '초대 취소', message: `${inv.invitedUser.displayName}님에 대한 초대를 취소할까요?`, confirmLabel: '취소', tone: 'danger' },
                () => cancelInvitation.mutate({ invitationId: inv.invitationId }),
              ),
          })),
          listLoading: invitationsQuery.isLoading,
        }
      : undefined,
  };

  if (team.isError || members.isError) return <TeamStatePageView model={getTeamStateViewModel('error')} />;
  // 멤버 목록 비공개는 일시적 오류가 아니므로 '다시 시도' 대신 전용 안내 상태로 분기한다.
  if (team.data && !team.data.canViewMembers) return <TeamStatePageView model={getTeamStateViewModel('restricted')} />;

  return (
    <>
      {/* 확인 모달 — window.confirm 대체 */}
      {ConfirmModal}
      <TeamMembersPageView model={model} backHref={`/teams/${teamId}`} />
    </>
  );
}

function withListActivityFallback(team: V1Team, detail?: V1TeamDetail): V1Team {
  if (team.activitySummary || team.activityAreaText || !detail) return team;
  return {
    ...team,
    activityAreaText: detail.profile.activityAreaText ?? null,
    activityDays: detail.profile.activityDays ?? [],
    activityFrequency: detail.profile.activityFrequency ?? null,
    activityTimeSlots: detail.profile.activityTimeSlots ?? [],
    activityTypes: detail.profile.activityTypes ?? [],
    activityMemo: detail.profile.activityMemo ?? null,
    activitySummary: detail.profile.activitySummary ?? detail.profile.activityAreaText ?? null,
  };
}

function toTeam(team: V1Team, fallback: TeamModel): TeamModel {
  const id = team.teamId ?? team.id;
  const sportName = team.sport?.name ?? team.sportName;
  const regionName = formatTeamRegion(team.region, team.regionName);
  const levelTag = formatTeamLevelTag(team);
  const genderRule = team.genderRule ?? '';
  const full = isTeamAtCapacity(team.memberCount, team.memberGoalCount);

  return {
    id,
    name: team.name,
    logo: team.name.slice(0, 1),
    logoUrl: team.logoUrl ?? null,
    coverImageUrl: team.coverImageUrl ?? null,
    sport: sportName,
    sports: [sportName],
    region: regionName,
    members: team.memberCount,
    capacity: team.memberGoalCount ?? 0,
    status: team.joinPolicy === 'closed' || full ? 'closed' : 'open',
    statusLabel: team.joinPolicy === 'closed' ? '가입 닫힘' : full ? '정원 마감' : '가입 신청 가능',
    tags: [levelTag, genderRule].filter(Boolean),
    genderRule,
    intro: team.introductionPreview ?? `${regionName}에서 활동하는 ${sportName} 팀이에요.`,
    next: team.activitySummary ?? team.activityAreaText ?? '',
  };
}

function formatTeamLevelTag(team: V1Team) {
  const explicitLabel = team.levelLabel?.trim() || team.skillLevelText?.trim();
  if (explicitLabel) return explicitLabel;
  const minName = team.minLevel?.name?.trim();
  const maxName = team.maxLevel?.name?.trim();
  if (minName && maxName) return minName === maxName ? minName : `${minName}-${maxName}`;
  return minName ?? maxName ?? '레벨 미설정';
}

function buildTeamSportChips(
  items: V1Team[],
  fallback: TeamListViewModel,
  params: URLSearchParams,
  selectedSportId?: string,
  masterSports?: Array<{ id: string; name: string }>,
) {
  const fixedSports = masterSports?.length
    ? masterSports.slice(0, 4)
    : fallback.chips.slice(1, 5).map((chip) => ({ id: chip.label, name: chip.label.replace(/\s+\d+$/, '') }));

  return [
    { label: fallback.chips[0]?.label.replace(/\s+\d+$/, '') ?? '전체', count: items.length, active: !selectedSportId, href: buildTeamHref(params, { sportId: null }) },
    ...fixedSports.map((sport) => ({
      label: sport.name,
      count: items.filter((team) => {
        const teamSport = team.sport;
        return teamSport?.sportId === sport.id || teamSport?.name === sport.name || team.sportName === sport.name;
      }).length,
      active: selectedSportId === sport.id,
      href: buildTeamHref(params, { sportId: sport.id }),
    })),
  ];
}

function buildTeamFilterSheet(
  params: URLSearchParams,
  sort: NonNullable<TeamListViewModel['filterSheet']>['sort'],
  genderRule: NonNullable<TeamListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<TeamListViewModel['filterSheet']>['levels'],
  open: boolean,
): NonNullable<TeamListViewModel['filterSheet']> {
  const sortOptions: NonNullable<TeamListViewModel['filterSheet']>['sortOptions'] = [
    { label: '추천순', value: 'recommended', href: buildTeamHref(params, { sort: sort === 'recommended' ? null : 'recommended', filter: '1' }), active: sort === 'recommended' },
    { label: '가입 가능', value: 'deadline', href: buildTeamHref(params, { sort: sort === 'deadline' ? null : 'deadline', filter: '1' }), active: sort === 'deadline' },
    { label: '최신순', value: 'latest', href: buildTeamHref(params, { sort: sort === 'latest' ? null : 'latest', filter: '1' }), active: sort === 'latest' },
  ];
  const genderOptions: NonNullable<TeamListViewModel['filterSheet']>['genderOptions'] = [
    { label: '성별 무관', value: '성별 무관', href: buildTeamHref(params, { genderRule: genderRule === '성별 무관' ? null : '성별 무관', filter: '1' }), active: genderRule === '성별 무관' },
    { label: '남', value: '남', href: buildTeamHref(params, { genderRule: genderRule === '남' ? null : '남', filter: '1' }), active: genderRule === '남' },
    { label: '여', value: '여', href: buildTeamHref(params, { genderRule: genderRule === '여' ? null : '여', filter: '1' }), active: genderRule === '여' },
  ];
  const levelOptions: NonNullable<TeamListViewModel['filterSheet']>['levelOptions'] = V1_LEVELS.map(({ code, label }) => ({
    label,
    value: code,
    href: buildTeamHref(params, { levelCodes: toggleLevelCode(levels, code), levels: null, filter: '1' }),
    active: levels.includes(code),
  }));

  return {
    open,
    closeHref: buildTeamHref(params, { filter: null }),
    resetHref: buildTeamHref(params, { sort: null, genderRule: null, levelCodes: null, levels: null, filter: '1' }),
    applyHref: buildTeamHref(params, { filter: null }),
    sort,
    genderRule,
    levels,
    sortOptions,
    genderOptions,
    levelOptions,
  };
}

function buildTeamHref(params: URLSearchParams, overrides: Record<string, string | null>) {
  const next = new URLSearchParams(params.toString());
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  });
  const queryString = next.toString();
  return queryString ? `/teams?${queryString}` : '/teams';
}

function toTeamSort(value: string | null): NonNullable<TeamListViewModel['filterSheet']>['sort'] {
  if (value === 'recommended' || value === 'deadline' || value === 'latest') return value;
  return '';
}

function toGenderRuleFilter(value: string | null): '' | '성별 무관' | '남' | '여' {
  if (value === '성별 무관' || value === '남' || value === '여') return value;
  return '';
}

function filterTeamsByLevels(teams: V1Team[] | undefined, levels: NonNullable<TeamListViewModel['filterSheet']>['levels']) {
  if (!teams || levels.length === 0) return teams ?? [];
  return teams.filter((team) => levelRangeMatches(levels, team.minLevel?.code, team.maxLevel?.code, team.levelLabel ?? team.skillLevelText));
}

function countTeamFilters(
  sort: NonNullable<TeamListViewModel['filterSheet']>['sort'],
  genderRule: NonNullable<TeamListViewModel['filterSheet']>['genderRule'],
  levels: NonNullable<TeamListViewModel['filterSheet']>['levels'],
) {
  return (sort ? 1 : 0) + (genderRule ? 1 : 0) + levels.length;
}

function toTeamDetail(team: V1TeamDetail, fallback: TeamModel): TeamModel {
  const levelLabel = formatTeamDetailLevel(team);
  const full = isTeamAtCapacity(team.memberCount, team.profile.memberGoalCount);
  const recruitmentLabel = team.profile.joinPolicy === 'closed' ? '마감' : full ? '정원 마감' : '모집 중';
  return {
    ...fallback,
    id: team.teamId,
    name: team.name,
    logo: team.name.slice(0, 1),
    logoUrl: team.profile.logoUrl ?? null,
    coverImageUrl: team.profile.coverImageUrl ?? null,
    sport: team.sport.name,
    sports: [team.sport.name],
    region: formatTeamRegion(team.region),
    members: team.memberCount,
    capacity: team.profile.memberGoalCount ?? 0,
    status: team.profile.joinPolicy === 'closed' || full ? 'closed' : team.viewer.joinState === 'requested' ? 'reviewing' : team.viewer.role !== 'none' ? 'mine' : 'open',
    statusLabel: recruitmentLabel,
    genderRule: team.profile.genderRule ?? fallback.genderRule,
    intro: team.profile.introduction ?? fallback.intro,
    tags: levelLabel ? [levelLabel, team.profile.genderRule ?? fallback.genderRule] : fallback.tags,
  };
}

function isTeamAtCapacity(memberCount: number, memberGoalCount?: number | null) {
  return memberGoalCount != null && memberCount >= memberGoalCount;
}

function formatTeamDetailLevel(team: V1TeamDetail) {
  const explicitLabel = team.profile.levelLabel?.trim() || team.profile.skillLevelText?.trim();
  if (explicitLabel) return explicitLabel;
  const minName = team.profile.minLevel?.name?.trim();
  const maxName = team.profile.maxLevel?.name?.trim();
  if (minName && maxName) return minName === maxName ? minName : `${minName}-${maxName}`;
  return minName ?? maxName ?? '';
}

function formatTeamRegion(region?: { name: string; parentName?: string | null } | null, fallback?: string | null) {
  if (region?.parentName) return `${region.parentName} ${region.name}`;
  return region?.name ? `${region.name} 전체` : fallback ?? '지역 미정';
}

function splitTeamRegion(region?: { name: string; parentName?: string | null } | null) {
  if (region?.parentName) return { city: region.parentName, county: region.name };
  const trimmed = region?.name?.trim();
  if (!trimmed) return { city: '', county: '지역 미정' };
  const [city, ...countyParts] = trimmed.split(/\s+/);
  if (countyParts.length === 0) return { city, county: '전체' };
  return { city, county: countyParts.join(' ') };
}

function toDetailMode(team: V1TeamDetail): TeamDetailViewModel['mode'] {
  if (isTeamMemberRole(team.viewer.role)) return 'mine';
  if (team.viewer.joinState === 'requested') return 'pending';
  if (team.profile.joinPolicy === 'closed') return 'closed';
  return 'default';
}

function teamDetailCtaLabel(team: V1TeamDetail, eligibility?: { message: string; joinState: string; eligible: boolean }) {
  if (isTeamMemberRole(team.viewer.role)) return '팀 채팅';
  if (eligibility?.joinState === 'requested') return '신청 취소';
  if (eligibility?.eligible) return '가입 신청';
  return eligibility?.message ?? '가입 불가';
}

function teamDetailCtaAction({
  team,
  eligibility,
  chat,
  join,
  withdraw,
}: {
  team: V1TeamDetail;
  eligibility?: { eligible: boolean; joinState: string };
  chat: () => Promise<unknown>;
  join: () => Promise<unknown>;
  withdraw: () => Promise<unknown>;
}): (() => void | Promise<unknown>) | undefined {
  if (isTeamMemberRole(team.viewer.role)) return chat;
  if (eligibility?.joinState === 'requested') return withdraw;
  if (eligibility?.eligible) return join;
  return undefined;
}

function buildTeamOperations(team: V1TeamDetail): TeamDetailViewModel['operations'] {
  if (!isTeamOperatorRole(team.viewer.role)) return undefined;
  return [
    {
      label: '팀 정보 수정',
      sub: '소개, 조건, 로고와 공개 범위를 수정해요.',
      href: `/teams/${team.teamId}/edit`,
    },
    {
      label: '멤버 관리',
      sub: '멤버 역할, 가입 신청, 초대를 관리해요.',
      href: `/teams/${team.teamId}/members`,
    },
    {
      label: '팀매치 만들기',
      sub: '이 팀 명의로 새 팀매치를 모집해요.',
      href: '/team-matches/new/team',
    },
  ];
}

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager' || role === 'admin') return '운영진';
  return '멤버';
}

function isTeamOperatorRole(role?: string | null) {
  return role === 'owner' || role === 'manager' || role === 'admin';
}

function isTeamMemberRole(role?: string | null) {
  return isTeamOperatorRole(role) || role === 'member';
}

function toMemberModel(
  member: V1TeamMember,
  actions: {
    actionPending: boolean;
    canManageMembers: boolean;
    canDelegateOwner: boolean;
    promote: () => void;
    delegateOwner: () => void;
    demote: () => void;
    remove: () => void;
  },
): TeamMembersViewModel['members'][number] {
  const itemActions: TeamMembersViewModel['members'][number]['actions'] = [];
  if (actions.canManageMembers && member.canChangeRole && member.role === 'member') {
    itemActions.push({ label: '운영진 지정', onSelect: actions.promote });
  }
  if (actions.canDelegateOwner && member.canChangeRole && member.role === 'manager') {
    itemActions.push({ label: '팀장 지정', onSelect: actions.delegateOwner });
    itemActions.push({ label: '멤버 강등', onSelect: actions.demote });
  }
  if (actions.canManageMembers && member.canRemove && member.role !== 'owner') {
    itemActions.push({ label: '내보내기', tone: 'danger', onSelect: actions.remove });
  }

  return {
    name: member.displayName,
    role: roleLabel(member.role),
    meta: `가입 ${formatDate(member.joinedAt)}`,
    locked: member.role === 'owner',
    actions: itemActions,
    actionPending: actions.actionPending,
  };
}

async function shareTeam(team: V1TeamDetail) {
  const title = team.name;
  const path = teamSharePath(team.teamId);
  const url = typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString();

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title, url });
    } catch (err) {
      // AbortError: user dismissed the native share sheet — not an error
      if (err instanceof Error && err.name === 'AbortError') return;
      throw err;
    }
    return;
  }

  await navigator.clipboard?.writeText(url);
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
    status: teamJoinApplicationStatusLabel(application.status),
    actions: [
      { label: '승인', onSelect: actions.approve },
      { label: '거절', tone: 'danger', onSelect: actions.reject },
    ],
    actionPending: actions.actionPending,
  };
}

/**
 * confirmAction — useConfirm()의 confirm 함수를 받아 모달 확인 후 action을 실행한다.
 * window.confirm 대체 헬퍼.
 */
function confirmAction(
  confirm: (opts: import('@/components/v1-ui/confirm-modal').ConfirmOptions) => Promise<boolean>,
  opts: import('@/components/v1-ui/confirm-modal').ConfirmOptions,
  action: () => void,
): void {
  confirm(opts).then((ok) => {
    if (ok) action();
  });
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
