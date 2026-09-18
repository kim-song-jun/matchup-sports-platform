import { describe, expect, it } from 'vitest';
import { competitionFormatLabel, isLeagueCompetition } from './competition-kind';

/**
 * **픽스처가 거울 행의 실제 모양이어야 한다.**
 *
 * `format: 'league'` 로 리그를 흉내내면 `||` 의 **앞쪽이 참이라 뒤를 안 탄다** — `|| kind` 를
 * 지워도 통과하는 vacuous 테스트가 된다. 통합 백필이 만드는 진짜 리그 행은 이 모양이다:
 *
 * ```
 * kind='regular_league'  format='group_knockout'   ← 백필이 format 을 안 채워 기본값이 남는다
 * ```
 * alpha 실측(2026-09-01, d0ffcf026): 공개 대회 62건 전부 `kind='regular_tournament'`,
 * 그중 `format='league'` 가 7건. 거울 행은 아직 이 표면에 안 온다.
 */
const MIRROR_LEAGUE = { format: 'group_knockout', kind: 'regular_league' } as const;
const LEAGUE_FORMAT_TOURNAMENT = { format: 'league', kind: 'regular_tournament' } as const;
const GROUP_KNOCKOUT = { format: 'group_knockout', kind: 'regular_tournament' } as const;
const KNOCKOUT = { format: 'knockout', kind: 'regular_tournament' } as const;
const LEGACY_NULL_KIND = { format: 'group_knockout', kind: null } as const;

describe('isLeagueCompetition', () => {
  it('거울 행(kind=regular_league)은 format 이 group_knockout 이어도 리그다', () => {
    expect(isLeagueCompetition(MIRROR_LEAGUE)).toBe(true);
  });

  it('리그 방식으로 치르는 대회(format=league)도 리그 분기를 탄다 — 기존 동작', () => {
    expect(isLeagueCompetition(LEAGUE_FORMAT_TOURNAMENT)).toBe(true);
  });

  it('조별+토너먼트 대회는 리그가 아니다', () => {
    expect(isLeagueCompetition(GROUP_KNOCKOUT)).toBe(false);
  });

  it('토너먼트 대회는 리그가 아니다', () => {
    expect(isLeagueCompetition(KNOCKOUT)).toBe(false);
  });

  // null 을 리그 쪽에 묶으면 R1 이전 행(전부 단발 대회)이 리그 규칙에 걸린다 —
  // 서버 `tournamentKindCondition` 이 같은 이유로 null 을 tournament 쪽에만 붙인다.
  it('kind=null(R1 이전 행)은 리그가 아니다', () => {
    expect(isLeagueCompetition(LEGACY_NULL_KIND)).toBe(false);
  });
});

describe('competitionFormatLabel', () => {
  // 이 케이스가 "라벨은 || 로 못 고친다"의 증거다 — format 값을 그대로 읽으면
  // 진짜 리그에 "조별리그 + 토너먼트" 라고 적힌다.
  it('거울 행에 "조별리그 + 토너먼트" 라고 적지 않는다', () => {
    expect(competitionFormatLabel(MIRROR_LEAGUE)).toBe('리그 방식');
  });

  it('format=league 대회도 리그 방식으로 적는다', () => {
    expect(competitionFormatLabel(LEAGUE_FORMAT_TOURNAMENT)).toBe('리그 방식');
  });

  it('조별+토너먼트 / 토너먼트 라벨은 그대로다', () => {
    expect(competitionFormatLabel(GROUP_KNOCKOUT)).toBe('조별리그 + 토너먼트');
    expect(competitionFormatLabel(KNOCKOUT)).toBe('토너먼트');
  });
});
