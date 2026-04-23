# Task 79 - Team Match Management and History Contracts

Owner: project-director -> tech-planner -> backend-api-dev -> frontend-data-dev -> frontend-ui-dev -> docs-writer -> QA
Date drafted: 2026-04-23
Status: Planned
Priority: P0

---

## 1. Context

팀매칭의 생성, 신청, 승인, 운영(`arrival`, `score`, `evaluate`) 플로우는 Task 23, 24, 35에서 대부분 닫혔다. 하지만 현재 코드 기준으로 "내가 만든 모집글을 수정/취소하고, 내 팀의 팀매칭 히스토리를 일관되게 관리한다"는 기본 관리 계약이 아직 완결되지 않았다.

이번 task는 새 기능을 넓게 추가하는 문서가 아니라, 이미 화면에 노출된 관리 affordance와 실제 API/상태/테스트 계약 사이의 drift를 닫기 위한 후속 정리 task다.

### 1.1 Prior tasks - do not duplicate

- Task 23: 신청 목록 가시성, 승인/거절 REST suffix 계약 정리
- Task 24: 생성/신청 시 팀 선택과 owner/manager 권한 게이트 정리
- Task 35: 운영 서브플로우(`arrival`, `score`, `evaluate`)와 상태 gate 정리

이번 task는 위 작업을 재구현하지 않는다. 대신 아래 남은 gap을 닫는다.

### 1.2 Verified evidence

- Backend controller에는 `PATCH /team-matches/:id`가 없다.
  - `apps/api/src/team-matches/team-matches.controller.ts`
- Frontend edit/cancel 화면은 이미 `PATCH /team-matches/:id`를 호출한다.
  - `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx`
  - `apps/web/src/app/(main)/my/team-matches/page.tsx`
- 목록 API는 `status`가 없으면 기본적으로 `recruiting`만 조회한다.
  - `apps/api/src/team-matches/team-matches.service.ts`
  - `docs/api/domains/team-matches.md`
- `/my/team-matches`, `/teams/:id/matches`는 status를 명시하지 않아 실제 히스토리를 누락한다.
  - `apps/web/src/app/(main)/my/team-matches/page.tsx`
  - `apps/web/src/app/(main)/teams/[id]/matches/page.tsx`
- 일부 프론트 컴포넌트는 아직 `matched` 중심 상태 언어를 유지하고 `scheduled/checking_in/in_progress`를 제대로 표현하지 않는다.
  - `apps/web/src/components/match/team-match-card.tsx`
  - `apps/web/src/app/(main)/my/team-matches/page.tsx`
  - `apps/web/src/lib/team-match-operations.ts`
- 중복 신청은 Prisma unique 제약에 기대고 있으며 도메인 에러가 정규화되어 있지 않다.
  - `apps/api/prisma/schema.prisma`
  - `docs/api/domains/team-matches.md`
- MSW와 integration/E2E 범위가 현재 관리 계약을 고정하지 못한다.
  - `apps/web/src/test/msw/handlers/team-matches.ts`
  - `apps/api/test/integration/team-matches.e2e-spec.ts`
  - `e2e/tests/team-match-operations.spec.ts`

---

## 2. Goal

1. 팀매칭 수정/취소를 프론트 가짜 affordance가 아니라 실제 backend 계약으로 닫는다.
2. `/my/team-matches`, `/teams/:id/matches`가 모집중만이 아니라 실제 진행/완료/취소 이력을 보여주게 만든다.
3. 프론트 전역에서 팀매칭 상태 언어를 `recruiting -> scheduled -> checking_in -> in_progress -> completed/cancelled` 기준으로 통일한다.
4. 신청 중복, 수정 불가, 취소 불가 같은 관리 에러를 DB 예외가 아니라 도메인 에러로 정규화한다.
5. API 문서, MSW, integration test, E2E/시나리오 문서가 같은 계약을 보도록 맞춘다.

## 2.1 Feature Definition

이번 구현의 canonical feature name은 다음과 같다.

`Team Match Management / History Contract Closure`

