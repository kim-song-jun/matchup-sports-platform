export type MatchCardModel = {
  id: string;
  title: string;
  sport: string;
  venue: string;
  region: string;
  date: string;
  time: string;
  endTime?: string;
  current: number;
  capacity: number;
  actionLabel: string;
  level: string;
  gender: string;
  host: string;
  /** 업로드된 대표 사진. 없으면 null — 목업 사진으로 메우지 않는다(2026-09-04 감사). */
  image: string | null;
  deadline: string;
  deadlineDetail?: string;
  status: 'open' | 'pending' | 'approved' | 'full' | 'mine';
};

export type MatchListViewModel = {
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
  summary: {
    label: string;
    count: number;
    today: number;
    urgent: number;
  };
  matches: MatchCardModel[];
  /** team-matches.types.ts의 #5와 같은 목적 — true일 때 EmptyState 대신 PageSkeleton 렌더.
   * 로딩 중(items === undefined)에 matches: []를 EmptyState로 그대로 그리면 "조건에 맞는
   * 매치가 없어요"가 실제로는 아직 응답을 못 받은 상태에서도 뜬다. */
  isLoading?: boolean;
  /** 서버 커서 페이지네이션(20건/페이지)에 다음 페이지가 더 있는지. true면 "더 보기" 노출. */
  hasNext?: boolean;
  onLoadMore?: () => void;
  loadMorePending?: boolean;
};

export type MatchStateViewModel = MatchListViewModel & {
  state: 'empty' | 'error' | 'joined';
  /** error 상태의 재시도(쿼리 refetch). 없으면 재시도 버튼을 그리지 않는다. */
  retry?: () => void;
  title: string;
  description: string;
};

export type MatchDetailViewModel = {
  match: MatchCardModel & {
    description: string;
    address: string;
    rules: string[];
    editHref?: string;
    applicationsHref?: string;
    participants: Array<{
      name: string;
      meta: string;
      status: string;
      href?: string;
      onApprove?: () => void;
      onReject?: () => void;
      actionPending?: boolean;
    }>;
  };
  mode: 'default' | 'pending' | 'approved' | 'closed' | 'mine';
  applyLabel?: string;
  applyPending?: boolean;
  onApply?: () => void;
  statusLabel?: string;
  chatLabel?: string;
  chatPending?: boolean;
  /** 경기 종료 후 후기 작성 화면(/my/reviews/match/:id) 링크. 참가자·호스트일 때만 설정된다.
   * 이 링크가 없던 동안 매치 상세에는 후기로 가는 길이 아예 없었다(완료 알림도 이 화면으로
   * 보냈지만 여기서 더 갈 곳이 없어 막다른 길이었다). */
  reviewAction?: { label: string; href: string } | null;
  onChat?: () => void;
  onShare?: () => void | string | null | Promise<void | string | null>;
  onNotify?: () => void;
};

export type MatchCreateStep = 'sport' | 'info' | 'place-time' | 'confirm' | 'edit';

export type MatchCreateViewModel = {
  step: MatchCreateStep;
  /** 생성 완료 또는 수정 중인 매치의 실제 ID. backHref·상세보기 링크에 사용. */
  matchId?: string;
  selectedSport: string;
  sports: string[];
  levels: string[];
  draft: {
    title: string;
    description: string;
    image: string;
    capacity: number;
    actionLabel: string;
    minLevel: string;
    maxLevel: string;
    gender: string;
    rules: string;
    venue: string;
    address: string;
    date: string;
    startTime: string;
    endTime: string;
    deadlineDate: string;
    deadlineTime: string;
  };
  form?: {
    selectedSportId: string;
    regionId: string;
    regions: Array<{ id: string; name: string }>;
    onSelectSport: (sportName: string) => void;
    onFieldChange: (field: keyof MatchCreateViewModel['draft'], value: string | number) => void;
    onRegionChange: (regionId: string) => void;
    onBack: () => void;
    onNext: () => void;
    onSubmit: () => void;
    onCancel?: () => void;
    uploadImage?: (file: File) => Promise<string>;
    submitLabel?: string;
    submitting?: boolean;
    error?: string | null;
    lockedReason?: string | null;
    /** 현재 스텝(또는 edit 화면 전체)에서 "다음"/"저장"을 시도한 뒤에만 채워지는 필드별 에러 문구. */
    fieldErrors?: Partial<Record<string, string>>;
    /** 최종 제출(confirm/edit)에서 실제로 비어 있는 필드 목록 — 각 항목은 해당 스텝으로 이동할 수 있다. */
    missingFields?: Array<{ field: string; label: string; step: MatchCreateStep }>;
    /** CreateProgress 배지: 지나온 스텝 중 필수 필드를 전부 채운 스텝(체크 표시용). */
    completeSteps?: MatchCreateStep[];
    /** #3 1단계: 이 사용자가 과거에 실제로 입력했던 장소 — 장소 입력창 포커스 시 칩으로 노출. */
    recentVenues?: Array<{ placeName: string; addressText: string | null }>;
  };
};
