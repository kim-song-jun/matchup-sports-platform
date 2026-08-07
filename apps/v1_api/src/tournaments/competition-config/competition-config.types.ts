export const COMPETITION_CONFIG_CODES = {
  INVALID: 'COMPETITION_CONFIG_INVALID',
  MISSING_SPORT: 'COMPETITION_CONFIG_SPORT_REQUIRED',
  UNSUPPORTED_SPORT: 'COMPETITION_CONFIG_SPORT_UNSUPPORTED',
  USED_MUTATION: 'COMPETITION_CONFIG_VERSION_IN_USE',
} as const;

export type CompetitionConfig = {
  periods: Array<{
    code: string;
    label: string;
    durationMinutes: number;
    extraTime: boolean;
  }>;
  events: string[];
  lineup: {
    minPlayers: number;
    maxPlayers: number;
    substitutions: 'limited' | 'rolling';
    maxSubstitutions: number | null;
  };
  result: {
    tournamentScorerPolicy: 'required' | 'optional';
    teamMatchScorerPolicy: 'optional_with_warning';
    mvpMin: 0;
    mvpMax: 1;
  };
  tieBreak: {
    points: { win: number; draw: number; loss: number };
    order: Array<
      | 'points'
      | 'head_to_head'
      | 'goal_difference'
      | 'goals_for'
      | 'fair_play'
      | 'seeded_draw'
    >;
    seededDraw: 'sha256-v1';
  };
  visibility: {
    default: 'live';
    allowed: Array<'live' | 'official'>;
  };
};
