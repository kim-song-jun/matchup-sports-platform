# Task 203: MD-QA #192 JoinKFA 선출 확인 — 판정 근거 기록 · 이전 판정 이어 쓰기 · 본인 신고

Status: Review
**Owner**: Planning team → backend-data-dev / frontend-ui-dev
**Created**: 2026-11-11

## Context

MD-QA #192 은 "선출 여부를 JoinKFA로 확인할 수 있게" 해 달라는 제보다. 조사 결과 JoinKFA(대한축구협회
통합경기정보시스템, https://www.joinkfa.com)는 공식 공개 API·파트너 연동이 없고 `robots.txt` 가
`Disallow: /` 로 전면 차단이다. 등록 이력은 개인정보라 Teameet 이 서버에서 조회·저장할 근거도 없다.
그래서 **사람이 JoinKFA 에서 직접 확인하고, Teameet 은 그 확인의 안내와 기록만 맡는다.**

같은 조사에서 실결함도 나왔다. 어드민 명단 검토 select 는 바꾸는 즉시 `{eligibilityStatus}` 만 보내고,
서버는 `eligibilityNote: dto.note ?? null` 로 메모를 매번 지웠다 — "무엇을 보고 판정했는지" 가 어디에도
남지 않았다. needs_review 라벨도 API CSV('검토 필요')와 웹('확인 중')이 달랐다.

## Goal

운영진 판정에 "무엇으로·언제·누가" 확인했는지가 선수 단위로 남고, 같은 사람의 이전 판정을 이어 쓸 수 있으며,
선수 본인이 선출 여부를 신고할 수 있다 — JoinKFA 에는 어떤 요청도 보내지 않는다.

## Original Conditions (must all be satisfied)

사용자 결정(2026-11-11): B안 위에 ①+②+③ 을 구현. 선출 기준 문구는 **"KFA 등록 이력(JoinKFA)으로 확인하고,
세부 기준은 대회 요강을 따라요"** — 등급·기간을 하드코딩하지 않는다.

- [x] ① `V1TournamentPlayer` nullable 컬럼: `eligibilityVerificationMethod`(joinkfa | certificate | self_presented | self_declared | other), `eligibilityVerifiedAt`, 확인자 — expand-only 마이그레이션(컬럼·인덱스 멱등), replay + drift 게이트 통과
- [x] ① `UpdatePlayerEligibilityDto` 에 `verificationMethod` + `note`, 서버가 확인일·확인자를 채우고 감사 `afterJson` 에 포함
- [x] ① 메모 덮어쓰기 결함 수정 — `note` 를 보낸 경우에만 바꾼다
- [x] ① 어드민 명단 검토: 즉시 저장 select → "판정 + 확인 방법 + 메모" 한 번에 저장하는 패널, 행 근거 줄("JoinKFA 확인 · 11.10 · 확인자"), 필터(확인 전/선출/본인 신고만), CSV 확인 방법·확인일 열
- [x] ① JoinKFA 는 링크만: `https://www.joinkfa.com`, 새 탭, `rel="noopener noreferrer"`, 외부 아이콘 + 텍스트 + sr-only "새 탭에서 열려요", "Teameet은 JoinKFA에 선수 정보를 보내지 않아요.", KFA 로고 없음, 서버·클라이언트 어디서도 joinkfa.com 호출 없음
- [x] ① 팀장 명단 폼: 선출 기준 문장 + 링크, 운영진 확인 시 "운영진 확인 완료(방법)" 잠금. 메모 노출 규칙 불변(팀장·매니저만, 공개 명단 없음)
- [x] ② 같은 **사용자 계정(userId)** 의 이전 판정(verifiedAt 최신)을 어드민 검토에 "이전 판정: 선출 아님 · JoinKFA 확인 · 2026.10.20 · (대회명)" 으로 제안, "이전 판정 유지" 한 번 클릭 → 판정·방법 복사, 메모 "이전 대회(이름) 판정 유지", 확인자 = 지금 운영자, 감사 기록. 자동 확정 없음(기본은 needs_review)
- [x] ③ 명단 행이 계정에 연결된 선수 본인이 자기 신청 화면에서 선출 여부 신고, 필수 동의 "허위로 신고하면 대회 규정에 따라 출전 제한·실격이 될 수 있어요.", `selfDeclaredStatus`·`selfDeclaredAt` 같은 마이그레이션, 어드민은 "팀장 선택"·"본인 신고" 둘 다 보고 불일치 표시, 어드민 판정이 최종(ELIGIBILITY_ADMIN_REVIEWED 유지)
- [x] needs_review 라벨 단일화('확인 중', 공유 라벨 소스)
- [x] DTO·서비스·직렬화(노출 규칙)·웹 타입/훅·MSW·fixture/spec·`docs/api/domains/tournaments.md`·changeset 동시 갱신

