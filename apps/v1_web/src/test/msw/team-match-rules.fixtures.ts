import type { V1TeamMatchPeriod } from '@/types/api';

export type TeamMatchRulesHostFixture = {
  readonly hostTeamId: string;
  readonly name: string;
  readonly sportId: string;
  readonly sportName: string;
  readonly managerUserId: string;
  readonly active: boolean;
  readonly competitionConfigVersionId: string | null;
  readonly periods: readonly V1TeamMatchPeriod[] | null;
};

// Explicit MSW presets mirror FOOTBALL_V1_CONFIG/FUTSAL_V1_CONFIG in v1_api.
// They are fixture authority, never a frontend fallback for a failed options request.
export const teamMatchRulesHostFixtures: readonly TeamMatchRulesHostFixture[] = [
  {
    hostTeamId: 'team-1', name: '성수 볼러즈', sportId: 'sport-futsal', sportName: '풋살',
    managerUserId: 'user-1', active: true, competitionConfigVersionId: 'config-futsal-v1',
    periods: [
      { code: 'FIRST_HALF', label: '전반', durationMinutes: 20, extraTime: false },
      { code: 'SECOND_HALF', label: '후반', durationMinutes: 20, extraTime: false },
    ],
  },
  {
    hostTeamId: 'team-mdqa141-football', name: '규칙 검증 축구팀', sportId: 'sport-soccer', sportName: '축구',
    managerUserId: 'user-1', active: true, competitionConfigVersionId: 'config-football-v1',
    periods: [
      { code: 'FIRST_HALF', label: '전반', durationMinutes: 45, extraTime: false },
      { code: 'SECOND_HALF', label: '후반', durationMinutes: 45, extraTime: false },
    ],
  },
  {
    hostTeamId: 'team-mdqa141-running', name: '규칙 미지원 러닝팀', sportId: 'sport-running', sportName: '러닝',
    managerUserId: 'user-1', active: true, competitionConfigVersionId: null, periods: null,
  },
];
