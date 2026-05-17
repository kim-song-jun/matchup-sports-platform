# SM New DB v1 Next Stage Plan

## 1. Status

```text
Status: planning handoff
Created: 2026-05-17
Source decision doc: docs/reference/sm-new-db-v1-table-decision-checklist.md
Scope: next planning gates after DB v1 table decisions
Not for: Prisma migration, Nest endpoint contract, DTO finalization, frontend implementation
```

이 문서는 `sm-new-db-v1-table-decision-checklist.md`에서 31개 core table 결정을 완료한 뒤,
다음 단계에서 어떤 문서를 어떤 순서로 작성해야 하는지 고정한다.

현재 완료된 것은 "DB v1에서 어떤 테이블을 core로 둘지"와 "각 테이블의 목적, 상태, 권한, audit,
API 영향"이다. 아직 완료되지 않은 것은 화면 액션 목록, 상태 전이표, 권한 매트릭스, ER v2,
API surface map, DTO/error/status 계약이다.

## 2. Files Considered

이번 계획은 아래 현재 파일들을 기준으로 작성한다.

### Primary SM New API/DB files

- `docs/reference/sm-new-api-db-baseline.md`
- `docs/reference/sm-new-db-v1-table-decision-checklist.md`
- `docs/reference/db-erd-overview.md`
- `docs/reference/db-table-definition.md`
- `docs/reference/team-design-first-design-db-plan.md`

### SM design baseline and handoff files

- `docs/reference/handoff-sm-new-direction/0502-design-freeze-brief.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/MODULE_MAP.md`
- `docs/reference/handoff-sm-new-direction-review.md`
- `docs/reference/handoff-sm-new-direction-progress-review.md`
- `docs/reference/handoff-sm-new-direction/INDEX.md`
- `docs/reference/handoff-sm-new-direction/HANDOFF.md`
- `docs/reference/handoff-sm-new-direction/DIRECTION.md`
- `docs/reference/handoff-sm-new-direction/ANALYSIS.md`
- `docs/reference/handoff-sm-new-direction/SYSTEM_CANDIDATE.md`
- `docs/reference/handoff-sm-new-direction/SECTION_UNIFICATION_MATRIX.md`
- `docs/reference/handoff-sm-new-direction/SOURCE_PROTOTYPE_PARITY.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/INTERACTIONS_AND_STATES.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/CASE_COVERAGE_MATRIX.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/COMMON_FLOWS.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/COMPONENT_CATALOG.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/PROTOTYPE_INVENTORY_FIX29.md`
- `docs/reference/handoff-sm-new-direction/prototype-system/CANONICAL_ID_MAP_FIX32.md`

### Scenario and task status files

- `.github/tasks/81-sm-new-direction-0502-freeze.md`
- `docs/scenarios/index.md`
- `docs/scenarios/01-auth-and-session.md`
- `docs/scenarios/02-home-and-discovery.md`
- `docs/scenarios/03-match-flows.md`
- `docs/scenarios/04-team-and-membership.md`
- `docs/scenarios/05-team-match-flows.md`
- `docs/scenarios/07-chat-and-notifications.md`
- `docs/scenarios/09-payment-review-badge.md`
- `docs/scenarios/10-profile-settings-admin.md`
- `docs/scenarios/11-team-and-venue-hubs.md`

### Reference-only implementation evidence

- `apps/api/prisma/schema.prisma`
- `docs/api/`
- `apps/api/src/`
- `apps/web/src/`

위 reference-only 파일들은 현재 구현 상태와 drift를 확인하기 위한 증거일 뿐, SM New 요구사항을
덮어쓰는 기준으로 쓰지 않는다.

## 3. Current Decision Summary

DB v1 core table decision은 완료 상태다.

```text
Identity/Auth: 4/4 Done
Terms/Master: 5/5 Done
User Preference/Home: 4/4 Done
Personal Match: 3/3 Done
Team: 5/5 Done
Team Match: 2/2 Done
Chat/Notification: 5/5 Done
Payment/Support: 0/0 Deferred
Admin/Audit: 3/3 Done
Total: 31/31 Done
```

