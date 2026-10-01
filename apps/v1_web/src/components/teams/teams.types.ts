import type { ReactNode } from 'react';

export type TeamStatus = 'open' | 'reviewing' | 'closed' | 'mine';

export type TeamModel = {
  id: string;
  name: string;
  logo: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  sport: string;
  sports: string[];
  region: string;
  members: number;
  capacity: number;
  status: TeamStatus;
  statusLabel: string;
  tags: string[];
  genderRule: string;
  intro: string;
  next: string;
};

export type TeamListViewModel = {
  query: string;
  placeholder: string;
  search?: {
    value: string;
    placeholder: string;
    recentItems: Array<{ id: string; query: string }>;
    isOpen: boolean;
    isLoading?: boolean;
    onFocus: () => void;
    onBlur: () => void;
    onChange: (value: string) => void;
    onSubmit: () => void;
    onClear: () => void;
    onSelectRecent: (query: string) => void;
  };
  filterCount: number;
  filterHref?: string;
  filterSheet?: {
    open: boolean;
    closeHref: string;
    resetHref: string;
    applyHref: string;
    sort: '' | 'recommended' | 'deadline' | 'latest';
    genderRule: '' | '성별 무관' | '남' | '여';
    levels: Array<'beginner' | 'novice' | 'intermediate' | 'advanced'>;
    regionId: string;
    sortOptions: Array<{ label: string; value: 'recommended' | 'deadline' | 'latest'; href: string; active?: boolean }>;
    genderOptions: Array<{ label: string; value: '성별 무관' | '남' | '여'; href: string; active?: boolean }>;
    levelOptions: Array<{ label: string; value: 'beginner' | 'novice' | 'intermediate' | 'advanced'; href: string; active?: boolean }>;
    regionOptions: Array<{ label: string; value: string; href: string; active?: boolean }>;
  };
  chips: Array<{ label: string; count?: number; active?: boolean; href?: string }>;
  summary: { scope: string; total: number; loaded?: number; recruiting: number; nearby?: number };
  listLoading?: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
  teams: TeamModel[];
};

export type TeamStateViewModel = TeamListViewModel & {
  state: 'empty' | 'error' | 'restricted';
  title: string;
  description: string;
};

