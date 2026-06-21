export type TeamMatchModel = {
  id: string;
  title: string;
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
  cost: number;
  opponentCost: number;
  uniform: string;
  gender: string;
  manner: number;
  wins: number;
  status: 'open' | 'pending' | 'approved' | 'mine';
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
    hostTeamLogoUrl?: string | null;
    hostTeamTrustState?: string | null;
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
  statusLabel?: string;
  chatLabel?: string;
  chatPending?: boolean;
  onChat?: () => void;
  onShare?: () => void;
  onNotify?: () => void;
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
    style: string;
    uniform: string;
    gender: string;
    cost: number;
    opponentCost: number;
    venue: string;
    address: string;
    date: string;
    startTime: string;
    endTime: string;
  };
  form?: {
    selectedTeamId: string;
    selectedSportId: string;
    regionId: string;
    regions: Array<{ id: string; name: string }>;
    onSelectTeam: (teamName: string) => void;
    onSelectSport: (sportName: string) => void;
    onFieldChange: (field: keyof TeamMatchCreateViewModel['draft'], value: string | number) => void;
    onRegionChange: (regionId: string) => void;
    onBack: () => void;
    onNext: () => void;
    onSubmit: () => void;
    onCancel?: () => void;
    submitLabel?: string;
    submitting?: boolean;
    error?: string | null;
    lockedReason?: string | null;
  };
};