핵심 방향은 다음과 같다.

- v1은 개인 매치, 팀, 팀 매치, 매치 연결 채팅, 인앱 알림, 공지, 관리자/audit를 core로 둔다.
- v1 결제는 제외한다. `payments`, `payment_attempts`, `refund_requests`, `disputes`,
  `dispute_events`는 deferred다.
- 개인 매치와 팀 매치는 결제 없이 시작하며, 신청은 항상 host 또는 team owner/manager 승인 기반이다.
- 팀은 팀장 1명, 관리자 최대 5명, 회원 무제한이다.
- 팀 가입에 `open` 즉시 가입은 없다. 가입은 승인형 또는 closed만 둔다.
- 공지는 사이트 전체 공지로 두고, 사용자별 공지 읽음 테이블은 만들지 않는다.
- 알림은 사용자별 `notifications` row의 `read_at`으로 처리하고, 별도 `notification_reads`는 만들지 않는다.
- 채팅은 v1에서 개인 매치와 팀 매치 연결 채팅만 둔다. 팀 상시 채팅과 1:1 DM은 제외한다.
- 관리자 권한은 v1에서 role enum으로 시작하고, capability table은 deferred다.

## 4. Why The Next Stage Is Not Implementation Yet

`sm-new-api-db-baseline.md`는 schema나 endpoint contract를 쓰기 전에 아래 게이트가 필요하다고 고정한다.

1. 17개 baseline section 기준 screen action inventory.
2. 상태 전이표: `from`, `to`, trigger, actor, permission, audit, failure behavior.
3. actor/permission matrix.
4. state/permission 결정을 반영한 ER v2.
5. 기존 route 이름이 아니라 사용자 action 기준 API surface map.
6. DTO/error/status contract draft.

따라서 지금 바로 Prisma migration이나 Nest controller 설계로 들어가면 순서가 틀린다. 다음 단계는
설계 문서 5개를 채워서 구현 가능한 계약으로 좁히는 일이다.

## 5. Next Documents

### 5.1 `sm-new-screen-action-inventory.md`

목적:

- 17개 baseline section을 기준으로 화면, 버튼, 입력, CTA, empty/error/loading, navigation을 전부 뽑는다.
- 각 액션이 어떤 table, state, permission, API read/write에 연결되는지 표시한다.

작성 방식:

- `core-shell-sm-final`부터 `common-flows-motion`까지 section 순서대로 작성한다.
- 결제/support section은 "v1 deferred"로 표시하되, 화면에 남는 문구나 CTA 차단 정책은 기록한다.
- 팀/팀매치/채팅/공지처럼 이번 체크리스트에서 확정된 정책은 그대로 반영한다.

애매하면 물어볼 항목:

- `my team` shortcut의 최종 목적지.
- 0502 문서에서 본문 요구가 부족한 팀 둘러보기의 최소 v1 화면 범위.
- desktop web section을 v1 API에 어느 정도 반영할지.

괜찮으면 바로 진행할 항목:

- 홈, 개인 매치, 팀 매치, 채팅/알림, 공지, 설정의 단순 read/write action 추출.
- 결제 CTA는 v1에서 disabled/deferred copy로 분류.

### 5.2 `sm-new-state-machines.md`

목적:

- DB table별 status enum을 실제 상태 전이로 바꾼다.
- 단순 enum 목록이 아니라 "누가, 어떤 조건에서, 어떤 audit와 함께 바꾸는지"를 고정한다.

우선 작성할 state machine:

- `users.account_status`
- `users.onboarding_status`
- `auth_identities.status`
- `terms_documents.status`
- `matches.status`
- `match_applications.status`
- `match_participants.status`
- `teams.status`
- `team_memberships.status`
- `team_join_applications.status`
- `team_trust_scores.trust_state`
- `team_matches.status`
- `team_match_applications.status`
- `chat_rooms.status`
- `chat_room_participants.status`
- `chat_messages.status`
- `notifications.status`
- `admin_users.status`