이 기능은 새 도메인을 추가하는 작업이 아니다. 이미 노출된 팀매칭 관리 UI를 실제 서비스 계약으로 완결하는 후속 구현이다.

포함 범위:

- 호스트 팀 manager+ 기준 모집글 수정
- 호스트 팀 manager+ 기준 모집글 취소
- `/my/team-matches` 히스토리 정상화
- `/teams/:id/matches` 히스토리 정상화
- 팀매칭 상태 vocabulary 통일
- duplicate-apply 및 관리 mutation 에러 정규화
- API docs / MSW / integration / scenario sync

제외 범위:

- 새 팀매칭 도메인 추가
- 새 운영 상태 추가
- chat, notification, badge 정책의 별도 확장
- 결과 입력/평가/도착인증 플로우 재설계

---

## 3. Original Conditions

### 3.1 User-facing management contract

- [ ] 호스트 팀 `owner/manager`는 자기 팀 모집글을 수정할 수 있다.
- [ ] 호스트 팀 `owner/manager`는 허용된 상태에서 자기 팀 모집글을 취소할 수 있다.
- [ ] 수정/취소 CTA는 실제 backend endpoint와 동일한 권한/상태 gate를 따른다.
- [ ] 수정 화면은 현재 route의 실제 team-match를 hydrate하며 다른 seed/mock 엔티티로 fallback하지 않는다.

### 3.2 History and read-model contract

- [ ] `/my/team-matches`는 hosted/applications 탭 모두에서 진행중/완료/취소 이력을 일관되게 보여준다.
- [ ] `/teams/:id/matches`는 해당 팀이 host이거나 applicant였던 팀매칭 이력을 status 누락 없이 보여준다.
- [ ] `GET /team-matches`는 목적에 따라 단일 status 또는 다중 status 조회를 지원한다.

### 3.3 Status language contract

- [ ] `matched`는 더 이상 canonical user-facing 상태명으로 쓰지 않는다.
- [ ] 카드, 리스트, 상세, 관리 화면이 모두 `scheduled/checking_in/in_progress/completed/cancelled`를 같은 tone과 copy로 보여준다.
- [ ] `team-match-operations`의 상태 helper가 실제 UI single source of truth가 된다.

### 3.4 Error and test contract

- [ ] 중복 신청은 Prisma raw error가 아니라 명시적 `ConflictException`과 안정된 메시지/code로 노출된다.
- [ ] 수정 불가 상태, 취소 불가 상태, 권한 없음이 integration test로 고정된다.
- [ ] MSW와 scenario docs가 실제 수정/취소/히스토리 계약을 반영한다.

---

## 4. User Scenarios

### S1. 호스트 팀 모집글 수정

1. 호스트 팀 manager가 `/my/team-matches` 또는 `/team-matches/:id`에서 "모집글 수정"으로 진입한다.
2. `/team-matches/:id/edit`는 실제 API detail로 hydrate된다.
3. 사용자가 일정, 장소, 비용, 메모 등 수정 가능한 필드를 바꾸고 저장한다.
4. backend는 host team `manager+`와 수정 가능 상태를 검증한 뒤 update를 반영한다.
5. 상세/목록/내 관리 화면은 invalidate 후 동일한 새 값을 보여준다.

### S2. 호스트 팀 모집글 취소

1. 호스트 팀 manager가 `/my/team-matches` 또는 edit 화면에서 취소를 선택한다.
2. backend는 권한과 상태 gate를 검사한다.
3. 취소 가능 상태면 `cancelled`로 전이한다.
4. 이후 목록/상세/내 관리/팀 히스토리에서 취소 상태가 일관되게 보인다.

### S3. 내 팀매칭 히스토리 조회

1. 사용자가 `/my/team-matches`에 진입한다.
2. hosted 탭에는 모집중뿐 아니라 예정/진행/완료/취소 이력까지 포함된다.
3. applied 탭과 `/my/team-match-applications`의 상태 배지도 실제 승인 상태와 경기 상태를 모순 없이 보여준다.

