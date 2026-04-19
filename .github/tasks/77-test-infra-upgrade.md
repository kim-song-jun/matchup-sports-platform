# Task 77 — Test Infra Upgrade (Vitest 1→3, jsdom 24→26, @swc/cli 0.7→0.8)

Owners: project-director + tech-planner
Drafted: 2026-04-19
Status: Draft — awaiting handoff
Priority: P2 (tech debt chore)

---

## Context

`apps/web/package.json` 감사 결과 테스트 인프라가 2개 메이저 버전 뒤처져 있다:

| 패키지 | 현재 | 최신 안정 | 격차 |
|--------|------|-----------|------|
| `vitest` | 1.6.0 | 3.x | major×2 |
| `jsdom` | 24.1.0 | 26.x | major×2 |
| `@vitejs/plugin-react` | 4.3.0 | minor — compatible | - |
| `@testing-library/react` | 16.3.2 | current | - |
| `msw` | 2.12.14 | current minor | - |

백엔드:

| 패키지 | 현재 | 최신 안정 |
|--------|------|-----------|
| `jest` | 30.3.0 | current ✓ |
| `ts-jest` | 29.4.6 | current ✓ |
| `@swc/cli` | 0.7.10 | 0.8.x (latest available; 0.9 unreleased) |

현재 전체 테스트 스위트 43 파일 / 422+ 테스트가 통과 중이며 알려진 장애는 없다 (Task 72–74 이후 baseline 갱신). 이번 업그레이드는 **순수 chore** 로 사용자 기능 변경 없음. 개별 패키지를 점진적으로 올리면 패키지 간 호환성 추적이 어려우므로 한 PR 에서 조율된 업그레이드를 단행한다.

---

## Goal

프론트엔드 테스트 인프라를 현재 안정 버전으로 올리고, 기존 422+개 웹 테스트와 638개 API 테스트 + 42개 통합 테스트를 모두 그린으로 유지한다. DX 회귀(HMR 속도 저하, watch 반응성 악화)를 발생시키지 않으며, CI 소요 시간은 기준선 대비 10% 이내를 유지한다.

---

## Original Conditions

- [ ] **C1** `vitest` 1.6.0 → 3.x (major — breaking change 대응 필수)
- [ ] **C2** `jsdom` 24.1.0 → 26.x (DOM API 변화 확인)
- [ ] **C3** `@vitejs/plugin-react` → Vitest 3 와 호환되는 최신 minor
- [ ] **C4** `@testing-library/jest-dom` / `@testing-library/react` 호환성 검증 (버전 고정 불요)
- [ ] **C5** `msw` minor 업데이트 — non-breaking 일 때만, 2.12 잔류 허용
- [ ] **C6** API `@swc/cli` 0.7.10 → 0.8.x (latest available; 0.9 is unreleased upstream — done against available latest)
- [ ] **C7** 웹 422+ + API 638 + 통합 42 테스트 전량 그린
- [ ] **C8** `vitest.config.ts` — Vitest 3 breaking changes 대응 (config 스키마 변경 포함)
- [ ] **C9** HMR + watch 반응성 확인 (테스트 재실행 목표 <500ms on save)
- [ ] **C10** CI 소요 시간 기준선 대비 ≤10% 증가 (기준선: Task 71 기준 ~4m58s)

---

## User Scenarios

### S1 — 개발자 단위 테스트 실행
개발자가 `cd apps/web && pnpm test` 실행 → 422+개 테스트 통과, 기존 대비 수행 시간 동일하거나 단축.

### S2 — watch 모드 HMR
개발자가 `pnpm test:watch` 실행 중 컴포넌트 파일 저장 → 500ms 이내에 관련 테스트 재실행.

### S3 — CI 파이프라인
PR 생성 시 CI가 `pnpm test` 실행 → 그린, 총 소요 시간 5m30s 미만.

---

## Test Scenarios

### Happy path
- C1~C3: 업그레이드 후 기존 422+개 테스트 그대로 통과, assertion API 변화 없음
- C6: `nest build` 가 `@swc/cli` 0.8.x 로 정상 컴파일 (`dist/` 출력 동일)
- C9: watch 모드 파일 저장 → 500ms 내 재실행 (수동 확인)

