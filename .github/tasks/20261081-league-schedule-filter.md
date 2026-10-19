# Task 20261081: 리그 경기 일정 전체/내 팀 필터

Status: Review (local validation passed; alpha QA pending)

## 대회 스위치 통일 후속 (2026-10-19)
- 후속 요구: 내 팀 스위치와 전체/조별리그/결선은 독립 상태로 동작. 단계 변경은 내 팀 scope를 보존하고, 스위치를 꺼도 고른 단계 유지. URL은 teamScope와 schedulePhase를 별도로 보존하고 기존 schedulePhase=mine 링크도 호환. 진행 중/시간 미정에도 같은 필터 적용. 소속 조의 미정의 --red600을 기존 --red 토큰으로 교정, `*)` 제거 및 문구 교정. 별도 dev 기반 브랜치에서 구현·CI·alpha 검증 예정. 사용자 승인으로 이번 배포 흐름의 Copilot 리뷰 게이트는 생략.
- 로컬 후속 검증: 격리 worktree에 frozen-lockfile 의존성 설치(원본 공유 node_modules 유지). 관련 3개 suite 116/116 PASS, 타입 검사 PASS. 패턴 검사는 Windows 기본 셸의 grep/find 미지원으로 실행 차단돼 Linux CI에 위임. diff whitespace/debt 검사 통과. 실제 alpha 계정의 대상 대회 참가 및 조별·결선 경기 존재를 API로 확인하여 배포 후 실제 브라우저 필터 검증 가능.
- 추가 요청: 대회 bracket 탭 아래 경기 일정/조별 순위 중복 제목 제거, 순위·대진표에도 조별리그/결선 버튼 추가. 각 보기를 단일 칼럼으로 전환하며 단일 단계 포맷은 해당 보기만 제공한다. 기존 결선 회귀 테스트를 클릭 흐름으로 갱신.
- 요청: 대회 bracket 경기 일정의 내 팀 버튼을 리그와 동일한 내 팀만 스위치로 변경.
- 범위: public-game-records/schedule-content.tsx 및 기존 테스트, patch changeset.
- 구현: 단계 탭에서 mine 항목을 분리하고 리그와 동일한 toggle 스타일과 switch/aria-checked 계약 적용. 기존 필터 및 전체 복원 동작 유지.
- 검증: 내 팀 필터 켜기/끄기 및 전체 경기 복원 회귀 테스트 추가. focused Vitest 실행은 설치 의존성 문제로 시작 전 차단됨(`ERR_MODULE_NOT_FOUND: @vitest/utils`; pnpm shim 또한 Windows에서 sh를 찾지 못함). 범위 내 diff whitespace 검사 통과, 새 debt marker 없음. alpha 배포 및 viewport별 시각 검증은 미실행.
Owner: Codex (단일 실행)
Created: 2026-10-14

## Context
리그 `/tournaments/:id/bracket` 일정에서 소속 팀 경기를 쉽게 찾는다. 사용자가 전체/내 팀 전환안과 로그인·빈 결과·오류·URL 유지 기획을 승인했다.

## Goal
정규 리그 일정의 전체/내 팀 필터를 별도 dev 기반 브랜치에 구현하고 변경 계약을 검증한다.

## Original Conditions
- [x] 전체 기본값, 내 팀 전환; 팀장/매니저/멤버의 정식 소속 팀 모두 포함.
- [x] 복수 팀 합집합, 예정/진행/종료/시간 미정 경기 모두 동일하게 필터.
- [x] 로그인 안내 및 원래 필터로 복귀, 조회 실패와 재시도.
- [x] 미참가와 참가 후 대진 미배정을 구분하고 전체 일정 복귀 CTA 제공.
- [x] 새로고침/상세 복귀에 선택 유지, 기존 from/단계 쿼리 보존.
- [x] 순위/대진표 및 대회 화면의 계약 유지.

## User Scenarios
1. 로그인한 일반 멤버가 내 팀을 선택하면 홈/원정 및 여러 소속 팀 경기가 모두 나온다.
2. 비로그인 사용자는 로그인 안내에서 원래 일정의 내 팀 선택으로 돌아온다.
3. 참가 팀이 없거나 아직 경기 배정이 없으면 정확한 안내와 전체 일정 보기로 복귀한다.

