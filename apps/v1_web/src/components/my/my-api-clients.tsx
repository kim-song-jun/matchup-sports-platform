'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppChrome } from '@/components/v1-ui/shell';
import { ChevronLeftIcon } from '@/components/v1-ui/icons';
import { Card, ListItem } from '@/components/v1-ui/primitives';
import { useConfirm } from '@/components/v1-ui/confirm-modal';
import { teamJoinApplicationStatusLabel, teamMemberStatusLabel } from '@/lib/v1-status-labels';
import {
  useV1AcceptTeamInvitation,
  useV1ApproveTeamJoinApplication,
  useV1CheckEmail,
  useV1CheckNickname,
  useV1ChangeTeamMembershipRole,
  useV1DeclineTeamInvitation,
  useV1MyActivitySummary,
  useV1MyTeams,
  useV1MyTeamMatches,
  useV1MasterRegions,
  useV1MasterSports,
  useV1Notifications,
  useV1Profile,
  useV1ReceivedInvitations,
  useV1RejectTeamJoinApplication,
  useV1RemoveTeamMembership,
  useV1ResolveLocation,
  useV1Reviews,
  useV1Settings,
  useV1TeamDetail,
  useV1TeamJoinApplications,
  useV1TeamMembers,
  useV1UpdateMyPreferences,
  useV1UpdateMyRegion,
  useV1UpdateProfile,
  useV1UpdateSettings,
  useV1WithdrawalRequest,
} from '@/hooks/use-v1-api';
import { V1ApiError } from '@/lib/api-client';
import { toDistrictRegionOptions } from '@/lib/v1-regions';
import type { V1MyActivitySummary, V1MyTeam, V1MyTeamMatch, V1Profile, V1ReceivedInvitation, V1Settings, V1Sport, V1TeamDetail, V1TeamJoinApplication, V1TeamMember } from '@/types/api';
import {
  MyHomePageView,
  MyInvitationsPageView,
  SettingsPageView,
  MyTeamDetailPageView,
  MyTeamMembersPageView,
  MyTeamsPageView,
} from './my-page';
import { ErrorState } from '@/components/v1-ui/primitives';
import type { MyHomeViewModel, MyInvitationItem, MyMember, MyTeam, MyTeamDetailViewModel, MyTeamMembersViewModel, MyTeamsViewModel } from './my.types';
import { myHomeModel, settingsModel } from './my.view-model';

type ProfileEditErrors = Partial<Record<'displayName' | 'nickname' | 'email' | 'phone' | 'birthDate' | 'profileImage' | 'form', string>>;
type DuplicateCheckState = {
  status: 'idle' | 'available' | 'taken' | 'error';
  value: string;
};

export function MyHomePageClient() {
  const profile = useV1Profile();
  const activitySummary = useV1MyActivitySummary();
  const teams = useV1MyTeams();
  const notifications = useV1Notifications({ status: 'unread', limit: 1 });
  const pendingReviews = useV1Reviews({ tab: 'pending', limit: 1 }, { enabled: Boolean(profile.data) });

  const model = useMemo(() => {
    if (!profile.data) {
      // profile.data 부재(로딩 중) 시 mock 사용자 정보를 노출하지 않는다.
      return {
        ...myHomeModel,
        user: {
          ...myHomeModel.user,
          name: '—',
          handle: '—',
          region: '—',
          initials: '—',
          intro: '',
          sports: [],
          stats: myHomeModel.user.stats.map((stat) => ({ ...stat, value: '—' })),
          monthly: myHomeModel.user.monthly.map((stat) => ({ ...stat, value: '—' })),
        },
      };
    }
    return toMyHomeModel(
      profile.data,
      teams.data?.items ?? [],
      notificationUnreadCount(notifications.data) > 0,
      activitySummary.data,
      hasPendingReview(pendingReviews.data),
    );
  }, [profile.data, teams.data, notifications.data, activitySummary.data, pendingReviews.data]);

  return <MyHomePageView model={model} />;
}

export function MyTeamsPageClient() {
  const query = useV1MyTeams();

  // 에러 상태: mock 폴백 없이 에러를 명시적으로 표시한다.
  if (query.isError) {
    return <ErrorState message="팀 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void query.refetch()} />;
  }

  const items = query.data?.items ?? [];
  const teams = items.map(toMyTeam);
  const model: MyTeamsViewModel = {
    teams,
    summary: buildTeamSummary(teams),
  };

  return <MyTeamsPageView model={model} />;
}

export function MyInvitationsPageClient() {
  const query = useV1ReceivedInvitations();
  const accept = useV1AcceptTeamInvitation();
  const decline = useV1DeclineTeamInvitation();
  const { confirm, ConfirmModal } = useConfirm();
  const router = useRouter();

  const actionPending = accept.isPending || decline.isPending;

  const onAccept = (invitationId: string) => {
    accept.mutate({ invitationId }, {
      onSuccess: (result) => {
        if (result.teamId) {
          router.push(`/my/teams/${result.teamId}`);
        } else {
          void query.refetch();
        }
      },
    });
  };

  const onDecline = (invitationId: string) => {
    const invitation = (query.data?.items ?? []).find((item) => item.invitationId === invitationId);
    const teamName = invitation?.team.name ?? '팀';
    confirm({
      title: '초대 거절',
      message: `${teamName}의 초대를 거절할까요?`,
      confirmLabel: '거절',
      tone: 'danger',
    }).then((ok) => {
      if (ok) {
        decline.mutate({ invitationId });
      }
    });
  };

  const model = {
    invitations: (query.data?.items ?? []).map(toMyInvitationItem),
    error: query.isError,
    actionPending,
    onAccept,
    onDecline,
    onRetry: () => void query.refetch(),
  };

  return (
    <>
      {ConfirmModal}
      <MyInvitationsPageView model={model} />
    </>
  );
}

