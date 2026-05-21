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
  host: string;
  image: string;
  deadline: string;
  status: 'open' | 'pending' | 'approved' | 'full' | 'mine';
};

export type MatchListViewModel = {
  query: string;
  filterCount: number;
  sports: Array<{ label: string; count: number; active?: boolean }>;
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
    participants: Array<{
      name: string;
      meta: string;
      status: string;
      onApprove?: () => void;
      onReject?: () => void;
      actionPending?: boolean;
    }>;
  };
  mode: 'default' | 'pending' | 'approved' | 'mine';
  applyLabel?: string;
  applyPending?: boolean;
  onApply?: () => void;
};

export type MatchCreateStep = 'sport' | 'info' | 'place-time' | 'confirm' | 'complete' | 'edit';

export type MatchCreateViewModel = {
  step: MatchCreateStep;
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