애매하면 물어볼 항목:

- 매치/팀매치 완료 처리를 host가 직접 하는지, system job이 하는지, admin override를 둘지.
- 신청 취소 가능 시점: 승인 전까지만 가능한지, 승인 후에는 participant cancellation로 넘어가는지.
- 팀장 위임을 v1에서 막을지, 관리자 기능으로만 둘지.

괜찮으면 바로 진행할 항목:

- 결제 관련 상태 전이는 deferred section으로만 남긴다.
- `deadline_soon`, `full`은 저장 상태가 아니라 derived 상태로 둔다.

### 5.3 `sm-new-permission-matrix.md`

목적:

- actor별로 읽기/쓰기/상태변경 가능 범위를 고정한다.
- API guard와 service permission check의 기준이 되는 문서다.

actor set:

- guest
- authenticated user
- match host
- match applicant
- match participant
- team owner
- team manager
- team member
- team join applicant
- team match host team owner/manager
- team match applicant team owner/manager
- chat room participant
- admin owner
- admin ops
- admin support
- system

애매하면 물어볼 항목:

- admin support가 상태 변경까지 할 수 있는지, 조회/응대 중심인지.
- 팀 manager가 멤버 강퇴와 role 변경을 할 수 있는지.
- 팀 owner만 가능한 destructive action 범위.

괜찮으면 바로 진행할 항목:

- 개인 매치 생성/수정/취소는 host 중심으로 둔다.
- 팀 매치 생성/수정/취소는 owner/manager 중심으로 둔다.
- 일반 팀 member는 팀 매치 신청/승인 권한이 없다.

### 5.4 `sm-new-db-design-v2.md`

목적:

- 31개 core table을 실제 ER v2 후보로 정리한다.
- column, type, nullable, default, FK, unique/index, audit, derived field를 implementation 직전 수준까지 구체화한다.

중요한 변화:

- `db-erd-overview.md`와 `db-table-definition.md`의 61개 후보를 그대로 가져오지 않는다.
- `sm-new-db-v1-table-decision-checklist.md`에서 deferred로 빠진 table은 core ER에서 제외한다.
- `venues`는 v1 core FK가 아니라 direct place field 또는 reference-only 수준으로 둔다.
- payment/support는 ER v2 core에서 제외하고 future module boundary만 남긴다.

애매하면 물어볼 항목:

- 직접 입력 장소 field의 최소 column set.
- match/team_match 대표 이미지 저장을 URL string으로 둘지, upload file FK를 둘지.
- region seed 범위를 전국 2-depth 전체로 둘지, 초기 서비스 지역만 둘지.

괜찮으면 바로 진행할 항목:

- 확정된 31개 table의 PK/FK/index/audit는 체크리스트 기준으로 옮긴다.
- deferred table은 별도 appendix에만 둔다.

### 5.5 `sm-new-api-surface-map.md`

목적:

- 기존 API route 이름이 아니라 사용자 action 기준으로 필요한 API surface를 뽑는다.
- 각 action마다 request source, permission, state transition, response shape, error case를 연결한다.

작성 순서:

1. Auth/onboarding.
2. Home/search/notice.
3. Personal match list/detail/create/apply/manage.
4. Team browse/create/join/manage.
5. Team match list/detail/create/apply/manage.
6. Chat/notification.
7. Settings/profile/trust.
8. Admin/audit.
9. Deferred payment/support boundary.

애매하면 물어볼 항목:

- 홈 추천을 API에서 실시간 계산으로만 둘지, 추후 cache contract를 남길지.
- 공지 확인을 local-only UI 처리로 둘지, 서버 action 없이 단순 detail view로 둘지.
- admin API를 처음부터 별도 namespace로 강하게 분리할지.

괜찮으면 바로 진행할 항목:

- 결제 API는 v1 surface에서 제외한다.
- 신청/승인/취소/읽음 처리 같은 mutation은 idempotency와 상태 충돌 error를 포함한다.

## 6. User Approval Rule For Next Stage

