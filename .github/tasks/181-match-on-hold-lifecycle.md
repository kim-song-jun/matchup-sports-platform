# Task 181 — 미충족 매치 보류와 주최자 후속 조치

Status: Review — latest-dev validation complete; CI/alpha deployment pending
Scope: v1 API/Web, migration, notification, API docs, scenarios

## Acceptance Criteria
- 모집 마감 또는 시작 시각에 개인 확정 인원 미달 / 팀 상대팀 미확정이면 보류. 신청 대기는 확정 인원으로 세지 않는다.
- 개인 확정 참가자가 주최자뿐이면 진행 불가. 정원 미달이지만 다른 확정 참가자가 있으면 주최자가 진행 확인 가능. 응답 없으면 보류 유지.
- 보류 매치를 미래 일정으로 수정하고 재모집 가능. 참가 이력 없는 매치는 soft delete, 이력 있으면 취소 및 알림.
- 개인 일정/장소 변경 시 기존 승인 참가자에게 재신청 안내, 승인 초기화. 진행 결정 초기화.
- 권한·동시성 검증, 실제 실패 노출, 목록/상세/내 매치 상태 일치.

## Ownership
Root agent only. 기존 shared-tree WIP 보존. 2026-10-01 사용자 dev 배포 요청으로 commit/PR/dev merge/alpha 배포 승인. main 승격 금지.

## Progress Snapshot
- 2026-09-30: 현재 recruiting + startAt 경과 = expired, update/cancel 차단 확인. 보류는 read-derived 상태로 기존 데이터에 적용, 개인 진행 선택은 nullable timestamp로 저장.

## Validation
- [x] API lifecycle focused tests
- [x] Web focused tests and typecheck (final output below)
- [ ] Browser mobile 390 / tablet 768 / desktop 1440, console/network and cleanup
- [x] Diff/debt inspection; own/new file dependencies present, unrelated WIP preserved


## Validation Evidence / Remaining Gates

- API: matches/team-matches focused suites 62 tests PASS; final follow-up strengthens persistence/deletion assertions. API tsc --noEmit PASS.
- Web: existing related match mode/view-model/client/team-client 21 tests PASS; new HTTP-backed lifecycle panel 4 tests PASS. Web final tsc and pattern checker recorded after edits.
- Initial RED: old team expired/edit-lock assertions failed with new on_hold behavior; updated expected contracts and passed. New UI error case initially used an incorrect error envelope; corrected to v1 `statusCode/code/message` and verified real server failure remains visible. WSL cold test startup needed --testTimeout=15000; mutation logic was unchanged.
- Headed browser component preview: `node scripts/qa/capture-match-on-hold-panel.mjs`, fixture props (host/no participants, host/3 of 10 confirmed, team/no opponent). 390/768/1440: 3/3 PASS, horizontal overflow 0, console/page/network errors 0. Screenshots and PID/PPID tree under `output/playwright/visual-audit/match-on-hold/`. This is **component-only**, not live route/permission/API/DB verification.
- New surface has no before baseline. Full detail/list/edit/mobile sticky-shell before/after evidence remains pending.
- Browser startup required sandbox escalation for localhost listen and /tmp-extracted libnspr4/libnss3/libasound2t64; no OS installation. Chromium and Vite closed in finally; temporary preview directory removed. Main browser PID 18032, parent Node 18009 (full tree in processes.json).
- Runtime blocker: localhost 3013/8121 unavailable; Docker reports WSL `UtilBindVsockAnyPort: socket failed 1`. No real DB integration, migration replay, or full authenticated route QA performed.
- Added `20260930150000_v1_match_proceed_confirmation` for nullable v1_matches.proceed_confirmed_at; Prisma Client generation PASS. No DB reset/seed/migration apply, commit, push, or alpha deployment performed.
- API/permission/state decisions documented in docs/api/domains/matches.md and team-matches.md; scenarios and index updated.
- Shared tree includes existing schema/types/team lineup/deploy WIP. Current branch fix/tournament-lineup-flow, not a new clean dev-based task branch. No PR-ready/committed-tree claim.

