# Task 73 — Idempotency + Retry Semantics Sweep

Owners: project-director + tech-planner
Drafted: 2026-04-19
Status: Draft — awaiting handoff

---

## Context

운영 중에 모바일 네트워크 불안정·백그라운드 탭 리트라이·사용자 더블클릭 등으로 인해 mutation 엔드포인트가 중복 호출되는 경우가 적지 않다. 현재 일부 엔드포인트는 이러한 재호출에 대해 400/500 으로 응답하여 사용자에게 "에러"로 보이지만 실제로는 이미 성공한 액션이다.

Task 69 Known issue:
> - mercenary close/cancel 재호출 시 400 (idempotency 미구현, 현재 예외 발생)

Task 71 QA-power CONCERN-3:
> - Participant churn between preview and confirm — deferred to Task 72 (`participantHash`)

리뷰 과정에서 비슷한 패턴이 다수 엔드포인트에 존재할 가능성이 제기되었으나 체계적 감사는 없었다. 이번 task 는 **쓰기 엔드포인트 전수조사**로 idempotency 계약을 정립하고, 재호출 시 200 + 상태 메타를 반환하도록 일괄 보정한다.

---

## Goal

프로덕션 환경에서 네트워크 replay·double-submit 로 인한 사용자 노출 에러를 0에 수렴시킨다. 각 mutation 엔드포인트는 "첫 호출이면 상태 전이 + 200 / 이미 전이된 상태라면 현재 상태 반환 + 200 + `alreadyXxx: true` 플래그" 를 돌려준다. 관련 테스트 스위트와 Swagger 문서가 idempotency 계약을 명시한다.

---

## Original Conditions (verbatim)

- [ ] **C1** `POST /mercenary/:id/close` — 이미 closed 상태면 200 + `{ post, alreadyClosed: true }`. 이전 400 동작 제거 (Task 69 known issue 해소)
- [ ] **C2** `POST /mercenary/:id/cancel` — 이미 cancelled/closed 상태면 200 + `{ post, alreadyCancelled: true }`
- [ ] **C3** `POST /matches/:id/complete` — 이미 completed 상태면 200 + `{ match, alreadyCompleted: true }` (ELO 업데이트·배지 평가 중복 트리거 금지 — `completedAt` 존재 여부 체크)
- [ ] **C4** `POST /matches/:id/cancel` — 이미 cancelled 면 200 + `{ match, alreadyCancelled: true }`
- [ ] **C5** `POST /matches/:id/close` (모집 마감) — 이미 full/closed면 200 idempotent
- [ ] **C6** `POST /reviews` — (matchId, authorId, targetId) 유니크 인덱스 추가(없다면). 중복 제출 시 200 + `{ review, alreadySubmitted: true }` — 기존 500/409 제거
- [ ] **C7** `POST /notifications/push-subscribe` — endpoint 기준 upsert 이미 구현되어 있으면 200 + `{ subscription, upserted: boolean }`. race 상 문제 없는지 재확인 (task 69 에서 race fix 됨 — 회귀 테스트 추가)
- [ ] **C8** `PATCH /teams/:id/applications/:userId/accept|reject` (task 69에 도입) — 이미 처리된 신청 재호출 → 200 + `{ application, alreadyProcessed: true }` (pending 전제 유효성 체크)
- [ ] **C9** Idempotency 계약을 기술한 공통 E2E 테스트 suite 신규: `apps/api/test/integration/idempotency-contract.e2e-spec.ts` — 각 엔드포인트를 2회 연속 호출하여 두 번째가 200 + alreadyXxx true 인지 검증
- [ ] **C10** CLAUDE.md API 섹션에 엔드포인트별 idempotency 명시 (`[idempotent]` 태그 추가)

---

## User Scenarios

### S1 — 모바일 네트워크 재전송 (mercenary close)
호스트가 용병 모집글 "마감" 버튼 탭 → 네트워크 지연으로 버튼 두 번 눌림 → 두 번째 요청이 400 "이미 마감된 글" 에러 → 사용자에게 에러 토스트 노출(기존 동작).
**수정 후**: 두 번째 요청은 200 + `alreadyClosed: true` → UI는 별도 에러 표시 없이 조용히 무시 (이미 성공한 것으로 간주).