## User Scenarios

### Scenario 1: 운영자가 JoinKFA 로 확인하고 판정한다
As an ops admin, I want to record how I verified a player so that a later dispute has evidence.
1. 어드민 대회 → 참가 신청 → 명단 검토 → 선수 행 "판정하기"
2. "JoinKFA 열기"(새 탭)로 직접 확인 → 판정 "아마추어", 확인 방법 "JoinKFA", 메모 입력 → "판정 저장"

Expected: 행에 "JoinKFA 확인 · MM.DD · 확인자 <닉네임>", 팀장 화면은 "운영진 확인 완료(JoinKFA)" 잠금.

### Scenario 2: 다음 대회에서 이전 판정을 이어 쓴다
As an ops admin, I want to reuse a ruling the same account got in a previous competition.
1. 새 대회 명단 검토에서 "이전 판정: 아마추어 · JoinKFA 확인 · 2026.10.20 · 가을 컵" 확인
2. "이전 판정 유지" 클릭

Expected: 판정·방법이 복사되고 메모 "이전 대회(가을 컵) 판정 유지", 확인자는 지금 운영자. 누르기 전에는 아무것도 바뀌지 않는다.

### Scenario 3: 선수가 본인 선출 여부를 신고한다
As a player on a roster, I want to declare my own status so that ops can cross-check the captain's selection.
1. 대회 상세 → 내 신청 → "내 선출 여부" 카드에서 선택, 허위 신고 안내 체크 → "선출 여부 신고하기"

Expected: 어드민 행에 "팀장 선택 아마추어 · 본인 신고 선출" + "팀장 선택과 본인 신고가 달라요". 운영진 판정 뒤에는 카드가 잠금 표시로 바뀐다.

## Test Scenarios

### Happy path
- [x] 판정 + 방법 + 메모 저장, 확인일·확인자 서버 기록, 감사 afterJson 포함 (`tournament-players.service.spec.ts`, 통합 스펙)
- [x] 이전 판정 제안 → 유지 클릭 → 복사 (`service.spec`, 통합 스펙, `tournament-roster-modal.test.tsx`)
- [x] 본인 신고 저장, 판정 불변 (`service.spec`, 통합 스펙, `player-self-declaration-card.test.tsx`)
### Edge cases
- [x] 메모 생략 시 기존 메모 유지 / 빈 문자열은 지우기
- [x] needs_review 로 되돌리면 확인일·확인자 비움, 팀장 잠금은 감사 로그로 유지
- [x] 근거 컬럼 이전 판정(감사 로그만)도 `eligibilityAdminReviewed: true` (일괄 조회)
- [x] 이전 판정 후보는 `userId` 로만 찾고 이름·생년월일 조건이 없다
- [x] 메모를 건드리지 않은 재판정은 `note` 를 보내지 않는다
### Error paths
- [x] 아마추어·선출 판정에 방법 없음 → 400 `ELIGIBILITY_METHOD_REQUIRED` (DTO + 서비스 + UI 문구)
- [x] 이전 판정 원본이 다른 사람·근거 없음·확인 중·같은 명단 → 400 `ELIGIBILITY_PREVIOUS_RULING_NOT_FOUND`
- [x] 본인 아닌 사람(팀장 포함) 신고 → 403, 판정 뒤 신고 → 409 `ELIGIBILITY_ADMIN_REVIEWED`, 취소 신청 → 409 `SELF_DECLARATION_CLOSED`, 동의 없음 → 400
- [x] 팀장 경로에 `verificationMethod`·`note` 실으면 whitelist 거부 (`UpdateTeamPlayerEligibilityDto`)
- [x] support 어드민은 판정 불가
### Mock data updates needed
- [x] `apps/v1_api/src/tournaments/tournament-players.service.spec.ts` `playerRow` 새 컬럼, 감사 로그 `findMany` mock
- [x] `apps/v1_api/src/tournaments/tournament-players.mdqa140-deleted-nickname.fixtures.ts`
- [x] `apps/v1_web/src/test/msw/player-eligibility-handlers.ts`(신규 상태형 핸들러)
- [x] 어드민 명단 테스트들(select → 판정 패널)

