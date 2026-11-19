import type { Prisma } from '@prisma/client';
import {
  PUBLIC_OFFICIAL_TEAM_FACT_FILTER,
  PUBLIC_OFFICIAL_TEAM_FACT_JOINS,
  countRecentPlayedByTeam,
  recentThreeMonthsSince,
} from './team-record-public-sql';

describe('recentThreeMonthsSince', () => {
  it('UTC 기준으로 정확히 3개월 전을 돌려준다', () => {
    expect(recentThreeMonthsSince(new Date('2026-11-19T06:30:00.000Z')).toISOString()).toBe('2026-08-19T06:30:00.000Z');
  });

  it('전달에 같은 날짜가 없으면 Date 의 월 보정을 따른다(11/30 → 8/30, 5/31 → 3/3)', () => {
    expect(recentThreeMonthsSince(new Date('2026-11-30T00:00:00.000Z')).toISOString()).toBe('2026-08-30T00:00:00.000Z');
    expect(recentThreeMonthsSince(new Date('2026-05-31T00:00:00.000Z')).toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });

  it('인자로 받은 Date 를 바꾸지 않는다', () => {
    const now = new Date('2026-11-19T00:00:00.000Z');
    recentThreeMonthsSince(now);
    expect(now.toISOString()).toBe('2026-11-19T00:00:00.000Z');
  });
});

describe('countRecentPlayedByTeam', () => {
  const since = new Date('2026-08-19T00:00:00.000Z');

  it('팀이 없으면 쿼리를 보내지 않고 빈 맵을 돌려준다', async () => {
    const $queryRaw = jest.fn();
    await expect(countRecentPlayedByTeam({ $queryRaw }, [], since)).resolves.toEqual(new Map());
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('한 페이지 팀들을 쿼리 1번으로 세고, 경기가 없는 팀은 맵에 넣지 않는다', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([
      { teamId: 'team-a', played: 17 },
      { teamId: 'team-b', played: 3 },
    ]);
    const counts = await countRecentPlayedByTeam({ $queryRaw }, ['team-a', 'team-b', 'team-c'], since);

    expect($queryRaw).toHaveBeenCalledTimes(1);
    expect(counts.get('team-a')).toBe(17);
    expect(counts.get('team-b')).toBe(3);
    // 호출부가 `?? 0` 으로 읽는다 — 0경기도 카드에 그대로 보여 주기 위해서다.
    expect(counts.has('team-c')).toBe(false);
  });

  it('팀 전적과 같은 공개·공식 조건과 기준 시각을 쿼리에 싣는다', async () => {
    const $queryRaw = jest.fn().mockResolvedValue([]);
    await countRecentPlayedByTeam({ $queryRaw }, ['team-a'], since);

    const query = $queryRaw.mock.calls[0][0] as Prisma.Sql;
    const text = query.text.replace(/\s+/g, ' ');
    expect(text).toContain('trf.team_id = ANY($1::text[])');
    expect(text).toContain('trf.played_at >= $2');
    expect(text).toContain('GROUP BY trf.team_id');
    // 조각이 그대로 들어가야 팀 전적과 기준이 어긋나지 않는다.
    expect(text).toContain(PUBLIC_OFFICIAL_TEAM_FACT_JOINS.sql.replace(/\s+/g, ' ').trim());
    expect(text).toContain(PUBLIC_OFFICIAL_TEAM_FACT_FILTER.sql.replace(/\s+/g, ' ').trim());
    expect(query.values).toEqual([['team-a'], since]);
  });
});

describe('공개·공식 경기 조건 조각', () => {
  it('현재 공식 리비전만, 숨김·결과 비공개 경기는 제외하는 조건을 담는다', () => {
    const joins = PUBLIC_OFFICIAL_TEAM_FACT_JOINS.sql.replace(/\s+/g, ' ');
    const filter = PUBLIC_OFFICIAL_TEAM_FACT_FILTER.sql.replace(/\s+/g, ' ');
    expect(joins).toContain('g.current_official_revision_id = trf.revision_id');
    // 정책 row 가 없는 경기는 fail-closed 라 INNER JOIN 이다.
    expect(joins).toContain('INNER JOIN v1_game_visibility_policies vp');
    expect(filter).toContain("vp.mode IN ('LIVE', 'OFFICIAL_ONLY')");
    expect(filter).toContain('league.is_public IS TRUE');
  });
});
