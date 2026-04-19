# Task 72 — Team Balancing v2 UX + Consistency Hardening

Owners: project-director + tech-planner
Drafted: 2026-04-19
Status: Draft — awaiting handoff after Task 70 completion

---

## Context

Task 71 (AI 팀 밸런싱)이 2026-04-18에 main으로 병합·배포되어 `POST /matches/:id/teams/preview`와 확정 엔드포인트가 프로덕션에서 동작 중이다. 리뷰·디자인·QA 라운드에서 **출시 블로커는 아니지만 v2로 이연된 개선 항목**이 6건 누적되었으며, 71 완료 리포트의 "Known Minor Issues" 섹션과 QA-regular F1, QA-power CONCERN-2·3, ui-manager W1, infra-review Warning(rate limit)에 기록되어 있다.

이번 task는 **새 기능 추가가 아니라 71의 사용자 경험을 안정화**하는 data-driven 후속 작업이다. 새 migration 없이 기존 스키마/서비스를 확장하여 드리프트·혼선·불공정한 재호출을 제거한다.

관련 전제:
- `TeamBalancingService` (순수 함수, `apps/api/src/matches/team-balancing.service.ts`) 그대로 재사용
- `MatchesService.previewTeams` / `generateTeams` 확장
- 프론트엔드 `AutoBalanceModal` 상태 모델 확장 (re-roll 이력, 교체 확인)

---

## Goal

Task 71 출시 직후 식별된 6개 UX·일관성 결함을 한 PR로 해소하여 호스트가 "**preview-confirm 간 결과가 달라질 수 있다**", "**무한 재추첨 남용이 가능하다**", "**이전 결과로 되돌릴 수 없다**", "**기존 팀이 경고 없이 교체된다**"고 느끼지 않게 한다. 또한 QA-power CONCERN에서 지적된 **3-team/4-team snake, in_progress 상태, 동시 호출** 엣지 커버리지를 integration test에 추가한다.

---

## Original Conditions (verbatim)

- [ ] **C1** `PreviewTeamsResponseDto`에 `participantHash: string` 필드 추가. 서버가 확정된 참가자 userId 배열(정렬)을 SHA-256으로 해시하여 반환
- [ ] **C2** `ComposeTeamsDto`에 optional `participantHash: string` 허용. `generateTeams`가 현재 참가자 해시와 불일치 시 `409 PARTICIPANTS_CHANGED` 반환, UI는 자동 재추첨 + 토스트 안내
- [ ] **C3** `POST /matches/:id/teams/preview`에 `@Throttle({ default: { limit: 20, ttl: 60_000 } })` 적용 (호스트당 분당 20회). 초과 시 `429 TOO_MANY_REQUESTS`
- [ ] **C4** 모달에서 직전 최대 2건의 preview 결과를 `previewHistory`로 유지. "이전 결과 보기" 토글로 비교 UI 제공. 이력 중 하나를 선택해 바로 확정 가능
- [ ] **C5** 이미 팀이 배정된 매치에서 재확정 시 `ConfirmReplaceModal` 표시 — "기존 팀 구성이 교체됩니다" 경고 + "교체" CTA에서만 실제 compose mutation 호출
- [ ] **C6** `AutoBalanceModal`의 team cards grid를 `teamCount >= 3`일 때도 `sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3`로 확장 (모바일 1열 유지)
- [ ] **C7** `matches-team-balancing.e2e-spec.ts`에 누락된 integration test 6건 추가:
  - 3-team snake 분배 ([4,4,3])
  - 4-team snake 패턴 (A-B-C-D-D-C-B-A-A-B-C-D-...)
  - `in_progress` 상태 매치 → 409 MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT
  - 동시 preview 10회 (PRNG 결정성 유지)
  - `participantHash` 불일치 시 409 (C2 검증)
  - Rate limit 초과 시 429 (C3 검증)
