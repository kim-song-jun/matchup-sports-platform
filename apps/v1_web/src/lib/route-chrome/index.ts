// apps/v1_web/src/lib/route-chrome/index.ts
// 14개 fragment를 합쳐 ROUTE_CHROME_TABLE을 만들고 resolveRouteChrome을 노출하는 barrel.
// U02 이후 이 파일은 다시 편집되지 않는다(docs/design/app-motion-wave-plan.md §1) —
// 각 세그먼트 유닛(U25~U38)은 자기 몫의 fragments/<name>.ts만 채운다.
//
// resolveRouteChrome을 matcher.ts가 아니라 여기 두는 이유: matcher.ts가 ROUTE_CHROME_TABLE을
// import하면 index.ts → matcher.ts → index.ts 순환이 생긴다(설계 문서 §1.4를 U02 지시에 따라
// 이 형태로 조정 — app-motion-wave-plan.md §2.2 지시 4).
//
// `grep -rl '<AppChrome' apps/v1_web/src`로 전수 확인한 결과, 이 테이블을 거치지 않고
// 자기 <AppChrome>을 직접 렌더하는 곳은 **2곳뿐이고 둘 다 영구 예외다** — "왜 여기만
// 옛날 방식이지"를 다시 조사하지 않아도 된다:
//   1. `components/v1-ui/app-shell-frame.tsx` — 셸의 유일한 마운트 지점 자체다. 이 파일이
//      바로 이 테이블을 참조해 <AppChrome>을 렌더하는 코드이므로 당연히 예외다
//      (app-shell-promotion.md §1.8).
//   2. `app/not-found.tsx` — 전역 404. pathname이 매치 실패를 뜻하는 라우트라 테이블에
//      등록할 대상 자체가 없다(§1.4의 영구 예외).
//
// (이력) 한때 `app/tournaments/campaigns/[slug]`의 page.tsx·not-found.tsx가 세 번째 예외였다.
// 검색 파라미터(`?from=events&sport=...`) 의존 backHref를 이 테이블이 표현하지 못했기
// 때문인데 — 테이블의 `backHref`는 라우트 파라미터 함수만 받는다(`RouteChromeConfig`,
// ./types.ts) — `ShellOverride`에 backHref 필드가 추가되면서 해소됐다. 지금은 서버 컴포넌트인
// page.tsx가 campaign-chrome-bridge.tsx(클라이언트 경계)를 통해 검색 파라미터 기반 backHref를
// 셸에 주입하고, 검색 파라미터가 없는 not-found.tsx는 테이블의 정적값만 쓴다.

import { literalSegmentCount, matchPattern } from './matcher';
import type { RouteChromeConfig, RouteChromeEntry, RouteParams } from './types';

// 아래 import 목록 자체가 "이 라우트는 어느 fragment인지" 찾는 목차 역할을 한다(설계 문서 §1
// 트레이드오프 완화 방침) — 각 줄에 담당 URL 프리픽스를 주석으로 적는다.
import { HOME_ROUTES } from './fragments/home'; // /home
import { MISC_ROUTES } from './fragments/misc'; // /events, /users, /search, /notices, /not-found
import { MATCHES_ROUTES } from './fragments/matches'; // /matches
import { TEAM_MATCHES_ROUTES } from './fragments/team-matches'; // /team-matches
import { TEAMS_ROUTES } from './fragments/teams'; // /teams
import { TEAM_SCHEDULES_ROUTES } from './fragments/team-schedules'; // /teams/:id/schedule, /my/schedule
import { LEAGUE_MATCHES_ROUTES } from './fragments/league-matches'; // /league-matches
import { TOURNAMENTS_CORE_ROUTES } from './fragments/tournaments-core'; // /tournaments(list/detail/schedule/bracket/results/awards/campaigns)
import { TOURNAMENTS_EXTRA_ROUTES } from './fragments/tournaments-extra'; // /tournaments/:id/apply, /my/tournaments, /matches, /registrations
import { COMMUNITY_ROUTES } from './fragments/community'; // /chat, /notifications
import { REVIEWS_ROUTES } from './fragments/reviews'; // /my/reviews, /tournaments/:id/reviews
import { MY_HOME_ROUTES } from './fragments/my-home'; // /my
import { MY_SETTINGS_ROUTES } from './fragments/my-settings'; // /my/api-clients 등 설정류
import { MY_SECONDARY_ROUTES } from './fragments/my-secondary'; // /my/inquiries, /leagues, /staff-fixtures, /tournament-staff, /team-contacts, /phone-verify

export const ROUTE_CHROME_TABLE: RouteChromeEntry[] = [
  ...HOME_ROUTES,
  ...MISC_ROUTES,
  ...MATCHES_ROUTES,
  ...TEAM_MATCHES_ROUTES,
  ...TEAMS_ROUTES,
  ...TEAM_SCHEDULES_ROUTES,
  ...LEAGUE_MATCHES_ROUTES,
  ...TOURNAMENTS_CORE_ROUTES,
  ...TOURNAMENTS_EXTRA_ROUTES,
  ...COMMUNITY_ROUTES,
  ...REVIEWS_ROUTES,
  ...MY_HOME_ROUTES,
  ...MY_SETTINGS_ROUTES,
  ...MY_SECONDARY_ROUTES,
];

/**
 * 테이블에 없는 pathname은 null을 반환한다 — admin/auth/login 등 원래도 AppChrome이 없던
 * 세그먼트를 위한 별도 제외 목록이 필요 없는 이유(설계 문서 §1.4). 여러 엔트리가 동시에
 * 매치되면 literal 세그먼트가 더 많은(더 구체적인) 쪽이 이긴다.
 */
export function resolveRouteChrome(
  pathname: string,
): { chrome: RouteChromeConfig; params: RouteParams } | null {
  const candidates = ROUTE_CHROME_TABLE
    .map((entry) => ({ entry, params: matchPattern(entry.pattern, pathname) }))
    .filter((c): c is { entry: RouteChromeEntry; params: RouteParams } => c.params !== null)
    .sort((x, y) => literalSegmentCount(y.entry.pattern) - literalSegmentCount(x.entry.pattern));
  const best = candidates[0];
  return best ? { chrome: best.entry.chrome, params: best.params } : null;
}

export type { RouteChromeConfig, RouteChromeEntry, RouteParams } from './types';
