# MD-QA #141 일반 팀매치 경기 규칙 설정

Status: In Progress

## Context
기존 리포트 https://teameet.jmandu.kr/issues/141/ 의 일반 팀매치 단판·전후반 설정 부재를 조사한다. root가 김성준 담당·확인 중을 실제 UI에서 확인했다. 현재 DTO에는 해당 입력이 없고 생성 시 종목 기본 immutable config version을 pin한다.

## Goal
최신 직접 사용자 선택 B: 경기 규칙 설정을 별도 화면으로 분리한다. 이전 A 선택은 B로 대체한다. 저장된 설정을 실제 Game/운영 콘솔이 사용하고 기존 종목·경기를 유지한다.

## Original Conditions
- [x] 2026-10-13 최신 직접 사용자 B 선택으로 A 대체
- [x] 관리형 전용 worktree/feature branch, origin/dev 9e3d596629ca350e5a12ac38a06ab42fff14713f
- [ ] 단판/전후반 저장·읽기 계약과 상태/권한/종목 제약 고정
- [ ] 실제 RED→GREEN·독립 리뷰·dev PR·기존 댓글

## User Scenarios
일반 팀매치 생성·수정 여정에서 별도 규칙 화면을 열고 지원 종목의 단판/전후반을 선택한다. 저장·복귀·재조회 후 같은 설정이 표시되고 운영 콘솔이 pinned config를 사용한다.

## Test Scenarios
- Happy: 별도 규칙 화면의 선택이 생성/수정 payload, pinned version, 상세와 콘솔에 일치한다.
- Edge: 뒤로가기/재진입, 기존 경기 호환, 지원 종목 전체, immutable config reuse를 확인한다.
- Error: 권한·완료/진행 경기 보호·지원하지 않는 설정·저장 실패를 노출하고 가짜 성공/빈 경로를 만들지 않는다.
- Mock: 실제 controller+DTO+service+hooks/type/MSW를 대조한다. 모델을 임의 변경하거나 mock만 성공시키지 않는다.

## Parallel Work Breakdown
Phase A readonly technical plan: v1 existing config version, general team-match create/edit, league custom-config reuse, console pin 계약을 조사해 실행 가능한 최소 범위를 root에게 전달한다. source/Git/tests/browser/공유문서 변경 Forbidden.
Phase B 단일 shared-contract owner: DTO/service/config resolver 및 hooks/types/MSW/API docs에 필요 변경을 선행한다. Phase C 그 뒤 별도 규칙 UI owner: 독립 routes/components. 같은 shared 파일은 중복 소유하지 않는다. root는 task/Changeset/Git/통합/직렬 검증/PR/브라우저를 소유한다. 별도 독립 reviewer가 적대적 검증한다.

## Acceptance Criteria
- Server optional `periods: [{ durationMinutes: number }]` accepts one/two periods with nested validation; omitted create keeps default and omitted edit keeps current pin. No UI-only serialized rulesText substitute.
- Rule-options read verifies active host owner/manager and returns actual same-sport defaults. Custom versions use a separate team-match lineage, never publish into `${sportCode}-v1` global default; immutable same-sport/content hash reuse and collision handling preserve non-period sections.
- Rule edit locks Game then TeamMatch and rechecks version/permissions/lifecycle. Real source-created revision-1 DRAFT roster is retained; submitted/locked/historical gameplay, periods with start/end/pause, events/results and LIVE/PAUSED/ENDED deny repinning.
- Create inserts `/team-matches/new/rules` between condition and place-time; edit uses `/team-matches/:id/edit/rules`, with entity/version-scoped draft and one final existing POST/PATCH. Existing console consumes pinned duration response, no new shared realtime protocol.
- B 별도 규칙 화면이 실제 생성·수정 여정에 연결되며 선택값은 실제 서버 저장에 반영된다.
- immutable config pin과 기존 경기·종목·상태·권한 계약을 보존한다.
- 실제 실패 회귀와 GREEN, committed tree/type/lint, 최신 head FindingsNone을 기록한다.
- alpha 배포 SHA에서 screenshot/console/network/viewport를 검증하기 전 runtime/시각 완료로 표시하지 않는다.

## Tech-Debt Resolved
조사 중. UI false affordance와 config/type/MSW drift를 같은 범위에서 정리한다.

## Security Notes
host/team owner-manager 권한과 운영 콘솔의 별도 권한을 보존한다. 과거 경기 config를 소급 변경하거나 실제 개인정보·비밀을 읽지 않는다.

## Risks & Dependencies
기존 리그 설정을 일반 팀매치에 복사해 중복 config 엔진을 만들지 않는다. API contract 선행 후 UI 구현. #134/#135 콘솔 shared hook 소유권과 충돌하지 않게 명시적 도메인별 범위를 고정한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-13 | user | A inline 또는 B 별도 화면 | 최신 B 선택. A는 superseded |
| 2026-10-13 | root | config version 저장 방식/종목별 제약 | Phase A 현재 v1 조사 중 |

## Progress Snapshot
- Phase A readonly technical plan complete on9e3d596: existing schema supports immutable pin/period changes, no initial migration. Pure normalizer/validator/hash and version publication may be factored from tournament implementation, but admin-only endpoint/registry permission must not be reused for ordinary hosts. Single API shared owner prepares genuine DTO/service RED using real DRAFT source aggregate before production edits; frontend shared contracts follow frozen API, then one UI owner handles shared create/edit component. Root retains docs/Changeset/Git/tests/PR/browser.
- 2026-10-13 root: 관리형 생성/등록·feature branch 완료. 최신 B로 계약 계획을 시작한다. 구현/회귀/PR/alpha NOT RUN.
