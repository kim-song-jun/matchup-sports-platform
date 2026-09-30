import { describe, expect, it } from 'vitest';
import { appearsInRanking, buildRecordExposureRows, describePendingRecord } from './record-consent-preview';
import type { PublicUserRecordItem, PublicUserRecordsSummary } from './types';

function item(overrides: Partial<PublicUserRecordItem> = {}): PublicUserRecordItem {
  return {
    id: 'record-1', gameId: 'game-1', teamMatchId: 'match-1', type: 'league', matchType: 'team_match', tournamentId: null,
    tournamentTitle: null, leagueId: 'league-1', leagueTitle: '마포 주말 리그', round: null, teamId: 'team-1', teamName: '마포 FC',
    opponentTeamId: 'team-2', opponentTeamName: '합정 유나이티드', result: 'WON', goals: 1, assists: 1, cards: { yellow: 0, red: 0 },
    minutesPlayed: 90, started: true, goalkeeper: false, mvp: false, officialAt: '2026-09-30T01:10:00.000Z', ...overrides,
  };
}

const ZERO = { appearances: 0, goals: 0, assists: 0, yellowCards: 0, redCards: 0, mvpCount: 0 };

function summary(byType: Partial<PublicUserRecordsSummary['byType']>): PublicUserRecordsSummary {
  const merged = { league: ZERO, tournament: ZERO, friendly: ZERO, ...byType };
  const total = (key: keyof typeof ZERO) => merged.league[key] + merged.tournament[key] + merged.friendly[key];
  return {
    appearances: total('appearances'), goals: total('goals'), assists: total('assists'), yellowCards: 0, redCards: 0,
    mvpCount: 0, matchMvpCount: 0, tournamentAwardCount: 0, byType: merged,
  };
}

describe('describePendingRecord', () => {
  it('날짜 · 리그 이름 / 팀 vs 상대 / 내 골·도움을 한 덩어리로 만든다', () => {
    expect(describePendingRecord(item())).toEqual({
      caption: '9/30 (수) · 마포 주말 리그',
      result: 'WON',
      matchup: '마포 FC vs 합정 유나이티드',
      stats: '내 기록 · 1골 · 1도움',
    });
  });

  it('0 인 칸은 말하지 않고, 둘 다 0 이면 엔트리라고만 한다', () => {
    expect(describePendingRecord(item({ goals: 2, assists: 0 })).stats).toBe('내 기록 · 2골');
    expect(describePendingRecord(item({ goals: 0, assists: 3 })).stats).toBe('내 기록 · 3도움');
    expect(describePendingRecord(item({ goals: 0, assists: 0 })).stats).toBe('내 기록 · 엔트리');
  });

  it('친선 경기는 대회·리그 이름 없이 날짜만, 상대·소속을 모르면 미상으로 쓴다', () => {
    const friendly = describePendingRecord(
      item({ type: 'friendly', leagueId: null, leagueTitle: null, teamName: null, opponentTeamName: null, result: null }),
    );
    expect(friendly.caption).toBe('9/30 (수)');
    expect(friendly.matchup).toBe('소속 미상 vs 상대 미상');
    expect(friendly.result).toBeNull();
  });
});

describe('공개하면 보이는 곳 미리보기', () => {
  it('리그·대회 골/도움이 있으면 순위 줄을 넣고, 같은 골이 친선에만 있으면 넣지 않는다', () => {
    const inLeague = summary({ league: { ...ZERO, appearances: 1, goals: 2, assists: 1 } });
    const inFriendly = summary({ friendly: { ...ZERO, appearances: 1, goals: 2, assists: 1 } });

    expect(appearsInRanking(inLeague)).toBe(true);
    expect(buildRecordExposureRows(inLeague, '골잡이')[0]).toEqual({
      key: 'ranking',
      title: '리그·대회 득점·도움 순위',
      example: '골잡이 · 2골 · 1도움',
    });
    // 대조군: 총합은 같지만 친선이라 순위 대상이 아니다.
    expect(appearsInRanking(inFriendly)).toBe(false);
    expect(buildRecordExposureRows(inFriendly, '골잡이').map((row) => row.key)).toEqual(['activity', 'matchDetail']);
  });

  it('순위 줄은 순위에 오르는 경기(리그+대회)만 세고, 활동 기록 줄은 전체를 센다', () => {
    const mixed = summary({
      league: { ...ZERO, appearances: 1, goals: 1, assists: 0 },
      tournament: { ...ZERO, appearances: 1, goals: 0, assists: 2 },
      friendly: { ...ZERO, appearances: 1, goals: 5, assists: 0 },
    });

    const rows = buildRecordExposureRows(mixed, null);

    expect(rows.find((row) => row.key === 'ranking')?.example).toBe('내 닉네임 · 1골 · 2도움');
    expect(rows.find((row) => row.key === 'activity')?.example).toBe('엔트리 3경기 · 6골 · 2도움');
  });

  it('골·도움이 하나도 없어도 활동 기록과 경기 상세 줄은 남는다', () => {
    const rows = buildRecordExposureRows(summary({ league: { ...ZERO, appearances: 1 } }), '골잡이');

    expect(rows.map((row) => [row.key, row.example])).toEqual([
      ['activity', '엔트리 1경기'],
      ['matchDetail', '경기 상세에서 내 이름을 누르면 내 활동 기록이 열려요'],
    ]);
  });
});