- [ ] **C8** CLAUDE.md 커스텀 훅 섹션에 `usePreviewTeams` 반환 타입 변경 반영 (+participantHash) 및 "`PreviewTeamsResponse.participantHash`로 stale preview 감지" 설명 추가

---

## User Scenarios

### S1 — 참가자 churn 감지 (C1·C2)
호스트 A가 12명 참가자로 preview. 도중에 참가자 1명이 탈퇴. 호스트가 "확정" 누름 → 서버는 `participantHash` 불일치 감지, 409 반환. 모달은 에러 상태 없이 자동으로 `previewMutation.mutate()` 재호출 → 11명 기준 새 preview가 표시되며 "참가자가 변경되어 다시 계산했어요" 토스트. 호스트가 새 결과를 보고 확정.

### S2 — Rate limit 보호 (C3)
호스트가 재추첨 버튼을 1초에 10번 이상 빠르게 클릭 → 21번째 호출부터 429 응답. 모달은 "잠시 후 다시 시도해 주세요 (분당 최대 20회)" 토스트 + 재추첨 버튼 일시 비활성 (60초 카운트다운).

### S3 — Re-roll 이력 비교 (C4)
호스트가 재추첨을 3회 수행. 모달 상단에 "이전 결과 1건 · 현재 결과" 토글 노출. 호스트가 "이전 결과" 클릭 → 직전 preview 구성이 복원(읽기전용 뷰). "이 구성으로 확정" 버튼으로 해당 seed를 재사용해 compose mutation 호출. 3개 이상 re-roll 시 가장 오래된 결과부터 폐기 (FIFO, 최대 2건 유지).

### S4 — 재확정 경고 (C5)
호스트가 이미 팀 배정을 확정한 매치에서 "팀 자동 구성" 다시 열기 → preview까지 정상 흐름. "확정" 버튼 클릭 순간 `ConfirmReplaceModal` 팝업: "현재 A팀(5명) · B팀(5명) 구성이 새 배정으로 교체됩니다. 참가자에게는 새 구성만 보여요." + "교체" / "취소" CTA. 사용자가 "교체" 누를 때만 실제 mutation 호출, "취소"는 preview 상태 유지.

### S5 — 4팀 데스크톱 레이아웃 (C6)
호스트가 8명 참가자 + teamCount=4 선택. 데스크톱(1280px)에서 팀 카드가 세로 1열로 쌓이던 기존 동작이 2열로 변경되어 스크롤 없이 한 눈에 비교 가능. 모바일(360px)에서는 여전히 단일 컬럼.

---

## Test Scenarios

### Happy path
- C1: `POST /matches/:id/teams/preview` 응답에 `participantHash: string(64)` 포함
- C2: preview → compose 같은 participantHash 전달 → 200 성공
- C4: 재추첨 3회 → 모달 state 에 previewHistory.length === 2 (FIFO cap)
- C5: 기존 팀 없는 매치에서 확정 → 경고 모달 표시하지 않고 바로 compose
- C6: 1280px viewport에서 teamCount=4 → 2열 그리드 스냅샷 매치

### Edge cases
- C2: preview 후 참가자 변동 → stale hash로 compose 호출 → 409 + frontend auto re-preview 경로 확인
- C3: 20회 초과 preview → 429 응답 + `Retry-After: 60` 헤더
- C4: previewHistory 상태에서 모달 close → 재오픈 시 history 리셋 (세션 단위)
- C5: preview 상태에서 "교체" 클릭 중 네트워크 실패 → confirm modal 내부 ErrorState + 재시도

### Error cases
- C2: 잘못된 형식 participantHash (non-hex) → 400
- C3: 429 응답 시 UI가 재추첨 버튼을 60초간 disable + 카운트다운 표시
- C5: replace modal 이 열린 상태에서 모달 외 클릭/ESC → "취소"로 처리 (실수 방지)

