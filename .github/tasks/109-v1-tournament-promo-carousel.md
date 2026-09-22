# Task 109 — V1 tournament promo carousel

## Scope

- Target: frontend
- Runtime: `apps/v1_web`
- Routes: `/home`, `/tournaments`

## Request

- 홈에서는 `promoHomePriority`가 작은 대회를 먼저 배치하며 `0`을 최상위로 취급하고, 활성 홍보 대회를 모두 노출한다.
- 대회 전체 조회에서는 `promoListPriority`가 작은 대회를 먼저 배치하며 `0`을 최상위로 취급하고, 모든 활성 홍보 대회를 카드뉴스형 캐러셀로 탐색할 수 있게 한다.

## Owned files

- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/lib/tournament-promo.ts`
- `apps/v1_web/src/components/home/tournament-hero-card.tsx`
- `apps/v1_web/src/components/home/home-page.tsx`
- `apps/v1_web/src/components/tournaments/tournament-promo-carousel.tsx`
- `apps/v1_web/src/app/tournaments/page.tsx`
- 관련 frontend CSS/tests

## Acceptance criteria

- [x] 홈 홍보 활성화된 모집 중 대회가 `0`을 최상위로 하는 우선순위 오름차순으로 모두 보인다.
- [x] 대회 목록 홍보 활성화된 모집 중 대회가 `0`을 최상위로 하는 우선순위 오름차순으로 모두 캐러셀에 보인다.
- [x] 같은 우선순위는 먼저 생성된 시각, ID 순으로 결정적으로 정렬된다.
- [x] 첫 API 페이지만 보지 않고 cursor pagination을 끝까지 조회한다.
- [x] 캐러셀은 기존 컴팩트 배너 구성을 유지하고 한 번에 온전한 카드 하나, 터치 스와이프, 키보드 포커스, 이미지 중앙 하단 위치 점을 제공하며 모바일과 데스크톱 웹에서 5초마다 자동 순환한다.
- [x] API 실패를 빈 목록처럼 숨기지 않고 재시도 UI를 제공한다.
- [ ] mobile/tablet/desktop에서 overflow, 카드 폭, 목록 위계를 확인한다.

## Progress snapshot

- Current (2026-07-14): 홍보 우선순위 계약을 `0` 최상위 오름차순으로 정정하고 홈/목록 회귀 테스트를 동기화했다.
- Passed: focused tests 6/6, TypeScript (`tsc --noEmit`)
- Full web test: 관련 테스트 포함 93/94 통과. 범위 밖 `src/app/admin/popups/page.test.tsx` 1건이 `공개 상태` 라벨을 찾지 못해 실패했다.
- Visual QA: 정렬 비교식과 테스트 데이터만 변경했으며 레이아웃 변경은 없다.

## Ambiguity log

- “전부”는 현재 응답 페이지 안의 전부가 아니라 공개 cursor pagination 전체를 의미한다.
- 종목 필터가 선택되면 대회 목록 캐러셀도 해당 종목의 활성 홍보 대회만 보여준다.

## 2026-09-21 모바일 제목 괄호 핫픽스

- dev와 별도 main 기준 패치. 목록과 홍보 제목의 괄호 묶음을 모바일에서 넘칠 때만 다음 줄로 이동. 긴 괄호 내용의 내부 줄바꿈과 제목 원문 보존.
- 검증 진행 중. dev 전체 승격 없음.
- 검증: 관련 Vitest 19/19, `tsc --noEmit --incremental false` 통과.
- headed Chromium + 실제 Next `/tournaments` + 운영 공개 API: 390/768/1440/320px 모두 제목 가로 넘침 없음. 390px 괄호 전체 다음 줄, 768/1440px 기존 inline 유지.
- 제목 fixture를 실제 페이지 API 응답에만 주입: 짧은 `컵(초급)` 한 줄, 긴 대회명 뒤 괄호 다음 줄, 폭보다 긴 괄호 내부 4줄, 전각 괄호 모두 통과. 운영 데이터 쓰기 없음.
- before: 운영 `47e71a07b`, after: 같은 main 기준 로컬 Next + 운영 읽기 API. 이미지: `docs/screenshots/tournament-title-parentheses/`.
- 콘솔 pageerror/HTTP 4xx·5xx 관찰 없음. 임시 서버·브라우저는 본 세션 PID만 종료.

## 2026-09-22 대회 카드 상태·참가비 배치 핫픽스

- 사용자 스크린샷 확인 후 dev/main 반영 요청. dev PR #1244 머지 완료; main에는 본 UI 수정만 별도 적용.
- 모집 중 예약률 80% 이상은 상단 `거의 마감`, 정원 충족 또는 closed는 `모집 마감`. 진행·종료·취소 상태는 유지.
- 기존 정원 막대 하나 유지. 하단은 좌측 참가비/금액, 우측 예약·확정 수/입금대기 두 그룹. 대기 0이면 두 번째 안내 생략.
- 직접 코드 리뷰 완료. Vitest 18/18 및 TypeScript 통과.
- headed Chromium 실제 Next 페이지 320/390/768/1440px: overflow·겹침 없음, 막대 1개, 상태별 배지·대기 안내 통과, 콘솔/HTTP 오류 0.
- 공개 제목 스냅샷에 명시적 상태 fixture와 로컬 예시 사진을 사용. 운영 데이터 변경 없음. before/after: `docs/screenshots/tournament-card-footer/`.
- 임시 브라우저 종료 완료. main CI·머지·배포 후 라이브 검증 예정.

## 2026-09-22 예약 수 표기 후속 핫픽스

- 사용자 요청으로 합산형 `16/20팀 예약`을 명시형 `11 + 5 / 20 팀 예약`으로 되돌린다.
- `팀 예약` 앞에 공백 하나를 보장하며, 하단 `입금대기 N팀` 안내와 상단 마감 상태 계산은 유지한다.
- 대기가 없는 `8/20팀 확정`, 무료 대회의 `확인대기` 계약은 변경하지 않는다.
- `제2회 팀밋 풋살컵(비선출 남성부)`처럼 제목이 긴 경우 괄호 묶음을 모바일에서만 보호하던 media query를 제거하고, 데스크톱에서도 카드 폭을 넘으면 괄호 전체가 다음 줄로 내려가게 한다.
- main 별도 구현 검증: 관련 Vitest 28/28, `tsc --noEmit --incremental false` 통과.
- headed Chrome의 실제 `/tournaments` + API fixture: 390px에서 괄호 묶음이 전체로 다음 줄, 1440px에서 공간이 있어 한 줄에 전체 표시. 두 폭 모두 `11 + 5 / 20 팀 예약`, qualifier overflow/clipping 0, console error 0, failed request 0.
- QA 종료 후 본 세션이 시작한 Next 3022 서버와 전용 Chrome 9224 세션을 종료했다.