다음 단계에서도 모든 항목을 매번 승인받지 않는다.

바로 진행할 것:

- 이미 체크리스트에서 명확히 확정된 table, status, permission, deferred 결정.
- baseline 문서에 이미 작성 순서가 고정된 문서 생성.
- 명백한 단순 전사 작업: table decision -> state/permission/API mapping.

사용자에게 물어볼 것:

- product policy가 갈리는 선택.
- 화면에 직접 노출되는 UX/문구/CTA 차단 방식.
- 권한이 커지는 결정.
- 나중에 바꾸기 어려운 DB cardinality, unique constraint, lifecycle terminal state.
- 기존 결정과 충돌하는 항목.

질문 방식:

```text
현재 판단:
이유:
선택지:
추천:
결정되면 반영할 문서:
```

질문은 필요한 순간에만 한다. 답을 받으면 해당 문서의 decision log에 남기고 다음 항목으로 진행한다.

## 7. Execution Plan

### Phase 1. Screen Action Inventory

산출물:

- `docs/reference/sm-new-screen-action-inventory.md`

완료 기준:

- 17개 baseline section이 모두 포함된다.
- 각 section에 screen, action, input, state, table, API impact가 있다.
- deferred payment/support는 화면 policy만 남기고 core API/DB에서 제외한다.
- open question이 있으면 사용자가 정해야 하는 것만 남긴다.

### Phase 2. State Machines

산출물:

- `docs/reference/sm-new-state-machines.md`

완료 기준:

- core status field마다 transition table이 있다.
- actor, permission, audit log, failure behavior가 있다.
- derived status와 stored status가 분리되어 있다.

### Phase 3. Permission Matrix

산출물:

- `docs/reference/sm-new-permission-matrix.md`

완료 기준:

- actor set이 고정된다.
- personal match, team, team match, chat, notification, admin의 read/write/status transition 권한이 있다.
- support/ops/owner admin 권한 차이가 있다.

### Phase 4. DB Design v2

산출물:

- `docs/reference/sm-new-db-design-v2.md`

완료 기준:

- 31개 core table의 ER, columns, nullable/default, FK, unique/index가 정리된다.
- deferred table은 core ER에 섞지 않는다.
- migration 전 검토 가능한 수준의 column contract가 있다.

### Phase 5. API Surface Map

산출물:

- `docs/reference/sm-new-api-surface-map.md`

완료 기준:

- 사용자 action 기준 API가 정리된다.
- 각 API에 actor, permission, state transition, read/write table, 주요 error가 연결된다.
- 기존 `apps/api` route와의 reuse/drift는 reference-only로만 표시한다.

### Phase 6. Implementation Task 준비

산출물:

- `.github/tasks/{NN}-sm-new-db-api-v1-implementation.md`

완료 기준:

- 위 5개 설계 문서가 모두 완료된다.
- implementation wave가 schema, seed/fixture, backend service/controller, frontend hook/type, docs/test로 분리된다.
- Owned/Forbidden files와 validation command가 명시된다.

## 8. Recommended Immediate Next Step

바로 다음 작업은 `sm-new-screen-action-inventory.md` 작성이다.

이유:

- DB v2와 API surface를 먼저 쓰면 화면 버튼/CTA/action이 빠질 수 있다.
- 상태 전이는 화면 action과 연결되어야 실제 product flow가 된다.
- 권한 매트릭스도 "누가 어떤 버튼을 누를 수 있나"에서 출발해야 누락이 적다.

진행 방식:

1. 17개 baseline section을 순서대로 훑는다.
2. 각 section의 화면/액션을 표로 만든다.
3. 이미 확정된 DB table decision을 연결한다.
4. deferred 정책이 필요한 곳은 명시한다.
5. 애매한 항목만 사용자에게 묻고 결정 로그에 남긴다.

첫 질문 후보:

- `my team` shortcut destination.
- 팀 둘러보기 v1 최소 범위.
- desktop web section의 v1 API 반영 범위.

단, 이 세 가지도 문서 작성 중 실제로 막히는 순간에만 질문한다.