### Edge cases
- Vitest 3의 `test.concurrent` 기본값 변경 — 현재 사용 중인 concurrent 테스트 있는지 grep 후 명시적 옵션 추가
- jsdom 26의 `Element.scrollTo`, `HTMLDialogElement.showModal`, `dialog::backdrop` 동작 변화 — 해당 API 사용 테스트 목록 사전 추출
- `vi.useFakeTimers()` 의미론 변화(Vitest 3) — timer mock 테스트 결과 재검증
- snapshot 직렬화 포맷 변화 — 기존 `.snap` 파일 존재 시 전량 재생성 필요

### Error cases
- `@swc/cli` 0.8.x 가 기존 NestJS CLI (`nest build`) 와 충돌 시: `nest build --watch` 로 전환하거나 `@swc/core` pin
- msw minor 버전이 핸들러 lifecycle 변경 → wave 1에서 msw 업데이트 보류 조건

### Mock / fixture updates
- Vitest 3 config 스키마 변경 시 `apps/web/vitest.config.ts` 수정
- 기존 `.snap` 파일이 있다면 `pnpm test -u` 로 재생성
- `apps/web/src/test/msw/` 핸들러는 이미 msw 2.x 기준 — 변경 없음 예상

---

## Parallel Work Breakdown

### Wave 0 (sequential — 단일 개발자, 패키지 변경)
패키지 업그레이드 및 lockfile 커밋:
```bash
cd apps/web
pnpm up -E vitest@latest jsdom@latest @vitejs/plugin-react@latest

cd apps/api
pnpm up -E @swc/cli@latest
```
- `vitest.config.ts` 스키마 breaking change 대응 (migration guide 참조)
- `pnpm-lock.yaml` diff 검토 후 커밋

### Wave 1 (parallel — breakage 트랙별)

**Track A — Vitest 3 breaking changes** (frontend dev):
- `test.concurrent` 기본값 변경 대응
- `happy-dom` 제안 무시, `jsdom` 유지
- timer mock 의미론 확인, 필요 시 수정

**Track B — jsdom 26 DOM quirk fixes** (frontend dev):
- `Element.scrollTo` / `dialog` 관련 테스트 grep 후 재검증
- `jsdom` 환경 선언 (`@vitest-environment jsdom`) 명시 확인

**Track C — @swc/cli 0.8.x API build** (backend dev):
- `nest build` 정상 컴파일 확인
- `@swc/core` 버전 호환 확인
- API 유닛 + 통합 테스트 무회귀 확인

### Wave 2 (integration)
- `cd apps/web && pnpm test` + `cd apps/api && pnpm test && pnpm test:integration` 전량
- HMR smoke (수동)
- Vitest UI (`pnpm test --ui`) 기동 확인

---

## Verification & Validation

### Pre-merge checks

**Frontend**:
```bash
cd apps/web
pnpm install
npx tsc --noEmit
pnpm test                 # 422+ pass
pnpm test:watch           # HMR <500ms 수동 확인
pnpm build                # next build unchanged
```

**Backend**:
```bash
cd apps/api
pnpm install
pnpm build                # swc 0.8.x 컴파일 확인
pnpm test                 # 638 pass
pnpm test:integration     # 42 pass
```

**Performance baseline**:
```bash
# 업그레이드 전
time (cd apps/web && pnpm test)
# 업그레이드 후
time (cd apps/web && pnpm test)
# 목표: 같거나 단축
```

**Lockfile diff 검토**:
```bash
git diff pnpm-lock.yaml | head -60
# 고아 dep / phantom dep 없음 확인
```

### CI smoke
- PR CI 실행 후 Task 71 기준선(4m58s) 대비 10% 이내 확인
- 목표 상한: <5m30s (Test job 기준)

### Manual verification
1. 컴포넌트 테스트 파일 열기 → 의도적으로 실패하는 assertion 추가 → 저장 → watch가 <500ms 내에 재실행하는지 확인
2. `pnpm test --ui` → Vitest UI 웹 화면 로딩 확인

### Rollback
- 단일 PR revert: `pnpm-lock.yaml` 복원 시 구 버전 복구
- DB 변경 없음, API 런타임 영향 없음 (test-only 변경)

### Regression surface
- 앱 런타임은 변화 없음 — 테스트 파일만 영향
- jsdom DOM API mock 동작 차이 (scrollTo, dialog 계열)
- `vi.useFakeTimers` 의미론 변화
- MSW 핸들러 라이프사이클 (이미 2.x — 안정적 예상)
- snapshot 직렬화 포맷 변경 시 `.snap` 전량 재생성 필요

