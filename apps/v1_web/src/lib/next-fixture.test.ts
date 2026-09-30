import { describe, expect, it } from 'vitest';
import { findNextFixture } from './next-fixture';

type Detail = Parameters<typeof findNextFixture>[0];

function tournamentFixture(id: string, scheduledAt: string | null, liveStatus: 'scheduled' | 'live' | 'ended' | 'cancelled') {
  return { id, scheduledAt, liveStatus, homeTeamName: `${id} 홈`, awayTeamName: `${id} 원정` };
}

function leagueFixture(teamMatchId: string, startAt: string, status: string) {
  return { teamMatchId, title: `${teamMatchId} 제목`, startAt, status };
}

function detail(parts: { fixtures?: unknown[]; leagueFixtures?: unknown[] }): Detail {
  return { fixtures: parts.fixtures ?? [], leagueFixtures: parts.leagueFixtures ?? [] } as unknown as Detail;
}

describe('findNextFixture', () => {
  it('리그: 일정 순서에서 현재 경기 바로 뒤의 미종료 경기를 고른다 (목록 순서가 아니라 시각 순)', () => {
    const next = findNextFixture(
      detail({
        leagueFixtures: [
          leagueFixture('m3', '2026-10-14T01:10:00Z', 'matched'),
          leagueFixture('m1', '2026-09-30T01:10:00Z', 'matched'),
          leagueFixture('m2', '2026-10-07T01:10:00Z', 'matched'),
        ],
      }),
      'm1',
    );
    expect(next).toEqual({ fixtureId: 'm2', label: 'm2 제목' });
  });

  it('취소·종료된 경기는 건너뛰고 그 다음 경기를 고른다', () => {
    const next = findNextFixture(
      detail({
        leagueFixtures: [
          leagueFixture('m1', '2026-09-30T01:10:00Z', 'matched'),
          leagueFixture('m2', '2026-10-07T01:10:00Z', 'cancelled'),
          leagueFixture('m3', '2026-10-14T01:10:00Z', 'completed'),
          leagueFixture('m4', '2026-10-21T01:10:00Z', 'matched'),
        ],
      }),
      'm1',
    );
    expect(next?.fixtureId).toBe('m4');
  });

  it('대회: 팀 이름으로 라벨을 만들고, 진행 중이거나 끝난 경기는 다음 경기로 고르지 않는다', () => {
    const next = findNextFixture(
      detail({
        fixtures: [
          tournamentFixture('f1', '2026-09-30T01:00:00Z', 'ended'),
          tournamentFixture('f2', '2026-09-30T02:00:00Z', 'ended'),
          tournamentFixture('f3', '2026-09-30T03:00:00Z', 'scheduled'),
        ],
      }),
      'f1',
    );
    expect(next).toEqual({ fixtureId: 'f3', label: 'f3 홈 vs f3 원정' });
  });

  it('참가팀이 아직 정해지지 않은 대진은 "미정"으로 부른다', () => {
    const next = findNextFixture(
      detail({
        fixtures: [
          tournamentFixture('f1', '2026-09-30T01:00:00Z', 'ended'),
          { id: 'f2', scheduledAt: '2026-09-30T03:00:00Z', liveStatus: 'scheduled', homeTeamName: null, awayTeamName: null },
        ],
      }),
      'f1',
    );
    expect(next?.label).toBe('미정 vs 미정');
  });

  it('일정 시각이 없는 경기는 맨 뒤로 보낸다', () => {
    const next = findNextFixture(
      detail({
        fixtures: [
          tournamentFixture('f1', '2026-09-30T01:00:00Z', 'ended'),
          tournamentFixture('f-tbd', null, 'scheduled'),
          tournamentFixture('f2', '2026-10-01T01:00:00Z', 'scheduled'),
        ],
      }),
      'f1',
    );
    expect(next?.fixtureId).toBe('f2');
  });

  it('마지막 경기이거나 뒤에 남은 경기가 없으면 null', () => {
    const last = detail({
      leagueFixtures: [
        leagueFixture('m1', '2026-09-30T01:10:00Z', 'matched'),
        leagueFixture('m2', '2026-10-07T01:10:00Z', 'matched'),
      ],
    });
    expect(findNextFixture(last, 'm2')).toBeNull();
  });

  it('현재 경기를 목록에서 찾지 못하면 엉뚱한 경기를 "다음"이라 부르지 않고 null', () => {
    expect(
      findNextFixture(detail({ leagueFixtures: [leagueFixture('m1', '2026-09-30T01:10:00Z', 'matched')] }), 'ghost'),
    ).toBeNull();
  });
});
