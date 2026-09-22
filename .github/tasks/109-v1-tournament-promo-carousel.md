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

- 사용자 요청: `/tournaments` 제목이 넘칠 때 괄호 설명부터 다음 줄로 이동. dev와 main에 각각 핫픽스.
- 범위: 목록 카드, 목록 홍보 캐러셀의 제목 렌더러 및 CSS. API·원문·배지 위치·데스크톱 서식 변경 없음.
- main과 dev의 카드 구현이 다르므로 각 최신 원격 기준으로 별도 패치한다. dev 전체를 main으로 승격하지 않는다.
- [x] 모바일에서 들어갈 때는 같은 줄, 넘치면 괄호 묶음 이동.
- [x] 긴 괄호 설명은 내부 줄바꿈 허용. 기존 `경기 중`/`모집 중` 묶음 유지.
- [x] 관련 테스트, 타입 검사, 390/768/1440 시각 증거 및 320px 확인.
- [ ] dev/main PR·리뷰·배포 확인.
- Progress snapshot: 구현 완료, 검증 진행 중. 운영 공개 목록에서 `제2회 팀밋 풋살컵(비선출 남성부)` 형태 확인.

- dev 검증: 관련 Vitest 35/35, `tsc --noEmit --incremental false` 통과. headed Chromium + 로컬 Next + alpha 공개 API로 320/390/768/1440px 제목 가로 넘침 없음, pageerror/HTTP 오류 없음.
- dev before 증거는 같은 화면에서 새 qualifier CSS를 inline으로 비활성화하여 기존 줄바꿈을 재현한 비교이다. main before는 실제 운영 화면이며 별도 main 작업 트리에 보관.
- 실제 dev 페이지의 API 응답에 제목 fixture를 주입해 짧은 괄호 한 줄 / 긴 제목 뒤 괄호 전체 다음 줄 / 긴 괄호 내부 줄바꿈 / 전각 괄호를 치수 검사로 통과. 서버 데이터 변경 없음.
- main 로컬 커밋 `04c89fafd` 검증 완료. 자동 승인 검토가 저장소 main 승격 금지 규칙을 근거로 main 브랜치 push·PR 생성을 거부하여 원격 반영은 보류.

## 2026-09-22 카드 상태 배지·하단 레이아웃 후속 PR

### Context / Scope
- 사용자 요청: 제목 옆 모집 중 배지를 거의 마감/모집 마감으로 전환하고, 기존 정원 막대 아래 가격과 예약 정보를 좌우로 분리. PR과 스크린샷까지만 준비하고 머지하지 않는다.
- Frontend only: `tournament-card.tsx`, 전용 CSS module, 관련 tests, changeset, 이 task, 시각 증거.
- 지난 제목 핫픽스는 dev #1241 / main #1242 및 양 환경 배포·실제 페이지 검증까지 완료됐다. 위 보류 기록은 당시 상태이며 현재는 해소됐다.
- 최신 dev `a494cde6a` 기준 격리 작업 트리. Backend/API/전역 status helper/다른 카드 레이아웃은 범위 밖.

### Acceptance criteria
- [x] 예약 수(확정+대기)가 정원의 80% 이상이고 모집 중이면 제목 옆 `거의 마감` 하나만 노출.
- [x] 정원 충족 또는 closed는 `모집 마감`. 진행/종료/취소 상태는 보존.
- [x] 기존 막대 1개 유지. 가격은 왼쪽 라벨+금액, 예약 현황은 오른쪽 합산 수+대기 안내.
- [x] 대기 0팀은 대기 문구 숨김, 무료 대회는 확인대기 유지, 리그는 가짜 정원 없음.
- [x] 320/390/768/1440px before/after 및 겹침·가로 넘침 검증.
- [x] 상태 경계 테스트 31/31, 타입 검사 통과.
- [ ] PR 생성·스크린샷 갤러리 첨부.

### Progress snapshot
- 변경 전 4폭 캡처 완료. 새 상태/요약 텍스트 계약 테스트 RED 확인 후 구현.
- 실제 Next route + 운영 공개 제목 snapshot에 상태별 fixture를 명시적으로 적용하여 검증. 서버 데이터 쓰기 없음. 썸네일은 기존 로컬 샘플 사진으로 고정.
- 보안: API/권한/데이터 저장 변경 없음. PR만 생성하며 이전 main 핫픽스 예외는 이번 변경에 적용하지 않는다.

- RED: 새 계약 12개 중 10개 실패 → GREEN: 기존 포함 31/31 통과. 모집 중 75%/80%/95%/100%, closed, 진행/종료/취소, 유료/무료 대기 안내, 리그 회귀 포함.
- `tsc --noEmit --incremental false` 통과. 헤더 상태와 하단 숫자만 변경하며 API contract 변화 없음.
- 실제 Next `/tournaments` + 상태 fixture 4종(마감 임박/일반 모집/마감/무료), 320/390/768/1440px에서 막대 1개·금액/예약 영역 비겹침·카드 overflow 없음. console/pageerror/HTTP 오류 0.
- 390px 마감 임박 카드: 274px → 258px. 일반 카드: 238px → 258px(좌우 두 줄 구성으로 정렬 통일). 고정 높이는 없으며 극단적인 좁은 폭은 정보 묶음 단위로 wrapping 가능.
- canonical screenshots: `docs/screenshots/tournament-card-footer/`; raw 상태별/폭별 결과: `output/playwright/visual-audit/tournament-card-footer/`.
- PR까지만 요청받았으므로 main 반영·dev 머지·배포는 하지 않는다.

- 검증 종료: 소유 Next PID 57162/57179 및 각 headed browser server를 종료. 생성된 next-env 변경과 의존성 symlink는 제거.

## 2026-09-22 예약 수 표기 후속 핫픽스

- 사용자 요청으로 합산형 `16/20팀 예약`을 명시형 `11 + 5 / 20 팀 예약`으로 되돌린다.
- `팀 예약` 앞에 공백 하나를 보장하며, 하단 `입금대기 N팀` 안내와 상단 마감 상태 계산은 유지한다.
- 대기가 없는 `8/20팀 확정`, 무료 대회의 `확인대기`, 리그 카드의 `팀 참가` 계약은 변경하지 않는다.
- `제2회 팀밋 풋살컵(비선출 남성부)`처럼 제목이 긴 경우 괄호 묶음을 모바일에서만 보호하던 media query를 제거하고, 데스크톱에서도 카드 폭을 넘으면 괄호 전체가 다음 줄로 내려가게 한다.
- 검증: 관련 Vitest 41/41, `tsc --noEmit --incremental false` 통과.
- headed Chrome의 실제 `/tournaments` + API fixture: 390px에서 괄호 묶음이 전체로 다음 줄, 1440px에서 공간이 있어 한 줄에 전체 표시. 두 폭 모두 `11 + 5 / 20 팀 예약`, qualifier overflow/clipping 0, console error 0, failed request 0.
- QA 종료 후 본 세션이 시작한 Next 3022 서버와 전용 Chrome 9223 세션을 종료했다.
