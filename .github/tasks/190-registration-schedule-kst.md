# Task 190: 내 신청 일정의 대회 KST 표시 계약

Status: Review
**Owner**: issue #1535 수정 세션
**Created**: 2026-10-02

## Context
Refs #1535. 실제 alpha의 동일 완료 합성 대회 상세는 10/3 (토) 11:00, 선택한 기존 신청 카드 일정은 10월 2일로 CSS402/787/1180에서 관측됐다. [고정 원본 6장과 proof](https://github.com/kim-song-jun/matchup-sports-platform/tree/8effa773f558350f43338cb2fe560d37583c2d0e/docs/qa/2026-10-02-application-schedule-date)는 서로 다른 화면의 수정 전 비교이며 after가 아니다.

## Goal
같은 scheduledAt/scheduledEndAt을 기존 대회 KST 정본 포맷터로 표시하여 브라우저 현지 시간대와 무관하게 상세/내 신청의 일정 날짜를 일치시킨다.

## Original Conditions (must all be satisfied)
- [ ] 현재 API 일정 값과 표시 정책 확인, 실제 상세/선택 신청의 날짜 일치.
- [ ] 신청일·확정일·결제일은 별도 의미와 필드 유지.
- [ ] 모바일→태블릿→데스크톱 실제 alpha 수정 후 비교, 상세↔내 신청 이동·refresh 확인.
- [ ] 원본 before와 수정 after 구분, 배포/검증 UTC·CSS 크기·관측 SHA·PASS 범위 기록.
- [ ] 원 이슈 전체 조건 충족 뒤만 종료. 현재 OPEN/Refs 유지.

## User Scenarios
1. 기존 참가 확정 신청의 카드 일정은 같은 대회 상세와 같은 KST 날짜를 말한다.
2. 입금 대기/참가 확정/결제/대기 목록의 일정은 단일일·동일일 범위·여러 날·미정에서 같은 정책을 쓴다.
3. 신청·확정·결제 시각과 권한/명단/결과는 일정 서식 변경과 무관하게 유지된다.

## Test Scenarios
### Happy path
- [x] 실제 MyRegistrationPageClient의 선택 신청 카드, UTC/LA/KST 계약 및 두 렌더 분기.
### Edge cases
- [x] KST 자정·연말 경계, 같은 날/여러 날/offset/naive datetime, null/invalid 일정, 재마운트.
### Error paths
- [x] 미정/invalid는 날짜가 있는 것처럼 표시하지 않으며 조회 오류/신청 미발견은 기존 테스트를 유지.
### Mock data updates needed
- 기존 typed 인메모리 API 경계 fixture만 확장. shared MSW/API/DTO/schema/저장 fixture 변경 없음.

## Parallel Work Breakdown
- Read-only 조사 에이전트: 원본 proof/6장 픽셀, API GET, current v1 상세/my/formatter/presenter와 기존 #1425/#1456/PR1466 대조 완료. 코드/데이터/테스트 쓰기 없음.
- Owned: `apps/v1_web/src/app/tournaments/[id]/my/my-registration-client.tsx`, 같은 경로 `my-registration-page-client.test.tsx`, 이 task, `.changeset/registration-schedule-kst.md`.
- Forbidden: 다른 worktree/미병합 PR, shared date-utils/API/DTO/schema/저장/권한/eligibility, 기존 완료 대회 결과/QA179/명단/신청/결제/팀 실제 데이터, merge/deploy/main/유료 재리뷰.

## Acceptance Criteria
- [x] 실제 카드 회귀 RED/GREEN, 기존 신청/상세/대회 날짜 테스트와 type/lint/6 aggregate/Changeset/diff 검사.
- [ ] 명시 pathspec 커밋·전용 브랜치 push·Ready/dev PR·exact-head CI/독립 리뷰를 구분 기록.
- [ ] 고정 실제 alpha before, 수정 after/전체 QA 대기를 명시.

