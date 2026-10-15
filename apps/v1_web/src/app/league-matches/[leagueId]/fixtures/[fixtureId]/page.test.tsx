import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LeagueFixturePage from './page';
import type { V1TeamMatch } from '@/types/api';

const { loadPublic } = vi.hoisted(() => ({ loadPublic: vi.fn() }));

vi.mock('../../load-public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../load-public')>()),
  loadPublic,
}));

vi.mock('./league-fixture-detail-client', () => ({ default: () => null }));

describe('리그 경기 상세 JSON-LD', () => {
  beforeEach(() => {
    loadPublic.mockReset();
    loadPublic.mockImplementation(async (path: string) => {
      if (path === '/team-matches/f9') return {
        ok: true,
        data: {
          teamMatchId: 'f9', title: '1주차', sportName: '풋살', startsAt: '2026-09-20T01:00:00.000Z',
          placeName: '송파 풋살파크', status: 'matched',
          hostTeam: { teamId: 'team-a', name: '송파 유나이티드' },
          league: { leagueId: 'lg1', title: '송파 풋살 리그' },
        } as unknown as V1TeamMatch,
      };
      if (path === '/league-matches/lg1') return { ok: true, data: { fixtures: [] } };
      return { ok: false, data: null };
    });
  });

  it('경기 Event 를 유효한 자체 정보로 내고 리그는 BreadcrumbList 로 연결한다', async () => {
    const html = renderToStaticMarkup(await LeagueFixturePage({
      params: Promise.resolve({ leagueId: 'lg1', fixtureId: 'f9' }),
    }));
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
    const event = scripts.find((node) => node['@type'] === 'SportsEvent');
    const breadcrumb = scripts.find((node) => node['@type'] === 'BreadcrumbList');

    expect(event).toMatchObject({
      '@id': 'https://teameet.co.kr/league-matches/lg1/fixtures/f9#event',
      url: 'https://teameet.co.kr/league-matches/lg1/fixtures/f9',
      name: '1주차',
      startDate: '2026-09-20T01:00:00.000Z',
      location: { '@type': 'Place', name: '송파 풋살파크' },
    });
    expect(event).not.toHaveProperty('superEvent');
    expect(breadcrumb.itemListElement).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: '송파 풋살 리그', item: 'https://teameet.co.kr/tournaments/lg1' }),
    ]));
  });
});