---

## Acceptance Criteria

1. `vitest@3.x`, `jsdom@26.x`, `@swc/cli@0.8.x` (latest available; 0.9 unreleased) 가 lockfile 에 반영됨
2. `cd apps/web && pnpm test` 422+개 통과
3. `cd apps/api && pnpm test` 638개 + `pnpm test:integration` 42개 통과
4. `pnpm test` CI 시간 기준선 대비 ≤10% 증가
5. watch 모드 save → 재실행 <500ms (수동 확인)
6. `pnpm-lock.yaml` diff 리뷰 완료, 고아 dep 없음
7. `vitest.config.ts` Vitest 3 스키마 기준으로 갱신

---

## Tech Debt Resolved

- Vitest 1.x → 3.x: 2개 메이저 버전 격차 해소
- jsdom 24 → 26: DOM quirk 수정 18개월치 반영
- 향후 의존성 부패 위험 감소

---

## Security Notes

- Vitest/jsdom 18개월치 CVE 패치 흡수
- `pnpm audit` 업그레이드 후 실행, HIGH/CRITICAL 신규 발견 시 즉시 처리
- 테스트 전용 변경 — 프로덕션 번들 및 API 런타임에 보안 면 변화 없음

---

## Risks & Dependencies

| ID | Risk | Impact | Mitigation |
|----|------|--------|-----------|
| R1 | Vitest 3 breaking API 변경으로 다수 테스트 실패 | Medium | migration guide 사전 숙지, wave 1에서 트랙별 분리 대응 |
| R2 | jsdom 26 DOM 동작 변화로 컴포넌트 테스트 실패 | Medium | scrollTo·dialog 사용 파일 grep 후 선제 파악 |
| R3 | `vi.useFakeTimers` 의미론 변화로 타이머 테스트 오동작 | Low | 타이머 mock 테스트 집중 검증 |
| R4 | CI 메모리 프로파일 변화(Vitest 3 runner 아키텍처 변경) | Low | CI 러너 메모리 경보 1주 모니터링 |
| R5 | `@swc/cli` 0.8.x 와 `@swc/core` 1.x 버전 불일치 | Low | `@swc/core` 같이 latest 로 올리거나 peer dependency 확인 |

### Dependencies
- Task 72/73/74 머지 이후 착수 권장 — 기존 테스트 플레이크 소스 격리 후 infra 업그레이드가 유리
- Turborepo 캐시 무효화 예상 — 첫 CI 실행은 캐시 miss 로 시간이 더 걸릴 수 있음 (기준선 비교 시 두 번째 실행 사용)

---

## Ambiguity Log

| ID | 질문 | 결정 (planning) |
|----|------|----------------|
| A1 | `jsdom` 대신 `happy-dom` (더 빠름)으로 전환? | **유지**: `jsdom` 안정성 우선. `happy-dom` 평가는 별도 task |
| A2 | `msw` 2.12 → 2.15+ 업그레이드 포함? | **조건부**: non-breaking 이면 포함, 핸들러 변경 필요 시 2.12 잔류 |
| A3 | `@vitejs/plugin-react` major bump? | **latest compatible with Vitest 3** 로 bump |

---

## Complexity Estimate

**Medium** (chore, ~1 focused day, Vitest 3 breaking change 수 따라 변동)

| 항목 | 복잡도 | 예상 LOC |
|------|--------|----------|
| 패키지 업그레이드 + lockfile | Low | - |
| `vitest.config.ts` Vitest 3 대응 | Low-Medium | ~30 |
| Breaking change 테스트 수정 | Medium | ~100~200 |
| `.snap` 재생성 (있다면) | Low | - |
| `@swc/cli` 빌드 검증 | Low | ~10 |
| **Total** | **Medium** | **~150~250** |

---

## Handoff Checklist

- [ ] `pnpm test` 기준선 시간 기록 (업그레이드 전)
- [ ] CI 기준선 시간 기록 (Task 71 merge 후 run 참조: ~4m58s)
- [ ] Task 72/73/74 merge 상태 확인 후 착수 (플레이크 소스 격리)
- [ ] Vitest 3 migration guide (`https://vitest.dev/guide/migration`) 사전 숙지
- [ ] 타이머 mock / `test.concurrent` 사용 파일 grep 결과 준비
- [ ] 집중 1일 작업 가능한 팀원 배정 (복수 task 병행 금지)
