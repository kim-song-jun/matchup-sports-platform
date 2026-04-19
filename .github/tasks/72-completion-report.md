# Task 72 Completion Report — 2026-04-19

## Summary

Task 71(ELO 기반 팀 자동 구성) 출시 직후 식별된 6개 UX·일관성 결함을 단일 브랜치에서 해소했다. `participantHash`(SHA-256 of sorted userIds)로 preview↔compose 간 참가자 churn을 감지하여 stale 구성으로 확정하는 경로를 차단하고, 호스트 단위 rate limit(20회/60초)로 재추첨 남용을 막았으며, 재추첨 이력 비교·기존 팀 배정 재확정 경고·4팀 데스크톱 2열 그리드·6건의 integration 엣지 케이스를 추가했다. Prisma 마이그레이션 없음 — 기존 스키마/서비스 확장만 사용.

## Original Conditions Met

- [x] **C1** `PreviewTeamsResponseDto.participantHash: string`(64-char SHA-256 hex) 추가, 서버가 참가자 userId 정렬 기반으로 결정적 해시 반환 (`computeParticipantHash()` in `apps/api/src/matches/matches.service.ts`)
- [x] **C2** `ComposeTeamsDto.participantHash` optional 수락, 불일치 시 **409 `PARTICIPANTS_CHANGED`**. 미전달 = legacy client로 stale check skip. 프론트는 자동 재-preview + info 토스트
- [x] **C3** `POST /matches/:id/teams/preview` 에 `@Throttle({ limit: 20, ttl: 60_000 })` 적용. `HostThrottlerGuard`가 `req.user.id`로 트래킹(shared NAT/VPN 간섭 방지). 초과 시 429 + `Retry-After: 60`
- [x] **C4** `AutoBalanceModal`이 직전 2건 preview를 `previewHistory`로 유지(FIFO cap). "이전 결과 보기" 토글로 비교·읽기전용 복원·재사용 확정 가능
- [x] **C5** 기존 팀 배정이 있는 매치의 재확정 시 `ConfirmReplaceModal`(alertdialog role) 표시 — 현재 팀 요약 + "교체"/"취소" 명시적 confirm 후에만 compose 호출
- [x] **C6** `AutoBalanceModal` 팀 카드 그리드 `sm:grid-cols-2 xl:grid-cols-3` — teamCount=3·4도 데스크톱(≥640px) 2열 이상. 모바일(360px) 단일 컬럼 유지
- [x] **C7** `matches-team-balancing.e2e-spec.ts`에 6건 신규 integration test 추가 (3-team snake / 4-team snake / in_progress 상태 409 / 동시 preview 10회 PRNG 결정성 / stale hash 409 / rate limit 429)
- [x] **C8** CLAUDE.md — `usePreviewTeams`/`useComposeTeams` 커스텀 훅 설명에 `participantHash`·`retryAfterSeconds`·`onParticipantsChanged` 반영, API 엔드포인트 섹션에 throttle·409·participantHash 명시

## Scope Shipped

**Backend**
- 1 신규 유틸: `computeParticipantHash()` (`apps/api/src/matches/matches.service.ts`)
- 1 신규 guard: `apps/api/src/common/guards/host-throttler.guard.ts` + spec
- 2 확장 서비스 메서드: `MatchesService.previewTeams` (participantHash 생성), `MatchesService.generateTeams` (stale check)
- 2 확장 DTO: `ComposeTeamsDto.participantHash?`(optional, 64-hex regex), `PreviewTeamsResponseDto.participantHash`(required)
- 1 controller 데코레이터: `@Throttle` on preview + `APP_GUARD` HostThrottlerGuard 바인딩
- 1 module 확장: `AppModule` `ThrottlerModule.forRoot([{ limit: 1000, ttl: 60_000 }])` (default는 사실상 무제한, route-level 데코레이터로만 제한)
- 1 exception filter 확장: `http-exception.filter.ts`가 `HttpException.code` / `getResponse().code`에서 domain code 전파
- 신규 integration 케이스: `matches-team-balancing.e2e-spec.ts` +6건 (기존 10 → 16건)
- 단위 테스트: `matches.service.spec.ts` +235 LOC (participantHash·stale check·throttle·replace 확인)

