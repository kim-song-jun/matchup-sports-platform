'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import {
  useV1ApproveTeamJoinApplication,
  useV1ChangeTeamMembershipRole,
  useV1MyActivitySummary,
  useV1MyTeams,
  useV1MyTeamMatches,
  useV1Notifications,
  useV1Profile,
  useV1RejectTeamJoinApplication,
  useV1RemoveTeamMembership,
  useV1Settings,
  useV1TeamDetail,
  useV1TeamJoinApplications,
  useV1TeamMembers,
  useV1UpdateProfile,
  useV1UpdateSettings,
  useV1WithdrawalRequest,
} from '@/hooks/use-v1-api';
import type { V1MyActivitySummary, V1MyTeam, V1MyTeamMatch, V1Profile, V1Settings, V1TeamDetail, V1TeamJoinApplication, V1TeamMember } from '@/types/api';
import {
  MyHomePageView,
  SettingsPageView,
  MyTeamDetailPageView,
  MyTeamMembersPageView,
  MyTeamsPageView,
} from './my-page';
import type { MyHomeViewModel, MyMember, MyTeam, MyTeamDetailViewModel, MyTeamsViewModel } from './my.types';
import { myHomeModel, myTeamsModel, profileEditModel, settingsModel } from './my.view-model';

export function MyHomePageClient() {
  const profile = useV1Profile();
  const activitySummary = useV1MyActivitySummary();
  const teams = useV1MyTeams();
  const notifications = useV1Notifications({ status: 'unread', limit: 1 });

  const model = useMemo(() => {
    if (!profile.data) return myHomeModel;
    return toMyHomeModel(
      profile.data,
      teams.data?.items ?? [],
      notificationUnreadCount(notifications.data) > 0,
      activitySummary.data,
    );
  }, [profile.data, teams.data, notifications.data, activitySummary.data]);

  return <MyHomePageView model={model} />;
}

export function MyTeamsPageClient() {
  const query = useV1MyTeams();
  const items = query.data?.items ?? [];
  const teams = items.map(toMyTeam);
  const model: MyTeamsViewModel = {
    teams: query.data ? teams : myTeamsModel.teams,
    summary: buildTeamSummary(query.data ? teams : myTeamsModel.teams),
  };

  return <MyTeamsPageView model={model} />;
}

export function MyTeamDetailPageClient({ teamId }: { teamId: string }) {
  const query = useV1TeamDetail(teamId);
  const teamMatches = useV1MyTeamMatches({ limit: 20 });
  const team = query.data;

  if (!team) {
    return <MyTeamDetailPageView model={fallbackTeamDetail(teamId)} />;
  }

  const model: MyTeamDetailViewModel = {
    team: toTeamDetailModel(team),
    actions: [
      { label: '멤버 관리', sub: '초대와 가입 요청을 검토해요', href: `/my/teams/${team.teamId}/members`, icon: 'M' },
      { label: '팀 매치 내역', sub: '최근 경기와 결과를 확인해요', href: '/team-matches', icon: 'G' },
      { label: '팀 설정', sub: '소개, 조건, 공개 범위를 수정해요', href: `/teams/${team.teamId}/edit`, icon: 'S' },
    ],
    recentMatches: (teamMatches.data?.items ?? []).filter((match) => match.teamId === team.teamId).slice(0, 3).map(toMyTeamMatch),
    chatHref: '/chat',
  };

  return <MyTeamDetailPageView model={model} />;
}

export function MyTeamMembersPageClient({ teamId }: { teamId: string }) {
  const team = useV1TeamDetail(teamId);
  const members = useV1TeamMembers(teamId, { limit: 50 });
  const canReviewApplications = team.data?.viewer.role === 'owner' || team.data?.viewer.role === 'manager';
  const applications = useV1TeamJoinApplications(teamId, { status: 'requested', limit: 50 }, { enabled: canReviewApplications });
  const changeRole = useV1ChangeTeamMembershipRole(teamId);
  const removeMember = useV1RemoveTeamMembership(teamId);
  const approveApplication = useV1ApproveTeamJoinApplication(teamId);
  const rejectApplication = useV1RejectTeamJoinApplication(teamId);
  const items = members.data?.items ?? [];
  const requests = applications.data?.items ?? [];
  const actionPending = changeRole.isPending || removeMember.isPending || approveApplication.isPending || rejectApplication.isPending;
  const model = {
    teamName: team.data?.name ?? '팀',
    summary: [
      { label: '전체', value: members.data?.summary.memberCount ?? items.length, unit: '명' },
      { label: '운영진', value: members.data ? members.data.summary.ownerCount + members.data.summary.managerCount : 0, unit: '명' },
      { label: '요청', value: requests.length, unit: '명' },
    ],
    members: items.map((member) =>
      toMyMember(member, {
        actionPending,
        promote: () => changeRole.mutate({ membershipId: member.membershipId, role: 'manager' }),
        demote: () => changeRole.mutate({ membershipId: member.membershipId, role: 'member' }),
        remove: () => removeMember.mutate({ membershipId: member.membershipId, reason: 'removed_from_v1_web_my_member_page' }),
      }),
    ),
    requests: requests.map((application) =>
      toMyJoinRequest(application, {
        actionPending,
        approve: () => approveApplication.mutate({ applicationId: application.applicationId, note: null }),
        reject: () => rejectApplication.mutate({ applicationId: application.applicationId, reason: 'rejected_from_v1_web_my_member_page' }),
      }),
    ),
  };

  return <MyTeamMembersPageView model={model} backHref={`/my/teams/${teamId}`} />;
}

