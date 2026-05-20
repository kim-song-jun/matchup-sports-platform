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
  intro: string;
  fit: number;
  manner: number;
  trust: 'verified' | 'estimated' | 'sample';
  next: string;
};

export type TeamListViewModel = {
  query: string;
  placeholder: string;
  filterCount: number;
  chips: Array<{ label: string; active?: boolean }>;
  summary: { scope: string; total: number; recruiting: number; nearby: number };
  teams: TeamModel[];
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
    contact: string;
    links: Array<{ label: string; value: string }>;
    images: Array<{ title: string; count: number; max?: number; example?: boolean }>;
    membersList: Array<{ name: string; role: string; meta: string; status: string }>;
  };
  mode: 'default' | 'pending' | 'mine' | 'closed';
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
    activity: string;
    capacity: number;
    contact: string;
    links: Array<{ label: string; value: string }>;
  };
};

export type TeamMembersViewModel = {
  teamName: string;
  summary: { total: number; managers: number; pending: number };
  members: Array<{ name: string; role: string; meta: string; status: string; locked?: boolean }>;
  requests: Array<{ name: string; meta: string; status: string }>;
};
