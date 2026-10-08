# Task 20261046: MD-QA #45 팀 일정 목록·캘린더 복귀 상태 보존

Status: In Progress
**Owner**: root → frontend worker
**Created**: 2026-10-08
**Report**: https://teameet.jmandu.kr/issues/45/

## Context
팀 f39f5962-38e9-4a41-9553-6156924c56d1 일정 목록에서 훈련·예정 선택 후 상세 c57b2eef-abfc-43dd-a867-a60a08a19e6c를 보고 header Back하면 전체·전체로 초기화된다. 캘린더10월10일 선택 후 browserBack도 목록으로 초기화된다. 원문·재현·댓글0 확인. 실제 unassigned/open과 canonical task·branch·열린devPR/활성agent를 교차 확인, 중복 없음. Root UI선점 성공 toast/김성준·확인 중 표시 확인. #26 /my/schedule 복귀 수정과 다른 팀 일정 경로.

## Goal
현재 팀 일정 목록의 종류·상태·보기·월·선택 날짜를 안전한 URL/local draft 계약으로 보존하고 실제 상세/뒤로가기 흐름으로 검증한다. 개인 일정/알림 상세 복귀 경로는 유지한다.

## Original Conditions (must all be satisfied)
- [x] 원문·최근 댓글·실제 선점·중복 진행 확인.
- [ ] 실제 결함 확인 및 가장 작은 수정.
- [ ] 좁은 RED→GREEN, 독립 리뷰, 커밋 검증, dev PR·기존 리포트 댓글.

## User Scenarios
- 훈련·예정 선택 → 실제 일정 카드 상세 → headerBack 또는 browserBack → 조건 유지.
- 캘린더·다른 월·유효 선택 날짜 → 상세 → 복귀 → 동일 보기/월/날짜 유지.
- 빠른 연속 조건 변경, 잘못된 URL 조건·날짜, 직접 상세 진입, 내 일정/알림에서의 from, empty/error retry를 현재 계약대로 처리.

## Test Scenarios
- 실제 TeamScheduleListPageClient/view 링크 → detail backHref → remount state와 useV1TeamSchedules 전달 필터를 검증한다. 가능하면 real query + HTTP MSW로 actual route contract RED→GREEN.
- Invalid params/date/month는 유효 기본값, stale router query overwrite 방지 local draft, 화면 내 즉시 연속입력 검증.
- query failure는 실제error/retry 보존; fake success/mock completed 금지.
- 기존 권한·관리/create·개인 일정/알림 복귀 테스트 유지.

## Parallel Work Breakdown
- Frontend implementation Owned: apps/v1_web/src/components/team-schedules/team-schedules-client.tsx; 새 team-schedules-return.test.tsx. 필요 시 team-schedules.view-model.ts/.types.ts 및 기존 team-schedules test의 router mock 최소 sync는 root exact범위 사전승인 후.
- Forbidden: API/DTO/schema, shared hooks/use-v1-api.ts/types/api.ts/MSWhandlers/providers/session lib, 다른 route/UIstyle/shared files/WT/state, .env. Root task/Changeset/Git/PR/SSOT/브라우저 근거 소유.
- 혼자가 아니다. 타인 변경 되돌리기/자체 stage·commit·push 금지. 좁은 검증1worker serialslot root승인 후. 서버/fullsuite/build/DB생성 금지.

## Acceptance Criteria
- [ ] 팀 일정 종류·상태·캘린더·월·날짜 상세복귀보존과 rapidchange 안전성.
- [ ] 기존 직접진입·개인일정·알림 from/권한·오류 계약 유지.
- [ ] actual RED→GREEN, independent latesthead OK/FindingsNone, committed scope/test/type/pattern 검증.
- [ ] base dev PR + original45 comment save/display proof.
- [ ] alphaBefore/After와 viewport·servingSHA 한계 별도 기록.

## Tech Debt Resolved
팀 일정 local-only 탐색 상태의 유실을 실제 route/from 계약으로 정리한다. UIstyle변경 없음, 기존 DESIGN.md와 v1토큰 유지.

## Security Notes
from은 기존 sanitizeRedirectPath로 제한하며 URL조건은 allowlist. 인증/참석/관리 권한과 저장 동작은 수정하지 않는다. 실제 사용자 일정 편집 없음.

## Risks & Dependencies
managedWT는 fetch직후 origin/dev5948dfd6 기준. 다른 독립PR/peerQA 진행 중; root가 Git통합/드리프트 검수. 실제 alpha after는 dev머지/배포 대기. UI보기를 바꾸는 rootQA는 readonlynavigation만.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | Report45 | 기존26중복/회귀? | 개인 내 일정 vs 독립 팀 일정 경로, 현재소스와 PR확인중복없음. |

## Progress Snapshot
- Absolute WT C:/Users/kinso/.codex/worktrees/mdqa-45-team-schedule-return/matchup-sports-platform; branch fix/mdqa-45-team-schedule-return; base5948dfd6b69e5f62a0e6c8f9f2de1ae38f7abf97.
- Root original checkout evidence tmp/qa/mdqa-assigned-monitor/2026-10-08-heartbeat-0550/report45-before/claimed.txt,png.
- Initial source TeamScheduleListPageClient sets all/list/currentmonth/null selection with local useState; links don't capture state. Worker actual contract investigation/RED→fix in progress. No PR yet.
### Implementation checkpoint — 2026-10-08 16:18 KST
- Actual TeamScheduleListPageClient의 5개 local state·bare detail href 원인 확정. URL allowlist/date validation + ref draft/native replaceState + 안전한 from 상세 경로로 최소 수정.
- Worker scope 추가 승인: 기존 team-schedules-empty.test.tsx의 실제 카드 href와 native history 격리만. API/hooks/types/MSW/개인 상세 구현 변경 없음.
- Actual HTTP/client/view RED: 14건 중9 FAIL/5 PASS → GREEN return14+empty14+기존route29 =57/57 PASS(13.54s,1worker).
- Root alpha before: 실제 E2E관리자/1280×720/팀f39f.. 일정c57b.. 훈련·예정→header Back 전체·전체, 캘린더10/10→browser Back 목록으로 초기화 모두FAIL. report45-filter/header-back/calendar/browser-back-before 파일. 실제 데이터 저장·신청·삭제 없음.
- task/Changeset/source/spec explicit commit 후 최신dev통합·committed 타입/패턴/좁은회귀·exacthead독립리뷰·PR·댓글 이어 진행. alpha after는 수정SHA배포 전pending.

- Independent review a19250 actual findings: 초기 bare 또는 shared-filter-no-month entry와 카드 from 강제 month가 달라 actual AppBackLink가 replace하여 이전 목록 이력 중복. 신규 실제 installNavigationHistory/native history2cases RED2 FAIL → GREEN 관련 return16+empty14+route29=59/59. from을 동일 team의 실제 live entry/query/hash에 맞추고 SSR queryString 유지, 선택/local draft/native replace 계약은 보존.
- Test typecheck11 errors(getByRole/findByRole exact:true) 제거. 해당 API의 기본 exact string 의미는 유지. 신규 href non-null assertion은 typed HTMLAnchorElement로 제거하고 path/from assertion 유지.
- Root의 이전 committed14 PASS 뒤 tsc FAIL을 성공으로 표시하지 않음. 해당 test-only 타입 실패와 실제 리뷰 findings를 수정한 새 HEAD에서 committed tsc/pattern/독립 리뷰를 다시 수행해야 함. alpha after는 여전히 pending.