export function ProfileEditPageClient() {
  const profile = useV1Profile();
  const update = useV1UpdateProfile();
  const [displayName, setDisplayName] = useState(profileEditModel.user.name);
  const [bio, setBio] = useState(profileEditModel.user.intro);
  const [visibilityStatus, setVisibilityStatus] = useState<'public' | 'members_only' | 'private'>('public');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.profile.displayName);
    setBio(profile.data.profile.bio ?? '');
    setVisibilityStatus(profile.data.profile.visibilityStatus);
  }, [profile.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    update.mutate(
      { displayName, bio, profileImageUrl: profile.data?.profile.profileImageUrl ?? null, visibilityStatus },
      {
        onSuccess: () => setMessage('프로필이 저장되었습니다.'),
        onError: (error) => setMessage(error instanceof Error ? error.message : '프로필 저장에 실패했습니다.'),
      },
    );
  };

  return (
    <AppChrome title="프로필 수정" activeTab="my" bottomNav={false} backHref="/my">
      <form className="tm-create-shell" id="v1-profile-edit-form" onSubmit={submit}>
        <section className="tm-my-profile-head">
          <div className="tm-my-avatar">{initials(displayName)}</div>
          <div>
            <div className="tm-text-body-lg">프로필 사진</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>목록과 신청 화면에 함께 표시됩니다.</div>
          </div>
        </section>
        <label className="tm-create-field">
          <span className="tm-text-label">닉네임</span>
          <input className="tm-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required />
        </label>
        <label className="tm-create-field">
          <span className="tm-text-label">소개</span>
          <textarea className="tm-input tm-create-input-multiline" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} />
        </label>
        <label className="tm-create-field">
          <span className="tm-text-label">공개 범위</span>
          <select className="tm-input" value={visibilityStatus} onChange={(event) => setVisibilityStatus(event.target.value as typeof visibilityStatus)}>
            <option value="public">전체 공개</option>
            <option value="members_only">멤버 공개</option>
            <option value="private">비공개</option>
          </select>
        </label>
        <Card pad={14} style={{ marginTop: 14, background: message?.includes('실패') ? 'var(--red50)' : 'var(--blue50)' }}>
          <div className="tm-text-label">{message ?? '저장할 수 있습니다'}</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>저장하면 /me/profile API에 반영됩니다.</div>
        </Card>
      </form>
      <div className="tm-fixed-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="submit" form="v1-profile-edit-form" disabled={update.isPending}>
          {update.isPending ? '저장 중' : '프로필 저장'}
        </button>
      </div>
    </AppChrome>
  );
}

export function SettingsPageClient() {
  const settings = useV1Settings();
  const model = {
    ...settingsModel,
    groups: settingsModel.groups.map((group) => ({
      ...group,
      items: group.items.map((item) =>
        item.label === '프로필 수정' && settings.data
          ? { ...item, sub: `${settings.data.profile.displayName} · ${visibilityLabel(settings.data.profile.visibilityStatus)}` }
          : item,
      ),
    })),
  };

  return <SettingsPageView model={model} />;
}