## Parallel Work Breakdown

### Backend
- [x] 스키마 + 마이그레이션 `20261111090000_v1_tournament_player_eligibility_evidence`
- [x] DTO(`UpdatePlayerEligibilityDto`·`UpdateTeamPlayerEligibilityDto`·`CarryOverPlayerEligibilityDto`·`SelfDeclarePlayerEligibilityDto`)
- [x] 서비스(판정 수정·이월·본인 신고·판정 여부 일괄 조회·이전 판정 조회·CSV 열), 컨트롤러 라우트 2개
### Frontend (3안 제시 → 선택이 구현보다 먼저 — 2026-11-11 완료, B안 선택)
- [x] 공용 `components/tournaments/player-eligibility.tsx`(JoinKFA 링크·기준 안내·잠금 표시)
- [x] 어드민 `components/admin/admin-player-eligibility-review.tsx` + `registrations-tab.tsx`
- [x] 팀장 `tournament-roster-client.tsx`·`participant-roster-editor.tsx` 잠금·안내
- [x] 선수 `player-self-declaration-card.tsx` + `my-registration-client.tsx`
### Sequential
- [ ] dev 머지 → alpha 배포 확인 → ego-lite 3폭 갤러리(390/768/1440) PR 코멘트 → MD-QA #192 댓글

## Acceptance Criteria
- [x] **UI 3안 제시 → 사용자 선택 완료(2026-11-11)**: A 안내+링크 / B 확인 근거 기록(추천) / C 확인 단계 흐름 중 B 선택, ①+②+③ 추가 확정
- [x] Original conditions 전부 충족
- [x] Test scenarios green (v1_api unit·integration, v1_web vitest)
- [x] 마이그레이션 동반(빈 DB replay + drift 0 로컬 확인, expand-contract 게이트 통과)
- [x] Mock data 업데이트, schema 와 sync
- [x] 디자인 시스템 준수(토큰 폰트 크기·`tm-chip`·`tm-badge`, 44px 터치, 다크 토큰)
- [ ] alpha 3폭 갤러리 게시(머지 후)
- [ ] Code review: Critical=0, Warning=0 (Copilot 루프)

## Tech Debt Resolved
- 어드민 판정이 메모를 `null` 로 덮어쓰던 결함
- 어드민 select 즉시 저장(잘못 누르면 그대로 저장)
- needs_review 라벨 불일치('검토 필요' vs '확인 중')
- 팀장 경로와 어드민 경로가 같은 DTO 를 써서 팀이 심사 필드를 실을 수 있던 구조

## Security Notes
- 고려한 위협: 팀장이 판정 근거를 위조 / 남이 대신 본인 신고 / 판정 근거·본인 신고가 일반 팀원·공개 명단에 노출 / 외부 서비스로 개인정보 전송.
- 완화책: 팀 경로 DTO 분리(whitelist 로 근거 필드 거부), 본인 신고는 `player.userId === user.id` + 활성 팀원 확인, 판정 뒤 신고·팀장 수정 409, 판정 쓰기는 기존 `getTournamentMutationAdmin`(owner·ops·배정된 대회 운영자, support 불가). 노출: 방법·확인일은 메모와 같은 선(팀장·매니저), 본인 신고는 개인정보 선(팀장·매니저 + 본인), 확인자 이름은 어드민 응답에만. 공개 명단 무변경. JoinKFA 로는 일반 링크만 — 서버·클라이언트 요청 0, 증빙 파일 업로드 없음.