**Frontend**
- 1 신규 컴포넌트: `components/match/confirm-replace-modal.tsx` (alertdialog, 현재 팀 요약, focus trap, ESC=취소)
- `components/match/auto-balance-modal.tsx` 대폭 확장 (+357 LOC): `previewHistory` 상태(FIFO cap=2) + 비교 토글 + read-only 복원 + "이 구성으로 확정" + rate-limit 카운트다운 disable + aria-live dedup 공지 + `sm:grid-cols-2 xl:grid-cols-3` 책임형 그리드
- `hooks/api/use-matches.ts` 확장: `usePreviewTeams`가 429 감지 시 `retryAfterSeconds` 상태 + info 토스트, `useComposeTeams(matchId, { onParticipantsChanged })`가 409 `PARTICIPANTS_CHANGED` 시 stale hash 제거 후 콜백 호출
- `types/api.ts` 확장: `PreviewTeamsResponse.participantHash`, `ComposeTeamsInput.participantHash?`
- MSW 핸들러: `test/msw/handlers/matches.ts` — preview fixture에 `participantHash` 포함, 409/429 시나리오 지원
- 신규 RTL 테스트: `auto-balance-modal.test.tsx` +259 LOC (previewHistory / confirm-replace / 429 countdown / 409 re-preview)

**Design**
- 별도 설계 문서 없음(기존 `docs/design/task-71-team-balancing.md`로 충분)

**Migration**
- 0 — Prisma 스키마 변경 없음

## Pipeline Metrics

| 단계 | 에이전트 | 병렬도 | 라운드 |
|------|---------|--------|--------|
| Plan | project-director + tech-planner | 2 parallel | 1 |
| Build Wave 0 | backend-api-dev (DTO + throttler install) | sequential | 1 |
| Build Wave 1 | backend-data-dev + backend-api-dev + frontend-ui-dev + frontend-data-dev | 4 parallel | 1 |
| Review | backend-review + frontend-review + infra-review | 3 parallel | 2 (initial + round-1 fix) |
| Design | design-main + ux-manager + ui-manager | 3 parallel | 1 |
| QA | qa-beginner + qa-regular + qa-power + qa-uiux | 4 parallel | 1 |

- 변경 파일: 17 (backend 9 / frontend 6 / package.json / pnpm-lock.yaml)
- LOC delta: +1,657 insertions / −167 deletions (main..HEAD)
- Integration tests: 기존 10 → 16 (+6)
- RTL tests: +259 LOC (auto-balance-modal.test.tsx)

## Key Decisions

- **Rate limit tracker**: `HostThrottlerGuard`가 `req.user.id`를 트래킹 키로 사용. IP 기반(기본)은 공용 NAT/VPN에서 서로 다른 호스트가 같은 버킷을 공유하므로 불공정. 미인증 요청은 `req.ip` fallback.
- **participantHash 알고리즘**: `SHA-256(sorted_userIds.join(','))` hex digest. Salt 없음(보안 민감 아님), 정렬로 insertion order 비의존.
- **Legacy client 호환**: `ComposeTeamsDto.participantHash`는 optional. 구 클라이언트가 hash 미전달하면 stale check skip + 서버 로그 warn. 리그레션 0.
- **ConfirmReplaceModal은 별도 컴포넌트**: 기존 `Modal`의 확장이 아닌 `role="alertdialog"` alertdialog로 분리. Focus trap 충돌 회피 + 파괴적 작업 명시성.
- **previewHistory cap=2**: 현재 + 직전 1건. 3건 이상은 UI 복잡도 대비 효용 낮다는 tech-planner 판정(A2).
- **ThrottlerModule default limit=1000/60s**: 사실상 무제한. route-level `@Throttle` 데코레이터로만 실제 제한 적용 → 다른 엔드포인트 무영향(R1 완화).
- **Exception code 전파**: `http-exception.filter.ts`가 `HttpException.code` + `getResponse().code`를 body에 복제. `ConflictException('...', { code: 'PARTICIPANTS_CHANGED' })`를 프론트에서 안전하게 식별 가능.

## Known Minor Issues (Non-blocking)

없음 — 모든 acceptance criteria 9/9 달성. 리뷰 라운드 1에서 발견된 "호스트 단위 throttle(C3)" / "409 코드 전파(C2)" / "aria-live dedup" 3건은 fix commit에서 모두 해소.

## Deferred

- **Throttle 확대 적용**: 이번은 `POST /matches/:id/teams/preview`만 scope. 다른 mutation 엔드포인트로의 점진 확대는 운영 지표 보면서 별도 task.
- **Feature flag**: 원자적 revert로 충분하므로 `NEXT_PUBLIC_TEAM_BALANCE_V2_ENABLED` 미도입 (계획 그대로).

## References

- Task doc: `.github/tasks/72-team-balancing-v2-hardening.md`
- Prior task: `.github/tasks/71-completion-report.md`
- Design doc: `docs/design/task-71-team-balancing.md` (알고리즘 설계는 71 그대로)
- Commits (5): `3e4992e` wave 0 → `c460117` wave 1 → `8ed5596` review round 1 → `d052a53` design warnings → `0541d8f` QA