### Mock / fixture updates
- `apps/api/test/integration/matches-team-balancing.e2e-spec.ts` — 6건 신규 test (C7)
- `apps/web/src/test/msw/handlers/matches.ts` — preview fixture 에 `participantHash` 필드 추가
- `apps/web/src/components/match/__tests__/auto-balance-modal.test.tsx` — previewHistory + confirm-replace 플로우 RTL 테스트 3건 추가

---

## Parallel Work Breakdown

### Wave 0 (sequential)
- **[backend-api-dev]** `apps/api/src/matches/dto/match.dto.ts` — `PreviewTeamsResponseDto.participantHash` + `ComposeTeamsDto.participantHash` 추가
- **[infra-security-dev]** `apps/api/src/common/throttler.module.ts` (또는 `app.module.ts` ThrottlerModule.forRoot) — ThrottlerModule 글로벌 등록 (이미 있다면 skip)

### Wave 1 (parallel)
- **Track A — backend-data-dev**: `MatchesService.previewTeams/generateTeams` — participantHash 생성(SHA-256 of sorted userId list) + stale check. `matches.service.spec.ts` 추가 케이스.
- **Track B — backend-api-dev**: `@Throttle` 데코레이터 preview 엔드포인트 적용, 429 응답 Swagger 기술, 통합 테스트 C7(6건) 추가
- **Track C — frontend-ui-dev**: `AutoBalanceModal` 확장 — previewHistory state + 비교 토글 + `ConfirmReplaceModal` 신규 컴포넌트. 4팀 그리드 responsive. aria-live로 "참가자가 변경되어 재계산" 안내
- **Track D — frontend-data-dev**: `usePreviewTeams` 응답 타입 확장, 429 에러 감지 시 retry-after toast 제어. `useComposeTeams` 409 → auto preview re-trigger 플로우. MSW 핸들러 업데이트.

### Wave 2 (integration)
- `tsc --noEmit` + `pnpm test` 양쪽 앱
- `pnpm test:integration -- matches-team-balancing` (DB 기동 필요)
- 브라우저 수동 검증 (아래 V&V 섹션)

---

## Verification & Validation

### Pre-merge checks
```bash
# Backend
cd apps/api
pnpm lint
npx tsc --noEmit
pnpm build
pnpm test                      # 29+ suites, 638+ tests expected
pnpm test:integration -- matches-team-balancing   # 16 cases (기존 10 + 신규 6)
# DB 필요: docker compose up -d postgres

# Frontend
cd apps/web
npx tsc --noEmit
pnpm lint
pnpm test auto-balance-modal   # 재추첨 history + confirm-replace 테스트 포함 기대
pnpm test                      # 352+ tests 기대
```

### Manual smoke (pre-deploy, dev 환경)

매치 생성·참가자 12명 dev-login 기본 시나리오 선행 후 아래 체크리스트:

1. **C1·C2 (participantHash churn)**
   - 호스트로 preview 호출 → 응답 JSON 에 `participantHash` (64자 hex) 포함 확인 (DevTools Network)
   - 두 번째 브라우저에서 참가자 중 1명이 `/matches/:id/leave` 수행
   - 첫 번째 브라우저에서 "확정" 클릭 → 자동으로 다시 preview + 토스트 "참가자가 변경되어 다시 계산했어요" 확인
2. **C3 (rate limit)**
   - 재추첨 버튼을 빠르게 25회 클릭 → 21번째부터 429, UI가 60초 disable + 카운트다운
   - `curl -X POST http://localhost:8100/api/v1/matches/:id/teams/preview -H "Authorization: Bearer $TOKEN"`로 21회 → 429 Retry-After 확인
3. **C4 (re-roll history)**
   - 재추첨 3회 수행 → "이전 결과 1건 · 현재" 토글 노출
   - 이전 결과 클릭 → 팀 구성이 직전 상태로 교체(읽기전용) + "이 구성으로 확정" 버튼
   - 확정 수행 → 해당 seed 로 compose mutation 성공