export type TeamDetailViewModel = {
  team: TeamModel & {
    description: string;
    activity: string;
    condition: string;
    schedule: string;
    city: string;
    county: string;
    level: string;
    genderRule: string;
    membersList: Array<{ membershipId: string; userId: string; name: string; role: string; profileHref?: string }>;
    memberAccess: {
      canView: boolean;
      enabled: boolean;
      message: string;
      /** 미리보기(최대 8명) 뒤에 남은 인원 수. 0이면 "+N명 더보기" CTA를 노출하지 않는다. */
      moreCount: number;
    };
  };
  mode: 'default' | 'pending' | 'mine' | 'closed';
  /**
   * 데스크톱 뒤로가기 헤더 링크(`tm-desktop-back`)가 쓰는 뒤로가기 목적지.
   * ShellOverride.backHref(모바일 셸)와 같은 `?from=` 기반 값 — 계산 위치:
   * `TeamDetailPageClient`(teams-client.tsx). 없으면 '/teams'로 고정.
   */
  backHref?: string;
  /** 이 팀 상세에서 나가는 링크가 쓸 출처(받은 `?from=` 포함). 없으면 `/teams/:id`. */
  selfHref?: string;
  /** 멤버 목록·팀 전적처럼 이 팀으로 돌아오는 하위 화면에 넘길 출처. 받은 출처가 없으면 null. */
  subPageFrom?: string | null;
  ctaLabel?: string;
  ctaPending?: boolean;
  onCta?: () => void | Promise<unknown>;
  onShare?: () => void | Promise<void>;
  ctaSuccessMessage?: string;
  ctaFailureMessage?: string;
  /**
   * 팀 컨택 작성 화면(`/teams/:id/contact/new`) 링크. 로그인 상태 + 내 팀이 아님 + 운영
   * 권한(owner/manager) 팀을 1개 이상 보유 — 세 조건을 모두 만족할 때만 채워지는 보조 CTA.
   * 계산 위치: `TeamDetailPageClient`(teams-client.tsx).
   */
  contactHref?: string;
  /** 보낼 수 없는 팀이라 "컨택 보내기"를 비활성으로 두는 이유. contactHref 대신 채워진다. */
  contactUnavailableReason?: string;
  /**
   * 승인 대기 중일 때만 채워진다(mode === 'pending'). 토스트는 2초 뒤 사라지므로
   * "무엇을 기다리는 중인지"는 화면에 계속 남아 있어야 한다.
   */
  joinRequest?: { requestedAtLabel?: string };
  operations?: Array<{ label: string; sub: string; href: string; badge?: number; badgeLabel?: string }>;
  /** 팀을 막 만든 팀장에게만 — 성공 안내와 다음 할 일(G12 F25). */
  justCreated?: boolean;
  /** 팀장·매니저 바로가기 — 운영 메뉴 맨 아래에 묻혀 있던 두 가지를 히어로 바로 아래로(G12 F26). */
  manageShortcuts?: { membersHref: string; editHref: string; inviteHref: string };
  /** 팀장·매니저 — 다가오는 경기의 명단·참석명단 버튼(Task 179 팀 A). */
  canManageGameRosters?: boolean;
  /** Recruiting matches this team currently hosts — "이 팀의 열린 매치" section. */
  openMatches?: Array<{ id: string; title: string; dateLabel: string; venue: string }>;
  openMatchesLoading?: boolean;
  /**
   * 이 팀의 팀매치 목록(host/신청 모두)에서 distinct 로 추린 리그 — "내 리그" section.
   * R4: 전용 리그 API 없이 GET /team-matches?teamId= 응답의 league 필드만으로 구성한다.
   * 값이 비어 있으면(리그 소속 매치 없음) 섹션 자체를 렌더하지 않는다.
   */
  myLeagues?: Array<{ leagueId: string; title: string; href: string }>;
  myLeaguesLoading?: boolean;
  /**
   * 그룹 F 재감사: myLeaguesQuery 가 실패해도 items가 빈 배열이 되어 "참가 리그 0개"와
   * 화면이 100% 동일했다(재시도 버튼도 없음). isError 를 뷰모델까지 끌고 와 통신 오류를
   * 별도 3번째 상태로 구분한다 — loading / error / empty(진짜 0개) 는 서로 다른 화면.
   */
  myLeaguesError?: boolean;
  onRetryMyLeagues?: () => void;
};

export type TeamFormMode = 'create' | 'edit';

export type TeamFormViewModel = {
  mode: TeamFormMode;
  /** 수정 화면 맨 아래 "팀 관리" — 팀장에게만 채운다(Task 180 H3). */
  dissolveHref?: string;
  team: {
    name: string;
    logoUrl: string | null;
    coverImageUrl: string | null;
    sport: string;
    region: string;
    description: string;
    sports: string[];
    city: string;
    county: string;
    level: string;
    genderRule: string;
    activityDays: string[];
    activityFrequency: string;
    activityTimeSlots: string[];
    activityTypes: string[];
    activityMemo: string;
    capacity: number;
  };
  form?: {
    sportId: string;
    regionId: string;
    regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>;
    sports: Array<{ id: string; name: string }>;
    joinPolicy: 'approval_required' | 'closed';
    membersVisibilityEnabled?: boolean;
    /** 수정 화면에서 정원이 내려갈 수 있는 하한 — 지금 팀원 수. */
    minCapacity?: number;
    /** 만들기 화면에서 활동 지역을 내 프로필 지역으로 채웠고 아직 바꾸지 않았다. */
    regionPrefilled?: boolean;
    /** 같은 종목·지역에 같은 이름의 팀이 있으면 이름 칸 아래 안내(H2). */
    nameError?: string;
    onFieldChange: (field: keyof TeamFormViewModel['team'], value: TeamFormViewModel['team'][keyof TeamFormViewModel['team']]) => void;
    onSportChange: (sportId: string) => void;
    onRegionChange: (regionId: string) => void;
    onJoinPolicyChange: (joinPolicy: 'approval_required' | 'closed') => void;
    onMembersVisibilityChange?: (enabled: boolean) => void;
    uploadImage?: (file: File) => Promise<string>;
    onSubmit: () => void;
    submitting?: boolean;
    error?: string | null;
  };
};

