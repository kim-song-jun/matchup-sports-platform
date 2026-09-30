import type { V1TeamMatchApiStatus } from '@/types/api';

export type TeamMatchModel = {
  id: string;
  title: string;
  /**
   * API 가 사진을 안 주면 null — matches.card-model.ts 의 `image` 와 같은 이유(웨이브4,
   * 2026-09-04). 목업 사진(`/mock/generated/team-huddle.webp`)으로 메우면 실제 팀매치에
   * 다른 매치의 사진이 그대로 붙는다. 화면은 null 이면 종목 그래픽(sportIllustration)을 그린다.
   */
  imageUrl: string | null;
  sport: string;
  hostTeam: string;
  /** 플랫폼이 개설해 두 팀의 신청을 받는 모집이면 true. */
  platformManaged?: boolean;
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
  /**
   * 확정된 상대팀 이름. 없으면 아직 상대가 안 정해진 것이다.
   *
   * 이 값이 없던 동안 카드는 **상대팀 이름 자리에 신청 상태**('승인 완료'·'신청 마감')를
   * 그렸다 — 상세에서 2026-08-25 에 고친 결함인데(`teamMatchOpponentLabel` 주석) 목록만
   * 남아 있었다. 리그 대진은 상대가 항상 확정돼 있어 그 자리가 늘 상태 배지였다.
   */
  opponentTeam: string | null;
  uniform: string;
  gender: string;
  manner: number | null;
  wins: number | null;
  /**
   * 나와의 관계('내 매치'·'승인 대기'…)와 매치 상태가 한 필드에 눌려 있다 —
   * `statusToCardStatus` 가 viewerState 를 먼저 보기 때문에, 호스트가 보는 매치는
   * 마감·취소·종료여도 항상 'mine' 이다. 그래서 매치 상태는 별도 필드로 둔다.
   */
  status: 'open' | 'pending' | 'approved' | 'closed' | 'mine';
  /** Raw/derived API state retained so a completed game is not mislabeled as application-closed. */
  apiStatus?: V1TeamMatchApiStatus;
  /** API status 만으로 판정한 "더는 신청받지 않는다" — 관계와 무관하다. */
  closed: boolean;
  live?: boolean;
  /** 친선 경기의 지정 종료 시각은 지났지만 양 팀 종료 확인은 아직 끝나지 않은 상태. */
  completionPending?: boolean;
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
    /** 일반 팀매치 / 정규 리그 경기 구분. 빈 문자열은 전체. */
    kind: '' | 'friendly' | 'competition';
    sortOptions: Array<{ label: string; value: 'recommended' | 'deadline' | 'latest'; href: string; active?: boolean }>;
    genderOptions: Array<{ label: string; value: '성별 무관' | '남' | '여'; href: string; active?: boolean }>;
    levelOptions: Array<{ label: string; value: 'beginner' | 'novice' | 'intermediate' | 'advanced'; href: string; active?: boolean }>;
    kindOptions: Array<{ label: string; value: '' | 'friendly' | 'competition'; href: string; active?: boolean }>;
  };
  sports: Array<{ label: string; count: number; active?: boolean; href?: string }>;
  summary: { count: number; today: number; urgent: number };
  matches: TeamMatchModel[];
  /** #5: 로딩 중 여부 — true일 때 EmptyState 대신 PageSkeleton 렌더 */
  isLoading?: boolean;
  /** 서버 커서 페이지네이션(20건/페이지)에 다음 페이지가 더 있는지. true면 "더 보기" 노출. */
  hasNext?: boolean;
  onLoadMore?: () => void;
  loadMorePending?: boolean;
};

export type TeamMatchStateViewModel = TeamMatchListViewModel & {
  state: 'empty' | 'error';
  title: string;
  description: string;
  /** matches.types.ts 의 MatchStateViewModel 과 동일 — ErrorState 재시도 버튼이 호출한다. */
  retry?: () => void;
  /** 뒤로가기 목적지(`?from=`). 없으면 '/team-matches'로 고정. */
  backHref?: string;
};

export type TeamMatchDetailMode = 'default' | 'pending' | 'approved' | 'mine' | 'cancelled';