## Tech Debt Resolved
- 대회 공용 KST 서식과 분리된 내 신청의 로컬 getMonth/getDate 일정 계산.

## Security Notes
- 읽기 전용 공개 alpha GET만 사용. 저장값/API/DTO/schema/권한/명단/점수 변경 없음.
- 환경/인증 파일·비밀값은 읽거나 기록하지 않는다.

## Risks & Dependencies
- 원본 실행 당시 브라우저 TZ/serving SHA/API ISO는 미관측. 현재 API GET은 과거 DB/캡처 serving 증거가 아니다.
- 수정 후 실제 alpha 화면은 별도 승인된 배포까지 대기하며 단위 테스트는 전체 QA 완료가 아니다.
- UI 날짜 로직과 기존 공용 포맷터 연결만 변경하므로 CLAUDE.md의 로직 전용 A/B/C 제외에 해당한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-02 | 조사 에이전트 | 10/3이 실제 저장/표시 계약인가? | 09:33:56.543 UTC 공개 GET scheduledAt=2026-10-03T02:00:00.000Z/end=null, 현재 KST10/3 11:00. 상세는 기존 KST 정본. 과거 값/TZ는 미확정. |
| 2026-10-02 | 수정 세션 | UTC 기본 fixture가 false-green일 수 있는가? | 기본 UTC에서도 RED인 15:30Z 자정 경계와 LA actual-ISO 사례를 실제 컴포넌트로 검증한다. |

## Progress Snapshot
- Fresh origin/dev e0f58632821bb12296541219f748bcee7cbd185f, 독립 `/tmp/teameet-issue-1535-20261002`, branch `fix/issue-1535-registration-schedule-kst`.
- 중복 열린 수정 PR 없음. #1425/#1456/PR1466은 입력/달력 경로이며 my 카드 미포함.
- 공개 alpha /landing HEAD 09:33:55 UTC serving9a35d05/release1.1.1-alpha.20261002.g9a35d05abd32; GET 시각은 위 표. 원본 사진의 serving SHA로 대체하지 않음.
- 실제 my 일정 두 분기는 local getMonth/getDate, 상세는 shared KST. 기존 공용 formatTournamentDateRangeMedium을 사용하고 일정 전용 로컬 함수만 제거한다. 신청/확정/결제 날짜는 수정하지 않는다.
- 실제 MyRegistrationPageClient RED 11 FAIL/44 PASS(55), 2.93s. UTC 자정/연말 경계와 LA에서 원본 API ISO 날짜가 실제 일정 행에서 틀림을 확인. 수정 후 신규15+기존137, 고유 5 suite 152 PASS, 7.48s, 1 worker. 신규는 4 신청 상태·UTC/LA/KST·단일/동일/여러 날·연말·offset/naive·null/invalid·새 마운트와 신청/확정/결제일/실제 상세 링크를 검증.
- `pnpm --filter v1_web lint`(tsc+pattern), 6 aggregate(DB/production security/compose/seed/Android/immutable deploy), patch Changeset policy/diff check/새 tech-debt marker 없음 PASS.
- Host preflight load15.00/20.84/18.89, vm_stat 확인; 앞선 동일 실행의 Node/Chrome/Docker 현황·alpha200를 확인. 최소 단일-worker 테스트와 scope lint만 직렬 실행. 실제 데이터/DB 쓰기·로컬 UI 서버 없음.
- 실제 alpha 원본 6장 proof/hash/픽셀은 read-only 조사 에이전트가 확인. 원본 CSS402×606/787×505/1180×757, UTC09:12:37–09:16:18. 서로 다른 화면의 두 열 모두 before다.
- 명시4 pathspec 커밋·Ready/dev PR와 exact-head CI/독립 리뷰는 PR 기록에 후속 반영. 수정 after와 원 이슈 전체 alpha 수용 조건은 별도 승인된 배포까지 PENDING, #1535 OPEN/Refs 유지.
