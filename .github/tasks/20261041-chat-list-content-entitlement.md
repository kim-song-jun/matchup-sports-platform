# Task 20261041: 채팅 목록 내용 조회의 현재 권한 재검증

Status: In Progress
**Owner**: root → backend-data-dev
**Created**: 2026-10-08

## Context
기존 PR [#1653](https://github.com/kim-song-jun/matchup-sports-platform/pull/1653)의 dev 머지 뒤 [정식 리뷰 5450911328](https://github.com/kim-song-jun/matchup-sports-platform/pull/1653#pullrequestreview-5450911328)에서 실제 ChatService.rooms를 호출한 권한 철회 회귀가 확인됐다. key 조회에는 현재 도메인 권한·active participant·status·플랫폼 방 조건이 있지만 두 번째 내용 조회에는 id 조건만 있다. 두 조회 사이 권한이 철회되면 새 메시지 미리보기와 방 제목을 돌려줄 수 있다. QA tracker 원본 IAB 연결은 root에 없어 신규 리포트 여부·선점·댓글 표시를 확인할 수 없다. 새 tracker 티켓은 만들지 않는다.

## Goal
두 번째 내용 조회에도 동일한 현재 접근 조건을 적용해 철회된 방의 내용을 반환하지 않고 정상 목록·정렬·커서 계약을 유지한다.

## Original Conditions
- [x] v1 ChatService의 가장 작은 올바른 수정으로 같은 seam의 모든 roomType을 보호한다.
- [x] 실제 서비스 호출의 실패하는 회귀 → GREEN 및 정상 대조군을 증명한다.
- [x] 최근 dev에서 별도 feature branch로 작업하고 기존 머지 branch에는 push하지 않는다.
- [ ] 최신 committed head 독립 리뷰, base dev PR, 기존 #1653 리뷰 답변까지 진행한다.
- [x] alpha 실측·DB 동시성 검증·tracker 읽기/댓글과 코드 검증을 구분한다.

## User Scenarios
1. 채팅 목록 key 조회 직후 팀 membership 또는 운영 권한이 철회되면 해당 방의 제목·새 메시지 미리보기를 받지 않는다.
2. 두 조회 사이 퇴장 또는 방 보관이 발생하면 내용 응답에 그 방을 포함하지 않는다.
3. 정상 권한 사용자는 기존 null-lastMessageAt 정렬, 페이지/커서, 메시지 visibleFromAt 및 플랫폼 빈 방 정책을 유지한다.

## Test Scenarios
### Happy path
- [x] 실제 ChatService.rooms 정상 DTO 대조군.
- [x] 기존 팀 컨택·목록 계약 관련 좁은 스펙.
### Edge cases
- [x] key 조회 후 membership/ops 권한 철회.
- [x] participant 비활성화, room status 변경, 플랫폼 목록 조건 변경.
- [x] 중간 필터링 또는 모든 선택 행이 사라지는 페이지와 null-message 커서.
### Error paths
- [x] 실제 Prisma 조회 실패를 성공 fallback으로 숨기지 않는다.
### Mock data updates needed
- [x] 새로운 API shape/schema는 없으며 필요한 query-contract/fixture만 같은 변경에서 맞춘다.
- [x] PostgreSQL integration이 필요한 경우 CI로 남기고 로컬 DB 성공을 주장하지 않는다.

## Parallel Work Breakdown
### Backend — Phase A
- [x] backend-data-dev 단독: ChatService 내용 조회, 회귀 스펙, chat API 문서, v1_api patch Changeset.
- Owned: apps/v1_api/src/chat/chat.service.ts, apps/v1_api/src/chat/chat.service.rooms-entitlement.spec.ts, docs/api/domains/chat.md, .changeset/chat-list-content-entitlement.md
- Forbidden: UI/hooks/types/MSW/DTO/schema/migrations, 다른 task/state, 기존 타인 WIP.
### Sequential — Phase B
- [x] root 검수·직렬 좁은 검증·필요 타입 검사.
- [x] 독립 backend reviewer, 실제 finding 수정·재리뷰 (intended diff; committed head 확인 별도).
### Sequential — Phase C
- [ ] root 최신 dev drift 검수, explicit pathspec commit, committed-tree 확인, feature push/base dev PR/attach.
- [ ] 최신 head 리뷰·CI·기존 #1653 리뷰 답변.
### Sequential — Phase D
- [ ] 실제 dev 머지는 기존 dev-pr-5 또는 사용자에게 맡긴다.
- [ ] 머지·배포 후 실제 로그인 권한 철회 시나리오와 viewport QA. 기존 담당 QA와 중복하지 않는다.

## Acceptance Criteria
- [x] 권한 철회 시 실제 반환 DTO에 방과 메시지 미리보기 없음.
- [x] status·participant·entitlement·platform 조건 유지 및 페이지 전진의 일관성.
- [x] RED/GREEN의 원인이 실제 접근 계약이며 구현을 그대로 복제한 테스트가 아님.
- [ ] committed diff 범위와 미추적 import, whitespace, touched TODO/FIXME/HACK/XXX 확인.
- [ ] 독립 리뷰 최신 head FindingsNone, 실제 미해결 finding 0.
- [x] API 문서·Changeset sync, schema/DTO/UI 변경 없음.
- [x] alpha/DB/tracker 미검증 한계 명시, 완료·영구 첨부 삭제 없음.

## Tech Debt Resolved
현재 접근 where를 key/content 조회에 일관되게 유지한다. 실제 query-contract 회귀를 저장소 검증에 남긴다.

## Security Notes
현재 chat participant 행이 남아 있어도 membership/운영 권한 철회를 내용 조회에서 반영한다. 서버의 인증·visibleFromAt·메시지 차단 및 도메인 entitlement 규칙을 우회하지 않는다.

## Risks & Dependencies
- root 인증 IAB 연결 unavailable: 원 tracker 최신 내용·선점 UI·댓글 표시·직접 alpha 검증 불가.
- 로컬 Docker daemon pipe 없음: 실제 PostgreSQL 동시성 검증은 CI/배포 후 별도 증거가 필요하다.
- 기존 dev-pr-5가 #1652~#1655 실제 리뷰·QA 진행 중. 코드 수정은 이 task가 단독 소유하며 해당 브라우저 시나리오는 중복하지 않는다.
- 최신 dev baseline ae8bf32a5cc15fe8234bb9244cdb35edb5d6afd1; PR 직전 다시 fetch/통합한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-08 | root | 타인이 이미 동일 소스를 수정 중인가 | 18 등록 worktree의 chat source WIP 0, 관련 feature branch 없음, 열린 dev PR 0을 확인했다. 새 변경이 보이면 중복하지 않고 재대조한다. |
| 2026-10-08 | root | skill의 신규 도구/전체 suite 지시 | 사용자 v1 기존 NestJS/Prisma/Jest 및 최소 검증 지시가 우선. root commit/push/PR은 이미 승인됨. |

## Progress Snapshot
- Canonical task: .github/tasks/20261041-chat-list-content-entitlement.md
- Root automation/run: 5-pr-qa / 2026-10-08-heartbeat-0313
- Worktree: C:/Users/kinso/.codex/worktrees/mdqa-chat-entitlement-content/matchup-sports-platform
- Branch: fix/mdqa-chat-content-entitlement
- Base: origin/dev @ ae8bf32a5cc15fe8234bb9244cdb35edb5d6afd1
- Existing finding: PR1653 / review5450911328 / P2 current content-query entitlement gap.
- Phase A COMPLETE; B intended/committed source diff PASS; C PR publication COMPLETE, latest-head review/CI IN_PROGRESS; D actual alpha PENDING.
- 실제 서비스 RED: 21건 중 12 FAIL / 9 PASS. 정상 대조군은 통과하고 권한 철회 뒤 실제 DTO 미리보기 반환을 재현했다.
- 최종 GREEN: 21/21 PASS (8.554초), 기존 관련 3 spec 26/26 PASS (10.106초). 증거는 own ignored tmp/qa/mdqa-chat-entitlement-content/의 red-assertions.log, phase-b-green.log, existing-chat.log 및 phase-b-fixture-result.json.
- 독립 intended review: Critical0 / Warning0 / FindingsNone. 컨택 expiresAt 날짜와 플랫폼/일반 팀 FK 관계 fixture 지적 2건을 수정하고 재검수했다. 독립 committed review도 source SHA 7ce55ece309a4d84f698a4004579a4549b7a8e4a의 5-file 경계와 동일 source/spec blob, clean status, diff check에서 FindingsNone을 확인했다. 문서 진행 갱신 후 최신 PR head를 다시 확인한다.
- API tsc --noEmit PASS 1회. 정본 surface checker도 GNU find PATH에서 616개 파일 스캔 PASS. 최초 pnpm launcher의 .pnpm 누락과 Windows find 오류는 원인별 로그로 보존하며 검증 성공으로 숨기지 않았다. 게이트 소스는 변경하지 않았다.
- read-only 기존 dependency runtime은 source lock/schema hash가 같고 generated client에는 채팅과 무관한 V1TeamMatch unique selector 1건 차이가 있다. shared dependency는 변경하지 않았으며 canonical Prisma 생성은 CI에서 확인한다.
- 실제 PostgreSQL 동시성·alpha·tracker 최신 읽기/선점/댓글: 미검증. DB daemon/IAB blocker를 보존하며 원 QA 종료 준비로 판단하지 않는다.
- Published dev PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/1658 (OPEN, 수정 PR 생성, 머지 대기). Source commit: 7ce55ece309a4d84f698a4004579a4549b7a8e4a. root feature push와 PR attach 완료. merge/main promotion: 0. 최신 문서 갱신 head/리뷰/CI/merge cursor는 원 checkout ignored state.json에서 함께 추적한다.