## Risks & Dependencies
- JoinKFA 실제 메뉴 경로(소속내역 등)는 1차 확인하지 못해 화면에 메뉴 경로를 적지 않았다(루트 링크 + 기준 문장만).
- 공식 연동(자동 조회)은 KFA 허락 전까지 범위 밖. 허락되면 `V1TournamentPlayerEligibilityMethod` 에 값을 더한다.
- 대회별 선출 기준 문구·인원 제한(C안 축)은 별도 태스크.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-11-11 | backend-data-dev | 확인자 컬럼을 `V1AdminUser` FK 로 둘지 | 판정 경로(`getTournamentMutationAdmin`)는 배정된 대회 운영자(director)도 통과하는데 그들은 `V1AdminUser` 행이 없다. 가짜 어드민을 만들지 않는 기존 원칙에 따라 **사용자 계정 FK**(`eligibilityVerifiedByUserId`, SET NULL)로 둔다. |
| 2026-11-11 | backend-data-dev | "admin endpoints owner/ops only" 와 기존 director 허용의 충돌 | 기존 판정 엔드포인트가 이미 director 를 허용한다(Task 운영자 배정). 좁히면 회귀라 **기존 권한을 유지**(support 는 계속 불가). |
| 2026-11-11 | backend-data-dev | 선수를 사람으로 잇는 열쇠 | `V1TournamentPlayer.userId` 는 non-null FK 라 모든 명단 행이 계정에 연결돼 있다. 이전 판정·본인 신고 모두 userId 로만 처리하고 이름·생년월일 추정은 하지 않는다. "계정 미연결 선수" 경로는 현재 없음. |
| 2026-11-11 | backend-data-dev | 근거 컬럼 이전 판정(감사 로그만)을 이전 판정 후보로 볼지 | 확인 방법을 모르므로 후보에서 뺀다(가장 보수적). 잠금 여부(`eligibilityAdminReviewed`)는 감사 로그로 계속 판정한다. |
| 2026-11-11 | backend-data-dev | 판정 뒤 본인 신고를 허용할지 | 판정이 최종이므로 409 로 막는다(보수적). 신고는 판정 전 참고 기록. 마감 지난 명단도 신고는 받되 끝난 대회·취소 신청은 막는다. |
| 2026-11-11 | frontend-ui-dev | 판정 뒤 "팀장 선택" 을 어떻게 보여 줄지 | 판정이 `eligibilityStatus` 를 덮어써 팀장 선택이 남지 않는다. 판정 전에는 "팀장 선택 · 본인 신고", 판정 뒤에는 판정과 본인 신고를 비교해 불일치를 표시한다. 팀장 선택 이력 보존은 범위 밖. |
| 2026-11-11 | frontend-ui-dev | 확인 중으로 되돌릴 때 확인 방법 필수 여부 | 필수 아님 — 되돌리면 확인일·확인자를 비운다. 아마추어·선출에는 필수(서버 400 + DTO). |
| 2026-11-11 | backend-data-dev | "idempotent 마이그레이션" 과 expand-contract 게이트의 충돌 | 게이트가 `DO $$ … $$`(enum 중복 가드·FK 존재 확인)를 additive 로 증명하지 못해 실패했다. 컬럼·인덱스는 `IF NOT EXISTS` 로 멱등, enum 생성과 FK 는 Prisma 표준 형태로 둔다(Prisma 가 적용 이력을 관리해 두 번 돌지 않음). FK 는 이 마이그레이션이 추가한 nullable 컬럼에만 걸려 기존 행을 거부하지 않는다. 빈 DB replay + drift 0 확인. |
| 2026-11-11 | planner | 정본(`competition-canonical-flow.md`) 결정 이력 행 추가 여부 | 정본은 선출 여부를 다루지 않아(§3 명단은 등번호·이름만) 결정 이력을 고치지 않는다. 계약은 `docs/api/domains/tournaments.md` "선출 여부 판정 근거" 절이 정본. |