## Test Scenarios
### Happy path
- [x] 전체/내 팀 토글, 일반 멤버·복수 팀·홈/원정·live/ended/unscheduled.
### Edge cases
- [x] 후속 커서 페이지 로딩 중 빈 결과 확정 금지, 미참가/미배정 구분.
- [x] URL 새로고침/복귀/연속 선택, from/hash/단계 보존.
### Error paths
- [x] 팀 조회 오류/401/재시도, 비로그인 안내.
### Mock data updates needed
- [x] 실제 컴포넌트 및 훅 경계 회귀 fixture; API/스키마 변경 없음.

## Parallel Work Breakdown
병렬 에이전트 요청 없음. 순차 실행한다.
### Backend
변경 없음: `/me/teams`는 active membership 전부 반환, cursor 없음. 공개 리그 일정 standings는 참가팀 전부 포함.
### Frontend
- [x] UI 선택: 대화에서 사용자가 일정 목록 위 전체/내 팀 전환 기획을 명시적으로 승인. 승인된 배치로 진행.
- [x] 리그 일정 wrapper, 공용 일정의 중복 내 팀 칩 방지 및 소속 팀 강조.
### Infra
변경 없음.
### Sequential
- [x] 좁은 회귀 검증, 타입/패턴 및 diff/debt 검토.
- [ ] alpha 390/768/1440 로그인·console/network·before/after QA.

## Owned / Forbidden Scope
Owned: bracket 일정 연결, 리그 일정 wrapper와 테스트, 공용 ScheduleContent의 소속 팀 강조/제목 계약, 이 task, 전용 scenario, changeset.
Forbidden: 기존 shared tree WIP, `.env*`, 운영 데이터, schema, unrelated routes.

## Acceptance Criteria
- [x] 원본 조건 및 회귀 검증 통과.
- [x] 토큰/공유 UI 사용, 새 tech-debt marker 없음, auth 권한 우회 없음.
- [x] changeset 포함 및 intended diff 확인.
- [ ] alpha 시각 QA 또는 정확한 미검증 blocker 기록; 테스트만으로 완료 표시하지 않는다.

## Tech Debt Resolved
기존 팀장 전용 fixture 기준을 일반 멤버의 소속 기준으로 잘못 재사용하지 않는다. 진행 중 경기도 팀 필터 전에 거른다.

## Security Notes
공개 경기의 teamId와 인증된 `/me/teams`만 매칭한다. 권한을 부여하거나 비공개 팀 ID를 추론하지 않는다. 로그인 redirect는 동일 출처 경로만 사용한다.

## Risks & Dependencies
기본 sandbox helper 오류: 승인된 elevated 실행으로 파일 접근 복구. alpha after QA는 배포된 변경이 있어야 가능하다. 현재 브랜치만 생성하고 배포하지 않았다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-14 | 대상 범위 | 요청 URL의 정규 리그 일정에만 전체/내 팀 컨트롤 적용 |

## Progress Snapshot
- [x] 최신 origin/dev fetch 및 feat/league-schedule-filter worktree 생성 (792042b7d).
- [x] 지침/현재 v1 계약 및 디자인 참조 확인.
- [x] 구현
- [x] 로컬 검증
- [ ] alpha QA

### Validation / Handoff (2026-10-14)
- 구현: `LeagueScheduleContent`를 정규 리그 bracket에 연결. 소속 팀은 기존 `/me/teams`, 경기 데이터는 기존 커서 페이지를 모두 합쳐 사용. 필터는 그룹/live 분리 전에 적용.
- 관련 기존 테스트 111/111 PASS, 전용 14/14 PASS (총 125개). 실제 query 및 navigation 경계를 제외한 렌더·링크·필터 동작 사용. 최종 fixture의 resultState/outcome 타입도 서버 계약에 맞춤.
- `pnpm --filter v1_web lint`의 tsc 단계 PASS. POSIX find/grep 기반 패턴 단계는 Windows cmd에서 실행 실패하여, process-local ComSpec/PATH를 Git Bash로 지정해 동일 `v1-pattern-check.mjs` 재실행 PASS. 저장소 설정 변경 없음.
- `git diff --check` PASS, touched code TODO/FIXME/HACK/XXX 없음. 신규 import 파일·전용 테스트·changeset·task·scenario 모두 작업트리에 존재. 미커밋 상태이므로 committed-tree/PR-ready 또는 배포 완료라고 하지 않는다.
- 공개 alpha API로 사용자 대상 엔티티 kind=regular_league / format=group_knockout / status=in_progress 및 health db=true 확인. 특정 식별자는 이 문서에 저장하지 않음.
- Alpha before/after 390/768/1440 및 로그인·console/network **미검증**. 브랜치 미배포, 브라우저 연결 2회 모두 sandbox 초기화 오류. [시나리오 및 blocker](../../docs/scenarios/league-schedule-team-filter.md).
- 변경 외 shared-tree WIP·운영 데이터 수정 없음. 테스트·검사 종료, 로컬 서버/브라우저 탭 생성 없음.

