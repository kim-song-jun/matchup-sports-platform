# Task 20261081: 리그 경기 일정 전체/내 팀 필터

Status: Review (local validation passed; alpha QA pending)
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
