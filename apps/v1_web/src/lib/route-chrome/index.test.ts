// apps/v1_web/src/lib/route-chrome/index.test.ts
// U02 시점 테스트: 매처 자체의 순수 로직(세그먼트 수 불일치 시 무매치, literal 특이성으로
// 우선순위 정렬)을 로컬 목 테이블로 검증한다(아래 첫 세 describe).
//
// U39(Wave-1 통합 확인) 시점 추가: 배치 3(U25~U38)이 14개 fragment를 전부 채운 뒤,
// 진짜 ROUTE_CHROME_TABLE(index.ts)을 대상으로 한 골든 샘플을 마지막 describe에 더했다
// (app-motion-wave-plan.md §2.39 지시 2, app-shell-promotion.md §3.5 원안 참조) — 14개
// 병렬 유닛이 서로 다른 세그먼트를 동시에 채우면서 우연히 서로의 pathname 패턴을
// 오매칭하는 회귀(예: 한 유닛이 :id 대신 다른 파라미터 이름을 써서 특이성 정렬이 예상과
// 다르게 동작하는 경우, 또는 두 유닛이 같은 literal 세그먼트를 서로 다른 title로 등록하는
// 경우)를 잡는다.

import { describe, expect, it } from 'vitest';
import { matchPattern, literalSegmentCount } from './matcher';
import { resolveRouteChrome, ROUTE_CHROME_TABLE } from './index';
import type { RouteChromeEntry } from './types';

describe('matchPattern — 순수 로직', () => {
  it('literal 세그먼트가 일치하면 빈 params를 반환한다', () => {
    expect(matchPattern('/home', '/home')).toEqual({});
  });

  it('literal 세그먼트가 다르면 null', () => {
    expect(matchPattern('/home', '/away')).toBeNull();
  });

  it('세그먼트 수가 다르면 동적 세그먼트 유무와 무관하게 null — 오매칭 방지', () => {
    // /tournaments(1세그먼트)가 /tournaments/campaigns/summer-cup(3세그먼트)을 삼키지 않는다.
    expect(matchPattern('/tournaments', '/tournaments/campaigns/summer-cup')).toBeNull();
  });

  it('동적 세그먼트(:id)는 params로 추출되고 URI 디코딩된다', () => {
    expect(matchPattern('/tournaments/:id', '/tournaments/t-1')).toEqual({ id: 't-1' });
    expect(matchPattern('/matches/:id/applications', '/matches/m%201/applications')).toEqual({
      id: 'm 1',
    });
  });
});

describe('literalSegmentCount', () => {
  it('동적 세그먼트는 세지 않는다', () => {
    expect(literalSegmentCount('/tournaments/:id/awards')).toBe(2);
    expect(literalSegmentCount('/home')).toBe(1);
  });
});

describe('resolveRouteChrome — 특이성 정렬(로컬 목 테이블)', () => {
  // 실제 resolveRouteChrome은 ROUTE_CHROME_TABLE(현재 전부 빈 배열)을 참조하므로,
  // 정렬 규칙만 여기서 matchPattern/literalSegmentCount를 그대로 재현해 검증한다 —
  // resolveRouteChrome 자체의 통합 동작(진짜 테이블 기반)은 U39 골든 샘플이 담당한다.
  function resolveAgainst(
    table: RouteChromeEntry[],
    pathname: string,
  ): RouteChromeEntry | null {
    const candidates = table
      .map((entry) => ({ entry, params: matchPattern(entry.pattern, pathname) }))
      .filter((c): c is { entry: RouteChromeEntry; params: NonNullable<typeof c.params> } =>
        c.params !== null,
      )
      .sort(
        (x, y) => literalSegmentCount(y.entry.pattern) - literalSegmentCount(x.entry.pattern),
      );
    return candidates[0]?.entry ?? null;
  }

  it('더 구체적인(literal이 많은) 엔트리가 우연히 겹쳐도 이긴다', () => {
    const table: RouteChromeEntry[] = [
      { pattern: '/tournaments/:id', chrome: { title: '대회 상세' } },
      { pattern: '/tournaments/:id/awards', chrome: { title: '시상·리뷰' } },
    ];
    // /tournaments/:id/awards 는 세그먼트 수가 3이라 /tournaments/:id(2세그먼트)와는
    // 애초에 세그먼트 수 자체가 달라 매치 경쟁이 없다 — 정상적으로 awards만 매치된다.
    expect(resolveAgainst(table, '/tournaments/t-1/awards')?.chrome.title).toBe('시상·리뷰');
    expect(resolveAgainst(table, '/tournaments/t-1')?.chrome.title).toBe('대회 상세');
  });

  it('테이블에 없는 라우트는 null', () => {
    const table: RouteChromeEntry[] = [{ pattern: '/home', chrome: { title: 'teameet' } }];
    expect(resolveAgainst(table, '/admin/users')).toBeNull();
  });
});