- Final follow-up: API 62/62 PASS with persisted proceed/deletion assertions; UI lifecycle 4/4 PASS includes deletion avoiding a refetch of the removed detail. Prior related UI tests 21/21 PASS. Pattern checker PASS. Final API typecheck PASS.
- Cleanup verified: owned Node 18009/Chromium 18032 no longer present; TCP 3033 not listening. No external messages or live match mutations.

- Final Web tsc --noEmit PASS (after all source edits); git diff --check PASS; touched-path debt grep found no TODO/FIXME/HACK/XXX markers. New runtime panel and migration files present; no committed-tree readiness claim.
- Temporary downloaded browser libraries removed from /tmp. Screenshots/verdict/process tree preserved in standard output directory.


## Shipping Snapshot
- 최신 origin/dev 3e38c75ef 기반 `/tmp/teameet-match-on-hold-ship`, fix/match-on-hold-lifecycle에서 관련 변경만 선별. 기존 대회/라인업/infra WIP 제외.
- 최신 dev의 hostParticipates, completion_pending, 신청 원장 중복 방지, 리그/대회 스케줄 계약과 Game → TeamMatch 잠금 순서 유지. 최신 dev 기반 검증 및 PR/배포 진행 중.

- 최신 dev에 archive/151-profile-tournament-awards.md가 있어 이전 로컬 Task151을 canonical Task181로 재번호.
- 최신 dev 기준 API 138/138, Web 관련 102/102 PASS. 양 앱 tsc PASS, API surface PASS. guest eligibility 401은 공개 상세에서 불필요한 인증 API 호출을 제거해 닫음.

- 공개 alpha 실제 상세 before 390/768/1440: 모두 종료 확인 중, overflow 0. guest eligibility 401 2건을 확인하고 조건부 query로 수정. 최신 dev component-only after 3/3 PASS, 오류/overflow 0. 이 증거는 인증 주최자의 실제 mutation을 증명하지 않음.
- PR 참조 증거: docs/screenshots/task181-match-on-hold/{alpha-before,panel}-{390,768,1440}.png. 배포 후 전체 실제 route after 추가 예정.

- 최종 API 139/139 PASS(보류 complete 우회 차단 포함). 최종 Web client/panel 34/34 PASS, 앞선 관련 102/102 PASS. 웹 타입 PASS 및 radius token 수정 후 pattern PASS. 최신 dev API surface PASS.

- 최종 후속: 실제 신고 매치와 같은 0/1 모집의 보류·진행 차단·삭제와 주최자 불참 + 확정 참가자 1명의 진행 선택을 회귀 테스트로 추가. API 141/141 PASS. 리그/대회 매치 주최팀 삭제 우회 차단. PR #1388(base dev), CI 및 Copilot 검토 진행 중.

## CI reconciliation
- 첫 CI RED: final schema binding, game-schema snapshot, personal completion integration 및 2개 Web expectation. 신규 nullable 컬럼의 현재 digest만 정확히 재바인딩하고 과거 alpha manifest digest 허용을 보존. schema binding 7/7 PASS.
- 실제 HTTP/DB 참여 이력 시나리오는 시간 fixture 후 주최자 confirm-proceed HTTP를 수행하도록 수정. 0/1 보류 조회/완료 차단/권한/soft delete 및 일정 변경·승인 초기화·이력 삭제 차단 시나리오 추가. CI 실제 Postgres 재검증 대기.
- 진행 확정 뒤 불참(no_show) 처리로 보류에 역전하지 않도록 기존 완료 흐름 보존. 참가 집계에서는 불참을 계속 제외.
- Web 가입 대기 상태는 진행중보다 우선 유지하고 보류만 공통 우선. 관리 링크 fixture는 실제 manageHref를 명시. 관련 Web 98/98 PASS; 개인 API 67/67 PASS(팀 API 74/74 이전 PASS).
