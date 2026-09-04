// apps/v1_web/src/app/league-matches/league-wave5.test.tsx
// Wave 5 — 리그 상세/시상/경기 라우트의 데스크톱 헤드 승격 + backHref 재타깃 회귀 가드.
//
// /league-matches(목록)는 2026-09-01부터 /tournaments?kind=league 로의 순수 redirect라
// (app/league-matches/page.tsx) 더 이상 "나갈 곳"이 아니다. 리그 상세의 backHref를 그
// 죽은 목록 대신 통합 목록으로 재타깃했는지, 그리고 세 라우트(상세/경기/시상) 모두
// desktopHead가 켜졌는지를 실제 ROUTE_CHROME_TABLE 기준으로 고정한다.
import { describe, expect, it } from 'vitest';
import { resolveRouteChrome } from '@/lib/route-chrome';

describe('Wave 5 — 리그 라우트 크롬', () => {
  it('리그 상세: backHref가 /league-matches(순수 redirect)가 아니라 통합 대회 목록을 가리키고, desktopHead가 켜져 있다', () => {
    const resolved = resolveRouteChrome('/league-matches/lg-1');
    expect(resolved?.chrome.backHref).toBe('/tournaments?kind=league');
    expect(resolved?.chrome.desktopHead).toBe(true);
  });

  it('리그 경기(fixture) 상세: desktopHead가 켜져 있고 backHref는 리그 상세로 돌아간다', () => {
    const resolved = resolveRouteChrome('/league-matches/lg-1/fixtures/fx-1');
    expect(resolved?.chrome.desktopHead).toBe(true);
    const backHref = resolved?.chrome.backHref;
    expect(typeof backHref === 'function' ? backHref({ leagueId: 'lg-1' }) : backHref).toBe(
      '/league-matches/lg-1',
    );
  });

  it('시즌 결산(awards): desktopHead가 켜져 있고 backHref는 리그 상세로 돌아간다', () => {
    const resolved = resolveRouteChrome('/league-matches/lg-1/awards');
    expect(resolved?.chrome.desktopHead).toBe(true);
    const backHref = resolved?.chrome.backHref;
    expect(typeof backHref === 'function' ? backHref({ leagueId: 'lg-1' }) : backHref).toBe(
      '/league-matches/lg-1',
    );
  });
});