### S2 — Review 중복 제출 방지 (C6)
참가자가 "리뷰 남기기" 제출 → 제출 완료 화면에서 뒤로가기 → 다시 제출 누름 → 기존에는 DB constraint 위반으로 500 혹은 일관되지 않은 409 → **수정 후** 200 + `alreadySubmitted: true` + 기존 리뷰 ID 반환, UI 는 "이미 제출한 리뷰예요" 인라인 배너 표시.

### S3 — Match complete 중복 트리거 (C3)
호스트가 "매치 완료" 버튼 클릭 후 네트워크 timeout → 프론트엔드가 재시도 로직으로 동일 요청 재전송 → 기존에는 ELO·배지 서비스가 2번 실행되어 이상 데이터 발생. **수정 후**: `completedAt` 이미 있으면 서비스 layer 초입에서 guard → 200 + alreadyCompleted, ELO·배지 호출 skip.

### S4 — 팀 신청 처리 중복 (C8)
매니저 A가 신청 수락 누름 → 동시에 매니저 B가 같은 신청을 수락 → serializable isolation 로 한 쪽은 이미 처리된 상태. **수정 후**: 두 번째 수락 요청은 200 + `alreadyProcessed: true` + 첫 호출 결과 반환. 거부 신청을 다시 수락하려 하면 `APPLICATION_NOT_PENDING` 400 (의미 있는 상태 충돌은 여전히 에러).

---

## Test Scenarios

### Happy path
- C1~C5, C8: 첫 호출 200 + 상태 전이, 두 번째 호출 200 + alreadyXxx true + **DB 변화 없음** (before/after 타임스탬프 동일)
- C6: 첫 review 200, 두 번째 200 + alreadySubmitted true, review row count === 1
- C7: push subscribe 두 번 호출 → row 1건, upserted true/false 변화

### Edge cases
- C3: 매치가 `in_progress` 상태에서 complete 호출 → 기존 `MATCH_NOT_IN_PROGRESS` 에러 유지 (진짜 상태 오류는 에러)
- C8: pending 이 아닌 신청(이미 거부된 것)을 다시 수락 → 400 (`APPLICATION_NOT_PENDING`)
- C6: 동일 author, 동일 match, **다른 target** 에게 리뷰는 정상 (서로 다른 유니크 키)

### Error cases
- 모든 엔드포인트: 권한 부재 시 idempotency 체크 전에 403 반환 (권한이 idempotency 보다 우선)
- 비존재 리소스: 404 유지

### Mock / fixture updates
- `apps/api/test/integration/idempotency-contract.e2e-spec.ts` (신규) — 7~8개 엔드포인트 × 2회 호출 × 응답 검증
- `apps/api/test/fixtures/` 기존 helper 재사용
- Frontend 변경 없음 (alreadyXxx 필드는 optional로 무시 가능)
- `apps/api/prisma/migrations/2026xxxx_add_review_unique_index/` (C6 에서 unique index 추가 시만)

---

## Parallel Work Breakdown

### Wave 0 (sequential — schema)
- **[backend-data-dev]** `apps/api/prisma/schema.prisma` — `Review` 모델에 `@@unique([matchId, authorId, targetId])` 추가. 마이그레이션 `YYYYMMDD_add_review_unique`

### Wave 1 (parallel)
- **Track A — backend-data-dev (mercenary + matches)**: 
  - `mercenary.service.ts` closePost/cancelPost idempotent
  - `matches.service.ts` complete/cancel/close idempotent
  - 각 service spec 에 재호출 테스트 추가
- **Track B — backend-data-dev (reviews + teams)**:
  - `reviews.service.ts` create → unique violation catch → 기존 review 조회 후 200
  - `teams.service.ts` acceptApplication/rejectApplication — 이미 처리된 경우 200 + alreadyProcessed
- **Track C — backend-api-dev (response shape)**:
  - 각 controller 에서 `AlreadyXxxResponseDto` 타입 활용 (선택적 — Swagger 만)
  - Integration test suite `idempotency-contract.e2e-spec.ts` 신규
- **Track D — infra-security-dev**:
  - ThrottlerModule default 수정 없이 유지. push-subscribe race fix 회귀 테스트만 추가

### Wave 2 (integration)
- `pnpm db:migrate` (reviews unique)
- 전체 pnpm test + test:integration 실행
- 수동 smoke per V&V

---

## Verification & Validation

