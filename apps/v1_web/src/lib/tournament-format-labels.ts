import type { V1TournamentFormat } from '@/types/api';

/** 어드민 대회 화면이 형식을 부르는 이름의 단일 표. 공개 화면 문구는 `lib/competition-kind.ts` 가 따로 맡는다. */
export const TOURNAMENT_FORMAT_NAMES: Record<V1TournamentFormat, string> = {
  group_knockout: '조별리그 → 토너먼트',
  knockout: '토너먼트만',
  league: '리그전',
  league_knockouts: '여러 단계(예선 → 결선 여러 개)',
};
