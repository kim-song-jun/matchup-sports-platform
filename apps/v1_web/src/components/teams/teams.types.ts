export type TeamStatus = 'open' | 'reviewing' | 'closed' | 'mine';

export type TeamModel = {
  id: string;
  name: string;
  logo: string;
  sport: string;
  sports: string[];
  region: string;
  members: number;
  status: TeamStatus;
  statusLabel: string;
  tags: string[];
  genderRule: string;
  intro: string;
  fit: number;
  manner: string;
  trust: 'verified' | 'estimated' | 'none';
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
    levels: Array<'입문' | '초보' | '중수' | '고수'>;
    sortOptions: Array<{ label: string; value: 'recommended' | 'deadline' | 'latest'; href: string; active?: boolean }>;
    genderOptions: Array<{ label: string; value: '성별 무관' | '남' | '여'; href: string; active?: boolean }>;
    levelOptions: Array<{ label: string; value: '입문' | '초보' | '중수' | '고수'; href: string; active?: boolean }>;
  };
  chips: Array<{ label: string; count?: number; active?: boolean; href?: string }>;
  summary: { scope: string; total: number; recruiting: number; nearby: number };
  teams: TeamModel[];
};

export type TeamStateViewModel = TeamListViewModel & {
  state: 'search' | 'empty' | 'error' | 'filter';
  title: string;
  description: string;
};

export type TeamDetailViewModel = {
  team: TeamModel & {
    description: string;
    activity: string;
    condition: string;
    trustNote: string;
    schedule: string;
    city: string;
    county: string;
    level: string;
    genderRule: string;
    contact: string;
    links: Array<{ label: string; value: string }>;
    images: Array<{ title: string; count: number; max?: number; example?: boolean }>;
    membersList: Array<{ name: string; role: string; meta: string; status: string }>;
  };
  mode: 'default' | 'pending' | 'mine' | 'closed';
  ctaLabel?: string;
  ctaPending?: boolean;
  onCta?: () => void;
};

export type TeamFormMode = 'create' | 'edit';

export type TeamFormViewModel = {
  mode: TeamFormMode;
  team: {
    name: string;
    sport: string;
    region: string;
    description: string;
    sports: string[];
    city: string;
    county: string;
    level: string;
    genderRule: string;
    activity: string;
    capacity: number;
    contact: string;
    logoImage: string;
    coverImage: string;
    activityImages: string[];
    links: Array<{ label: string; value: string }>;
  };
  form?: {
    sportId: string;
    regionId: string;
    regions: Array<{ id: string; name: string }>;
    sports: Array<{ id: string; name: string }>;
    joinPolicy: 'approval_required' | 'closed';
    onFieldChange: (field: keyof TeamFormViewModel['team'], value: TeamFormViewModel['team'][keyof TeamFormViewModel['team']]) => void;
    onSportChange: (sportId: string) => void;
    onRegionChange: (regionId: string) => void;
    onJoinPolicyChange: (joinPolicy: 'approval_required' | 'closed') => void;
    onSubmit: () => void;
    submitting?: boolean;
    error?: string | null;
  };
};

export type TeamMembersViewModel = {
  teamName: string;
  summary: { total: number; managers: number; pending: number };
  members: Array<{
    name: string;
    role: string;
    meta: string;
    status: string;
    locked?: boolean;
    onPromote?: () => void;
    onDemote?: () => void;
    onRemove?: () => void;
    actionPending?: boolean;
  }>;
  requests: Array<{
    name: string;
    meta: string;
    status: string;
    onApprove?: () => void;
    onReject?: () => void;
    actionPending?: boolean;
  }>;
};
