export type MatchCardModel = {
  id: string;
  title: string;
  sport: string;
  venue: string;
  region: string;
  date: string;
  time: string;
  current: number;
  capacity: number;
  actionLabel: string;
  level: string;
  gender: string;
  host: string;
  image: string;
  deadline: string;
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
    viewOptions: Array<{ label: string; value: 'card' | 'compact'; description: string; href: string; active?: boolean }>;
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
};

export type MatchStateViewModel = MatchListViewModel & {
  state: 'empty' | 'error' | 'filter' | 'joined' | 'participants';
  title: string;
  description: string;
};

export type MatchDetailViewModel = {
  match: MatchCardModel & {
    description: string;
    address: string;
    rules: string[];
    manageHref?: string;
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

export type MatchCreateStep = 'sport' | 'info' | 'place-time' | 'confirm' | 'complete' | 'edit';

export type MatchCreateViewModel = {
  step: MatchCreateStep;
  backHref?: string;
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
    submitLabel?: string;
    submitting?: boolean;
    error?: string | null;
    lockedReason?: string | null;
  };
};
