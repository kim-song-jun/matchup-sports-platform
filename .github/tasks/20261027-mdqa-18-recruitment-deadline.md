# MD-QA #18: 신청 마감일 경과 대회의 대표 모집 상태 정합성

Status: Review
**Owner**: Codex MD-QA monitor / mdqa_18 worker
**Created**: 2026-10-06

## Context
리포트: https://teameet.jmandu.kr/issues/18/ (김성준 할당).
신청 마감일이 지난 0/4팀 합성 대회가 이벤트 카드·캠페인·대회 상세에서 모집 중으로 표시되는 반면 신청 버튼과 안내는 마감이다. 정원 충족 사례와 다르다. 기존 후보 검증 기록만 있고 해당 수정 PR은 아직 없다.

## Goal
신청 마감일이 지난 대회의 대표 상태와 실제 신청 가능 여부를 일치시키고 dev PR 및 머지 후 alpha QA로 연결한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev에서 분기한 전용 워크트리 사용.
- [x] 이벤트·캠페인·대회 상세의 대표 배지가 마감일을 반영(구현 및 회귀 검증 완료).
- [x] 마감 버튼/안내와 실제 신청 게이트 유지; 신청·결제 데이터 변경 없음.
- [ ] 한국어 dev PR 생성 및 Changeset 포함.
- [ ] dev 머지 후 리포트 상태는 QA로 변경; Done/완료 처리는 하지 않음.

## User Scenarios
기존 합성 대회의 이벤트 → 캠페인 → 상세를 읽으면 마감 상태가 일관돼 신청 가능한 대회로 오해하지 않는다.
관측 경로: `/events`, `/tournaments/campaigns/alpha-qa-futsal-recruiting?from=events`, `/tournaments/aa100000-0000-4000-8000-000000000002`.

## Test Scenarios
### Happy path
- [x] 미래 마감일·모집 중 상태는 모집 중.
- [x] 과거 마감일·빈 정원은 모집 마감.
### Edge cases
- [x] 마감 경계와 기존 날짜/timezone 계약 확인.
- [x] 마감일 미설정, 정원 충족, closed, 진행/종료 상태 검증.
### Error paths
- [x] 실패를 성공이나 임의 상태로 숨기지 않음(기존 API/error/신청 게이트를 그대로 유지).
### Mock data updates needed
- [x] 영향받는 fixture/MSW/기존 테스트를 실제 계약과 동기화(신규 응답 계약 없음; 기존 full 캠페인의 hero/decision 배지 개수만 실제 화면에 맞게 조정).

## Parallel Work Breakdown
- Builder owns tournament/campaign/event recruitment presentation and direct tests, this document, `.changeset/mdqa-18-recruitment-deadline.md`.
- Forbidden: admin/inquiries paths, unrelated shared contracts, main checkout, other worktrees.
- Shared API/schema 변경이 꼭 필요하면 편집 전에 root와 조율.
- Root handles Git/PR and browser QA; builder must not commit or push.

## Acceptance Criteria
- [x] 재현 계약을 검증하는 회귀 테스트 및 관련 기존 테스트 통과(관련 6파일 총 84개).
- [ ] 타입/패턴 검사와 committed diff 검토 완료.
- [x] reviewer 실결함 0(10/10 파일 및 shared helper caller 8/8 검토, Critical 0 / Warning 0).
- [x] API/mock 계약 drift 및 새로운 부채 0.
- [ ] 머지 및 alpha 배포 확인 후 원래 사용자 흐름을 390/768/1440에서 재검증.

## Tech Debt Resolved
- 저장된 대회 단계(`open`)와 신청 가능 여부를 대표 배지가 혼동하던 분기를 shared status helper에 통합했다.
- 캠페인 hero가 신청 버튼과 별개로 마감 후에도 모집 중을 유지하던 문제를 기존 provider의 시계 재사용으로 해소했다.
- 신규 TODO/FIXME/HACK/XXX marker 없음; 기존 신청/API/결제 게이트 수정 없음.

## Security Notes
기존 권한/신청 차단 유지. .env·인증정보는 읽거나 문서/PR에 적지 않음.

## Risks & Dependencies
alpha 실제 배포와 인증 세션에 의존. 병렬 구현은 가능하지만 무거운 검증은 root가 직렬로 조율한다. 캠페인의 시간 경과 갱신은 기존 60초 주기를 유지한다. 이벤트 카드는 기존 API의 registrationAvailability를 사용한다.

