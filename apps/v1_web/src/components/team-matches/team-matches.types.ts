export type TeamMatchModel = {
  id: string;
  title: string;
  imageUrl: string;
  sport: string;
  hostTeam: string;
  venue: string;
  region: string;
  date: string;
  time: string;
  endTime?: string;
  format: string;
  grade: string;
  style: string;
  /**
   * 비용·매너·전적은 **모를 수 있다**(null). 호스트가 costNote 를 안 적은 매치가 있고,
   * 팀 매너 점수·승수는 애초에 API 응답에 없는 값이다(V1TeamMatch.hostTeam 은
   * trustState 카테고리만 준다). 예전에는 이 자리를 화면 골격용 목업(140,000원 · 매너 4.8 ·
   * 승 23)으로 채워 **어느 매치를 열어도 같은 가짜 숫자가 보였다**(2026-08-23 alpha 실측).
   * 숫자로 강제하지 않고 null 을 허용해, 모르는 값은 화면에서 감춘다.
   */
  cost: number | null;
  opponentCost: number | null;
  /** 값이 있으면 리그전 경기다. */
  league?: { leagueId: string; title: string } | null;
  uniform: string;
  gender: string;
  manner: number | null;
  wins: number | null;
  status: 'open' | 'pending' | 'approved' | 'closed' | 'mine';
};

export type TeamMatchListViewModel = {
  query: string;
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
    view: 'card' | 'compact';
    genderRule: '' | '성별 무관' | '남' | '여';
    levels: Array<'beginner' | 'novice' | 'intermediate' | 'advanced'>;
    sortOptions: Array<{ label: string; value: 'recommended' | 'deadline' | 'latest'; href: string; active?: boolean }>;
    genderOptions: Array<{ label: string; value: '성별 무관' | '남' | '여'; href: string; active?: boolean }>;
    levelOptions: Array<{ label: string; value: 'beginner' | 'novice' | 'intermediate' | 'advanced'; href: string; active?: boolean }>;
  };
  sports: Array<{ label: string; count: number; active?: boolean; href?: string }>;
  summary: { count: number; today: number; urgent: number };
  matches: TeamMatchModel[];
  /** #5: 로딩 중 여부 — true일 때 EmptyState 대신 PageSkeleton 렌더 */
  isLoading?: boolean;
};

export type TeamMatchStateViewModel = TeamMatchListViewModel & {
  state: 'empty' | 'error';
  title: string;
  description: string;
};

export type TeamMatchDetailViewModel = {
  match: TeamMatchModel & {
    description: string;
    address: string;
    hostTeamHref?: string;
    hostTeamId?: string | null;
    hostTeamLogoUrl?: string | null;
    hostTeamTrustState?: string | null;
    /** 값이 있으면 리그전 경기다(리그 홈으로 딥링크). null 이면 일반 팀 매치. */
    league?: { leagueId: string; title: string } | null;
    applicantActionError?: string | null;
    manageHref?: string;
    applicantTeams: Array<{
      name: string;
      meta: string;
      status: string;
      href?: string;
      applicationId?: string;
      onApprove?: () => void;
      onReject?: () => void;
      actionPending?: boolean;
    }>;
  };
  mode: 'default' | 'pending' | 'approved' | 'mine';
  applyLabel?: string;
  applyPending?: boolean;
  onApply?: () => void;
  hostActions?: Array<{
    label: string;
    tone?: 'neutral' | 'primary' | 'danger';
    pending?: boolean;
    onClick: () => void | Promise<unknown>;
  }>;
  // Task 17: navigates to /team-matches/:id/result(/approval) — a matched/completed match
  // no longer has a standalone "complete" mutation (Task 16 removed it); completion is now
  // an atomic side effect of submitting a validated result revision on that screen.
  resultAction?: { label: string; href: string; tone?: 'primary' | 'neutral' } | null;
  /** 경기 종료 후 후기 작성 화면(/my/reviews/team_match/:id) 링크. 참가팀 소속일 때만 설정된다.
   * 이 링크가 없던 동안 팀매치 후기는 /my/reviews 목록에 뜨기를 기다리는 수밖에 없었다. */
  reviewAction?: { label: string; href: string } | null;
  statusLabel?: string;
  chatLabel?: string;
  chatPending?: boolean;
  onChat?: () => void;
  onShare?: () => void;
  onNotify?: () => void;
  /** 라인업 관리 화면(Task 15) 링크. 내가 owner/manager로 속한 팀(호스트팀 또는 승인된
   * 상대팀)이 이 매치에 관여할 때만 설정된다 — 그 외에는 undefined라 CTA 자체가 안 보인다. */
  lineupHref?: string;
};

export type TeamMatchCreateStep = 'team' | 'sport' | 'info' | 'condition' | 'place-time' | 'confirm' | 'complete' | 'edit';

export type TeamMatchCreateViewModel = {
  step: TeamMatchCreateStep;
  /** Back-arrow target. Edit flow points to the real team-match detail; create flow falls back to the list. */
  backHref?: string;
  selectedTeam: string;
  selectedSport: string;
  isLoadingTeams?: boolean;
  teams: Array<{ name: string; sport: string; members: number; role: string; selected?: boolean; disabled?: boolean }>;
  sports: string[];
  draft: {
    title: string;
    description: string;
    grade: string;
    format: string;
    style: string[];
    uniform: string;
    gender: string;
    imageUrl: string;
    cost: number;
    opponentCost: number;
    venue: string;
    address: string;
    date: string;
    startTime: string;
    endTime: string;
    deadlineDate: string;
    deadlineTime: string;
  };
  form?: {
    selectedTeamId: string;
    selectedSportId: string;
    regionId: string;
    regions: Array<{ id: string; name: string; shortName?: string; parentName?: string }>;
    onSelectTeam: (teamName: string) => void;
    onSelectSport: (sportName: string) => void;
    onFieldChange: (field: keyof TeamMatchCreateViewModel['draft'], value: string | number | string[]) => void;
    onRegionChange: (regionId: string) => void;
    uploadImage?: (file: File) => Promise<string>;
    onBack: () => void;
    onNext: () => void;
    onSubmit: () => void;
    /** 진행 표시줄 클릭 이동. target 이전 스텝이 모두 유효할 때만 target으로 이동하고,
     * 그렇지 않으면 첫 번째 무효 스텝으로 되돌린다(team-matches.validation의
     * firstIncompleteTeamMatchStep). edit 화면은 스텝 구분이 없어 설정하지 않는다. */
    onGoToStep?: (step: TeamMatchCreateStep) => void;
    onCancel?: () => void;
    submitLabel?: string;
    submitting?: boolean;
    error?: string | null;
    lockedReason?: string | null;
    /** 현재 스텝(또는 edit 화면 전체)에서 "다음"/"저장"을 시도한 뒤에만 채워지는 필드별 에러 문구. */
    fieldErrors?: Partial<Record<string, string>>;
    /** 최종 제출(confirm/edit)에서 실제로 비어 있는 필드 목록 — 각 항목은 해당 스텝으로 이동할 수 있다. */
    missingFields?: Array<{ field: string; label: string; step: TeamMatchCreateStep }>;
    /** CreateProgress 배지: 지나온 스텝 중 필수 필드를 전부 채운 스텝(체크 표시용). */
    completeSteps?: TeamMatchCreateStep[];
    /** #3 1단계: 이 팀이 호스트로 과거에 실제로 입력했던 장소 — 장소 입력창 포커스 시 칩으로 노출. */
    recentVenues?: Array<{ placeName: string; addressText: string | null }>;
  };
};
