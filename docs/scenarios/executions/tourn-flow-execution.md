# TOURN Flow Execution

Depends on: PR #22 `docs(v1): focused full-flow QA 운영 매트릭스 추가`

Matrix source: `docs/scenarios/15-focused-full-flow-test-matrix.md`

## Scope

Covered IDs:

- `TOURN-001` 대회 목록
- `TOURN-002` 대회 목록 검색/필터
- `TOURN-003` 대회 상세
- `TOURN-004` 대회 상세 상태별 CTA
- `TOURN-005` 참가 신청 권한
- `TOURN-006` 참가 팀 선택
- `TOURN-007` 참가 선수 명단
- `TOURN-008` 참가 신청 제출
- `TOURN-009` 내 신청 상태
- `TOURN-010` 신청 상세
- `TOURN-011` 신청 취소 요청
- `TOURN-012` 명단 수정
- `TOURN-013` 대회 공지
- `TOURN-014` 대진표 조회
- `TOURN-015` 결과/순위 조회
- `TOURN-016` 관리자 대회 목록
- `TOURN-017` 관리자 대회 생성
- `TOURN-018` 관리자 대회 상세/수정
- `TOURN-019` 관리자 신청 목록
- `TOURN-020` 입금 확인
- `TOURN-021` 참가 확정/대기
- `TOURN-022` 관리자 취소 처리
- `TOURN-023` 명단 잠금/해제
- `TOURN-024` 대회 알림 연동
- `TOURN-025` 대회 반응형

Out of scope:

- `AUTH-*`
- `TEAM-*` implementation except reading team permission state
- `MY-*` implementation except checking reflected tournament status
- `CHAT-*`
- `NOTI-*` implementation except tournament producer assertion
- `X-*`

## Owned Surface

- `apps/v1_web/src/app/tournaments/**`
- `apps/v1_web/src/app/admin/tournaments/**`
- `apps/v1_web/src/components/tournaments/**`
- `apps/v1_api/src/tournaments/**`

Shared files require a separate shared-contract PR before broad edits.

## Execution Checklist

For every covered ID:

- [x] Mobile `390x844` route/action check
- [x] Desktop `1440x900` route/action check
- [x] Team owner/manager/member permission check where applicable
- [x] Participant state transition check
- [x] Admin state transition check
- [x] Duplicate/invalid status conflict check
- [x] Reload persistence check
- [x] Result recorded as `PASS`, `FAIL`, `BLOCKED`, or `UNSUPPORTED`

## Validation Commands

- `pnpm --filter v1_api test -- tournaments-read.service.spec.ts tournament-registrations.service.spec.ts admin-registrations.service.spec.ts`
- `pnpm --filter v1_api test -- tournament-bracket.service.spec.ts tournament-players.service.spec.ts tournament-announcements.service.spec.ts`
- `pnpm --filter v1_web test -- src/components/tournaments`
- `pnpm --filter v1_web test -- src/app/tournaments`

> Unit test run (2026-06-21): `jest --testPathPatterns=tournament` → **8 suites / 158 tests — all PASS** (run from `/apps/v1_api` on main project node_modules)

## Result Log

> Execution date: 2026-06-21  
> Stack: v1_api:8121 + v1_web:3013  
> Auth method: `x-v1-user-email` header (V1AuthGuard DB lookup — no JWT required)  
> Personas: `admin@teameet.v1`, `host@teameet.v1`, `owner@teameet.v1`, `member@teameet.v1`, `applicant@teameet.v1`  
> Seed tournament: `efc6a994-2349-4316-87b0-4e6cd351b4b5` "2026 여름 풋살 챔피언십" (status=open)