export function MyTeamDetailPageClient({ teamId }: { teamId: string }) {
  const query = useV1TeamDetail(teamId);
  const teamMatches = useV1MyTeamMatches({ limit: 20 });

  // 에러 상태: mock 폴백 없이 에러를 명시적으로 표시한다.
  if (query.isError) {
    return <ErrorState message="팀 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void query.refetch()} />;
  }

  // 로딩 중: data 부재 시 스켈레톤 대신 빈 모델을 사용 (MyTeamDetailPageView 내부 레이아웃 보존)
  const team = query.data;
  if (!team) {
    return <MyTeamDetailPageView model={{ team: { id: teamId, name: '불러오는 중…', logo: '…', sport: '', region: '', role: 'member', roleLabel: '', members: 0, manner: '-', next: '', description: '' }, actions: [], recentMatches: [] }} />;
  }

  const viewerRole = team.viewer.role;
  // #10: owner/manager에게만 운영 메뉴(멤버 관리, 팀 설정) 노출. viewer.role은 V1TeamDetail에 실제 존재함.
  const canManage = viewerRole === 'owner' || viewerRole === 'manager';
  const actions: MyTeamDetailViewModel['actions'] = [
    { label: '팀매치 내역', sub: '최근 경기와 결과를 확인해요', href: '/team-matches', icon: 'ClipboardList' },
    ...(canManage
      ? [
          { label: '멤버 관리', sub: '초대와 가입 신청을 검토해요', href: `/my/teams/${team.teamId}/members`, icon: 'Users' },
          // #16: 공개 edit 페이지로 가되 from=my로 취소·저장 후 /my/teams/[id] 복귀 유도
          { label: '팀 설정', sub: '소개, 조건, 공개 범위를 수정해요', href: `/teams/${team.teamId}/edit?from=my`, icon: 'Settings' },
        ]
      : []),
  ];

  const model: MyTeamDetailViewModel = {
    team: toTeamDetailModel(team),
    actions,
    recentMatches: (teamMatches.data?.items ?? []).filter((match) => match.teamId === team.teamId).slice(0, 3).map(toMyTeamMatch),
    chatHref: '/chat',
  };

  return <MyTeamDetailPageView model={model} />;
}

export function MyTeamMembersPageClient({ teamId }: { teamId: string }) {
  const [activeTab, setActiveTab] = useState<MyTeamMembersViewModel['activeTab']>('members');
  const team = useV1TeamDetail(teamId);
  const canViewMembers = Boolean(team.data?.canViewMembers);
  const members = useV1TeamMembers(teamId, { limit: 50 }, { enabled: canViewMembers });
  const canReviewApplications = team.data?.viewer.role === 'owner' || team.data?.viewer.role === 'manager';
  const applications = useV1TeamJoinApplications(teamId, { status: 'requested', limit: 50 }, { enabled: canReviewApplications });
  const changeRole = useV1ChangeTeamMembershipRole(teamId);
  const removeMember = useV1RemoveTeamMembership(teamId);
  const approveApplication = useV1ApproveTeamJoinApplication(teamId);
  const rejectApplication = useV1RejectTeamJoinApplication(teamId);
  const { confirm, ConfirmModal } = useConfirm();
  const items = members.data?.items ?? [];
  const requests = applications.data?.items ?? [];
  const actionPending = changeRole.isPending || removeMember.isPending || approveApplication.isPending || rejectApplication.isPending;
  const viewerRole = team.data?.viewer.role;
  const canManageMembers = viewerRole === 'owner' || viewerRole === 'manager';
  const canDelegateOwner = viewerRole === 'owner';
  const model = {
    teamName: team.data?.name ?? '팀',
    activeTab,
    tabs: [
      { key: 'members' as const, label: '멤버', count: members.data?.summary.memberCount ?? items.length, onSelect: () => setActiveTab('members') },
      { key: 'requests' as const, label: '가입 신청', count: requests.length, onSelect: () => setActiveTab('requests') },
    ],
    summary: [
      { label: '전체', value: members.data?.summary.memberCount ?? items.length, unit: '명' },
      { label: '운영진', value: members.data ? members.data.summary.ownerCount + members.data.summary.managerCount : 0, unit: '명' },
      { label: '요청', value: requests.length, unit: '명' },
    ],
    members: items.map((member) =>
      toMyMember(member, {
        actionPending,
        canManageMembers,
        canDelegateOwner,
        promote: () => confirmAction(confirm, { title: '운영진 지정', message: `${member.displayName}님을 운영진으로 지정할까요?` }, () => changeRole.mutate({ membershipId: member.membershipId, role: 'manager' })),
        delegateOwner: () => confirmAction(confirm, { title: '팀장 위임', message: `${member.displayName}님에게 팀장을 위임할까요? 위임 후 현재 팀장은 운영진이 돼요.`, tone: 'danger' }, () => changeRole.mutate({ membershipId: member.membershipId, role: 'owner' })),
        demote: () => confirmAction(confirm, { title: '멤버 강등', message: `${member.displayName}님을 멤버로 강등할까요?` }, () => changeRole.mutate({ membershipId: member.membershipId, role: 'member' })),
        remove: () => confirmAction(confirm, { title: '멤버 내보내기', message: `${member.displayName}님을 팀에서 내보낼까요?`, tone: 'danger' }, () => removeMember.mutate({ membershipId: member.membershipId, reason: 'removed_from_v1_web_my_member_page' })),
      }),
    ),
    requests: requests.map((application) =>
      toMyJoinRequest(application, {
        actionPending,
        approve: () => confirmAction(confirm, { title: '가입 신청 승인', message: `${application.applicant.displayName}님의 가입 신청을 승인할까요?`, confirmLabel: '승인' }, () => approveApplication.mutate({ applicationId: application.applicationId, note: null })),
        reject: () => confirmAction(confirm, { title: '가입 신청 거절', message: `${application.applicant.displayName}님의 가입 신청을 거절할까요?`, confirmLabel: '거절', tone: 'danger' }, () => rejectApplication.mutate({ applicationId: application.applicationId, reason: 'rejected_from_v1_web_my_member_page' })),
      }),
    ),
  };

  return (
    <>
      {/* 확인 모달 — window.confirm 대체 */}
      {ConfirmModal}
      <MyTeamMembersPageView model={model} backHref={`/my/teams/${teamId}`} />
    </>
  );
}