describe('ROUTE_CHROME_TABLE — 골든 샘플(전 세그먼트 통합, U39)', () => {
  // 14개 fragment 각각 대표 라우트 1~2개씩 — 이 fragment가 사라지거나(barrel import 누락)
  // 다른 fragment의 항목으로 조용히 치환되는 회귀를 잡는다.
  it.each<[string, string, string]>([
    ['home', '/home', 'teameet'],
    ['misc', '/events', '이벤트'],
    ['misc', '/notices', '공지사항'],
    ['matches', '/matches', '매치'],
    ['team-matches', '/team-matches', '매치'],
    ['teams', '/teams', '팀'],
    ['team-schedules', '/teams/t-1/schedules', '팀 일정'],
    ['team-schedules', '/my/schedule', '내 일정'],
    ['league-matches', '/league-matches', '정규 리그'],
    ['tournaments-core', '/tournaments', '대회'],
    ['tournaments-core', '/tournaments/t-1/awards', '시상·리뷰'],
    ['tournaments-extra', '/tournaments/t-1/apply', '참가 신청'],
    ['tournaments-extra', '/tournaments/t-1/reviews', '참가팀 후기'],
    ['community', '/chat', '채팅'],
    ['community', '/notifications', '알림'],
    ['reviews', '/my/reviews', '리뷰'],
    ['my-home', '/my', '마이페이지'],
    ['my-settings', '/my/settings/theme', '화면 테마'],
    ['my-secondary', '/my/inquiries', '문의'],
    ['my-secondary', '/my/phone-verify', '휴대폰 본인인증'],
  ])('[%s] %s → title=%s', (_fragment, pathname, expectedTitle) => {
    expect(resolveRouteChrome(pathname)?.chrome.title).toBe(expectedTitle);
  });

  it('패턴 충돌 쌍: /teams/:id vs /teams/new — 정적이 동적을 이긴다', () => {
    // 둘 다 /teams/new에 매치되지만(teams 유닛이 :id를 dynamic으로 등록했으므로
    // matchPattern('/teams/:id', '/teams/new')도 params={id:'new'}로 성공한다) literal
    // 세그먼트가 더 많은 '/teams/new'가 특이성 정렬에서 이겨야 한다.
    expect(resolveRouteChrome('/teams/new')?.chrome.title).toBe('팀 만들기');
    expect(resolveRouteChrome('/teams/t-1')?.chrome.title).toBe('팀 상세');
  });

  it('패턴 충돌 쌍: /my vs /my/inquiries — 세그먼트 수가 달라 겹치지 않는다', () => {
    // my-home(U36)이 등록한 '/my'(1세그먼트)가 my-secondary(U38)가 등록한
    // '/my/inquiries'(2세그먼트)를 삼키면 안 된다.
    expect(resolveRouteChrome('/my')?.chrome.title).toBe('마이페이지');
    expect(resolveRouteChrome('/my/inquiries')?.chrome.title).toBe('문의');
  });

  it('패턴 충돌 쌍: /tournaments vs /tournaments/campaigns/:slug — 세그먼트 수가 달라 겹치지 않는다', () => {
    // ShellOverride.backHref(shell-override.ts) 추가로 '/tournaments/campaigns/:slug'도
    // 테이블에 등록됐다(fragments/tournaments-core.ts 하단). '/tournaments'(1세그먼트)가
    // 이 3세그먼트 경로를 잘못 삼키면 안 된다 — 삼키면 캠페인 페이지가 '대회' 제목의
    // 잘못된(그리고 :slug params가 빠진) chrome을 받는다.
    expect(resolveRouteChrome('/tournaments')?.chrome.title).toBe('대회');
    const campaign = resolveRouteChrome('/tournaments/campaigns/summer-cup');
    expect(campaign?.chrome.title).toBe('대회 캠페인');
    expect(campaign?.params).toEqual({ slug: 'summer-cup' });
  });

  it('패턴 충돌 쌍: /my/schedule(U30) vs /my/settings류(U37) — 서로 다른 title로 겹치지 않는다', () => {
    expect(resolveRouteChrome('/my/schedule')?.chrome.title).toBe('내 일정');
    expect(resolveRouteChrome('/my/settings')?.chrome.title).toBe('설정');
    expect(resolveRouteChrome('/my/settings/theme')?.chrome.title).toBe('화면 테마');
  });

  it('테이블에 완전한 중복 pattern이 없다 — 두 유닛이 같은 라우트를 실수로 동시에 등록하는 것 방지', () => {
    const patterns = ROUTE_CHROME_TABLE.map((e) => e.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