### Pre-merge checks
```bash
cd apps/api
pnpm lint
npx tsc --noEmit
pnpm build
pnpm db:migrate             # Review unique index 적용
pnpm test                   # 기존 + idempotency 추가 spec
pnpm test:integration -- idempotency-contract    # 신규 suite
pnpm test:integration -- mercenary matches reviews teams    # 회귀 확인
```

프론트엔드는 변경 없음이지만 회귀 확인:
```bash
cd apps/web && npx tsc --noEmit && pnpm test
```

### Manual smoke (dev 환경)
Postman/curl 이나 dev 서버에서 다음 시나리오 반복 호출:

1. **C1 (mercenary close idempotent)**
   ```bash
   TOKEN=$(... dev-login host token)
   POST_ID=$(... 기존 모집글 ID)
   curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:8100/api/v1/mercenary/$POST_ID/close
   # 첫 호출: 200, alreadyClosed: false
   curl -X POST -H "Authorization: Bearer $TOKEN" \
     http://localhost:8100/api/v1/mercenary/$POST_ID/close
   # 두 번째 호출: 200, alreadyClosed: true (기존 400 아님)
   ```
2. **C3 (match complete idempotent)**
   - 매치 완료 API 를 두 번 연속 호출
   - 두 번째는 ELO 변동 없음 확인 (`SELECT elo_rating FROM user_sport_profiles WHERE user_id = ...` 변화 X)
   - `SELECT * FROM notifications WHERE type = 'elo_changed' AND created_at > NOW() - interval '5 minutes'` 로 중복 알림 없음 확인
3. **C6 (review duplicate)**
   - 한 참가자가 동일 target 에게 리뷰 2회 제출 시도
   - 두 번째 응답이 200 + alreadySubmitted + 첫 review ID 와 동일
   - `SELECT COUNT(*) FROM reviews WHERE match_id = ... AND author_id = ... AND target_id = ...` === 1
4. **C8 (team application double accept)**
   - 두 매니저 브라우저에서 동시 수락 (실제로는 10ms 이내 타이밍)
   - 두 번째 응답 200 + alreadyProcessed, DB memberCount 중복 증가 없음

### Post-deploy validation
- 30분간 API 에러율 모니터링, 특히 mercenary/matches/reviews 도메인 500/400 비율
- DB 관점: 
  - `SELECT COUNT(*) FROM reviews GROUP BY match_id, author_id, target_id HAVING COUNT(*) > 1` → 0 rows 기대
  - `SELECT COUNT(*) FROM user_sport_profiles WHERE updated_at > NOW() - interval '1 hour'` → 배포 전 대비 비정상 급증 없음
- 로그 grep: `grep -c "alreadyClosed" api.log` → 실제 재호출 수 트래킹 (베이스라인 측정용)

### Rollback plan
- Review unique index 롤백:
  ```bash
  pnpm prisma migrate resolve --rolled-back YYYYMMDD_add_review_unique
  ```
  (주의: 이미 중복 레코드가 있다면 마이그레이션 실패. deploy 전 `SELECT ... HAVING COUNT > 1` 으로 선제 확인)
- 코드 revert: `git revert <merge-commit>` → 재배포

### Regression surface
- **ELO 업데이트**: complete 중복 방지 실패 시 모든 완료 매치의 ELO가 2배 업데이트 → 통합 테스트로 방어
- **알림 폭주**: 재호출 시 이미 발송된 알림 중복 방지 확인 (`NotificationsService.create` 호출 조건에 completedAt guard)
- **배지 지급**: `BadgesService.awardIfEligible` 이 이미 수여한 배지를 중복 지급하지 않는지 (기존 로직 재점검)
- **Push 구독**: endpoint upsert 이 기존 구독을 덮어쓰지 않는지 (keys 필드 보존)
- **API 클라이언트**: alreadyXxx 필드는 optional 이므로 구 클라이언트 호환 (`undefined` 처리 확인)

---

## Acceptance Criteria

1. 위 7개 mutation 엔드포인트 모두 재호출 시 200 + alreadyXxx true 응답
2. 재호출 시 DB 상태 변화 없음(타임스탬프·count 동일)
3. 중복 알림·중복 ELO·중복 배지 발생 0건
4. `Review` 테이블에 `(matchId, authorId, targetId)` unique constraint 적용, 기존 중복 레코드는 마이그레이션 전 수동 정리
5. `idempotency-contract.e2e-spec.ts` 7~8개 case 통과
6. 기존 테스트 스위트 무회귀 (API 638+, Web 352+)
7. CLAUDE.md API 섹션에 `[idempotent]` 태그 추가
8. Swagger 문서에 2xx 응답 예시 업데이트

