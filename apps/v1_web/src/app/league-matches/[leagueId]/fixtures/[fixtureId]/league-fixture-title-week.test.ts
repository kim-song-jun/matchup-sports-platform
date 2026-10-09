/**
 * 리그 경기 탭 제목의 주차는 본문 주차와 같아야 한다 — 저장된 대진 제목의 주차는 생성 시점 값이라
 * 재일정 뒤 어긋난다. API 경계(fetch)만 바꾸고 page 의 generateMetadata 는 실제 코드로 돌린다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from './page';

const fixture = (id: string, title: string, startAt: string) => ({
  teamMatchId: id, title, homeTeamId: 'team-a', awayTeamId: 'team-b', startAt, placeName: '송파 풋살파크', status: 'matched',
});

const LEAGUE = {
  leagueId: 'lg-1', title: '서울 나이트 풋살 리그',
  fixtures: [
    fixture('fx-1', '서울 나이트 풋살 리그 1주차', '2026-09-13T11:00:00.000Z'),
    fixture('fx-2', '서울 나이트 풋살 리그 2주차', '2026-09-20T11:00:00.000Z'),
    // 제목은 2주차로 박제됐지만 일정이 옮겨져 세 번째 경기 날짜가 됐다.
    fixture('fx-3', '서울 나이트 풋살 리그 2주차', '2026-09-27T14:57:00.000Z'),
    fixture('fx-4', '개막전', '2026-10-04T11:00:00.000Z'),
  ],
};

const teamMatch = (id: string) => {
  const stored = LEAGUE.fixtures.find((item) => item.teamMatchId === id)!;
  return {
    id, title: stored.title, startsAt: stored.startAt, place: { name: stored.placeName },
    league: { leagueId: 'lg-1', title: LEAGUE.title },
  };
};

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ status: 'success', data }), { status: 200 });
}

let leagueResponse: () => Response;

beforeEach(() => {
  leagueResponse = () => envelope(LEAGUE);
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const path = String(input).replace(/^.*\/api\/v1/, '');
    if (path === '/league-matches/lg-1') return leagueResponse();
    const match = /^\/team-matches\/(fx-\d)$/.exec(path);
    if (match) return envelope(teamMatch(match[1]));
    return new Response('unexpected', { status: 500 });
  }));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const titleOf = async (fixtureId: string) => {
  const meta = await generateMetadata({ params: Promise.resolve({ leagueId: 'lg-1', fixtureId }) });
  return String(meta.title);
};

describe('리그 경기 탭 제목의 주차', () => {
  it('일정이 옮겨져 어긋난 경기는 본문과 같은 파생 주차로 바꾼다', async () => {
    expect(await titleOf('fx-3')).toContain('서울 나이트 풋살 리그 3주차');
  });

  it('제목이 이미 맞는 경기는 그대로 둔다', async () => {
    expect(await titleOf('fx-1')).toContain('서울 나이트 풋살 리그 1주차');
    expect(await titleOf('fx-2')).toContain('서울 나이트 풋살 리그 2주차');
  });

  it('주차 토큰이 없는 사용자 지정 제목은 건드리지 않는다', async () => {
    expect(await titleOf('fx-4')).toContain('개막전');
  });

  it('리그 조회가 실패하면 저장된 제목으로 둔다', async () => {
    leagueResponse = () => new Response('boom', { status: 500 });
    expect(await titleOf('fx-3')).toContain('서울 나이트 풋살 리그 2주차');
  });
});