### Local UI preview (2026-10-16)
- User selected the proposed inline `내 팀만` switch and explicitly requested local preview without deployment; this session uses local runtime as the requested exception to alpha-only QA.
- Owned files: league-schedule-content.tsx and its existing test. Separate worktree: `_worktrees/bracket-my-team-switch`, branch `preview/bracket-my-team-switch`, base e89556ad7.
- Replaced two segmented tabs with a title-row switch using shared tm-toggle tokens. Existing membership filtering, URL/history, login and error states remain. Confirmed nonparticipants see no switch in all mode; an existing mine URL still offers recovery.
- Browser automation unavailable: sandbox initialization error. Opened the requested localhost page through the OS browser handler. Local compilation initially failed because shared installed dependencies were stale; installing frozen dependencies in the isolated worktree.
- No commit, push, merge, deployment, or data mutations. Visual viewport verification remains pending.
- Final local check: isolated frozen install completed using WSL virtual store `/tmp/teameet-bracket-switch-deps`; focused suite 14/14 PASS, route GET 200. Preview server left running on port 3014 at user request; OS default browser opened to the requested route. Browser screenshot/viewport validation was not possible because the browser control kernel could not initialize. Next generated next-env.d.ts now points to its dev route types.
- Follow-up: removed the duplicate schedule heading and the generic regular-league standings heading (retained meaningful division labels). Moved the membership switch beside the phase chips in one toolbar, with the game count beneath. Phase chips scroll horizontally on narrow screens. Login/error/empty states retain the switch so the user can return to all games.
- Follow-up validation: schedule/league suites 68 tests PASS; bracket suite 42 tests PASS after updating assertions for the intentionally removed heading. Total 110 tests PASS. Local route GET 200. Browser-control retry still fails at sandbox kernel initialization, so viewport screenshots remain unverified. No deployment.
- Runtime error follow-up: observed upstream alpha 503 from fetchPublicV1 and then browser hydration mismatch in the standings heading. Upstream recovered to 200. Local server restarted with WATCHPACK_POLLING=true for Windows edits. Regular-league standings now defer browser-only query-cache data until hydration, keeping initial headings, rows and loading state consistent. Added real rendered-HTML comparison for cold server vs populated browser cache: RED before fix, GREEN after; bracket suite 43/43 PASS. No deployment.
- Additional cause confirmed: sw-push.js caches /_next/static assets for 7 days; localhost development chunk URLs stay stable, so the browser kept executing a prior bundle after server rebuilds. Used a temporary localhost-only page to unregister this origin's SW and clear only teameet-static-* caches, preserving localStorage/cookies. Reopened bracket: GET 200 and no new browser hydration error observed in server logs. Removed the temporary refresh page after use; old build cache retained under tmp/bracket-next-cache-before-hydration. Final bracket suite 43/43 PASS.
- PR preparation: user explicitly requested PR creation only. v1_web lint (tsc --noEmit + pattern checker) PASS; focused suites total 111 tests PASS; diff whitespace/debt checks PASS. Added patch changeset. Commit scope excludes generated next-env.d.ts and local cache/runtime files. Base is dev; no merge or deployment authorized.


## 배포 및 최종 실측 (2026-10-19)
- PR #1996/#1998 dev 머지 완료. 후속 merge SHA 4daf51a3bc503f89d3004b49d0f96f23482a797f, CI 39261076773 및 Deploy Alpha 39261076753 success. 공개 release SHA 일치, DB health true.
- 관련 로컬 테스트 116/116, Linux 전체 Web/API/Gates PASS. 사용자 명시 승인으로 이번 Copilot 서비스 장애 리뷰 게이트 예외 적용.
- 실제 참가팀 owner, 390/768/1440: 내 팀만 유지 상태에서 전체 5/조별 3/결선 2 확인. 새로고침 시 두 상태 복원, 스위치 해제 시 결선 유지. 소속 조 빨강 rgb(240,68,82), 별표 제거, overflow 없음.
- 새 pageerror 없음. before/after 동일한 기존 이미지 최적화 400, 로그인 전 auth/me 401 기록. QA 소유 브라우저 종료 완료.
- 사용자가 로그인 QA 화면의 공개 GitHub 게시를 명시 승인. screenshots와 재현 도구는 이 QA 증거 브랜치에 보존하고 PR #1998에 SHA 고정 갤러리 게시.