---

## Tech Debt Resolved

- Task 69 Known issue: mercenary close/cancel idempotency 미구현 해소
- 잠재적 데이터 정합성 버그 예방 (중복 ELO·배지·알림)
- 사용자 노출 "에러" 토스트가 실제로는 성공한 액션인 케이스 제거

---

## Security Notes

- **Authorization > idempotency**: 권한 부재 시 403 먼저, 그 다음 idempotency 체크. 권한 우회 수단으로 악용되지 않음
- **Replay attack**: idempotent 응답은 공격 가능성을 높이지 않음 (원래 중복 호출이 성공하는 것과 같은 결과)
- **Unique index 추가**: `Review` 는 PII 없는 공개 리뷰 구조. 인덱스 추가로 개인정보 노출 변화 없음
- **로그**: `alreadyXxx` 플래그 기반 로그 집계 시 userId 등 PII 제외

---

## Risks & Dependencies

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| R1 | 기존 중복 Review rows 존재 → migration 실패 | High | deploy 전 `SELECT` 쿼리로 중복 존재 확인. 있다면 cleanup SQL 작성 후 migration |
| R2 | ELO 업데이트의 idempotency 누락으로 실제 운영 데이터에 영향 | High | 통합 테스트 + 수동 smoke 로 검증. `completedAt` 기반 guard 필수 |
| R3 | Frontend 가 기존 400/500 에러 표시에 의존 | Low | 현재 UI 는 error 뜨면 toast 표시뿐 → 200 받으면 오히려 사용자 경험 개선 |
| R4 | Review unique index 가 기존 uuid PK 와 충돌 | Low | Prisma `@@unique` 는 composite constraint, PK 와 독립 |

### Dependencies
- Task 70 (결제 라이프사이클) — settlements/disputes 도 idempotent 대상일 수 있으나, Task 70 scope 내에서 먼저 정리되고 있다면 중복 작업 회피 필요. Task 70 완료 후 delta 스위프
- Task 72 (balance hardening) — 독립적, 병렬 가능

---

## Ambiguity Log

| ID | 질문 | 답변 (planning) |
|----|------|----------------|
| A1 | alreadyXxx 응답 필드명 통일: `alreadyClosed`, `alreadyProcessed`, `alreadySubmitted` 등 도메인별 다르게? | **도메인별 다르게** 유지 (자연스러운 영어). 공통 타입은 만들지 않음 |
| A2 | 중복 리뷰를 idempotent 로 처리하면 사용자가 수정 의도로 재제출해도 silent success. 수정 기능이 필요한가? | **별도 task** (`PATCH /reviews/:id`). 이번은 duplicate prevention 만 |
| A3 | Review unique constraint 위반한 기존 데이터가 있다면? | deploy 전 SQL 로 오래된 것 삭제 + 주 1건만 유지. 실제 확인 선행 |
| A4 | ThrottlerModule 를 idempotency 와 연계? | **연계 안 함**. rate limit 와 idempotency 는 별개 책임 |
| A5 | Push subscribe 의 upserted:boolean 노출 가치? | **내부 로그만**. API 응답에는 단순 200 OK. frontend 필요 없음 |

---

## Complexity Estimate

**Medium**

| Item | Complexity | Est. LOC |
|------|------------|----------|
| Review unique index + migration | Low | ~40 |
| 7~8 mutation endpoints idempotent guard | Medium | ~250 |
| `idempotency-contract.e2e-spec.ts` | Medium | ~300 |
| 개별 service spec 추가 테스트 | Medium | ~200 |
| Swagger + CLAUDE.md 문서 | Low | ~40 |
| **Total** | **Medium** | **~830** |

예상 PR: 변경 ~10 파일, 신규 ~2 파일, 1 migration.

---

## Handoff checklist

- [ ] Task 70 merge 이후 착수 (matches.service.ts 충돌 방지)
- [ ] 중복 Review 실제 데이터 존재 여부 prod DB 에서 사전 확인
- [ ] Ambiguity Log 5개 항목 확인
- [ ] Task 72 와 병렬 시 파일 overlap 확인 (`matches.service.ts` complete 로직)
- [ ] 설치 패키지 변화 없음(기존 Prisma/Nest 스택 재사용) 확인
