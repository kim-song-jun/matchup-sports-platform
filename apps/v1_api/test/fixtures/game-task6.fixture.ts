import {
  V1CompetitionConfigStatus,
  V1GameEventType,
  V1GameSideKey,
  V1GameSourceType,
} from '@prisma/client';
import { FOOTBALL_V1_CONFIG } from '../../src/tournaments/competition-config/competition-config';

export const TASK6_GAME_FIXTURE_IDS = {
  game: '64000000-0000-4000-8000-000000000001',
  teamMatch: '64000000-0000-4000-8000-000000000002',
  competitionConfigVersion: '64000000-0000-4000-8000-000000000003',
  homeTeam: '64000000-0000-4000-8000-000000000004',
  awayTeam: '64000000-0000-4000-8000-000000000005',
  homeSide: '64000000-0000-4000-8000-000000000006',
  awaySide: '64000000-0000-4000-8000-000000000007',
  homeParticipant: '64000000-0000-4000-8000-000000000008',
  awayParticipant: '64000000-0000-4000-8000-000000000009',
} as const;

export const TASK6_GAME_FIXTURE = {
  verified: false,
  source: {
    type: V1GameSourceType.TEAM_MATCH,
    id: TASK6_GAME_FIXTURE_IDS.teamMatch,
  },
  competitionConfig: {
    id: TASK6_GAME_FIXTURE_IDS.competitionConfigVersion,
    sportCode: 'football',
    name: 'football-v1',
    version: 1,
    status: V1CompetitionConfigStatus.ACTIVE,
    contentHash: 'task6-l4-football-v1-config',
    document: FOOTBALL_V1_CONFIG,
  },
  sides: [
    {
      id: TASK6_GAME_FIXTURE_IDS.homeSide,
      sideKey: V1GameSideKey.HOME,
      teamId: TASK6_GAME_FIXTURE_IDS.homeTeam,
      displayNameSnapshot: 'Task 6 L4 Home',
    },
    {
      id: TASK6_GAME_FIXTURE_IDS.awaySide,
      sideKey: V1GameSideKey.AWAY,
      teamId: TASK6_GAME_FIXTURE_IDS.awayTeam,
      displayNameSnapshot: 'Task 6 L4 Away',
    },
  ],
  participants: [
    {
      id: TASK6_GAME_FIXTURE_IDS.homeParticipant,
      sideId: TASK6_GAME_FIXTURE_IDS.homeSide,
      displayNameSnapshot: 'Task 6 L4 Home Scorer',
    },
    {
      id: TASK6_GAME_FIXTURE_IDS.awayParticipant,
      sideId: TASK6_GAME_FIXTURE_IDS.awaySide,
      displayNameSnapshot: 'Task 6 L4 Away Scorer',
    },
  ],
  scorerRecords: [
    {
      sequence: 1,
      type: V1GameEventType.GOAL,
      sideId: TASK6_GAME_FIXTURE_IDS.homeSide,
      participantId: TASK6_GAME_FIXTURE_IDS.homeParticipant,
      period: 1,
      clockMs: 60_000,
      occurredAt: '2026-07-31T12:00:00.000Z',
    },
    {
      sequence: 2,
      type: V1GameEventType.GOAL,
      sideId: TASK6_GAME_FIXTURE_IDS.awaySide,
      participantId: TASK6_GAME_FIXTURE_IDS.awayParticipant,
      period: 2,
      clockMs: 120_000,
      occurredAt: '2026-07-31T12:20:00.000Z',
    },
  ],
  resultParticipants: [
    {
      participantId: TASK6_GAME_FIXTURE_IDS.homeParticipant,
      sideId: TASK6_GAME_FIXTURE_IDS.homeSide,
      started: true,
      minutesPlayed: 90,
      goals: 1,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    },
    {
      participantId: TASK6_GAME_FIXTURE_IDS.awayParticipant,
      sideId: TASK6_GAME_FIXTURE_IDS.awaySide,
      started: true,
      minutesPlayed: 90,
      goals: 1,
      cards: { yellow: 0, red: 0 },
      goalkeeper: false,
    },
  ],
} as const;