### S4. 팀 허브 경기 이력 조회

1. 사용자가 `/teams/:id/matches`에 진입한다.
2. 해당 팀이 host였던 경기와 applicant였던 경기 이력이 모두 보인다.
3. 모집중만 남고 완료 경기가 사라지는 현상이 없어야 한다.

### S5. 중복 신청 에러

1. 같은 팀이 같은 모집글에 다시 신청한다.
2. backend는 DB unique 예외를 그대로 흘리지 않고 도메인 충돌로 변환한다.
3. 프론트는 안정된 에러 메시지로 처리한다.

---

## 5. Test Scenarios

### 5.1 Backend integration

- `POST /team-matches` 생성 후 `PATCH /team-matches/:id`로 모집글 수정 성공
- host team `manager+`가 아닌 사용자의 수정/취소는 `403`
- `recruiting`이 아닌 상태에서 금지된 수정은 `409`
- 허용 상태에서 취소 성공, 금지 상태 취소는 `409`
- `GET /team-matches?teamId=...&status=...` 또는 다중 status 조회가 hosted/applicant 이력을 모두 반환
- 중복 신청 시 안정된 conflict 응답 반환

### 5.2 Frontend unit / MSW

- `/my/team-matches`가 상태별 리스트를 올바르게 분기 렌더링
- `/teams/:id/matches`가 recruiting만 보이지 않고 히스토리를 렌더링
- `TeamMatchCard`가 `scheduled/checking_in/in_progress/completed/cancelled` badge를 모두 올바르게 표기
- edit page submit/cancel mutation이 실제 계약과 같은 경로/shape를 사용

### 5.3 Browser / E2E smoke

- host manager가 모집글 수정 후 detail/list에 반영되는지 확인
- host manager가 모집글 취소 후 상태 badge와 CTA가 바뀌는지 확인
- `/my/team-matches`와 `/teams/:id/matches`에서 completed/cancelled 이력이 보이는지 확인

### 5.4 Documentation sync

- `docs/api/domains/team-matches.md`에 update/cancel/history query 계약이 반영된다.
- `docs/scenarios/05-team-match-flows.md`와 `tests/ui-scenarios/scenarios/06-team-matches.md`의 edit/history 시나리오가 실제 계약과 맞는다.

---

## 6. Parallel Work Breakdown

### Wave 0 - Contract decision and DTO shape (serial)

단일 결정이 먼저 필요한 영역:

- `PATCH /team-matches/:id`의 canonical 의미
  - 일반 필드 수정
  - `status: cancelled` 취소
- 수정 가능 상태
  - 결정안: `recruiting`만 수정 가능
- 취소 가능 상태
  - 결정안: `recruiting`, `scheduled`까지만 가능
  - `checking_in` 이후는 취소 불가
- update DTO와 cancel policy를 확정하고 `docs/api/domains/team-matches.md`에 먼저 적는다.

### Wave 1 - Backend contract closure

Owned files:

- `apps/api/src/team-matches/team-matches.controller.ts`
- `apps/api/src/team-matches/team-matches.service.ts`
- `apps/api/src/team-matches/dto/*.dto.ts`
- `apps/api/test/integration/team-matches.e2e-spec.ts`

Work:

- `PATCH /team-matches/:id` 추가
- update/cancel 권한 gate 추가
- 상태 gate 추가
- duplicate-apply conflict normalization 추가
- list query가 다중 status 또는 history 모드에 대응하도록 확장

### Wave 2 - Frontend read model and mutations

Owned files:

- `apps/web/src/hooks/api/use-team-matches.ts`
- `apps/web/src/app/(main)/team-matches/[id]/edit/page.tsx`
- `apps/web/src/app/(main)/my/team-matches/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/matches/page.tsx`
- `apps/web/src/components/match/team-match-card.tsx`
- `apps/web/src/lib/team-match-operations.ts`

Work:

- update/cancel mutation 계약 일치
- history query param 명시
- 상태 badge/copy single source 정리
- stale `matched` 의존 제거

