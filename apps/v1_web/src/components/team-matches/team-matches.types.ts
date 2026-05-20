export type TeamMatchModel = {
  id: string;
  title: string;
  sport: string;
  hostTeam: string;
  venue: string;
  date: string;
  time: string;
  format: string;
  grade: string;
  cost: number;
  opponentCost: number;
  uniform: string;
  manner: number;
  wins: number;
  status: 'open' | 'pending' | 'approved' | 'mine';
};

export type TeamMatchListViewModel = {
  query: string;
  filterCount: number;
  sports: Array<{ label: string; count: number; active?: boolean }>;
  summary: { count: number; today: number; urgent: number };
  matches: TeamMatchModel[];
};

export type TeamMatchStateViewModel = TeamMatchListViewModel & {
  state: 'empty' | 'error' | 'filter';
  title: string;
  description: string;
};

export type TeamMatchDetailViewModel = {
  match: TeamMatchModel & {
    description: string;
    address: string;
    applicantTeams: Array<{ name: string; meta: string; status: string }>;
  };
  mode: 'default' | 'pending' | 'approved' | 'mine';
};

export type TeamMatchCreateStep = 'team' | 'sport' | 'info' | 'condition' | 'place-time' | 'confirm' | 'complete' | 'edit';

export type TeamMatchCreateViewModel = {
  step: TeamMatchCreateStep;
  selectedTeam: string;
  selectedSport: string;
  teams: Array<{ name: string; sport: string; members: number; role: string; selected?: boolean }>;
  sports: string[];
  draft: {
    title: string;
    description: string;
    grade: string;
    format: string;
    style: string;
    uniform: string;
    cost: number;
    opponentCost: number;
    venue: string;
    address: string;
    date: string;
    startTime: string;
    endTime: string;
  };
};
