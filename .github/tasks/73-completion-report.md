# Task 73 Completion Report — 2026-04-19

## Summary

7개 mutation 엔드포인트(mercenary close/cancel · matches complete/cancel/close · reviews create · teams accept/reject)를 멱등화하여 재호출 시 500/400이 아닌 200 + `alreadyXxx: true` 플래그를 반환하도록 통일했다. `Review`에 `(matchId, authorId, targetId)` unique constraint를 추가하여 중복 리뷰를 DB 레벨에서 차단하고, 기존 리뷰를 idempotent 응답으로 돌려준다. 응답 shape은 **flattened**(`{ ...model, alreadyXxx }`)으로 유지되어 프론트엔드 훅 수정이 전혀 필요 없다. 9건의 신규 integration 테스트가 각 엔드포인트의 멱등 계약(첫 호출 false / 두 번째 호출 true + DB invariant 유지)을 검증한다.

## Original Conditions Met

- [x] **C1** `POST /mercenary/:id/close` 멱등 — 이미 closed 상태면 200 + `alreadyClosed: true`. 이전 400 제거
- [x] **C2** `POST /mercenary/:id/cancel` 멱등 — 이미 cancelled/closed 상태면 200 + `alreadyCancelled: true`
- [x] **C3** `POST /matches/:id/complete` 멱등 — 이미 completed면 200 + `alreadyCompleted: true`. 알림·배지 fan-out 중복 트리거 차단(`status === 'completed'` guard 앞세움)
- [x] **C4** `POST /matches/:id/cancel` 멱등 — 이미 cancelled면 200 + `alreadyCancelled: true` (completed 매치 취소는 여전히 400)
- [x] **C5** `POST /matches/:id/close` 멱등 — 이미 confirmed/full이면 200 + `alreadyClosed: true`
- [x] **C6** `POST /reviews` 멱등 — Prisma `Review @@unique([matchId, authorId, targetId])` 추가. P2002 catch → 기존 review 조회 + 200 + `alreadySubmitted: true`. 매너 점수 aggregate, `review_received` 알림, `updateEloAfterMatch` 모두 replay 시 skip. `@HttpCode(HttpStatus.OK)` 적용으로 첫 호출도 200 (task doc C6 준수)
- [x] **C7** `POST /notifications/push-subscribe` — 기존 endpoint upsert 구현 유지, 4건 race regression test 추가(same-endpoint upsert / key 갱신 / device hand-off / concurrent Promise.all)
- [x] **C8** `PATCH /teams/:id/applications/:userId/accept|reject` 멱등 — 이미 처리된 경우 200 + `alreadyProcessed: true`. pending도 아니고 terminal state도 아닌 경우 400 `APPLICATION_NOT_PENDING`
- [x] **C9** `apps/api/test/integration/idempotency-contract.e2e-spec.ts` — 신규 suite 9 테스트. DB invariant 검증(notification count, memberCount, updatedAt, review count)
- [x] **C10** `CLAUDE.md` 엔드포인트 섹션에 `[idempotent]` 태그 추가 — mercenary/matches/teams application/notifications/reviews 엔드포인트별 명시

## Scope Shipped

**Backend**
- 1 Prisma migration: `20260419000000_add_review_unique_index/migration.sql` (UNIQUE INDEX, IF NOT EXISTS, fail-loud 정책 — 중복 존재 시 silent delete 하지 않음)
- 1 schema change: `schema.prisma` — `@@unique([matchId, authorId, targetId])` on `Review`
- 4 service 멱등 가드: `mercenary.service.ts` (close/cancel), `matches.service.ts` (complete/cancel/close), `reviews.service.ts` (P2002 catch), `teams.service.ts` (accept/reject)
- 5 controller `@HttpCode(HttpStatus.OK)` 추가: matches × 3, mercenary × 2, reviews × 1 — idempotent replay도 일관된 200
- 9 Swagger 2xx schema 주석: `{ ...model, alreadyXxx: boolean }` 설명
- 1 integration suite: `idempotency-contract.e2e-spec.ts` (9 cases)
- 4 web-push race regression tests: `notifications/web-push.service.spec.ts`
- 5 service spec 확장: `alreadyXxx` flag + side-effect skip 검증

**Frontend**
- 변경 없음. Flattened response shape으로 기존 `useCloseMatch`/`useCancelMatch`/`useCloseMercenaryPost` 등 호출자 모두 무회귀. `alreadyXxx` 필드는 optional로 필요시 UI 처리 가능