## Ambiguity Log
- 기존 배지와 화면 구조를 유지하며 상태 계산만 변경한다. `CLAUDE.md` UI 착수 규칙의 로직 전용 변경 예외에 해당한다.
- 캠페인 API·provider는 `deadline <= now`에 마감한다. 일반 대회 신청 서비스와 상세의 공유 신청 게이트는 `deadline < now`에 마감한다. 이번 변경은 각 화면의 기존 게이트를 그대로 따르고 API 경계를 바꾸지 않는다.
- 원본 ISO timestamp를 절대 시각으로 비교하고 날짜 문구는 기존 Asia/Seoul 포맷을 유지한다. 신청·결제·API·MSW 계약 변경은 필요하지 않다.
- root가 shared `lib/v1-tournament-status.ts` 소유권을 승인했다. 존재하지 않는 `lib/v1-tournament-registration.ts` 대신 현행 `lib/tournament-registration-availability.ts`를 읽기 전용으로 재사용한다.

## Progress Snapshot
- [x] 할당·상세·기존 PR 중복 확인.
- [x] 로컬 dev를 먼저 fetch/FF 동기화; 시작 SHA `4e1c14bb9cd089da10e1dae0088dfea6deb5b72d`.
- [x] 구현·회귀 검증.
- [x] events/campaign/detail 기존 게이트와 대표 배지 경로 조사.
- [x] 세 화면의 RED 회귀 테스트 준비 및 root의 직렬 실행.
- [x] RED: root 실행, 기존 3파일 52개 중 7 fail / 45 pass. 모두 실제 모집 중 배지가 유지돼 모집 마감을 찾지 못하는 회귀.
- [x] 최소 구현 및 deadline/timezone/정원/대회 단계 대조 테스트 준비. GREEN·타입/패턴은 root가 직렬 실행한다.
- [x] 1차 GREEN: 6파일 84개 중 82 pass / 2 fail. 캠페인·이벤트·시계·shared gate 검증 통과. 상세의 추가 대조군 2개는 정상 버튼/종료 표시와 텍스트가 같아 선택자가 중복 매칭됐다. 실제 대표 배지(`.tm-badge`)로 선택 범위를 좁혔으며 프로덕션 재수정은 없다.
- [x] 최종 상세 1파일 32/32 PASS. 나머지 5파일 52/52 PASS와 합쳐 관련 84개 PASS. root가 최소 worker 1개, 파일 병렬화 없이 실행했다.
- [x] reviewer: 파일 10/10, shared helper caller 8/8, Critical 0 / Warning 0.
- [x] alpha baseline: root가 `/events` → 캠페인 → 상세를 390/768/1440에서 총 9장 캡처했다. baseline serving SHA는 `4e1c14bb9`다.
- [x] root 타입 검사 통과. Windows `find.exe`와 Unix 검사 명령 충돌을 피하기 위해 패턴 검사는 기존 Git Bash를 자식 shell로 지정해 통과했다. 제품/검사 코드는 변경하지 않았다.
- [x] root committed diff 10파일 검토, 미추적 의존성 없음, clean 작업트리 확인.
- [x] 리뷰·PR: [dev PR #1625](https://github.com/kim-song-jun/matchup-sports-platform/pull/1625) 게시 및 채팅 attach. Copilot 리뷰 요청 완료. 현재 CI/리뷰 진행 중.
- [ ] dev 머지·QA 상태 변경·alpha 재검증.

## Validation Evidence
- RED: `pnpm --filter v1_web exec vitest run src/components/tournaments/event-campaign-card.test.tsx src/components/tournaments/tournament-campaign-template.test.tsx src/app/tournaments/[id]/tournament-detail-cta.test.tsx --maxWorkers=1 --no-file-parallelism` — 7 fail / 45 pass. 실제 모집 중 표시가 남아 모집 마감 배지를 찾지 못했다.
- GREEN 1차: 위 3파일과 `src/lib/v1-tournament-status.test.ts`, `src/lib/tournament-registration-availability.test.ts`, `src/components/tournaments/tournament-campaign-primary-action.test.tsx` — 82 pass / 2 selector fail. 증거: `tmp/qa/mdqa18/green.log`(로컬 검증 로그, 커밋 대상 아님).
- GREEN 최종: `pnpm --filter v1_web exec vitest run src/app/tournaments/[id]/tournament-detail-cta.test.tsx --maxWorkers=1 --no-file-parallelism` — 32/32 PASS. 수정하지 않은 나머지 5파일 52/52 PASS를 포함해 84개 계약 검증 통과.
- alpha after-state QA는 PR 머지·배포 확인 후 진행한다. tracker는 QA로만 전환하며 Done/완료 처리는 하지 않는다.
- `pnpm --filter v1_web run lint`의 `tsc --noEmit` 통과; 후속 패턴 명령은 Windows shell 충돌로 실패했다. `process.env.ComSpec`을 해당 Node 프로세스에서 Git Bash로 지정하여 기존 `scripts/v1-pattern-check.mjs`를 재실행했고 모든 패턴 게이트가 통과했다. 증거: `tmp/qa/mdqa18/lint.log`, `tmp/qa/mdqa18/patterns-gitbash.log`.
