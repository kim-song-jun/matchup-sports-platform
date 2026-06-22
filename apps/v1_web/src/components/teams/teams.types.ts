export type TeamStatus = 'open' | 'reviewing' | 'closed' | 'mine';

export type TeamModel = {
  id: string;
  name: string;
  logo: string;
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
  state: 'empty' | 'error' | 'filter' | 'restricted';
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
    membersList: Array<{ name: string; role: string; meta: string; status: string; visibility: '공개' | '비공개' }>;
    memberAccess: {
      canView: boolean;
      enabled: boolean;
      message: string;
    };
  };
  mode: 'default' | 'pending' | 'mine' | 'closed';
  ctaLabel?: string;
  ctaPending?: boolean;
  onCta?: () => void;
  onShare?: () => void | Promise<void>;
  /** Recruiting matches this team currently hosts — "이 팀의 열린 매치" section. */
  openMatches?: Array<{ id: string; title: string; dateLabel: string; venue: string }>;
  openMatchesLoading?: boolean;
};

export type TeamFormMode = 'create' | 'edit';

export type TeamFormViewModel = {
  mode: TeamFormMode;
  team: {
    name: string;
    logoUrl: string | null;
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
  };
  form?: {
    sportId: string;
    regionId: string;
    regions: Array<{ id: string; name: string }>;
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
    manageLabel?: string;
    locked?: boolean;
    actions: Array<{ label: string; tone?: 'danger'; onSelect: () => void }>;
    actionPending?: boolean;
  }>;
  requests: Array<{
    name: string;
    meta: string;
    status: string;
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
  };
};