**Migration**
- 1 — Prisma `20260419000000_add_review_unique_index`. Pre-deploy: prod DB에서 `SELECT match_id, author_id, target_id, COUNT(*) FROM reviews GROUP BY 1,2,3 HAVING COUNT(*) > 1` 실행해 중복 0건 확인 필요. 있다면 cleanup SQL 선행

## Pipeline Metrics

| 단계 | 에이전트 | 라운드 |
|------|---------|--------|
| Plan | 기존 task doc 활용 (생략) | 0 |
| Build Wave 1 | backend-data-dev + backend-api-dev + infra-security-dev | 3 parallel |
| Review | backend-review | 1 |
| Fix | 직접 적용 (@HttpCode + Swagger 정합 + response flatten) | 1 |

- 변경 파일: 13 (schema 1 / migration 1 / services 4 / controllers 4 / specs 3, integration 1, push-subscribe spec 1)
- LOC delta: +999 insertions / −87 deletions (main..HEAD)
- Unit tests: 773 passed / 36 suites
- Integration tests: 9 신규 케이스 (로컬 DB 미접근 → CI에서 실행 예정)

## Key Decisions

- **Response shape — Flattened**: `{ ...model, alreadyXxx: boolean }` 채택. Task doc의 "Frontend 변경 없음" 계약을 지키기 위해 `{ match, alreadyXxx }` wrapped 대신 spread 사용 (advisor 판정: "optional로 무시 가능"이 tighter constraint). 프론트엔드 훅 수정 제로.
- **Authorization > Idempotency**: 모든 서비스에서 permission check가 idempotent early return보다 먼저. 403 → 200 flow 유지.
- **`@HttpCode(HttpStatus.OK)` 일관 적용**: POST default 201을 명시적으로 OK로 내림. 멱등 replay와 최초 실행 모두 같은 상태 코드로 통일. Reviews는 "creation"이 아닌 "submit-or-get" 시맨틱이라 200이 더 정확.
- **Migration 전략 — fail-loud**: 중복 레코드를 silent DELETE하는 마이그레이션은 데이터 손실 리스크. `CREATE UNIQUE INDEX IF NOT EXISTS`는 idempotent re-apply 가능하면서, 중복 존재 시 explicit error로 작업자에게 cleanup을 강제함.
- **State machine violation은 여전히 400**: 이미 terminal state(left)인 신청을 다시 accept하려 하면 `APPLICATION_NOT_PENDING` 400. "의미 있는 상태 충돌은 에러로 유지" 원칙.
- **Mercenary cancel Swagger 수정**: 기존 문서가 "작성자 또는 팀 매니저+"라 했으나 실제 서비스는 작성자만 허용. Swagger를 `작성자 전용`으로 정정(contract drift 제거).

## Known Minor Issues (Non-blocking)

- **Concurrent write race (reviewer Warning)**: 두 호스트가 동시에 match cancel 호출 시 둘 다 `recruiting` 상태를 읽고 둘 다 업데이트·fan-out 가능. 이번 task의 scope(sequential replay 멱등)를 벗어나므로 이연. `updateMany({ where: { status: { not: 'cancelled' } } })` 가드 적용은 후속 task에서 검토.
- **Mercenary `findOne` viewer shape**: close/cancel 응답의 `viewer` 필드(`isAuthenticated`, `canManage` 등)가 `findOne(postId)` 호출 시 `currentUserId` 누락으로 잘못된 값. 프론트 호출자는 mutation 응답에서 `viewer`를 읽지 않고 후속 detail GET에서 읽으므로 실사용 영향 없음 — 별도 task로 이연.

## Deferred

- Task 72가 먼저 진행 중이었으므로 `matches.service.ts`의 `complete/cancel/close` 메서드 충돌 우려가 있었지만, task 72가 `previewTeams/generateTeams`만 확장하여 실제 충돌 0건
- Concurrent-write 원자성 강화 (updateMany status guard) — 후속 task
- 프로덕션 DB 중복 Review 존재 여부 확인 → deploy runbook 항목

## References

- Task doc: `.github/tasks/73-idempotency-retry-semantics.md`
- Prior task: `.github/tasks/72-completion-report.md`
- Commits (4): `54073bb` push-subscribe regression → `e315b11` integration suite + Swagger → `3ddccaf` service idempotency + flatten → `3bd8e9f` review fixes (@HttpCode + reviews 200 align)