/** 멤버 행의 ⋯ 시트 항목(H2 A-2). risky 는 '되돌리기 어려운 동작' 소제목 아래로 떨어진다. */
export type TeamMemberAction = {
  key: string;
  label: string;
  description?: string;
  risky?: boolean;
  destructive?: boolean;
  /** 있으면 항목을 비활성으로 두고 설명 자리에 이 이유를 보여 준다. */
  disabledReason?: string;
  onSelect: () => void;
};

export type TeamMemberRowModel = {
  /** membershipId — 행 키이자 방금 바뀐 행을 강조할 때 쓴다. */
  id: string;
  name: string;
  /** '팀장' | '매니저' | '멤버' — teamRoleLabel 에서 온다. */
  role: string;
  /** 배지는 팀장·매니저만. 멤버는 기본 상태라 배지 없이 둔다. */
  roleTone?: 'owner' | 'manager';
  meta: string;
  jerseyNumber?: number | null;
  profileHref?: string;
  actions: TeamMemberAction[];
  actionPending?: boolean;
  /** 확인 창 뒤 방금 바뀐 행 — 토스트와 함께 잠깐 강조한다(H2 A-3). */
  highlighted?: boolean;
};

export type TeamMembersViewModel = {
  teamName: string;
  /** Live viewer role from the team detail response; absent only in the loading fallback. */
  viewerRole?: string | null;
  activeTab: 'members' | 'requests' | 'invitations';
  tabs: Array<{ key: 'members' | 'requests' | 'invitations'; label: string; count: number; onSelect: () => void }>;
  summary: { total: number; managers: number; pending: number };
  /** 팀원 본인에게만 보이는 안내(내 결장 기간 등). 멤버 탭 위에 놓인다. */
  selfNotice?: ReactNode;
  /** 역할 변경·내보내기가 서버에서 거절됐을 때의 이유. 목록 위에 뜨고 화면으로 끌어온다. */
  actionError?: string | null;
  /** 팀장 혼자 남은 팀에서만(Task 180 H3 A-1) — 멤버 초대·팀 해체 입구. */
  soloOwner?: { onInvite: () => void; dissolveHref: string };
  members: TeamMemberRowModel[];
  membersLoading?: boolean;
  requests: Array<{
    id: string;
    name: string;
    meta: string;
    profileHref?: string;
    /** 이 화면에서 방금 승인했다 — 목록 조회에서 빠져도 "승인 완료"로 제자리에 남는다. */
    approved?: boolean;
    pending?: boolean;
    /** 개별 승인은 확인 창 없이 바로 반영된다(G12 F37). */
    onApprove: () => void;
    /** 거절은 확인 창을 거친다. */
    onReject: () => void;
  }>;
  requestsLoading?: boolean;
  /** 대기 중인 신청이 둘 이상일 때만 — 확인 창 한 번으로 전부 승인한다. */
  approveAll?: { count: number; pending: boolean; onSelect: () => void };
  /** owner/manager 전용 — 보낸 초대 목록 + 초대 폼 */
  invitations?: {
    /** 이메일 입력 폼 */
    form: {
      email: string;
      message: string;
      onEmailChange: (value: string) => void;
      onMessageChange: (value: string) => void;
      onSubmit: () => void;
      submitting: boolean;
      error: string | null;
      successMessage: string | null;
    };
    /** 보낸 pending 초대 목록 */
    items: Array<{
      invitationId: string;
      displayName: string;
      createdAt: string;
      message: string | null;
      cancelPending: boolean;
      onCancel: () => void;
    }>;
    /** 최근 30일에 끝난 초대 — 수락·거절·취소(초대가 목록에서 사라진 이유) */
    pastItems: Array<{ invitationId: string; displayName: string; statusLabel: string; closedAt: string }>;
    listLoading: boolean;
    /** 목록 조회 실패 여부 — true면 EmptyState 대신 에러+재시도 UI로 분기 */
    listError: boolean;
    onRetry: () => void;
  };
};