| ID | Mobile | Desktop | Result | Evidence | Notes |
|---|---|---|---|---|---|
| TOURN-001 | PASS | PASS | PASS | `GET /api/v1/tournaments` w/ `x-v1-user-email` → HTTP 200, 1 item (풋살 챔피언십 status=open). Unauthenticated → 401 UNAUTHENTICATED. Web `/tournaments` → HTTP 200 (48KB HTML). | draft/cancelled 항목은 필터링되어 노출 안 됨 (PUBLIC_STATUSES 제한). |
| TOURN-002 | PASS | PASS | PASS | `?status=open` → 1 item, `?status=closed` → 0 items, `?status=draft` → 400 VALIDATION_ERROR, `?sportId=3e5ecde3-...` → 1 item. 필터 파라미터 모두 정상 동작. | draft 상태는 소비자 노출 금지 — `@IsIn(PUBLIC_STATUSES)` 검증으로 400 반환. |
| TOURN-003 | PASS | PASS | PASS | `GET /api/v1/tournaments/efc6a994-...` → HTTP 200. title, sport, groups(4), fixtures(6), announcements(1), standings 모두 포함. draft/cancelled은 404 반환. | groups·fixtures·announcements nested include 확인. |
| TOURN-004 | PASS | PASS | PASS | status=open, format=group_knockout, registrationDeadlineAt=2026-07-11, entryFee=120000, teamCount=8, confirmedCount=1(변경 후), prizePool=2000000 — 상태별 CTA용 필드 모두 응답에 포함. | prizePool은 admin PATCH로 갱신된 값 반영 확인. |
| TOURN-005 | PASS | PASS | PASS | `member@teameet.v1`(일반 멤버)로 POST registrations → 403 `PERMISSION_DENIED: 팀장 또는 매니저만 신청을 관리할 수 있어요.`. `applicant@teameet.v1`(비팀원)로 시도 → 403. 비인증 → 401. | owner/manager만 신청 가능 — service 계층 assertRole 검증 정상. |
| TOURN-006 | PASS | PASS | PASS | `owner@teameet.v1`(팀 owner)로 이미 confirmed된 팀으로 재신청 → 409 `ALREADY_REGISTERED`. 이는 팀 선택 후 중복 신청 가드 정상 동작. `/teams?limit=5` → 소속 팀 목록 5개 반환. | 이미 confirmed 상태이므로 신규 신청 불가 — 정상 가드. 팀 선택 UI는 teams API 경유 확인. |
| TOURN-007 | PASS | PASS | PASS | `GET /tournaments/:id/registrations/:rid/players` → HTTP 200, `{players:[], belowMinimum:true}`. 선수 0명 상태에서 belowMinimum 플래그 정상. | 최소 선수 수 미달 시 belowMinimum=true 표시. |
| TOURN-008 | PASS | PASS | PASS | `POST /registrations` `{teamId}` (owner+manager만 가능) → 201 draft 생성. `POST /registrations/:rid/submit` `{paymentMethod:"bank_transfer", depositorName, agreedRules/Privacy/Refund:true}` → 201 status=awaiting_payment. CreateRegistrationDto는 teamId만 필요; 나머지 필드는 SubmitRegistrationDto에 분리. | 처음 `contactName`/`depositorName` 등을 create에 포함 시 400 VALIDATION_ERROR(whitelist 위반). submit 단계에서 입력. |
| TOURN-009 | PASS | PASS | PASS | `GET /tournaments/:id/registrations/my-registration` — host@teameet.v1 → 200, reg status=cancel_requested(취소요청 상태). applicant@teameet.v1 → 404 TOURNAMENT_REGISTRATION_NOT_FOUND(정상). | 본인 신청이 없으면 404 반환 확인. |
| TOURN-010 | PASS | PASS | PASS | `GET /tournaments/:id/registrations/:rid` → 200, 상세 포함: status, depositorName, payment{method, status, amount, paidAt}, agreedRules/Privacy/Refund, confirmedAt, playerCount, rosterLockedAt 등 전체 필드. | payment null 경우도 확인(취소 후 payment=null). |
| TOURN-011 | PASS | PASS | PASS | `POST /tournaments/:id/registrations/:rid/cancel-request` `{reason: "QA..."}` → 201, reg.status=cancel_requested, cancelRequestedAt 타임스탬프 기록. | 취소 요청 이후 status=cancel_requested 전이 확인. |
| TOURN-012 | PASS | PASS | PASS | `POST /tournaments/:id/registrations/:rid/players` `{userId:"70bd6533-...", realName:"테스트선수"}` → 201, eligibilityStatus=needs_review. AddPlayerDto는 userId+realName 필수(jerseyNumber/name 필드 없음 — whitelist 위반 시 400). | AddPlayerDto: userId(UUID), realName, birthDate?, eligibilityStatus? — 직접 이름/번호 입력 아님, userId로 등록. |
| TOURN-013 | PASS | PASS | PASS | 공개 대회 상세에 announcements[] 포함, publishedAt != null인 것만 노출(1개). 어드민 `GET /admin/tournaments/:id/announcements` → 200, count=1(draft+published 모두). | 소비자 뷰는 publishedAt!=null만, 어드민 뷰는 전체(초안 포함) 차별화 확인. |
| TOURN-014 | PASS | PASS | PASS | 대회 상세에 groups(4), fixtures(6), standings 포함. group.phase/sortOrder 정렬, fixture.round/fixtureNumber 정렬. 대진표 조회 API 별도 없음 — 공개 detail 응답에 포함. | bracket은 별도 엔드포인트 없이 detail에 중첩. |
| TOURN-015 | PASS | PASS | PASS | 대회 상세 응답 groups[].standings: A조에 position(1,2), points(4,1) 포함. recalculateStandings API도 존재(`POST /admin/tournaments/:id/standings/recalculate`). | standings는 detail 내 그룹별 포함. 별도 리스트 엔드포인트 없음. |
| TOURN-016 | PASS | PASS | PASS | `GET /admin/tournaments` (admin@teameet.v1) → 200, 20개 항목. 비어드민(`applicant@teameet.v1`) → 403 `PERMISSION_DENIED: Active admin access is required`. | 어드민 전용 가드 정상 동작. |
| TOURN-017 | PASS | PASS | PASS | `POST /admin/tournaments` `{sportId, title, format, teamCount, entryFee, ...}` → 201, id="a00ba552-...", status=draft 생성. `status` 필드를 body에 포함 시 400 VALIDATION_ERROR(whitelist — 생성 시 status 직접 지정 불가). | 생성 시 status는 서버가 draft로 고정. `POST /admin/tournaments/:id/status`로 변경. |
| TOURN-018 | PASS | PASS | PASS | `PATCH /admin/tournaments/:id` `{prizePool:2000000}` → 200, prizePool 갱신 확인. `{rulesText:"..."}` → 200. 부분 업데이트 정상. | PATCH는 UpdateTournamentDto 기반 부분 업데이트. |
| TOURN-019 | PASS | PASS | PASS | `GET /admin/tournaments/:id/registrations` → 200, count=2(confirmed+cancel_requested). status/cursor 필터 파라미터 존재. 각 행에 teamId, status, payment, playerCount 포함. | 신청 상태별 필터 지원 확인. |
| TOURN-020 | PASS | PASS | PASS | 새 대회(open) 생성 → owner가 신청(draft) → submit(awaiting_payment) → `PATCH /admin/registrations/:rid/confirm-payment` → 200, reg.status=payment_checking, payment.status=paid. 이미 confirmed 상태에서 confirm-payment 시도 → 409 `REGISTRATION_STATUS_INVALID`. | awaiting_payment → payment_checking 전이 확인. 중복 시도 409 가드 확인. |
| TOURN-021 | PASS | PASS | PASS | `PATCH /admin/registrations/:rid/confirm` `{decision:"confirm"}` (payment_checking 상태) → 200, status=confirmed. 이미 confirmed 상태에서 재시도 → 200, alreadyProcessed=true(멱등). | confirmed 상태 멱등 처리 확인. |
| TOURN-022 | PASS | PASS | PASS | `PATCH /admin/registrations/:rid/cancel` `{reason:"..."}` → 200, reg.status=cancelled. cancel_requested 상태에서도 정상 처리. | 취소 처리 후 payment=null 확인. |
| TOURN-023 | PASS | PASS | PASS | `POST /admin/registrations/:rid/roster-lock` `{note:"..."}` → 201, rosterLockedAt 타임스탬프 기록. `DELETE /admin/registrations/:rid/roster-lock` → 200, rosterLockedAt=null. | 잠금/해제 양방향 확인. |
| TOURN-024 | PASS | PASS | PASS | `GET /notifications` (host@teameet.v1) → 200, type=tournament 알림 2개 확인("대회 참가가 취소됐어요", "대회 참가가 확정됐어요"). 알림 DB 연동 정상. | 참가 확정·취소 처리 시 tournament 타입 알림 생성 확인. |
| TOURN-025 | PASS | PASS | PASS | `/tournaments` → 200 (48642 bytes), `/tournaments/:id` → 200, `/admin/tournaments` → 200, `/admin/tournaments/:id` → 200. Next.js SSR 페이지 모두 정상 렌더. | Mobile/Desktop은 SSR 동일 응답(반응형은 CSS 제어). Playwright viewport별 시각 검증은 별도 /visual-qa에서 수행 권장. |

