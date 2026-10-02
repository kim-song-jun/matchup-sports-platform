# Task 198: 선택 날짜의 빈 일정 안내 범위 (#1547)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
기존 일정이 있는 실제 alpha 팀에서 10/8 결과0을 ‘아직 등록된 일정/첫 일정’으로 안내한다.10/4 일정1건과 필터 해제10건은 기존 데이터가 있다는 대조군이다. 데이터 소실/날짜 필터 오류는 관측하지 않았다.

## Goal
유효한 날짜 선택/종류·상태 필터의 부분 빈 상태와 필터 없는 최초 빈 상태 문구를 구분한다.

## Original Conditions (must all be satisfied)
- [x] fetch 직후 origin/dev 독립 worktree/전용 브랜치, 다른 미병합 코드를 섞지 않는다.
- [x] 선택 날짜0은 해당 날짜의 빈 결과와 다른 날짜/날짜 필터 해제 행동을 안내한다.
- [x] 필터 없는 전체0의 기존 등록 안내·역할별 CTA와 일정 있는 날짜·해제 목록을 유지한다.
- [ ] 초점/관련 회귀·lint·필수 검사·명시 pathspec·Ready/base dev PR·exact head CI·독립 리뷰를 기록한다.
- [x] 실제 alpha before6장의 프레임/행동 근거와 after 승인 배포 대기를 구분한다.

## User Scenarios
- 일정 있는 팀원이 빈 날짜를 선택하면 다른 날짜/날짜 필터 해제를 안내받는다.
- 날짜를 해제하거나 목록 탭으로 바꾸면 날짜 필터가 적용되지 않은 결과를 확인한다.
- 종류/상태 조회의 결과0은 현재 조건의 빈 상태이며 최초 등록 안내로 보이지 않는다.

## Test Scenarios
### Happy path
- [x] 실제 client→calendar/page에서 일정 있는 날짜→빈 날짜→필터 해제.
### Edge cases
- [x] owner/manager/member, 목록 전환·연속 날짜 선택·전체0/선택일0·종류/상태0.
### Error paths
- [x] loading/error가 빈 성공 문구보다 우선하며 실제 재시도 유지.
### Mock data updates needed
- schema/API 변경 없음. 실제 V1TeamScheduleSummary와 고정 Date 경계 fixture를 사용한다.

## Parallel Work Breakdown
### Frontend
- [x] 사용자 고정 최소 copy/state 분기만 기존 client에 적용한다. 새 layout/컨트롤·필터/history/date 알고리즘을 만들지 않는다.
### Read-only evidence
- [x] 독립 담당자가 고정 원본9사진+proof 중 해당6장·선택상태/행동 연결을 확인했다.
### Sequential
- [ ] 초점 RED→GREEN/관련3suite·lint·6gates·Changeset·4pathspec commit/push·Ready PR·exact head CI/리뷰.
- [ ] 승인된 alpha 배포 뒤402→787→1180 날짜/문구·필터해제·목록·역할·실제keyboard/console/network/after 기록.
### Owned / Forbidden files
- Owned: `apps/v1_web/src/components/team-schedules/team-schedules-client.tsx`, 새 `team-schedules-empty.test.tsx`, 이 문서, `.changeset/schedule-empty-date-copy.md`.
- Forbidden: shared styles/shell/hooks/types/API/DTO/schema, #1546/1533 및 다른 worktree, 실제 일정/참석/경기 결과/권한/배포.

## Acceptance Criteria
- [x] 날짜 선택이 유효한 calendar view에서 날짜 copy, 종류·상태 조건0에서 조건 copy, 그 외 최초 empty copy로 명확히 구분한다.
- [x] 기존 query/limit/date grouping/list items/CTA 권한/loading/error/Back 경로를 유지한다.
- [ ] 실제 렌더·조작과 committed tree/원격결과를 증명하고 로컬 PASS를 실제 alpha3폭 전체 QA로 확대하지 않는다.

## Tech Debt Resolved
부분 빈 결과를 처음 등록하라고 안내하던 고정 copy를 현재 조회 범위에 맞춘다.

## Security Notes
표시 문구만 변경한다. API/DTO/권한/상태 gate·저장/참석/결과/QA179 변경0회. 비밀정보/환경 파일을 읽거나 공개하지 않는다.

## Risks & Dependencies
- actual before commit `f36abbb8838ae865b782698c0bd91910fe78fd24`, `docs/qa/2026-10-02-calendar-readonly`; UTC2026-10-02 11:02:06.453–11:04:54.850, 최종해제11:15:41.161.
- CSS402×606(JPEG402×605)/787×505/1180×757. mobile Oct8 및 desktop 선택 사진에는 문구가 아래이며 clear사진은 문구만, tablet 선택날짜는 DOM보완이다. 전체10건과 최종복구는 행동기록이며 별도 사진이 아니다.
- 원본9/9 bytes/SHA/Gitblob/raster/픽셀 PASS, 이슈별6장 URL 매핑 PASS. proof31,316B/SHA ea15cda0…/blob7832dbde…; 독립 artifact `/tmp/teameet-1546-1547-evidence-agent-fmrtfytt`.
- serving SHA/브라우저 버전/물리기기/스크린리더·전체시간대/필터 정확성·오류/로딩·다른 역할·create/edit/delete/참석은 before에서 미검증. after 승인 배포 대기.
- #1456 시간대/월말/연말 AC 및 #1546 진입, #1533 리그 필터 history는 별도 범위다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 전체0 판단 | 서버 items는 현재 종류/상태 조건의 한 페이지다. 필터0을 전체 팀0으로 단정하지 않고 조건 copy로 안내 |

## Progress Snapshot
- base `d4c7cfd990370f7af7e175849e69db4a9ca9406c`; worktree `/tmp/teameet-issue-1547-20261002`; branch `fix/issue-1547-schedule-empty-date-copy`.
- 기존 PR 중 동일 copy 수정 미발견. 현재 source는 selectedDate 필터 후에도 고정 first-copy를 사용한다.

- 새14 RED8 FAIL/6 PASS→제품 copy 분기 후 관련3suite78 PASS(새14+기존64). 기존 create 링크가 desktop와 EmptyState에2개임을 반영해 assertion은 queryAllByRole로 바로잡았다. Date만 고정하며 실제 async timers는 유지해 날짜 의존 fixture를 피했다.
- lint(typecheck+pattern),6aggregate,patch Changeset,diff whitespace/markers PASS. host12cores/load10.67/36.05/52.80,swap191.81MB/Node21/browser0,alphaHEAD200; Docker직전4s 읽기timeout. 직렬 최소worker, local Next/browser/전체test/build 실행0회.
- 명시4pathspec committed-tree/원격 CI/독립 리뷰는 PR 기록에 보충한다. actual alpha3폭/keyboard/console/network·동조건 after는 승인된 배포 뒤 대기. #1547 OPEN/Refs/Ready/dev, 실제 일정·참석·결과/QA179 변경0회.