export function NotificationSettingsPageClient() {
  const settings = useV1Settings();
  const update = useV1UpdateSettings();
  const notifications = settings.data?.notifications;
  const items = [
    { key: 'matchEnabled', label: '매치 승인 알림', sub: '참가 승인, 거절, 대기 상태가 바뀔 때' },
    { key: 'teamEnabled', label: '팀 가입 요청', sub: '내가 운영하는 팀에 요청이 들어올 때' },
    { key: 'teamMatchEnabled', label: '팀매치 알림', sub: '팀매치 신청, 승인, 매칭 상태가 바뀔 때' },
    { key: 'chatEnabled', label: '채팅 메시지', sub: '참여 중인 매치와 팀 채팅 새 메시지' },
    { key: 'noticeEnabled', label: '공지 알림', sub: '서비스 운영 공지와 필수 안내' },
    { key: 'marketingEnabled', label: '마케팅 소식', sub: '새 기능과 이벤트 안내' },
  ] as const;

  const toggle = (key: keyof V1Settings['notifications']) => {
    if (!notifications) return;
    update.mutate({ notifications: { [key]: !notifications[key] } });
  };

  return (
    <AppChrome title="알림 설정" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        {items.map((setting) => {
          const enabled = Boolean(notifications?.[setting.key]);
          return (
            <button key={setting.key} className="tm-card tm-my-toggle-button tm-pressable" onClick={() => toggle(setting.key)} type="button" disabled={!notifications || update.isPending}>
              <div className="tm-my-toggle-row">
                <div>
                  <div className="tm-text-body-lg">{setting.label}</div>
                  <div className="tm-text-caption" style={{ marginTop: 4 }}>{setting.sub}</div>
                </div>
                <span className={`tm-toggle ${enabled ? 'tm-toggle-on' : ''}`} aria-hidden="true" />
              </div>
            </button>
          );
        })}
      </div>
    </AppChrome>
  );
}

export function WithdrawalPageClient() {
  const router = useRouter();
  const withdrawal = useV1WithdrawalRequest();
  const [reason, setReason] = useState('');

  return (
    <AppChrome title="회원 탈퇴" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        <section className="tm-danger-panel">
          <div className="tm-text-heading">탈퇴 전 확인해 주세요</div>
          <p className="tm-text-body" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>진행 중인 매치, 팀 운영 권한, 정산 내역이 남아 있으면 탈퇴가 제한될 수 있습니다.</p>
        </section>
        <Card pad={16}>
          <ListItem title="요청 상태" sub="탈퇴 요청 후에는 계정 검토가 진행됩니다" trailing="검토" />
          <ListItem title="보관 데이터" sub="법적 보관 기간 이후 삭제됩니다" trailing="필수" />
        </Card>
        <label className="tm-create-field">
          <span className="tm-text-label">탈퇴 사유</span>
          <textarea className="tm-input tm-create-input-multiline" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="선택 입력" />
        </label>
        {withdrawal.isError ? <Card pad={14} className="tm-auth-soft-card-error"><div className="tm-text-label">탈퇴 요청에 실패했습니다</div></Card> : null}
      </div>
      <div className="tm-fixed-cta">
        <button
          className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block"
          type="button"
          disabled={withdrawal.isPending}
          onClick={() => withdrawal.mutate({ reason: reason || null }, { onSuccess: () => router.replace('/login') })}
        >
          {withdrawal.isPending ? '요청 중' : '탈퇴 요청'}
        </button>
      </div>
    </AppChrome>
  );
}

function toMyHomeModel(
  profile: V1Profile,
  teams: V1MyTeam[],
  hasNewNotification: boolean,
  activitySummary?: V1MyActivitySummary,
): MyHomeViewModel {
  const displayName = profile.profile.displayName;
  const totalMannerScore = activitySummary?.totals.mannerScore ?? profile.reputation.mannerScore;
  const monthlyMannerScore = activitySummary?.monthly.mannerScore ?? totalMannerScore;
  return {
    ...myHomeModel,
    hasNewNotification,
    user: {
      ...myHomeModel.user,
      name: displayName,
      handle: profile.email ?? authProviderLabel(profile.authProvider),
      region: profile.regionName ?? myHomeModel.user.region,
      initials: initials(displayName),
      intro: profile.profile.bio ?? myHomeModel.user.intro,
      stats: [
        { label: '활동', value: activitySummary?.totals.activityCount ?? profile.reputation.activityCount, unit: '회' },
        { label: '소속 팀', value: activitySummary?.totals.teamCount ?? teams.length, unit: '팀' },
        { label: '매너 점수', value: formatScore(totalMannerScore) },
      ],
      monthly: [
        { label: '이번 달 경기', value: activitySummary?.monthly.matchCount ?? 0, unit: '경기' },
        { label: '매너 점수', value: formatScore(monthlyMannerScore) },
        { label: '승률', value: formatWinRate(activitySummary?.monthly.winRate) },
      ],
    },
  };
}

function toMyTeam(item: V1MyTeam): MyTeam {
  return {
    id: item.teamId,
    name: item.name,
    logo: item.name.slice(0, 1),
    sport: item.sport.name,
    region: item.region?.name ?? '지역 미정',
    role: item.role,
    roleLabel: roleLabel(item.role),
    members: item.memberCount,
    manner: '-',
    next: item.canCreateTeamMatch ? '팀매치 생성 가능' : '팀매치 참여 가능',
    description: `${item.sport.name} 팀입니다.`,
  };
}

