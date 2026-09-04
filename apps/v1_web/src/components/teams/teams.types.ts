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
  /** 팀장 표시명 — 목록 카드용, V1Team.owner가 아직 없는 폴백/시드 데이터에는 없을 수 있어 optional */
  ownerName?: string;
  /** 감독 표시명 — 감독이 없는 팀은 null */
  managerName?: string | null;
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
    sortOptions: Array<{ label: string; value: 'recommended' | 'deadline' | 'latest'; href: string; active?: boolean }>;
    genderOptions: Array<{ label: string; value: '성별 무관' | '남' | '여'; href: string; active?: boolean }>;
    levelOptions: Array<{ label: string; value: 'beginner' | 'novice' | 'intermediate' | 'advanced'; href: string; active?: boolean }>;
  };
  chips: Array<{ label: string; count?: number; active?: boolean; href?: string }>;
  summary: { scope: string; total: number; recruiting: number; nearby?: number };
  listLoading?: boolean;
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
    membersList: Array<{ name: string; role: string; meta: string; status: string; visibility: '공개' | '비공개'; profileHref?: string }>;
    memberAccess: {
      canView: boolean;
      enabled: boolean;
      message: string;
      /** 미리보기(최대 8명) 뒤에 남은 인원 수. 0이면 "+N명 더보기" CTA를 노출하지 않는다. */
      moreCount: number;
    };
  };
  mode: 'default' | 'pending' | 'mine' | 'closed';
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
  /**
   * 승인 대기 중일 때만 채워진다(mode === 'pending'). 토스트는 2초 뒤 사라지므로
   * "무엇을 기다리는 중인지"는 화면에 계속 남아 있어야 한다.
   */
  joinRequest?: { requestedAtLabel?: string };
  operations?: Array<{ label: string; sub: string; href: string; badge?: number; badgeLabel?: string }>;
  /** Recruiting matches this team currently hosts — "이 팀의 열린 매치" section. */
  openMatches?: Array<{ id: string; title: string; dateLabel: string; venue: string }>;
  openMatchesLoading?: boolean;
  /**
   * 이 팀의 팀매치 목록(host/신청 모두)에서 distinct 로 추린 리그 — "내 리그" section.
   * R4: 전용 리그 API 없이 GET /team-matches?teamId= 응답의 league 필드만으로 구성한다.
   * 값이 비어 있으면(리그 소속 매치 없음) 섹션 자체를 렌더하지 않는다.
   */
  myLeagues?: Array<{ leagueId: string; title: string }>;
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

export type TeamMembersViewModel = {
  teamName: string;
  activeTab: 'members' | 'requests' | 'invitations';
  tabs: Array<{ key: 'members' | 'requests' | 'invitations'; label: string; count: number; onSelect: () => void }>;
  summary: { total: number; managers: number; pending: number };
  members: Array<{
    name: string;
    role: string;
    meta: string;
    profileHref?: string;
    manageLabel?: string;
    locked?: boolean;
    actions: Array<{ label: string; tone?: 'danger'; onSelect: () => void }>;
    actionPending?: boolean;
    /** 본인 행에만 노출되는 "팀 나가기" 버튼. owner는 소유권 이전 전까지 disabled + 툴팁. */
    selfLeave?: {
      disabled: boolean;
      disabledReason?: string;
      pending?: boolean;
      error?: string | null;
      onSelect: () => void;
    };
  }>;
  requests: Array<{
    name: string;
    meta: string;
    status: string;
    profileHref?: string;
    actions: Array<{ label: string; tone?: 'danger'; onSelect: () => void }>;
    actionPending?: boolean;
  }>;
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
    listLoading: boolean;
    /** 목록 조회 실패 여부 — true면 EmptyState 대신 에러+재시도 UI로 분기 */
    listError: boolean;
    onRetry: () => void;
  };
};