export function ProfileEditPageClient() {
  const router = useRouter();
  const profile = useV1Profile();
  const update = useV1UpdateProfile();
  const checkEmail = useV1CheckEmail();
  const checkNickname = useV1CheckNickname();
  const [displayName, setDisplayName] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [birthDateDigits, setBirthDateDigits] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageName, setProfileImageName] = useState('');
  const [bio, setBio] = useState('');
  const [visibilityStatus, setVisibilityStatus] = useState<'public' | 'members_only' | 'private'>('public');
  const [fieldErrors, setFieldErrors] = useState<ProfileEditErrors>({});
  const [nicknameCheck, setNicknameCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });
  const [emailCheck, setEmailCheck] = useState<DuplicateCheckState>({ status: 'idle', value: '' });

  useEffect(() => {
    if (!profile.data) return;
    setDisplayName(profile.data.profile.displayName);
    setNickname(profile.data.profile.nickname ?? profile.data.profile.displayName);
    setEmail(profile.data.email ?? '');
    setPhoneDigits(profile.data.phone ?? '');
    setBirthDateDigits(profile.data.profile.birthDate ?? '');
    setProfileImageUrl(profile.data.profile.profileImageUrl ?? '');
    setProfileImageName('');
    setBio(profile.data.profile.bio ?? '');
    setVisibilityStatus(profile.data.profile.visibilityStatus);
    setNicknameCheck({ status: 'idle', value: '' });
    setEmailCheck({ status: 'idle', value: '' });
  }, [profile.data]);

  const originalNickname = profile.data?.profile.nickname ?? profile.data?.profile.displayName ?? '';
  const originalEmail = profile.data?.email ?? '';
  const normalizedNickname = nickname.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const nicknameChanged = normalizedNickname !== originalNickname;
  const emailChanged = normalizedEmail !== originalEmail;
  const nicknameVerified = !nicknameChanged || (nicknameCheck.status === 'available' && nicknameCheck.value === normalizedNickname);
  const emailVerified = !emailChanged || (emailCheck.status === 'available' && emailCheck.value === normalizedEmail);
  const isBlocked = update.isPending || checkNickname.isPending || checkEmail.isPending || !nicknameVerified || !emailVerified;

  const runNicknameCheck = () => {
    setFieldErrors((current) => ({ ...current, nickname: undefined, form: undefined }));
    if (!nicknameChanged) {
      setNicknameCheck({ status: 'available', value: normalizedNickname });
      return;
    }
    if (normalizedNickname.length < 2) {
      setFieldErrors((current) => ({ ...current, nickname: '닉네임은 2자 이상 입력해 주세요.' }));
      setNicknameCheck({ status: 'idle', value: '' });
      return;
    }

    checkNickname.mutate(normalizedNickname, {
      onSuccess: (result) => {
        setNicknameCheck({ status: result.available ? 'available' : 'taken', value: normalizedNickname });
        setFieldErrors((current) => ({ ...current, nickname: result.available ? undefined : '이미 사용 중인 닉네임이에요.' }));
      },
      onError: () => {
        setNicknameCheck({ status: 'error', value: normalizedNickname });
        setFieldErrors((current) => ({ ...current, nickname: '확인하지 못했어요. 다시 시도해 주세요.' }));
      },
    });
  };

  const runEmailCheck = () => {
    setFieldErrors((current) => ({ ...current, email: undefined, form: undefined }));
    if (!emailChanged) {
      setEmailCheck({ status: 'available', value: normalizedEmail });
      return;
    }
    if (!normalizedEmail.includes('@')) {
      setFieldErrors((current) => ({ ...current, email: '이메일 형식을 확인해 주세요.' }));
      setEmailCheck({ status: 'idle', value: '' });
      return;
    }

    checkEmail.mutate(normalizedEmail, {
      onSuccess: (result) => {
        setEmailCheck({ status: result.available ? 'available' : 'taken', value: normalizedEmail });
        setFieldErrors((current) => ({ ...current, email: result.available ? undefined : '이미 가입된 이메일이에요.' }));
      },
      onError: () => {
        setEmailCheck({ status: 'error', value: normalizedEmail });
        setFieldErrors((current) => ({ ...current, email: '확인하지 못했어요. 다시 시도해 주세요.' }));
      },
    });
  };

  const selectProfileImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setFieldErrors((current) => ({ ...current, profileImage: undefined, form: undefined }));
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setFieldErrors((current) => ({ ...current, profileImage: '이미지 파일만 선택할 수 있어요.' }));
      event.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFieldErrors((current) => ({ ...current, profileImage: '프로필 사진은 2MB 이하 이미지만 선택해 주세요.' }));
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfileImageUrl(reader.result);
        setProfileImageName(file.name);
      }
    };
    reader.onerror = () => {
      setFieldErrors((current) => ({ ...current, profileImage: '이미지를 불러오지 못했어요. 다시 선택해 주세요.' }));
    };
    reader.readAsDataURL(file);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFieldErrors({});
    if (!displayName.trim()) {
      setFieldErrors({ displayName: '이름을 입력해 주세요.' });
      return;
    }

    if (normalizedNickname.length < 2) {
      setFieldErrors({ nickname: '닉네임은 2자 이상 입력해 주세요.' });
      return;
    }

    if (!normalizedEmail.includes('@')) {
      setFieldErrors({ email: '이메일 형식을 확인해 주세요.' });
      return;
    }

    if (!nicknameVerified) {
      setFieldErrors({ nickname: '닉네임 중복 확인이 필요해요.' });
      return;
    }

    if (!emailVerified) {
      setFieldErrors({ email: '이메일 중복 확인이 필요해요.' });
      return;
    }

    if (phoneDigits && phoneDigits.length !== 11) {
      setFieldErrors({ phone: '휴대폰 번호는 숫자 11자리로 입력해 주세요.' });
      return;
    }

    if (birthDateDigits && (birthDateDigits.length !== 8 || !isValidBirthDateDigits(birthDateDigits))) {
      setFieldErrors({ birthDate: '올바른 생년월일을 입력해 주세요. (예: 1995-01-15)' });
      return;
    }

    try {
      await update.mutateAsync({
        displayName: displayName.trim(),
        nickname: normalizedNickname,
        email: normalizedEmail,
        bio,
        profileImageUrl: profileImageUrl || null,
        phone: phoneDigits || null,
        birthDate: birthDateDigits || null,
        visibilityStatus,
      });
      router.replace('/my');
    } catch (nextError) {
      if (nextError instanceof V1ApiError && nextError.statusCode === 409) {
        const duplicateField = nextError.code === 'NICKNAME_CONFLICT' ? 'nickname' : nextError.code === 'PHONE_CONFLICT' ? 'phone' : 'email';
        setFieldErrors({
          [duplicateField]: duplicateField === 'nickname'
            ? '이미 사용 중인 닉네임이에요.'
            : duplicateField === 'phone'
              ? '이미 가입된 휴대폰 번호예요.'
              : '이미 가입된 이메일이에요.',
          form: '이미 가입된 정보가 있어요. 다른 정보를 사용해 주세요.',
        });
        return;
      }
      setFieldErrors({ form: nextError instanceof Error ? nextError.message : '저장하지 못했어요. 다시 시도해 주세요.' });
    }
  };

  return (
    <AppChrome title="프로필 수정" activeTab="my" bottomNav={false} backHref="/my">
      <form className="tm-create-shell tm-profile-edit-shell tm-my-profile-edit-desktop" id="v1-profile-edit-form" onSubmit={submit}>
        {/* Desktop page head */}
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">프로필 수정</h1>
        </div>
        <section className="tm-my-profile-head">
          <div className="tm-auth-profile-preview" style={profileImageUrl ? { backgroundImage: `url(${profileImageUrl})` } : undefined}>
            {profileImageUrl ? null : <span className="tm-text-caption">{initials(displayName)}</span>}
          </div>
          <div>
            <div className="tm-text-body-lg">프로필 사진</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>매치 목록과 신청서에 함께 보여요.</div>
            <div className="tm-auth-profile-upload-body" style={{ marginTop: 10 }}>
              <label className="tm-btn tm-btn-md tm-btn-neutral">
                {profileImageUrl ? '사진 변경' : '사진 선택'}
                <input className="sr-only" type="file" accept="image/*" onChange={selectProfileImage} />
              </label>
              {profileImageUrl ? (
                <button className="tm-btn tm-btn-md tm-btn-ghost" type="button" onClick={() => { setProfileImageUrl(''); setProfileImageName(''); }}>
                  제거
                </button>
              ) : null}
              <span className="tm-text-caption">{profileImageName || '이미지 1장, 2MB 이하'}</span>
            </div>
            {fieldErrors.profileImage ? <div className="tm-text-caption tm-auth-field-helper-error" style={{ marginTop: 6 }}>{fieldErrors.profileImage}</div> : null}
          </div>
        </section>
        <label className="tm-create-field">
          <span className="tm-text-label">이름</span>
          <input className={`tm-input ${fieldErrors.displayName ? 'tm-auth-input-error' : ''}`} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} required />
          {fieldErrors.displayName ? <span className="tm-text-caption tm-auth-field-helper-error">{fieldErrors.displayName}</span> : null}
        </label>
        <div className="tm-create-field">
          <label className="tm-text-label" htmlFor="v1-profile-nickname">닉네임</label>
          <span className="tm-auth-field-with-action">
            <input
              id="v1-profile-nickname"
              className={`tm-input ${fieldErrors.nickname ? 'tm-auth-input-error' : nicknameVerified && nicknameChanged ? 'tm-auth-input-success' : ''}`}
              value={nickname}
              onChange={(event) => {
                setNickname(event.target.value);
                setNicknameCheck({ status: 'idle', value: '' });
                setFieldErrors((current) => ({ ...current, nickname: undefined }));
              }}
              maxLength={40}
              required
              aria-describedby={fieldErrors.nickname ? 'v1-profile-nickname-helper' : undefined}
            />
            <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkNickname.isPending || !nicknameChanged || normalizedNickname.length < 2} onClick={runNicknameCheck} type="button" aria-label="닉네임 중복 확인">
              {checkNickname.isPending ? '확인 중' : nicknameChanged ? '중복 확인' : '변경 없음'}
            </button>
          </span>
          {fieldErrors.nickname || (nicknameVerified && nicknameChanged) ? (
            <span id="v1-profile-nickname-helper" className={`tm-text-caption ${fieldErrors.nickname ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
              {fieldErrors.nickname ?? '사용 가능한 닉네임이에요.'}
            </span>
          ) : null}
        </div>
        <div className="tm-create-field">
          <label className="tm-text-label" htmlFor="v1-profile-email">이메일</label>
          <span className="tm-auth-field-with-action">
            <input
              id="v1-profile-email"
              className={`tm-input ${fieldErrors.email ? 'tm-auth-input-error' : emailVerified && emailChanged ? 'tm-auth-input-success' : ''}`}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailCheck({ status: 'idle', value: '' });
                setFieldErrors((current) => ({ ...current, email: undefined }));
              }}
              type="email"
              required
              aria-describedby={fieldErrors.email ? 'v1-profile-email-helper' : undefined}
            />
            <button className="tm-btn tm-btn-md tm-btn-neutral" disabled={checkEmail.isPending || !emailChanged || !normalizedEmail.includes('@')} onClick={runEmailCheck} type="button" aria-label="이메일 중복 확인">
              {checkEmail.isPending ? '확인 중' : emailChanged ? '중복 확인' : '변경 없음'}
            </button>
          </span>
          {fieldErrors.email || (emailVerified && emailChanged) ? (
            <span id="v1-profile-email-helper" className={`tm-text-caption ${fieldErrors.email ? 'tm-auth-field-helper-error' : 'tm-auth-field-helper-success'}`}>
              {fieldErrors.email ?? '사용 가능한 이메일이에요.'}
            </span>
          ) : null}
        </div>
        <label className="tm-create-field">
          <span className="tm-text-label">휴대폰 번호</span>
          <input
            className={`tm-input ${fieldErrors.phone ? 'tm-auth-input-error' : ''}`}
            inputMode="numeric"
            maxLength={13}
            placeholder="010-0000-0000"
            value={formatPhone(phoneDigits)}
            onChange={(event) => {
              setPhoneDigits(toDigits(event.target.value, 11));
              setFieldErrors((current) => ({ ...current, phone: undefined }));
            }}
          />
          {fieldErrors.phone ? <span className="tm-text-caption tm-auth-field-helper-error">{fieldErrors.phone}</span> : null}
        </label>
        <label className="tm-create-field">
          <span className="tm-text-label">생년월일</span>
          <input
            className={`tm-input ${fieldErrors.birthDate ? 'tm-auth-input-error' : ''}`}
            inputMode="numeric"
            maxLength={10}
            placeholder="예: 1995-01-15"
            value={formatBirthDate(birthDateDigits)}
            onChange={(event) => {
              setBirthDateDigits(toDigits(event.target.value, 8));
              setFieldErrors((current) => ({ ...current, birthDate: undefined }));
            }}
          />
          {fieldErrors.birthDate ? <span className="tm-text-caption tm-auth-field-helper-error">{fieldErrors.birthDate}</span> : null}
        </label>
        <label className="tm-create-field">
          <span className="tm-text-label">소개</span>
          {/* #25: rows=4 + min-height 100px — 프로필 소개는 좀 더 넓게 */}
          <textarea className="tm-input tm-create-input-multiline" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={500} rows={4} />
        </label>
        <label className="tm-create-field">
          <span className="tm-text-label">공개 범위</span>
          {/* (3) OS 기본 ▾ 대신 커스텀 SVG chevron — appearance:none + background-image */}
          <select className="tm-input tm-input-select" value={visibilityStatus} onChange={(event) => setVisibilityStatus(event.target.value as typeof visibilityStatus)}>
            <option value="public">전체 공개</option>
            <option value="members_only">멤버 공개</option>
            <option value="private">비공개</option>
          </select>
        </label>

        <Card pad={14} style={{ marginTop: 14, background: fieldErrors.form ? 'var(--red50)' : 'var(--blue50)' }}>
          <div className="tm-text-label">{fieldErrors.form ?? '프로필 정보만 저장돼요.'}</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>종목·난이도·활동 지역은 '운동 정보'에서 따로 관리할 수 있어요.</div>
        </Card>
      </form>
      {/*
        (1) 모바일: tm-fixed-cta가 생년월일 필드를 가리지 않도록 form shell에
            padding-bottom을 safe-area 포함 계산값으로 덮어씁니다. (globals.css 참조)
        (2) 데스크톱: position:static 으로 전환해 폼 흐름 맨 끝에 위치시킵니다.
            tm-my-profile-edit-cta 데스크톱 override는 desktop/my.css에서 처리합니다.
      */}
      <div className="tm-fixed-cta tm-my-profile-edit-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="submit" form="v1-profile-edit-form" disabled={isBlocked}>
          {update.isPending ? '저장 중' : '프로필 저장'}
        </button>
        {isBlocked && (nicknameChanged || emailChanged) ? <div className="tm-text-micro tm-auth-fixed-reason">변경한 닉네임과 이메일은 중복 확인 후 저장할 수 있어요.</div> : null}
      </div>
    </AppChrome>
  );
}

export function SportsSettingsPageClient() {
  const router = useRouter();
  const profile = useV1Profile();
  const sportsQuery = useV1MasterSports();
  const regionsQuery = useV1MasterRegions();
  const updatePreferences = useV1UpdateMyPreferences();
  const sports = sportsQuery.data ?? [];
  const regions = toDistrictRegionOptions(regionsQuery.data ?? []);
  const [selectedSports, setSelectedSports] = useState<Array<{ sportId: string; levelId: string | null }>>([]);
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!profile.data || hydratedUserId === profile.data.userId) return;
    setSelectedSports((profile.data.sports ?? []).map((sport) => ({ sportId: sport.sportId, levelId: sport.levelId })));
    setSelectedRegionId(profile.data.regions?.find((region) => region.primary)?.regionId ?? profile.data.regions?.[0]?.regionId ?? '');
    setHydratedUserId(profile.data.userId);
  }, [hydratedUserId, profile.data]);

  const toggleSport = (sportId: string) => {
    setSelectedSports((current) => {
      const exists = current.some((sport) => sport.sportId === sportId);
      return exists ? current.filter((sport) => sport.sportId !== sportId) : [...current, { sportId, levelId: null }];
    });
  };

  const setSportLevel = (sportId: string, levelId: string) => {
    setSelectedSports((current) => current.map((sport) => (sport.sportId === sportId ? { ...sport, levelId } : sport)));
  };

  const missingLevels = selectedSports.some((sport) => !sport.levelId);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    if (missingLevels) {
      setMessage('선택한 종목의 난이도를 모두 선택해 주세요.');
      return;
    }

    try {
      await updatePreferences.mutateAsync({
        sports: selectedSports,
        regions: selectedRegionId ? [{ regionId: selectedRegionId, primary: true }] : [],
      });
      router.replace('/my');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '운동 정보 저장에 실패했어요.');
    }
  };

  return (
    <AppChrome title="운동 정보" activeTab="my" bottomNav={false} backHref="/my">
      <form className="tm-create-shell tm-profile-edit-shell tm-my-sports-desktop" id="v1-sports-settings-form" onSubmit={submit}>
        <div className="tm-desktop-page-head tm-show-desktop">
          <Link className="tm-desktop-back" href="/my" aria-label="마이페이지로 돌아가기">
            <ChevronLeftIcon size={22} strokeWidth={2.5} />
          </Link>
          <h1 className="tm-text-heading">운동 정보</h1>
        </div>
        <Card pad={16}>
          <div className="tm-text-body-lg">운동 종목</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>매치 추천과 모집 조건에 쓸 종목을 선택해 주세요.</div>
          <div className="tm-auth-sport-grid" style={{ marginTop: 14 }}>
            {sports.map((sport) => {
              const selected = selectedSports.some((item) => item.sportId === sport.id);
              return (
                <button
                  className={`tm-card tm-auth-option-card ${selected ? 'tm-auth-option-selected' : ''}`}
                  key={sport.id}
                  onClick={() => toggleSport(sport.id)}
                  type="button"
                  aria-pressed={selected}
                >
                  <div className="tm-text-body-lg">{sport.name}</div>
                  <div className="tm-text-caption" aria-hidden="true">{selected ? '선택됨' : ''}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {selectedSports.length > 0 ? (
          <Card pad={16}>
            <div className="tm-text-body-lg">난이도</div>
            <div className="tm-text-caption" style={{ marginTop: 4 }}>선택한 종목마다 현재 실력에 가까운 난이도를 선택해 주세요.</div>
            <div className="tm-auth-stack" style={{ marginTop: 14 }}>
              {selectedSports.map(({ sportId, levelId }) => {
                const sport = sports.find((candidate) => candidate.id === sportId);
                if (!sport) return null;
                return <SportLevelPicker key={sportId} levelId={levelId} onSelect={(nextLevelId) => setSportLevel(sportId, nextLevelId)} sport={sport} />;
              })}
            </div>
          </Card>
        ) : null}

        <Card pad={16}>
          <div className="tm-text-body-lg">기본 활동 지역</div>
          <div className="tm-text-caption" style={{ marginTop: 4 }}>매치와 팀 추천에 사용할 기본 지역이에요.</div>
          <label className="tm-create-field" style={{ marginTop: 14 }}>
            <span className="tm-text-label">지역</span>
            <select className="tm-input" value={selectedRegionId} onChange={(event) => setSelectedRegionId(event.target.value)}>
              <option value="">지역 선택 안 함</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>{region.name}</option>
              ))}
            </select>
          </label>
        </Card>

        <Card pad={14} style={{ marginTop: 14, background: message?.includes('실패') || message?.includes('선택해') ? 'var(--red50)' : 'var(--blue50)' }}>
          <div className="tm-text-label">{message ?? '운동 정보만 별도로 저장돼요.'}</div>
          <div className="tm-text-caption" style={{ marginTop: 5 }}>저장하면 종목 태그와 추천 기준에 바로 반영돼요.</div>
        </Card>
      </form>
      <div className="tm-fixed-cta tm-my-sports-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="submit" form="v1-sports-settings-form" disabled={updatePreferences.isPending}>
          {updatePreferences.isPending ? '저장 중' : '운동 정보 저장'}
        </button>
      </div>
    </AppChrome>
  );
}

function SportLevelPicker({
  levelId,
  onSelect,
  sport,
}: {
  levelId: string | null;
  onSelect: (levelId: string) => void;
  sport: V1Sport;
}) {
  return (
    <div className="tm-profile-level-panel">
      <div className="tm-text-label">{sport.name}</div>
      <div className="tm-auth-chip-wrap" style={{ marginTop: 10 }}>
        {sport.levels.map((level) => (
          <button className={`tm-chip ${levelId === level.id ? 'tm-chip-active' : ''}`} key={level.id} onClick={() => onSelect(level.id)} type="button" aria-pressed={levelId === level.id}>
            {level.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPageClient() {
  return <SettingsPageView model={settingsModel} />;
}

type LocationStatus = 'idle' | 'requesting' | 'matched' | 'denied' | 'unsupported' | 'unmatched' | 'saved';

export function LocationSettingsPageClient() {
  const profile = useV1Profile();
  const regionsQuery = useV1MasterRegions();
  const resolveLocation = useV1ResolveLocation();
  const updateRegion = useV1UpdateMyRegion();
  const regions = toDistrictRegionOptions(regionsQuery.data ?? []);
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [matchedLabel, setMatchedLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [message, setMessage] = useState('현재 위치를 한 번 확인해 활동 지역으로 설정해요.');

  const requestCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unsupported');
      setMessage('이 브라우저에서는 위치를 확인할 수 없어요. 아래에서 지역을 직접 선택해 주세요.');
      return;
    }

    setStatus('requesting');
    setMessage('현재 위치를 확인하고 있어요.');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolveLocation.mutate(
          {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          {
            onSuccess: (result) => {
              if (!result.region?.id) {
                setStatus('unmatched');
                setMessage('현재 위치에 맞는 지역을 찾지 못했어요. 아래에서 직접 선택해 주세요.');
                return;
              }

              const label = result.region.parent?.name ? `${result.region.parent.name} ${result.region.name}` : result.region.name;
              setSelectedRegionId(result.region.id);
              setMatchedLabel(label);
              setStatus('matched');
              setMessage(`${label} 지역으로 확인됐어요. 저장하면 추천 기준 지역으로 사용돼요.`);
            },
            onError: () => {
              setStatus('unmatched');
              setMessage('현재 위치로 지역을 찾지 못했어요. 아래에서 직접 선택해 주세요.');
            },
          },
        );
      },
      () => {
        setStatus('denied');
        setMessage('위치 접근이 거부됐어요. 아래에서 지역을 직접 선택해 주세요.');
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
    );
  };

  const save = () => {
    if (!selectedRegionId) return;
    updateRegion.mutate(
      { regionId: selectedRegionId },
      {
        onSuccess: (result) => {
          setStatus('saved');
          setMatchedLabel(result.region.name);
          setMessage(`${result.region.name} 지역을 추천 기준으로 저장했어요.`);
        },
        onError: (error) => {
          setStatus('unmatched');
          setMessage(error instanceof Error ? error.message : '활동 지역 저장에 실패했어요.');
        },
      },
    );
  };

  return (
    <AppChrome title="위치 및 활동 지역" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        <div className="tm-my-location-desktop">
          <div className="tm-desktop-page-head tm-show-desktop">
            <Link className="tm-desktop-back" href="/my/settings" aria-label="설정으로 돌아가기">
              <ChevronLeftIcon size={22} strokeWidth={2.5} />
            </Link>
            <h1 className="tm-text-heading">위치 및 활동 지역</h1>
          </div>
          <Card pad={16}>
            <div className="tm-text-label">현재 활동 지역</div>
            <div className="tm-text-heading" style={{ marginTop: 6 }}>{profile.data?.regionName ?? '지역 미설정'}</div>
            <div className="tm-text-caption" style={{ marginTop: 6 }}>
              매치·팀매치·팀 추천의 기준 지역으로 사용돼요.
            </div>
          </Card>

          <Card pad={16}>
            <div className="tm-text-body-lg">현재 위치로 찾기</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>
              좌표는 저장하지 않고 지역을 찾을 때만 사용해요.
            </div>
            <button className="tm-btn tm-btn-md tm-btn-neutral tm-btn-block" style={{ marginTop: 12 }} type="button" onClick={requestCurrentLocation} disabled={status === 'requesting' || resolveLocation.isPending}>
              {status === 'requesting' || resolveLocation.isPending ? '현재 위치 확인 중' : '현재 위치로 지역 찾기'}
            </button>
          </Card>

          <label className="tm-create-field">
            <span className="tm-text-label">활동 지역 직접 선택</span>
            <select className="tm-input" value={selectedRegionId} onChange={(event) => {
              setSelectedRegionId(event.target.value);
              setMatchedLabel(regions.find((region) => region.id === event.target.value)?.name ?? null);
              setStatus('idle');
              setMessage('선택한 지역을 저장하면 추천 기준 지역으로 사용돼요.');
            }}>
              <option value="">시/군/구 선택</option>
              {regions.map((region) => (
                <option key={region.id} value={region.id}>{region.name}</option>
              ))}
            </select>
          </label>

          <Card pad={14} style={{ background: status === 'denied' || status === 'unsupported' || status === 'unmatched' ? 'var(--red50)' : 'var(--blue50)' }}>
            <div className="tm-text-label">{matchedLabel ?? '지역을 선택해 주세요'}</div>
            <div className="tm-text-caption" style={{ marginTop: 5 }}>{message}</div>
          </Card>
        </div>
      </div>
      <div className="tm-fixed-cta tm-my-location-cta">
        <button className="tm-btn tm-btn-lg tm-btn-primary tm-btn-block" type="button" disabled={!selectedRegionId || updateRegion.isPending} onClick={save}>
          {updateRegion.isPending ? '저장 중' : '활동 지역 저장'}
        </button>
      </div>
    </AppChrome>
  );
}

export function NotificationSettingsPageClient() {
  const settings = useV1Settings();
  const update = useV1UpdateSettings();

  // #12: 설정 로드 실패 시 에러 상태를 명시적으로 표시한다.
  if (settings.isError) {
    return (
      <AppChrome title="알림 설정" activeTab="my" bottomNav={false} backHref="/my/settings">
        <div className="tm-my-shell">
          <ErrorState message="알림 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={() => void settings.refetch()} />
        </div>
      </AppChrome>
    );
  }

  const notifications = settings.data?.notifications;
  const [toggleError, setToggleError] = useState(false);
  const items = [
    { key: 'matchEnabled', label: '매치 승인 알림', sub: '참가 승인, 거절, 대기 상태가 바뀔 때' },
    { key: 'teamEnabled', label: '팀 가입 신청', sub: '내가 운영하는 팀에 신청이 들어올 때' },
    { key: 'teamMatchEnabled', label: '팀매치 알림', sub: '팀매치 신청, 승인, 매칭 상태가 바뀔 때' },
    { key: 'chatEnabled', label: '채팅 메시지', sub: '참여 중인 매치와 팀 채팅 새 메시지' },
    { key: 'noticeEnabled', label: '공지 알림', sub: '서비스 운영 공지와 필수 안내' },
    { key: 'marketingEnabled', label: '마케팅 소식', sub: '새 기능과 이벤트 안내' },
  ] as const;

  const toggle = (key: keyof V1Settings['notifications']) => {
    if (!notifications) return;
    setToggleError(false);
    update.mutate(
      { notifications: { [key]: !notifications[key] } },
      {
        onError: () => {
          setToggleError(true);
          window.setTimeout(() => setToggleError(false), 3000);
        },
      },
    );
  };

  return (
    <AppChrome title="알림 설정" activeTab="my" bottomNav={false} backHref="/my/settings">
      <div className="tm-my-shell">
        <div className="tm-my-settings-desktop">
          <div className="tm-desktop-page-head tm-show-desktop">
            <Link className="tm-desktop-back" href="/my/settings" aria-label="설정으로 돌아가기">
              <ChevronLeftIcon size={22} strokeWidth={2.5} />
            </Link>
            <h1 className="tm-text-heading">알림 설정</h1>
          </div>
          {toggleError ? (
            <Card pad={14} className="tm-auth-soft-card-warning" style={{ marginBottom: 8 }}>
              <div className="tm-text-label" style={{ color: 'var(--orange500)' }}>저장하지 못했어요</div>
              <div className="tm-text-caption" style={{ marginTop: 4 }}>잠시 후 다시 시도해 주세요.</div>
            </Card>
          ) : null}
          {/* 6개 개별 카드 → 단일 Card 내 .tm-my-menu-row 행 — 시각 단위 절감, 마이홈 메뉴 패턴 일치 */}
          <div className="tm-card" style={{ padding: 0 }}>
            {items.map((setting) => {
              const enabled = Boolean(notifications?.[setting.key]);
              return (
                <button
                  key={setting.key}
                  className="tm-my-menu-row tm-pressable tm-noti-toggle-row"
                  onClick={() => toggle(setting.key)}
                  type="button"
                  disabled={!notifications || update.isPending}
                  role="switch"
                  aria-checked={enabled}
                  aria-label={setting.label}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="tm-text-body">{setting.label}</div>
                    <div className="tm-text-caption" style={{ marginTop: 3 }}>{setting.sub}</div>
                  </div>
                  <span
                    className="tm-text-caption"
                    style={{ minWidth: 24, textAlign: 'right', color: enabled ? 'var(--blue500)' : 'var(--text-caption)' }}
                    aria-hidden="true"
                  >
                    {enabled ? 'ON' : 'OFF'}
                  </span>
                  <span className={`tm-toggle ${enabled ? 'tm-toggle-on' : ''}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AppChrome>
  );
}

export function WithdrawalPageClient() {
  const router = useRouter();
  const withdrawal = useV1WithdrawalRequest();
  const [reason, setReason] = useState('');
  // #4: 비가역 작업이므로 confirm 모달로 이중 확인한다.
  const { confirm, ConfirmModal } = useConfirm();

  const handleWithdraw = () => {
    confirm({
      title: '탈퇴 요청',
      message: '정말 탈퇴 요청할까요? 되돌릴 수 없어요.',
      confirmLabel: '탈퇴 요청',
      tone: 'danger',
    }).then((ok) => {
      if (ok) {
        withdrawal.mutate({ reason: reason || null }, { onSuccess: () => router.replace('/login') });
      }
    });
  };

  return (
    <AppChrome title="회원 탈퇴" activeTab="my" bottomNav={false} backHref="/my/settings">
      {ConfirmModal}
      <div className="tm-my-shell">
        <div className="tm-my-withdrawal-desktop">
          <div className="tm-desktop-page-head tm-show-desktop">
            <Link className="tm-desktop-back" href="/my/settings" aria-label="설정으로 돌아가기">
              <ChevronLeftIcon size={22} strokeWidth={2.5} />
            </Link>
            <h1 className="tm-text-heading">회원 탈퇴</h1>
          </div>
          <section className="tm-danger-panel">
            <div className="tm-text-heading">탈퇴 전 확인해 주세요</div>
            <p className="tm-text-body" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>진행 중인 매치, 팀 운영 권한, 정산 내역이 있으면 탈퇴가 제한될 수 있어요.</p>
          </section>
          <Card pad={16}>
            <ListItem title="요청 상태" sub="탈퇴 신청 후 계정 확인 절차가 진행돼요" trailing="검토" />
            <ListItem title="보관 데이터" sub="법령에 따른 보관 기간이 지나면 삭제돼요" trailing="필수" />
          </Card>
          <label className="tm-create-field">
            <span className="tm-text-label">탈퇴 사유</span>
            <textarea className="tm-input tm-create-input-multiline" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="선택 입력" />
          </label>
          {withdrawal.isError ? <Card pad={14} className="tm-auth-soft-card-error"><div className="tm-text-label">탈퇴 요청에 실패했어요</div></Card> : null}
        </div>
      </div>
      <div className="tm-fixed-cta tm-my-withdrawal-cta">
        <button
          className="tm-btn tm-btn-lg tm-btn-danger tm-btn-block"
          type="button"
          disabled={withdrawal.isPending}
          onClick={handleWithdraw}
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
  hasPendingReviews?: boolean,
): MyHomeViewModel {
  const displayName = profile.profile.displayName;
  const totalMannerScore = activitySummary?.totals.mannerScore ?? profile.reputation.mannerScore;
  const sections = myHomeModel.sections.map((section) => ({ ...section, items: [...section.items] }));
  const communitySection = sections.find((section) => section.title === '커뮤니티');
  if (communitySection && !communitySection.items.some((item) => item.href === '/my/reviews')) {
    communitySection.items.push({
      label: '리뷰',
      sub: hasPendingReviews ? '작성할 리뷰가 있어요' : '작성한 리뷰와 받은 리뷰를 확인해요',
      href: '/my/reviews',
      icon: 'Star',
    });
  }

  return {
    ...myHomeModel,
    hasNewNotification,
    sections,
    user: {
      ...myHomeModel.user,
      name: displayName,
      handle: profile.email ?? authProviderLabel(profile.authProvider),
      region: profile.regionName ?? myHomeModel.user.region,
      initials: initials(displayName),
      intro: profile.profile.bio ?? '',
      sports: (profile.sports ?? []).map((sport) =>
        sport.levelName ? `${sport.sportName} ${sport.levelName}` : sport.sportName,
      ),
      stats: [
        { label: '활동', value: activitySummary?.totals.activityCount ?? profile.reputation.activityCount, unit: '회' },
        { label: '소속 팀', value: activitySummary?.totals.teamCount ?? teams.length, unit: '팀' },
        { label: '매너 점수', value: formatScore(totalMannerScore) },
      ],
      // '매너 점수'는 상단 활동 요약(stats)에만 표시. monthly는 경기 수·승률만 — 이중 표기 해소.
      monthly: [
        { label: '이번 달 경기', value: activitySummary?.monthly.matchCount ?? 0, unit: '경기' },
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
    manner: item.trust?.score != null && hasTrustValue(item.trust.trustState) ? String(item.trust.score) : '-',
    next: item.canCreateTeamMatch ? '팀매치 만들 수 있어요' : '팀매치에 참여할 수 있어요',
    description: `${item.sport.name} 팀이에요.`,
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
    next: team.profile.activityAreaText ?? '팀매치에서 일정을 확인해 보세요',
    description: team.profile.introduction ?? '아직 팀 소개가 없어요.',
  };
}

function toMyMember(
  member: V1TeamMember,
  actions?: {
    actionPending: boolean;
    canManageMembers: boolean;
    canDelegateOwner: boolean;
    promote: () => void;
    delegateOwner: () => void;
    demote: () => void;
    remove: () => void;
  },
): MyMember {
  const itemActions: NonNullable<MyMember['actions']> = [];
  if (actions?.canManageMembers && member.canChangeRole && member.role === 'member') {
    itemActions.push({ label: '운영진 지정', onSelect: actions.promote });
  }
  if (actions?.canDelegateOwner && member.canChangeRole && member.role === 'manager') {
    itemActions.push({ label: '팀장 지정', onSelect: actions.delegateOwner });
    itemActions.push({ label: '멤버 강등', onSelect: actions.demote });
  }
  if (actions?.canManageMembers && member.canRemove && member.role !== 'owner') {
    itemActions.push({ label: '내보내기', tone: 'danger', onSelect: actions.remove });
  }

  return {
    id: member.membershipId,
    name: member.displayName,
    role: roleLabel(member.role),
    meta: new Date(member.joinedAt).toLocaleDateString('ko-KR'),
    status: teamMemberStatusLabel(member.status),
    locked: member.role === 'owner',
    actions: itemActions,
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
    id: application.applicationId,
    name: application.applicant.displayName,
    role: '가입 신청',
    meta: application.message ?? new Date(application.createdAt).toLocaleDateString('ko-KR'),
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

function toMyTeamMatch(match: V1MyTeamMatch): MyTeamDetailViewModel['recentMatches'][number] {
  const status = match.status === 'completed' || match.status === 'expired' || match.status === 'cancelled' ? 'ended' : match.relation === 'requested' ? 'pending' : match.relation === 'approved' ? 'approved' : 'recruiting';
  return {
    id: match.teamMatchId,
    title: match.title,
    meta: `${new Date(match.startsAt).toLocaleString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} · ${match.sportName}`,
    status,
    statusLabel: status === 'pending' ? '승인 대기' : status === 'approved' ? '승인 완료' : status === 'ended' ? '종료' : '모집 중',
    note: match.teamName ? `${match.teamName} 관련 팀매치예요.` : '내 팀 관련 팀매치예요.',
    href: match.detailRoute,
  };
}

function toMyInvitationItem(invitation: V1ReceivedInvitation): MyInvitationItem {
  return {
    invitationId: invitation.invitationId,
    teamName: invitation.team.name,
    teamLogo: invitation.team.name.slice(0, 1),
    invitedByName: invitation.invitedBy.displayName,
    message: invitation.message,
    dateLabel: new Date(invitation.createdAt).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }),
  };
}

function buildTeamSummary(teams: MyTeam[]) {
  return [
    { label: '소속 팀', value: teams.length, unit: '팀' },
    { label: '운영 중인 팀', value: teams.filter((team) => team.role === 'owner' || team.role === 'manager' || team.role === 'admin').length, unit: '팀' },
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

function hasPendingReview(data: unknown) {
  if (typeof data === 'object' && data && 'items' in data) {
    const items = (data as { items?: unknown }).items;
    return Array.isArray(items) ? items.length > 0 : undefined;
  }
  return undefined;
}

function roleLabel(role: string) {
  if (role === 'owner') return '팀장';
  if (role === 'manager' || role === 'admin') return '운영진';
  if (role === 'member') return '멤버';
  return '비회원';
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

function toDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

function formatPhone(value: string) {
  if (value.length <= 3) return value;
  if (value.length <= 7) return `${value.slice(0, 3)}-${value.slice(3)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}

function formatBirthDate(value: string) {
  if (value.length <= 4) return value;
  if (value.length <= 6) return `${value.slice(0, 4)}-${value.slice(4)}`;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
}

function isValidBirthDateDigits(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function initials(value: string) {
  return value.trim().slice(0, 1) || 'T';
}