function toTeamDetailModel(team: V1TeamDetail): MyTeam {
  return {
    id: team.teamId,
    name: team.name,
    logo: team.name.slice(0, 1),
    sport: team.sport.name,
    region: team.region?.name ?? '지역 미정',
    role: team.viewer.role as MyTeam['role'],
    roleLabel: roleLabel(team.viewer.role),
    members: team.memberCount,
    manner: team.trust.score && hasTrustValue(team.trust.trustState) ? String(team.trust.score) : '-',
    next: team.profile.activityAreaText ?? '예정된 팀 일정은 팀매치에서 확인하세요',
    description: team.profile.introduction ?? '팀 소개가 아직 없습니다.',
  };
}

function toMyMember(
  member: V1TeamMember,
  actions?: {
    actionPending: boolean;
    promote: () => void;
    demote: () => void;
    remove: () => void;
  },
): MyMember {
  return {
    name: member.displayName,
    role: roleLabel(member.role),
    meta: new Date(member.joinedAt).toLocaleDateString('ko-KR'),
    status: member.status === 'active' ? '활동중' : member.status,
    locked: member.role === 'owner',
    onPromote: actions && member.canChangeRole && member.role === 'member' ? actions.promote : undefined,
    onDemote: actions && member.canChangeRole && member.role === 'manager' ? actions.demote : undefined,
    onRemove: actions && member.canRemove ? actions.remove : undefined,
    actionPending: actions?.actionPending,
  };
}

function toMyJoinRequest(
  application: V1TeamJoinApplication,
  actions: {
    actionPending: boolean;
    approve: () => void;
    reject: () => void;
  },
): MyMember {
  return {
    name: application.applicant.displayName,
    role: '가입 요청',
    meta: application.message ?? new Date(application.createdAt).toLocaleDateString('ko-KR'),
    status: application.status === 'requested' ? '검토' : application.status,
    onApprove: actions.approve,
    onReject: actions.reject,
    actionPending: actions.actionPending,
  };
}

function toMyTeamMatch(match: V1MyTeamMatch): MyTeamDetailViewModel['recentMatches'][number] {
  const status = match.status === 'completed' || match.status === 'expired' || match.status === 'cancelled' ? 'ended' : match.relation === 'requested' ? 'pending' : match.relation === 'approved' ? 'approved' : 'recruiting';
  return {
    id: match.teamMatchId,
    title: match.title,
    meta: `${new Date(match.startsAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · ${match.sportName}`,
    status,
    statusLabel: status === 'pending' ? '승인 대기' : status === 'approved' ? '승인 완료' : status === 'ended' ? '종료' : '모집중',
    note: match.teamName ? `${match.teamName} 관련 팀매치입니다.` : '내 팀 관련 팀매치입니다.',
    href: match.detailRoute,
  };
}

function fallbackTeamDetail(teamId: string): MyTeamDetailViewModel {
  const team = myTeamsModel.teams.find((item) => item.id === teamId) ?? myTeamsModel.teams[0];
  return { team, actions: [], recentMatches: [] };
}

function buildTeamSummary(teams: MyTeam[]) {
  return [
    { label: '소속 팀', value: teams.length, unit: '팀' },
    { label: '운영 권한', value: teams.filter((team) => team.role === 'owner' || team.role === 'manager' || team.role === 'admin').length, unit: '팀' },
    { label: '평균 매너', value: '-' },
  ];
}

function notificationUnreadCount(data: unknown) {
  if (typeof data === 'object' && data && 'unreadCount' in data) {
    const count = (data as { unreadCount?: unknown }).unreadCount;
    return typeof count === 'number' ? count : 0;
  }
  return 0;
}

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager' || role === 'admin') return '운영진';
  if (role === 'member') return '멤버';
  return '비회원';
}

function visibilityLabel(value: string) {
  if (value === 'private') return '비공개';
  if (value === 'members_only') return '멤버 공개';
  return '전체 공개';
}

function hasTrustValue(value: string) {
  return value === 'verified' || value === 'estimated';
}

function formatScore(value: number | null | undefined) {
  if (typeof value !== 'number') return '-';
  return Number.isInteger(value) ? value : value.toFixed(1);
}

function formatWinRate(value: number | null | undefined) {
  if (typeof value !== 'number') return '-';
  return `${Math.round(value)}%`;
}

function authProviderLabel(provider: V1Profile['authProvider']) {
  if (provider === 'kakao') return '카카오 로그인';
  if (provider === 'naver') return '네이버 로그인';
  return '소셜 로그인';
}

function initials(value: string) {
  return value.trim().slice(0, 1) || 'T';
}