export type TeamMatchDetailViewModel = {
  match: TeamMatchModel & {
    description: string;
    address: string;
    hostTeamHref?: string;
    hostTeamId?: string | null;
    hostTeamLogoUrl?: string | null;
    hostTeamSportName?: string | null;
    hostTeamLevelLabel?: string | null;
    hostTeamRatingScore?: number | null;
    hostTeamWins?: number | null;
    hostTeamTrustState?: string | null;
    /** 값이 있으면 리그전 경기다(리그 홈으로 딥링크). null 이면 일반 팀 매치. */
    league?: { leagueId: string; title: string } | null;
    applicantActionError?: string | null;
    manageHref?: string;
    applicantTeams: Array<{
      teamId?: string;
      name: string;
      meta: string;
      status: string;
      logoUrl?: string | null;
      sportName?: string | null;
      levelLabel?: string | null;
      trustState?: string | null;
      href?: string;
      applicationId?: string;
      /** 서버 신청 상태 원문(requested·approved…). 호스트 카드는 라벨(`status`)이 아니라 이 값으로 고른다. */
      applicationStatus?: string;
      appliedByName?: string | null;
      appliedAtLabel?: string | null;
      /** 신청할 때 남긴 한마디. */
      message?: string | null;
      onApprove?: () => void;
      onReject?: () => void;
      actionPending?: boolean;
    }>;
  };
  /**
   * 'cancelled' 는 뷰어와 무관한 매치 상태가 우선한다 — cancel() 은 신청서 상태를 그대로 두므로
   * viewerState 는 취소 뒤에도 'approved'/'host_team' 으로 남는다(matches.mode.ts 와 같은 이유).
   */
  mode: TeamMatchDetailMode;
  /**
   * 뒤로가기 목적지. `/team-matches/:id`는 topBar:false라 셸 뒤로가기가 없고 페이지가
   * 직접 모바일·데스크톱 링크를 그린다 — 계산 위치: `TeamMatchDetailPageClient`
   * (team-matches-client.tsx). 없으면 '/team-matches'로 고정.
   */
  detailBackHref?: string;
  applyLabel?: string;
  applyPending?: boolean;
  onApply?: () => void;
  /** 히어로 ⋯ 메뉴의 실행 항목(모집 마감·재개·취소). */
  hostActions?: Array<{
    label: string;
    /** 메뉴 행 아래 한 줄 — 누르면 무엇이 되는지. */
    description?: string;
    tone?: 'neutral' | 'primary' | 'danger';
    pending?: boolean;
    confirm?: {
      title: string;
      message: string;
      confirmLabel: string;
      cancelLabel?: string;
      /** 기본 'danger'(취소). 되돌릴 길이 있는 모집 마감은 'default'. */
      tone?: 'default' | 'danger';
    };
    onClick: () => void | Promise<unknown>;
  }>;
  /** 호스트의 신청 목록을 아직 받는 중 — 알림으로 들어온 호스트에게 "신청 없음"을 먼저 보이지 않는다. */
  applicationsPending?: boolean;
  /** 호스트의 신청 목록 조회가 실패했다 — 빈 목록이 아니라 모르는 상태라 "신청 없음"을 말하지 않는다. */
  applicationsError?: { retry: () => void };
  /** 히어로 ⋯ 메뉴의 나머지 두 행 — 정보 수정(잠겼으면 이유)과 처리된 신청 기록. */
  manageMenu?: {
    edit: { href: string; lockedReason?: undefined } | { href?: undefined; lockedReason: string };
    history: Array<{ key: string; name: string; statusLabel: string; timeLabel: string | null }>;
  };
  /** 하단 바의 두 번째 버튼(호스트·참가팀의 다음 할 일). 없으면 신청 CTA(applyLabel·onApply)를 그린다. */
  nextAction?: {
    label: string;
    tone: 'primary' | 'neutral';
    href?: string;
    onClick?: () => Promise<unknown>;
  };
  /** 하단 바 상태 줄의 캡션을 바꿀 때만(예: '모집 상태', '경기 준비'). */
  statusCaption?: string;
  /** 상대가 정해진 뒤 참가팀 소속이 보는 진행 체크리스트. */
  progress?: {
    opponentName: string;
    confirmedAtLabel: string | null;
    /** 친선 참석명단 제출 여부. 모르면 null — 표시하지 않는다. */
    lineupSubmitted: boolean | null;
    /** 호스트에게만 — 상대가 정해져 수정이 잠긴 이유. */
    lockNote: string | null;
    /** 친선 참석명단 칸의 우리 인원·상대 명단 상태(H5 D-1). 명단을 못 읽었으면 null. */
    attendance?: {
      /** 제출했을 때의 인원. 제출 전이면 null. */
      ownCount: number | null;
      opponent: {
        name: string;
        badge: { tone: 'blue' | 'green' | 'grey'; label: string };
        note: string;
        /** 공개된 상대 명단(읽기 전용) — 공개 전이면 null. */
        viewHref: string | null;
      } | null;
    } | null;
  };
  /** 승인 대기 중인 신청 팀(히어로 "우리 팀" 자리). */
  myApplicationTeam?: { teamId: string; name: string } | null;
  /** 신청 가능한 팀이 2개 이상인 팀장의 팀 선택 시트(N-1). */
  applyTeamPicker?: {
    teams: Array<{ teamId: string; name: string; roleLabel: string; eligible: boolean; reason: string | null }>;
    defaultTeamId: string;
    submit: (teamId: string, message: string | null) => Promise<unknown>;
  };
  // Task 17: navigates to /team-matches/:id/result(/approval) — a matched/completed match
  // no longer has a standalone "complete" mutation (Task 16 removed it); completion is now
  // an atomic side effect of submitting a validated result revision on that screen.
  // tone(웨이브4 이전): 이 행 하나의 primary/neutral 색을 골랐다. team-matches-page.tsx의
  // 매치 관리 카드가 라인업→경기 결과→후기 순서로 "화면 전체에 primary 하나만" 규칙을
  // 새로 적용하면서(2026-09-04) 행별 tone 은 더 이상 읽히지 않는다 — 죽은 필드로 남기지 않고
  // 제거한다.
  resultAction?: { label: string; href: string } | null;
  /** 경기 종료 후 후기 작성 화면(/my/reviews/team_match/:id) 링크. 참가팀 소속일 때만 설정된다.
   * 이 링크가 없던 동안 팀매치 후기는 /my/reviews 목록에 뜨기를 기다리는 수밖에 없었다. */
  reviewAction?: { label: string; href: string } | null;
  statusLabel?: string;
  /** statusLabel의 의미 축. 기본은 'application'(신청 흐름 — 승인 대기/완료, 신청 마감 등)이고,
   * modelScheduleLabel()이 진행/종료 확인 상태를 준 경우에는 'match'(경기 자체 상태)다.
   * 두 축은 캡션이 다르다 — '신청 상태' 캡션 아래 경기 진행 상태를 보여주면 신청 관련
   * 정보로 오인된다(team-matches-page.tsx statusLabel 캡션 참고). */
  statusLabelKind?: 'application' | 'match';
  chatLabel?: string;
  chatPending?: boolean;
  /** 채팅방 열기 실패 사유(409/403 등). onChat 버튼이 조용히 죽지 않도록 클릭 결과를 보여준다. */
  chatError?: string | null;
  onChat?: () => void;
  onShare?: () => void;
  /** 명단 입구. 내가 owner/manager로 속한 참가팀이 있을 때만 설정된다 — 친선은 참석명단,
   * 리그 대진은 참가 명단에서 계산되는 경기 명단 화면이다(Task 179). */
  lineupAction?: { href: string; kind: 'attendance' | 'match-roster' };
};

// 'complete' 스텝(웨이브4 이전): /team-matches/new/complete 페이지가 썼는데, 실제 제출 성공
// 경로는 항상 /team-matches/:id 로 바로 이동해(team-matches-create-client.tsx) 이 스텝에
// 닿는 진짜 경로가 없었다(죽은 라우트, 2026-09-04 감사) — 라우트·컴포넌트와 함께 제거한다.
export type TeamMatchCreateStep = 'team' | 'sport' | 'info' | 'condition' | 'place-time' | 'confirm' | 'edit';

export type TeamMatchCreateViewModel = {
  step: TeamMatchCreateStep;
  /** Back-arrow target. Edit flow points to the real team-match detail; create flow falls back to the list. */
  backHref?: string;
  selectedTeam: string;
  selectedSport: string;
  isLoadingTeams?: boolean;
  teamLoadError?: { message: string; onRetry: () => void };
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
    endDate?: string;
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
    /** 이미지 업로드가 끝나기 전에 이동하거나 저장하면 빈 URL이 저장될 수 있으므로
     * 업로드 중에는 화면의 주 행동을 잠근다. */
    imageUploading?: boolean;
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
