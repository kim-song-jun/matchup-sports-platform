import { CompetitionConfig } from './competition-config.types';

export const REQUIRED_TIE_BREAK_ORDER: CompetitionConfig['tieBreak']['order'] = [
  'points',
  'head_to_head',
  'goal_difference',
  'goals_for',
  'fair_play',
  'seeded_draw',
];

export const FOOTBALL_V1_CONFIG: CompetitionConfig = {
  periods: [
    { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
    { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
  ],
  events: ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION'],
  lineup: {
    minPlayers: 7,
    maxPlayers: 11,
    substitutions: 'limited',
    maxSubstitutions: 5,
  },
  result: {
    tournamentScorerPolicy: 'required',
    teamMatchScorerPolicy: 'optional_with_warning',
    mvpMin: 0,
    mvpMax: 1,
  },
  tieBreak: {
    points: { win: 3, draw: 1, loss: 0 },
    order: REQUIRED_TIE_BREAK_ORDER,
    seededDraw: 'sha256-v1',
  },
  visibility: { default: 'live', allowed: ['live', 'official'] },
};

export const FUTSAL_V1_CONFIG: CompetitionConfig = {
  periods: [
    { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
    { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
  ],
  events: ['GOAL', 'OWN_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'TEAM_FOUL'],
  lineup: {
    minPlayers: 3,
    maxPlayers: 5,
    substitutions: 'rolling',
    maxSubstitutions: null,
  },
  result: {
    tournamentScorerPolicy: 'required',
    teamMatchScorerPolicy: 'optional_with_warning',
    mvpMin: 0,
    mvpMax: 1,
  },
  tieBreak: {
    points: { win: 3, draw: 1, loss: 0 },
    order: REQUIRED_TIE_BREAK_ORDER,
    seededDraw: 'sha256-v1',
  },
  visibility: { default: 'live', allowed: ['live', 'official'] },
};
