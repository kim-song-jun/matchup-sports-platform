# Task 109 — V1 tournament promo carousel

## Scope

- Target: frontend
- Runtime: `apps/v1_web`
- Routes: `/home`, `/tournaments`

## Request

- 홈에서는 `promoHomePriority`가 높은 대회를 먼저 배치하되 활성 홍보 대회를 모두 노출한다.
- 대회 전체 조회에서는 `promoListPriority`가 높은 대회를 먼저 배치하고, 모든 활성 홍보 대회를 카드뉴스형 캐러셀로 탐색할 수 있게 한다.

## Owned files

- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/lib/tournament-promo.ts`
- `apps/v1_web/src/components/home/tournament-hero-card.tsx`
- `apps/v1_web/src/components/home/home-page.tsx`
- `apps/v1_web/src/components/tournaments/tournament-promo-carousel.tsx`
- `apps/v1_web/src/app/tournaments/page.tsx`
- 관련 frontend CSS/tests

## Acceptance criteria

- [x] 홈 홍보 활성화된 모집 중 대회가 우선순위 내림차순으로 모두 보인다.
- [x] 대회 목록 홍보 활성화된 모집 중 대회가 우선순위 내림차순으로 모두 캐러셀에 보인다.
- [x] 같은 우선순위는 먼저 생성된 시각, ID 순으로 결정적으로 정렬된다.
- [x] 첫 API 페이지만 보지 않고 cursor pagination을 끝까지 조회한다.
- [x] 캐러셀은 기존 컴팩트 배너 구성을 유지하고 한 번에 온전한 카드 하나, 터치 스와이프, 키보드 포커스, 이미지 중앙 하단 위치 점을 제공하며 모바일과 데스크톱 웹에서 5초마다 자동 순환한다.
- [x] API 실패를 빈 목록처럼 숨기지 않고 재시도 UI를 제공한다.
- [ ] mobile/tablet/desktop에서 overflow, 카드 폭, 목록 위계를 확인한다.

## Progress snapshot

- Current: implementation and non-browser validation complete
- Passed: focused tests 10/10, full web tests 88/88, TypeScript, pattern check
- Blocked: build and Playwright visual/console/network because the local runtime only has Node 18.19.1; Next.js requires >=20.9 and this repository requires Node >=22

## Ambiguity log

- “전부”는 현재 응답 페이지 안의 전부가 아니라 공개 cursor pagination 전체를 의미한다.
- 종목 필터가 선택되면 대회 목록 캐러셀도 해당 종목의 활성 홍보 대회만 보여준다.