4. **C5 (replace warning)**
   - 이미 팀 배정된 매치 → 모달 재오픈 → preview 후 "확정" 클릭
   - `ConfirmReplaceModal` 에서 현재 배정 요약 표시 + "교체"/"취소"
   - "취소" → preview 상태 유지, 아무 mutation 발생 안 함
   - "교체" → 기존 Team row 교체, toast 성공
5. **C6 (4팀 데스크톱 2열)**
   - Chrome DevTools 반응형 모드 1280px + teamCount=4 → 팀 카드 2×2 격자 확인
   - 360px 모바일 → 여전히 단일 컬럼

### Post-deploy validation
- 배포 직후 Sentry/서버 로그에서 `MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT` / `PARTICIPANTS_CHANGED` / `429` 응답 비율 모니터링 (30분)
- Grafana(또는 `/admin/stats/matches`)에서 "팀 자동 구성" 성공률 baseline 대비 하락 없는지 확인
- 가장 활성도 높은 2개 매치에 대해 수동 재현(호스트 시점) — 위 1~5 시나리오 중 3건 spot check

### Rollback plan
- **DB**: 마이그레이션 없음 → 롤백 단순
- **Revert**: `git revert <merge-commit>` → PR + 재배포 (기존 스키마 호환)
- **Feature flag**: `NEXT_PUBLIC_TEAM_BALANCE_V2_ENABLED`는 도입하지 않음 (원자적 revert이면 충분). 단, 문제 발생시 frontend side에서만 `previewHistory`, confirm-replace 로직을 if-flag로 끄는 hotfix는 가능

### Regression surface
- 영향 범위: `apps/api/src/matches/*`, `apps/web/src/components/match/auto-balance-modal.tsx`, `usePreviewTeams` / `useComposeTeams` 콜 사이트
- 회귀 체크리스트:
  - [ ] 매치 생성/참가/완료 플로우 (task 66 스크린샷 audit 기준)
  - [ ] 비-호스트가 `/teams/preview` 호출 → 403 유지
  - [ ] Cold-start 참가자만 있는 매치도 정상 preview (task 71 test 4)
  - [ ] `participantHash` 필드 없이 compose 호출(구 클라이언트 호환성) → hash 검증 skip + 200
  - [ ] 429 응답이 `NotificationsService` 등 다른 엔드포인트에 영향 주지 않는지 (ThrottlerModule scope)

---

## Acceptance Criteria

1. Preview 응답에 `participantHash` 필드가 64자 hex 로 존재하며 참가자 userId 정렬 기반으로 결정적
2. Compose 호출 시 stale hash 전달 → 409 `PARTICIPANTS_CHANGED` + UI 자동 재-preview
3. Preview rate limit: 호스트당 분당 20회 초과 시 429 + `Retry-After: 60`
4. 모달이 직전 preview 2건까지 보존, 비교/재사용 가능
5. 이미 팀이 있는 매치의 재확정에는 `ConfirmReplaceModal` 이 노출
6. Desktop(≥640px)에서 teamCount=3·4 일 때 팀 카드 2열 이상
7. 신규 integration test 6건 모두 통과 (통합 테스트 suite 16건)
8. `tsc --noEmit` clean, 기존 352 web tests + 638 api tests 무회귀
9. 배포 후 프로덕션 에러율 baseline 대비 +0.5% 이내

---

## Tech Debt Resolved

- Task 71 Known Minor Issues 중 4/4 해소 (rate limit, participantHash, re-roll history, 3-4 team grid)
- QA-power CONCERN-2 (replace warning) 해소
- QA-power "Missing test coverage" 6건 중 4건 해소 (3-team/4-team snake, in_progress, 동시성)
- ui-manager W1 (3/4팀 그리드) 해소

---

## Security Notes

