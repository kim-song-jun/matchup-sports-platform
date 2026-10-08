# Task 20261040: 리그 즉시 모집마감 · 참가비 · 대표 이미지 (MD-QA #35 · #36 · #37)

Status: In Progress (2026-10-08 — 기능은 PR #1649·#1650 으로 dev 머지. 종료 리그 참가비 편집 결함 수정(`fix/league-fee-readonly-ended`)과 아래 "남은 일"의 alpha 확인이 남았다)
**Owner**: Planning team → BE-2 → BE-1 → FE-data → FE-A·B·C·D → DOCS
**Created**: 2026-10-07

## Context
정규 리그(`V1Tournament kind=regular_league`)에는 운영자가 쓸 수 있는 세 가지가 비어 있다.

1. **즉시 모집마감(#35)** — 신청 열림의 판정자는 `registrationDeadlineAt` 하나라, 정원이 다 찼거나 일정이 확정돼도 마감 시각이 지나길 기다리는 수밖에 없다.
   `open-registration` 은 과거·현재 시각을 422 로 막아 지금 닫는 길도 없다.
2. **참가비(#36)** — 리그 생성·수정·시즌 시딩 어디에도 참가비·입금 계좌를 넣는 곳이 없어 전 리그가 `entryFee=0` 이다.
   공개 상세는 사실이 아닌 '무료'가 뜰까 봐 리그 참가비를 숨겨 왔고(`showsEntryFee = !isLeagueMirror`), 통합 목록 카드는 오히려 '무료'를 그대로 그린다.
3. **대표 이미지(#37)** — `coverImageUrl` 컬럼은 이미 있으나 저장 경로가 없어 늘 null 이다. 공개 상세·OG·JSON-LD 에도 이미지가 없다.

세 요구는 같은 화면(리그 상세·신청 관리·공개 리그 상세)과 같은 서버 파일을 공유해 한 태스크로 묶는다.
정본: `docs/design/competition-canonical-flow.md`(6절 결정 이력에 이번 결정을 먼저 적는다). 신청 열림 판정자는 마감 하나라는 2026-09-04 확정은 **그대로 유지**한다.

## Goal
운영자가 (1) 모집 중인 리그를 한 번에 마감하고 다시 열 수 있고, (2) 리그 참가비와 입금 계좌를 정하며 미설정과 '무료 확정'이 구분되고, (3) 리그 대표 이미지를 올리고 바꾸고 지울 수 있으며, 공개 화면이 셋을 사실대로 보여 준다. 머지 후 alpha 에서 ego-browser 로 사용자 흐름·3폭 화면을 확인한 것이 완료다.

## Original Conditions (must all be satisfied)
사용자 확정(2026-10-07, 다시 묻지 않는다):
- [x] **#35 D1 B** 리그 상세(어드민)에 공개 설정·보류와 같은 골격의 카드형 컨트롤, 별도 파일 `league-close-registration-control.tsx`.
- [x] **#35 D2 C** `ConfirmModal` + 신청 현황 요약(공유 `ConfirmModal` 에 선택 prop `details` 슬롯 신설) + 사유 선택(최대 200자).
- [x] **#35 D3 C** 공개 리그 상세에 마감 안내 카드 + 다른 리그 링크.
- [x] **#35 D4 B** 신청 관리 화면 재오픈은 3/7/14일 프리셋 칩 + 직접 정하기(기존 `open-registration` 사용).
- [x] **#35 D5 A** 전용 `POST /admin/league-matches/:leagueId/close-registration`(서버가 `registrationDeadlineAt=now`).
- [x] **#35 D6 A** 마감=now 로 덮고 감사 `league_match.close_registration` 에 beforeJson/afterJson.
- [x] **#35 D7 A** 팀 알림 없음.
- [x] **#36 D1 B** 신청 관리 화면 '신청 받기' 위에 참가비·입금 계좌(은행·계좌번호·예금주) 카드, 인라인 입력.
- [x] **#36 D2 C** 공개 리그 상세 순위표 위 '참가 안내' 카드(금액·입금 방법·마감).
- [x] **#36 D3 C** `V1Tournament.entryFeeConfiguredAt`(`entry_fee_configured_at`) nullable 컬럼 — expand-only·idempotent 마이그레이션(null=미설정).
- [x] **#36 D4 B** 미설정 상태에서 신청을 열면 열기 전 확인 모달('무료로 열기' 시 0원 확정 저장 후 열기), 서버 가드는 추가하지 않음.
- [x] **#36 D5 B** 신청이 들어온 뒤에도 변경 허용, 기존 신청은 신청 당시 금액(`payment.amount` 스냅샷) 유지 — 신청 완료·내 신청 화면은 `tournament.entryFee` 대신 `payment.amount`.
- [x] **#36 D6 B** 접수된(활성) 신청이 있을 때만 사유 필수(금액·계좌 변경 모두), 사유는 `logAdminAction.reason`.
- [x] **#36 D7 B** 시즌 승계 시 같은 티어 직전 시즌의 `entryFee`·계좌를 복사하되 `entryFeeConfiguredAt` 은 null → '직전 시즌 설정을 이어받았어요' 배지 + 열기 전 모달이 확인을 유도.
- [x] **#36 D8 A** 전용 `PATCH /admin/league-matches/:leagueId/entry-fee`.
- [x] **#37 D1 A** 리그 상세(어드민)에 독립 '대표 이미지' 카드(`league-cover-image-control.tsx`), 선택 즉시 업로드·저장.
- [x] **#37 D2 B** 공개 리그 상세 제목 옆 56px 정사각 썸네일(`CompetitionThumbnail`, 없으면 종목 그래픽).
- [x] **#37 D3 C** 제거만 가벼운 확인 모달, 교체는 즉시.
- [x] **#37 D4 A** 전용 `PATCH /admin/league-matches/:leagueId/cover-image`.
- [x] **#37 D5 A** 마지막 저장 우선, 감사 `league_match.cover_image_updated` before/after.
- [x] **#37 D6 A** 옛 파일은 지우지 않는다.
- [x] **#37 D7 B** 시즌 승계 시 같은 티어 직전 시즌 `coverImageUrl` 값 복사.
- [x] **#37 D8 A** `/uploads/` 안전 경로만 허용 — 캠페인 DTO 검증기를 공용으로 승격하고 '/uploads/ 만' 옵션, 캠페인·스폰서 기본 동작 불변.
- [x] **#37 D9 A** 이미지가 있으면 OG·JSON-LD(절대 URL) 사용, 없으면 현행.
- [x] **#37 D10 A** draft·active·보류·종료 모두 편집 허용.
- [x] **공개 화면 통합** #35 D3 C 와 #36 D2 C 는 같은 자리이므로 `/league-matches/:leagueId`(`LeagueRegistrationCta` 자리)에 '참가 안내' 카드 **하나**로 합친다. 열림: 금액(설정된 경우)·입금 방법(계좌이체, 계좌번호는 공개 응답에 없고 '신청 후 안내돼요')·마감 시각·신청 버튼 / 닫힘(마감 설정됨·지남·리그 안 끝남·내 팀 신청 없음): '신청이 마감됐어요' + 다른 리그 링크 / 그 외(마감 미설정이고 참가비도 미설정, 끝난 리그): 카드 없음. 이미 신청한 팀은 기존처럼 카드를 숨긴다.
- [x] 대회 상세 `/tournaments/:id` 의 `showsEntryFee = !isLeagueMirror` 를 '설정된(`entryFeeConfiguredAt` 있음) 리그만 표시'로 바꾼다.

## User Scenarios
### Scenario 1: 정원이 찬 리그를 바로 마감한다
As a 플랫폼 운영자, I want to 모집 중인 리그의 신청을 지금 닫고 싶다 so that 마감 시각을 기다리지 않고 대진을 확정한다.

Steps:
1. 리그 상세에서 '신청 마감' 카드의 '지금 마감하기'를 누른다.
2. 모달에서 현재 마감 시각·낸 신청 N팀(확정 a · 대기 b)을 확인하고 필요하면 사유(선택)를 적는다.
3. '지금 마감'을 누른다.

Expected result: 토스트로 마감을 알리고 카드가 '신청 관리에서 다시 열기'로 바뀐다. 공개 리그 상세는 '신청이 마감됐어요' 카드를 보이고 `/tournaments/:id/apply` 는 마감 문구로 막힌다. 이미 낸 신청은 그대로다.

### Scenario 2: 마감 뒤 다시 연다
Steps: 신청 관리 → 3/7/14일 칩 중 하나(또는 직접 정하기) → 미리보기 확인 → '다시 열기'.
Expected result: 마감이 미래로 바뀌어 공개 카드가 '모집 중'으로 돌아온다. 참가비가 미설정이면 열기 전에 '무료로 열려요' 모달이 먼저 뜬다.

### Scenario 3: 유료 리그의 참가비와 계좌를 정한다
Steps: 신청 관리 → '참가비·입금 계좌' 카드에 70,000원·은행·계좌번호·예금주 입력 → 저장 → 신청 열기.
Expected result: 공개 리그 상세 '참가 안내' 카드에 '팀당 70,000원 · 계좌이체 · 신청 후 안내해요'가 보이고(계좌번호 없음), 팀 신청 화면의 입금 안내에는 계좌가 나온다.

### Scenario 4: 신청이 들어온 뒤 금액을 바꾼다
Steps: 3팀이 70,000원으로 신청한 뒤 어드민이 80,000원으로 저장 → 사유 필수 모달에서 사유 입력 → 바꾸기.
Expected result: 기존 3팀의 신청·내 신청 화면은 70,000원, 새 신청 팀은 80,000원. 신청 관리 행에 팀별 금액이 보이고 감사 로그에 사유와 before/after 가 남는다.

### Scenario 5: 대표 이미지를 올리고 바꾸고 지운다
Steps: 리그 상세 '대표 이미지' 카드에서 파일 선택(즉시 반영) → 다른 파일로 교체(확인 없음) → '제거'(확인 모달).
Expected result: 통합 목록 카드와 공개 상세 제목 옆 56px 썸네일이 바뀌고, 제거하면 종목 그래픽으로 돌아온다. 링크 미리보기(OG)·JSON-LD 는 이미지가 있을 때만 쓴다.

### Scenario 6: 새 시즌이 직전 시즌 설정을 이어받는다
Steps: 승강 확정으로 다음 시즌을 만든다 → 신청 관리 확인.
Expected result: 같은 티어의 참가비·계좌·대표 이미지가 복사되고(티어가 서로 바뀌지 않는다) 참가비 카드에 '직전 시즌 설정을 이어받았어요' 배지가 뜬다. 저장해 확인하면 설정됨으로 바뀐다.

## Test Scenarios
### Happy path
- [x] 열린 리그 마감 → 신청 제출 409 `REGISTRATION_DEADLINE_PASSED`, **다른 열린 리그는 계속 신청 가능**, 재오픈 후 다시 가능.
- [x] 참가비 설정 → 어드민·공개 상세 반영, 공개 JSON 에 계좌 sentinel 없음(어드민에는 있음).
- [x] 금액 변경 후 기존 신청 `payment.amount` 불변, 새 신청은 새 금액.
- [x] 대표 이미지 설정·교체·제거가 해당 리그에만 반영(다른 리그 null).
- [x] 승강 확정 후 같은 티어 값 복사, `entryFeeConfiguredAt` null.
### Edge cases
- [x] 이미 닫힌/마감 미설정 리그의 `close-registration` 은 `alreadyProcessed:true`, 쓰기·감사 0. 같은 값의 `entry-fee`·`cover-image` 도 멱등.
- [x] 0원 '무료 확정'은 계좌 없이 저장되고 `entryFeeConfiguredAt` 이 세팅된다. 같은 0원이라도 미설정이면 쓴다.
- [x] 활성 신청이 있어도 값이 그대로인 '확인'(이어받은 설정 확정)은 사유가 필요 없다. 활성 신청 0 이면 금액 변경도 사유 불필요.
- [x] 보류 중 리그도 마감·이미지 변경 가능. 종료 리그는 마감 불가·참가비 변경 불가·이미지 변경 가능. — 서버 기준. 웹 참가비 카드는 #1649 머지본에서 종료 리그에도 입력·저장이 열려 있었다(리뷰 P2, alpha 재현) → `fix/league-fee-readonly-ended` 에서 읽기 전용으로 고침.
- [x] KST 자정 경계에서 프리셋 23:59 계산이 로컬 타임존에 의존하지 않는다.
- [ ] 같은 밀리초 경계: `마감 = now` 는 다음 판정부터 닫힘(응답은 `registrationOpen:false`). — 받아들인 위험으로 남김: 같은 밀리초 제출 1건 통과 가능, 응답 상수만 단위 테스트가 확인.
### Error paths
- [x] 대회 id 로 세 엔드포인트 호출 → 404 `LEAGUE_NOT_FOUND`. support 관리자·비어드민 → 403.
- [x] 유료인데 계좌 누락 → 422 `LEAGUE_PAYMENT_INSTRUCTIONS_REQUIRED`. 활성 신청 + 금액 변경 + 사유 없음 → 422 `LEAGUE_ENTRY_FEE_REASON_REQUIRED` 이고 DB 값 불변.
- [x] 외부 URL·`javascript:`·`..` 경로·빈 문자열·키 누락 → 400. 동시 변경 → 409 `LEAGUE_STATE_CHANGED`.
- [x] 무료로 열기: 0원 저장이 실패하면 열기를 호출하지 않는다. 업로드 실패 시 저장 호출 0.
### Mock data updates needed
- [x] `apps/v1_web/src/test/msw/league-visibility-handlers.ts` 리그 fixture 에 새 필수 필드, `test/msw/fixtures.ts` 대회 fixture 에 `entryFeeConfigured:true`.
- [x] 새 필수 필드로 깨지는 웹 인라인 fixture(어드민·공개 리그 테스트 10여 개, 대회 `V1TournamentListItem`·`V1TournamentDetail` 리터럴)를 소유 단계가 같은 커밋에서 갱신.
- [x] `apps/v1_api/src/league-matches/league-match-admin.service.spec.ts`·`league-competition-mirror.spec.ts`·`league-series-admin.service.spec.ts` 를 새 응답·승계 필드에 맞춰 갱신.
- [x] 스키마 바이트 핀 5곳(`game-schema.fixture.ts`·`Dockerfile.v1-api`·`alpha-manifest-common.sh`·`create-alpha-release-manifest.sh`·`prepare-task168-final-steady-inputs.sh`) 재고정.

## Parallel Work Breakdown
구현 계약(엔드포인트·DTO·오류 코드·응답 필드·파일 소유권·테스트표)의 정본은 구현 단계에 넘기는 계약서이고, 아래는 저장소에 남기는 요약이다. 둘이 어긋나면 `BLOCKED` 로 멈추고 기획 재진입한다.

### API 계약 요약 (모두 `V1AuthGuard` + `adminContext.getMutationAdmin`, `findTournamentOnSurface(tx, LEAGUE_KINDS, …)` 로 리그만 — 대회 id 는 404)
| 엔드포인트 | 본문 | 핵심 규칙 | 감사 액션 |
|---|---|---|---|
| `POST …/:leagueId/close-registration` | `{ reason?: ≤200자 }` | 마감<now 또는 null → `alreadyProcessed`. 아니면 조건부 `updateMany`(읽은 마감값 CAS)로 `registrationDeadlineAt=now`, 실패 409 `LEAGUE_STATE_CHANGED`. 끝난 리그 409 `LEAGUE_REGISTRATION_NOT_ALLOWED`. `open-registration` 은 불변 | `league_match.close_registration` (before/after 마감) |
| `PATCH …/:leagueId/entry-fee` | `{ entryFee:0..1억 정수, bankName?, bankAccount?, bankHolder?, reason?: ≤500자 }` | 유료면 계좌 3필드 필수(422). 값 동일+설정됨 → 멱등. CAS 쓰기 → **쓰기 뒤** 활성 신청 수를 세어 금액·계좌가 바뀌었고 사유 없으면 422 `LEAGUE_ENTRY_FEE_REASON_REQUIRED` + 롤백. `payment.amount` 는 건드리지 않음 | `league_match.entry_fee_updated` (before/after 금액·계좌) |
| `PATCH …/:leagueId/cover-image` | `{ coverImageUrl: string \| null }`(키 필수) | `/uploads/` 안전 경로만(공용 검증기 `localUploadsOnly`), 행 잠금(`FOR UPDATE`) 후 읽어 before 정합, 같은 값 멱등, 상태 제한 없음, 옛 파일 보존 | `league_match.cover_image_updated` (before/after URL) |

응답 확장: 어드민 상세 +`sportCode·coverImageUrl·entryFee·entryFeeConfiguredAt·bankName·bankAccount·bankHolder·activeRegistrationCount`, 공개 상세 +`sportCode·coverImageUrl·entryFee·entryFeeConfigured`(**계좌 없음**), 통합 목록·대회 상세 presenter +`entryFeeConfigured`(리그=설정 여부, 대회=항상 true).
DB: `V1Tournament.entryFeeConfiguredAt DateTime?` 한 줄 + `ADD COLUMN IF NOT EXISTS` 마이그레이션(`20261008100000_v1_league_entry_fee_configured`, 착수 직전 최신 타임스탬프 재확인).

### Backend (순차: BE-2 → BE-1. 서로 파일이 겹치지 않는다)
- [x] **BE-2 (#36 서버 · 마이그레이션 · 공유 읽기면 · 시즌 승계)** — 스키마 한 줄·마이그레이션·스키마 핀 5곳 / 활성 신청 상태 상수 / entry-fee DTO·서비스·컨트롤러 / 어드민·공개 상세 응답 확장(`league-match-admin.service.ts` 의 `detail`·`loadLeague` 만) / presenter `entryFeeConfigured` / `LeagueMirrorSource.inherited` + `commitPromotions` 에서 같은 티어 직전 시즌 값 복사(`entryFeeConfiguredAt` 은 싣지 않음) / spec·통합 spec.
- [x] **BE-1 (#35·#37 서버 · 배선)** — `common/safe-image-url.ts` 승격(기본 동작 불변·`localUploadsOnly`)과 캠페인 DTO 교체 / close-registration·cover-image DTO·서비스(새 파일)·컨트롤러 / `league-match.module.ts` 에 세 서비스·두 컨트롤러 등록(+ `league-match.module.spec.ts` 가 새 컨트롤러가 풀리는지 단언 — #750 방지) / `tournament-raw-sql-baseline.json` 에 cover 서비스 항목 / spec·통합 spec.
### Frontend (FE-data 선행, 이후 A·B·C·D 병렬 — 파일 겹침 없음)
"A·B·C 3안 제시 → 사용자 선택"은 **2026-10-07 완료**(위 Original Conditions 의 D 항목들). 구현 전 목업 조각(`f35`·`f36`·`f37`)을 열어 마크업·문구를 대조한다.
- [x] **FE-data** — `types/league-match.ts`·`types/api.ts` 필드 / 훅 3개(`useV1CloseLeagueRegistration`·`useV1UpdateLeagueEntryFee`·`useV1UpdateLeagueCoverImage`) + 재오픈 훅 포함 공통 무효화 헬퍼 / `ConfirmModal` 선택 prop `details` / MSW fixture.
- [x] **FE-A** — 어드민 리그 상세 카드 2개(`league-close-registration-control.tsx`·`league-cover-image-control.tsx`) + `league-match-fixtures-client.tsx` 마운트(import 2줄·JSX 2줄만, 다른 세션이 편집 중인 파일).
- [x] **FE-B** — 신청 관리: `league-fee-card.tsx`(참가비·계좌, 사유 모달, 이어받음 배지)·열기 전 '무료로 열기' 확인·3/7/14일 칩·진행 순서 표시·`lib/league-registration-setup.ts`.
- [x] **FE-C** — 공개 리그 상세: `league-join-guide-card.tsx`(`LeagueRegistrationCta` 대체·삭제), 제목 옆 `CompetitionThumbnail`, OG·JSON-LD, `CompetitionThumbnail` 주석 정정, 대회 JSON-LD(`buildSportsEventLd`)의 미설정 리그 가격·무료 표기 제거.
- [x] **FE-D** — 대회 쪽: 상세 `showsEntryFee` 게이트(참가비 4자리 전부 — 열림 레일 1곳이 가드 없이 '무료'를 그린다), 목록 카드의 리그 '무료' 누출 제거(푸터 재균형), 메타 설명(`lib/seo.ts`)·JSON-LD 의 미설정 리그 '무료' 제거(JSON-LD 는 FE-C 가 같은 파일에서), 신청 완료·내 신청 금액 원천을 `payment.amount` 로(`lib/tournament-registration-amount.ts`) — 내 신청 허브의 행별 결제 메타 포함.
### Infra
- [x] 스키마 바이트 핀 5곳 재고정(BE-2 에 포함). 새 의존성·환경변수 없음.
### Sequential (병렬 작업 이후에 실행)
- [x] **DOCS** — `docs/api/domains/league-matches.md`·`tournaments.md`, 정본 6절 결정 이력 3행, `.changeset/league-close-fee-cover.md`(v1_api·v1_web patch), 이 문서 Status.
- [x] 통합: 전체 `tsc`(두 앱)·`lint`·소유 테스트, PR(base `dev`, 한국어, 머지 방식은 `--merge`), Copilot 리뷰 clean, CI 통합 spec green.
- [ ] 머지 후 alpha 배포 SHA 확인 → ego-browser 로 Scenario 1~6 + 390/768/1440 갤러리를 같은 PR 에 게시 → 메인 트리 로컬 `dev` `--ff-only` 동기화. — 배포 SHA 확인·로컬 동기화·10단계 갤러리는 했다. Scenario 4·5 일부와 6 은 "남은 일".

## Acceptance Criteria
- [x] Original conditions 전부 충족
- [ ] User scenarios 전부 통과 — alpha 실화면으로 확인한 것은 아래 Verification 의 10단계뿐이다: Scenario 1·2·3 전체, 4 는 사유 모달까지, 5 는 업로드까지. 4 의 신청별 금액 유지, 5 의 교체·제거, 6(시즌 승계)은 통합 스펙만 있고 alpha 미확인.
- [x] Test scenarios 전부 green (서버 통합 spec 은 CI 에서 확인)
- [x] 범위 내 tech debt 해결됨 (새로운 부채 0) — `LeagueRegistrationCta` 삭제, 옛 주석 정정
- [x] Security 리뷰 통과 (아래 노트 참조)
- [x] Mock data 업데이트 완료, schema와 sync (스키마 변경이므로 migration 포함·핀 5곳 재고정)
- [x] 디자인 시스템 준수 (token, component, naming) — 하드코딩 색·`transition-all` 0, 44px, 포커스 링, 해요체
- [x] **UI 항목: 3안 제시→선택 완료(2026-10-07)** — #35 D1~D4 · #36 D1·D2·D4·D5 · #37 D1~D3 의 선택안(B·C·C·B / B·C·B·B / A·B·C)을 목업대로 구현, 구현 전에 목업 조각 대조
- [ ] 머지 후 alpha 에서 ego-browser 로 사용자 흐름·3폭(390/768/1440) before/after·콘솔/네트워크 확인, 목록 카드 푸터 재균형 확인 — 3폭 갤러리 19장은 위 10단계 범위만 담는다. 나머지 흐름은 "남은 일" 참고.
- [ ] Code review: Critical=0, Warning=0 — #1649 리뷰 P2 1건(종료 리그 참가비 편집이 열려 있고 저장하면 409) 미해결 상태로 머지됐다. `fix/league-fee-readonly-ended` 머지·alpha 확인 후 체크한다.

## 남은 일 (2026-10-08 리뷰 정정)
- [ ] 종료 리그 참가비 카드 읽기 전용 — `fix/league-fee-readonly-ended` dev 머지 후 alpha 에서 저장 요청 0회·안내 문구 확인.
- [ ] Scenario 4 신청별 금액 유지(기존 신청 70,000원·새 신청 80,000원) alpha 확인.
- [ ] Scenario 5 대표 이미지 교체·제거 alpha 확인.
- [ ] Scenario 6 시즌 승계(참가비·계좌·이미지 복사, '이어받았어요' 배지) alpha 확인.

## Tech Debt Resolved
- 리그 참가비·대표 이미지 저장 경로가 없어 전 리그가 0원/이미지 null 이던 누락(이관 때 매핑이 필드를 안 옮긴 것 — 의도 아님)을 해소한다.
- 통합 목록 카드가 리그에 '무료'를 새게 그리던 문제와 `showsEntryFee = !isLeagueMirror` 임시 가드를 '설정 여부' 판정으로 바꾼다.
- `useV1OpenLeagueRegistration` 이 어드민 캐시만 무효화해 재오픈 뒤 공개 입구가 낡던 문제를 공통 무효화 헬퍼로 해소한다.
- 대표 이미지 URL 검증이 캠페인 DTO 안에만 있던 것을 공용 모듈로 승격해 규칙 한 벌로 만든다(대회 `UpdateTournamentDto.coverImageUrl` 의 `@IsString` 뿐인 갭은 이번 범위 밖 — 같은 검증기로 닫을 수 있다는 사실만 기록).
- `LeagueRegistrationCta` 와 그 주석, `CompetitionThumbnail` 의 "리그는 이미지가 없다" 서술을 같은 변경에서 지운다.

## Security Notes
- 고려한 위협: ① 비어드민·support 의 변경 ② 대회 id 로 리그 경로 호출·그 반대(#863 계열 누출) ③ 공개 응답으로 계좌번호 노출(저장소·화면이 공개) ④ 대표 이미지 URL 로 외부 추적·XSS·경로 탈출(`javascript:`·`..`·`%22`) ⑤ 금액 변경과 신청 제출의 경합(구금액 청구·사유 누락) ⑥ 동시 변경으로 인한 감사 before 값 불일치 ⑦ 업로드는 로그인 사용자 누구나 가능(기존 계약)이라 저장 엔드포인트가 유일한 어드민 게이트.
- 완화책: 컨트롤러 가드 + 서비스 첫 줄 `getMutationAdmin`(support 거부), 리그 전용 `LEAGUE_KINDS` 조회(대회 어드민 경로는 열지 않음), 공개 응답에는 계좌 필드를 아예 싣지 않고(공개 `loadLeague` 는 select allow-list 라 계좌 컬럼을 select 하지 않는다) 공개 리그·`/tournaments` 응답 JSON 에 계좌 sentinel 이 없음을 세 신분으로 테스트로 고정, 계좌번호·예금주를 `V1ErrorLog` 에 평문 저장하지 않도록 `SENSITIVE_KEYS` 에 `bankAccount`·`bankHolder` 추가, `entryFee` DTO 는 `@Type(Number)` 없이 `""`→0 무료 확정을 막고 계좌 필드는 trim 후 검증, `/uploads/` 안전 세그먼트만 허용하는 공용 검증기(null 만 제거로 허용·빈 문자열 거부, `localUploadsOnly` 는 `.private` 같은 점 시작 세그먼트도 거부), 금액은 CAS 쓰기 뒤에 활성 신청을 세어 제출 트랜잭션의 `FOR UPDATE` 와 직렬화, 커버는 행 잠금 후 읽기, 감사는 모두 같은 트랜잭션. 새 의존성·시크릿·CSRF 면 없음(기존 세션 쿠키·mutation origin 검사).

## Risks & Dependencies
- 외부 블로커: 없음. 서버 통합 spec 은 `DATABASE_URL` 이 있는 CI 에서만 돈다 — 로컬 green 으로 대체하지 않는다.
- 선행 태스크: 보류(#1645)·공개 설정(#1644)의 카드 골격과 `GateConfirmModal`/`ConfirmModal`, 정본 §6(신청 판정자는 마감 하나).
- 위험: ① `league-match-fixtures-client.tsx` 는 다른 세션이 편집 중 → 마운트 4줄만, 머지 충돌 시 그 4줄만 재적용. ② `schema.prisma` 를 다른 세션이 동시에 고치면 핀 해시가 어긋난다 → 마지막에 재계산, 공유 `node_modules` 에 `prisma generate` 금지(격리 생성). ③ 마감=now 같은 밀리초 제출 1건이 통과할 수 있음(수용). ④ 목록 카드에서 가격 블록을 빼면 푸터가 쏠린다 → 스크린샷으로 재균형. ⑤ 공개 '참가 안내' 카드가 마감 지난 모든 진행 중 리그에 남는다(일찍 닫은 것과 기한 만료를 구분하지 않음 — 결정 D3 C 의 대가). ⑥ 서버가 미설정 리그의 신청 열기를 막지 않아 모달이 유일한 안전장치(직접 API 호출은 우회 가능 — 결정 D4 B). ⑦ 금액을 0 으로 내리면 기존 유료 신청자의 입금 계좌 안내(`serialize` 가 현재 `entryFee > 0` 로 판정)가 사라진다 — 계약서 O절 3번으로 해소: 신청별 `payment.amount > 0` 기준으로 판정. ⑧ 전역 ValidationPipe 가 암묵 변환을 켜 두어 `entryFee` DTO 는 `@Transform(({ obj }) => obj.entryFee)` 로 원본을 검증해야 `""`→0 '무료 확정'을 막는다. ⑨ '활성 신청' 에 운영자가 넣은 로스터 팀(`seeded`·`promoted`)이 섞이는 해석 문제 — 계약서 O절 4번으로 해소: 팀이 직접 낸 신청(`applied`·`null`)만 센다. 화면 라벨은 PR #1650 에서 '팀이 직접 낸 신청'으로 밝혔다.
- 이 태스크는 alpha 데이터를 직접 쓰지 않는다(SQL·백필 없음). QA 로 만든 새 리그·대진은 지워지지 않는다(409 `FIXTURE_NOT_DELETABLE`)는 전제로 진행한다.

## Ambiguity Log
빌더가 에스컬레이션할 때마다 아래 표를 업데이트.

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-07 | contract author | 통합 목록에 '모집 중' 필터가 없다 — "다른 모집 리그 링크"의 대상 | 사용자 선택(2026-10-07): '다른 리그 둘러보기' → `/tournaments?kind=league`. 모집 중 필터는 만들지 않는다 |
| 2026-10-07 | contract author | `CoverImageUploader` 는 빈 상태에 대회 예시 사진·240px 미리보기를 그려 스톡 금지·56px 노출과 충돌 | 컴포넌트 대신 입력 계약·`useV1UploadImages`·`CompetitionThumbnail` 재사용(계약서 Q2) |
| 2026-10-07 | contract author | 사유 모달: 목업은 `GateConfirmModal`(사유 항상 필수)이나 D6 B 는 신청이 있을 때만 필수 | `ConfirmModal` + `reasonField`(필수 여부 동적) + `details` 슬롯(Q3) |
| 2026-10-07 | contract author | 끝난 리그의 참가비 수정, 감사 액션명, 활성 신청 상태 집합 | 막는다 409 / `league_match.entry_fee_updated` / `draft`·`cancelled` 제외 7개(Q4·Q5·Q8) |
| 2026-10-07 | contract author | 스폰서 DTO 검증기는 캠페인과 규칙이 달라 통합하면 동작이 바뀐다 | 캠페인만 승격, 스폰서 불변(Q6). 시즌 1 시딩은 직전 시즌이 없어 복사 대상 아님(Q7) |

| 2026-10-08 | alpha QA | 같은 리그인데 신청 관리 목록은 5팀, 마감 확인창은 '낸 신청 2팀' | 세는 대상이 다르다(목록은 운영자가 넣은 팀 포함). 기준은 유지하고 라벨을 '팀이 직접 낸 신청'·'③ 직접 신청 N팀'으로 바꿨다(PR #1650) |

## Verification (2026-10-08)

- PR #1649 dev 머지(`5fb342c76`) → deploy-alpha 성공, 마이그레이션 `20261008100000_v1_league_entry_fee_configured` 적용 로그 확인.
- CI: Gates·API·Web 통과. 통합 스펙 4개(즉시 마감·참가비·대표 이미지·시즌 승계)가 실제 DB 로 마감 후 제출 409, 감사 before/after, 멱등, 공개 응답 계좌 부재(비로그인·무관 사용자·다른 팀장), 승계 복사를 검증.
- alpha 실화면(기존 QA 리그 1개, 사용자 승인 범위): 미설정 확인 모달 → 참가비 70,000원·계좌 저장(신청 2팀이라 사유 모달) → 대표 이미지 업로드 → 7일 프리셋으로 열기 → 공개 '참가 안내' 모집 중 카드·56px 썸네일 → 지금 마감(확인창 '2팀(확정 1·대기 1)') → 공개 '신청이 마감됐어요'·'다른 리그 둘러보기' → 되돌리기. 10단계 PASS, 3폭 갤러리 19장은 PR #1649 코멘트.
- 남은 흔적(되돌릴 수 없음): 그 리그의 참가비가 '0원 확정'으로 남고(미설정으로 못 돌림), 가짜 계좌 값과 업로드 파일이 남으며, 마감 시각이 검증 시각으로 바뀌었다(원래도 지난 마감이라 공개 상태는 같다).
- 범위 밖으로 보고한 기존 동작: 마감된 리그의 `/tournaments/:id/apply` 1단계 '다음' 버튼이 비활성화되지 않는다(서버는 409 로 거부) — 이번 변경 전부터 같다.