### Wave 3 - Mock, scenarios, docs

Owned files:

- `apps/web/src/test/msw/handlers/team-matches.ts`
- `docs/api/domains/team-matches.md`
- `docs/scenarios/05-team-match-flows.md`
- `tests/ui-scenarios/scenarios/06-team-matches.md`

Work:

- MSW 핸들러에 update/cancel/history 응답 추가
- API domain docs sync
- QA/scenario 문구를 실제 status vocabulary로 교체

### Wave 4 - QA closure

- backend integration green
- web typecheck and targeted tests green
- browser smoke or Playwright로 edit/cancel/history 확인

---

## 7. Acceptance Criteria

- frontend에서 노출된 팀매칭 수정/취소 CTA가 실제 backend endpoint로 성공 동작한다.
- `PATCH /team-matches/:id`는 host team `manager+`만 허용하고, 허용된 상태에서만 수정/취소된다.
- `/my/team-matches`와 `/teams/:id/matches`는 `recruiting`만이 아니라 예정/진행/완료/취소 이력을 보여준다.
- 사용자-facing 상태 표현에서 `matched` drift가 제거되고 canonical 상태 집합으로 통일된다.
- duplicate-apply는 안정된 conflict 응답으로 정규화된다.
- API docs, MSW, integration tests, UI scenario docs가 같은 계약을 반영한다.

---

## 8. Tech Debt Resolved

- 프론트 affordance와 backend 계약 drift 제거
- history read-model이 default query에 묶여 모집중만 보이던 문제 제거
- 상태 vocabulary drift 제거
- DB unique 예외 의존 도메인 에러 제거
- MSW/test/docs 미동기화 제거

---

## 9. Security Notes

- 수정/취소는 controller guard만이 아니라 service에서 host team membership role을 다시 검증해야 한다.
- `owner`와 `manager`만 관리 mutation 허용, `member`는 read-only 유지
- 취소/수정 불가 상태를 프론트 숨김만으로 처리하지 말고 backend에서 강제
- `teamId` 기반 history 조회는 비공개 데이터 확대 노출이 없는지 기존 detail/list visibility와 함께 검증

---

## 10. Risks and Dependencies

- 현재 host dev runtime에서 `/team-matches` 계열 route가 간헐적으로 불안정할 수 있어 browser green은 runtime 상태 영향을 받을 수 있다.
- `matched` 상태를 이미 참조하는 다른 화면이 더 남아 있을 수 있으므로 repo-wide search가 필요하다.
- status 다중 조회 방식은 기존 API 소비자와 호환되도록 additive하게 설계해야 한다.
- 취소 시 notification fan-out 여부는 정책 결정이 필요하지만, 이번 task의 최소 목표는 계약 closure다.

---

## 11. Ambiguity Log

### A1. 취소 허용 범위

- Option A: `recruiting`만 취소 가능
- Option B: `scheduled`까지 취소 가능, `checking_in` 이후 금지
- Decision for this task: Option B
- Reason: UI 관리 기대치와 운영 현실을 맞추면서도 경기 시작 이후의 무결성은 지킨다.

### A2. 조회 API 설계

- Option A: `status`를 comma-separated 다중 값으로 받는다.
- Option B: `status=all` 또는 `includeHistory=true` 같은 별도 모드 추가
- Decision for implementation preference: Option A
- Reason: 기존 query shape를 유지하면서 additive 확장이 가능하고, 프론트 목적별 제어가 명확하다.

### A3. 수정 가능한 필드 범위

- 최소 범위: 일정, 장소, 비용, 메모, 조건 필드
- 제외 범위: 이미 운영 단계에 들어간 경기의 결과/평가/참가팀 확정 데이터
- Decision: 모집글 성격의 필드만 수정 가능, 결과성 데이터는 scope 밖

### A4. 취소 알림

- Decision: 이번 task의 최소 수용 기준에는 포함하지 않는다.
- Follow-up: 취소 notification fan-out이 필요하면 별도 task 또는 같은 PR 후속으로 확장 가능