- **Rate limit 확장**: ThrottlerModule 을 다른 mutation 엔드포인트에도 점진 확대할 발판. 이번 task 에서는 preview 만 scope.
- **participantHash 위조 내성**: 서버는 클라이언트 전달 hash 가 서버 자체 계산 결과와 일치하는지만 검증. 공격자가 hash 를 재사용해도 참가자 구성이 실제 바뀌었다면 불일치 → 방어됨
- **429 payload**: 민감 정보 없음. `Retry-After` 헤더만 노출
- **Admin bypass 없음**: 호스트 guard 유지. 관리자는 이미 별도 채널

---

## Risks & Dependencies

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| R1 | ThrottlerModule 전역 등록이 기존 엔드포인트에 의도치 않은 throttle 부여 | High | route-level @Throttle 데코레이터로만 적용, global default 는 limit=1000 (사실상 무제한) |
| R2 | `participantHash` 없는 구 클라이언트의 compose 호출이 stale 인 경우 | Medium | hash 미전달 시 stale check skip + 서버 로그에 legacy client warn |
| R3 | confirm-replace modal 이 중첩 Modal 로 인해 focus trap 충돌 | Low | 별도 컴포넌트 + `role="alertdialog"`로 접근성 확인 |
| R4 | 재추첨 이력 2건 유지가 메모리 증가 (30명 참가자 × 2건 = 60 객체) | Low | 무시 가능 수준, React 메모리 예산 내 |

### Dependencies
- Task 71 main merged ✅
- `@nestjs/throttler` 패키지 설치 여부 확인 (이미 있으면 skip, 없으면 `pnpm add -F @teameet/api @nestjs/throttler`)
- Task 70 작업 중이므로 `matches.service.ts` 병합 충돌 가능 → Task 70 merge 후 착수 권장

---

## Ambiguity Log

| ID | 질문 | 답변 (planning) |
|----|------|----------------|
| A1 | ThrottlerModule 을 global 로 할지 route-level 로? | Route-level 로 preview 만 적용. 나중에 idempotent sweep(Task 73)에서 확대 |
| A2 | previewHistory 최대 건수? | **2** (현재 + 직전). 3 이상은 UI 복잡도 대비 효용 낮음 |
| A3 | confirm-replace 모달을 기존 Modal 확장으로 만들지 별도 컴포넌트? | **별도** `components/match/confirm-replace-modal.tsx`. alertdialog role 로 접근성 차별화 |
| A4 | 429 응답 시 Retry-After 구현은 ThrottlerGuard 기본값으로 충분? | **Yes** — `@nestjs/throttler` 는 기본 헤더 설정 제공 |
| A5 | participantHash 알고리즘? | SHA-256 hex digest of `participants.map(p => p.userId).sort().join(',')`. Salt 불필요 (보안 민감 아님) |

---

## Complexity Estimate

**Medium**

| Item | Complexity | Est. LOC |
|------|------------|----------|
| participantHash 서버 구현 + DTO + stale check | Medium | ~150 |
| ThrottlerModule setup + @Throttle | Low | ~30 |
| previewHistory state + 비교 UI | Medium | ~180 |
| ConfirmReplaceModal 신규 | Medium | ~140 |
| 4팀 그리드 responsive | Low | ~10 |
| 신규 6개 integration test | Medium | ~260 |
| RTL 테스트 3건 | Low | ~120 |
| Hook 429/409 에러 처리 | Low | ~60 |
| 문서·CLAUDE.md 갱신 | Low | ~30 |
| **Total** | **Medium** | **~980** |

---

## Handoff checklist

- [ ] Task 70 main merged (prerequisite — `matches.service.ts` 충돌 최소화)
- [ ] Ambiguity Log 5개 항목 사용자/tech-planner 재확인
- [ ] `@nestjs/throttler` 설치 여부 확인
- [ ] ThrottlerModule 글로벌 default 설정 리뷰
- [ ] 프로덕션 VAPID 미설정 → 429 미준수 PWA 에서 영향 없는지 확인 (독립)
