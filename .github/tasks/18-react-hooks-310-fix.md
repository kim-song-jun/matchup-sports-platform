# 18 — React Error #310 Production Crash Fix (P0)

> **Parent plan**: `/Users/kimsungjun/.claude/plans/enumerated-scribbling-popcorn.md`
> **Wave**: 1 (P0 critical, task 16 Phase 1.1로 진범 식별 후 시작)
> **Owner**: frontend-ui-dev (lead, sub-component 분리 가능 시 frontend-data-dev 협업)
> **Status**: pending
> **Estimated PRs**: 1 (단일 page 파일 수정 위주)
> **Blocked by**: task 16 Phase 1.1 (진범 페이지 식별)

---

## Context

사용자가 프로덕션에서 다음 에러를 마주침:

```
Error: Minified React error #310; visit https://react.dev/errors/310
  at ao (6a63df6d-02370c574a937568.js:1:52416)
  at aI (6a63df6d-02370c574a937568.js:1:58894)
  at Object.a$ [as useEffect] (6a63df6d-02370c574a937568.js:1:59119)
  at t.useEffect (4980-2bd7d016fdfe9d03.js:1:164194)
  at E (page-42b09a0ef3e9b188.js:1:21173)
```

- **React #310** = "Rendered more hooks during this render than during the previous render."
- 원인: hook이 조건부로 호출되어 리렌더 시 hook 호출 횟수가 달라짐 → React가 hook order를 매칭 못함
- trace의 `E` 함수 = 단일 page component (Next.js App Router page.tsx의 default export, minified name)
- hash `page-42b09a0ef3e9b188.js`는 빌드별로 다르므로 task 16 Phase 1.1에서 sourcemap으로 식별 필요
- task 16 사전 조사에서 후보 페이지 6개 추림 (Phase 1.1.5 참조)

이 task는 진범이 식별된 후 그 페이지를 hooks rules에 맞게 리팩토링한다.

## Goal

- React #310 에러가 production에서 재현되지 않음
- hooks rules ESLint plugin이 해당 파일에 warning 0
- 회귀 방지를 위해 `eslint-plugin-react-hooks` 규칙이 CI에서 강제됨

## Original Conditions

- [ ] 사용자가 보고한 React #310 크래시 사라짐
- [ ] 동일 패턴이 다른 페이지에 잠재해 있는지 확인
- [ ] CI에서 hooks rule 위반이 자동 차단되도록 강제

---

## Phase 2.2A — 진범 페이지 확정

> Wave 1, Owner: frontend-ui-dev, depends on task 16 Phase 1.1

### Steps

- [ ] **A.1** task 16의 verification report에서 진범 file:line 확인
- [ ] **A.2** 진범 파일을 line 1부터 끝까지 read
- [ ] **A.3** 위반 패턴 분류:
  - [ ] **Pattern P1**: early return 이후 hook 호출
    ```tsx
    if (loading) return <Spinner />;
    useEffect(...) // ← 위반
    ```
  - [ ] **Pattern P2**: 조건부 hook 호출
    ```tsx
    if (data) {
      useEffect(...) // ← 위반
    }
    ```
  - [ ] **Pattern P3**: loop 안에서 hook
    ```tsx
    items.forEach(item => useState(...)) // ← 위반
    ```
  - [ ] **Pattern P4**: 다른 hook 안에서 hook
    ```tsx
    useMemo(() => useState(...), []) // ← 위반
    ```
  - [ ] **Pattern P5**: dynamic deps array (덜 흔함)
- [ ] **A.4** 동일 파일에 다른 hook 위반이 더 있는지 전수 점검

### Acceptance
- 위반 line + 패턴 분류 완료

---

## Phase 2.2B — 패턴별 수정 전략

> Wave 1, Owner: frontend-ui-dev

### Pattern P1: Early return 이후 hook → 모든 hook을 return 앞으로

**Before**:
```tsx
function Page() {
  const { data, isLoading } = useQuery(...);
  if (isLoading) return <Spinner />;
  if (!data) return <NotFound />;

  useEffect(() => {  // ← 위반
    document.title = data.title;
  }, [data]);

  return <main>...</main>;
}
```

**After**:
```tsx
function Page() {
  const { data, isLoading } = useQuery(...);

  useEffect(() => {  // ← hook 먼저
    if (data) document.title = data.title;
  }, [data]);

  if (isLoading) return <Spinner />;
  if (!data) return <NotFound />;
  return <main>...</main>;
}
```

### Pattern P2: 조건부 hook → 항상 호출하고 deps로 분기

**Before**:
```tsx
if (user?.id) {
  useEffect(() => fetchProfile(user.id), [user.id]);
}
```

**After**:
```tsx
useEffect(() => {
  if (!user?.id) return;
  fetchProfile(user.id);
}, [user?.id]);
```

### Pattern P3/P4: 컴포넌트 분리

dynamic 개수의 hook이 필요한 경우 sub-component로 분리:
```tsx
function ItemList({ items }) {
  return items.map(item => <Item key={item.id} item={item} />);
}
function Item({ item }) {  // ← 각 Item이 자체 hook 보유
  const [open, setOpen] = useState(false);
  ...
}
```

### Steps

- [ ] **B.1** Phase A에서 식별된 위반 패턴별로 위 전략 매핑
- [ ] **B.2** 수정 diff 작성 (한 파일에 여러 위반 가능)
- [ ] **B.3** 같은 컴포넌트 안에서 hook 호출 순서 안정성 확인:
  - [ ] 모든 hook이 컴포넌트 최상단 (return 앞)에 위치
  - [ ] 어떤 분기에서도 hook 개수/순서 동일
- [ ] **B.4** 함수 컴포넌트 분리가 필요하면:
  - [ ] sub-component 신규 파일 또는 같은 파일에 정의
  - [ ] props 인터페이스 명시
  - [ ] memo가 필요한 경우 `React.memo` 적용

### Acceptance
- 위반 패턴 0
- 코드 가독성 유지 (과도한 분리 금지)

---

## Phase 2.2C — Lint Rule 강제

> Wave 1, Owner: frontend-ui-dev, B와 병렬

### Background
현재 hooks 위반이 빌드를 막지 않고 있음 (CLAUDE.md 검증으로 next.config.ts에 `ignoreBuildErrors`는 없으나, ESLint는 lint 단계에서만 동작). lint가 CI에서 차단을 보장하는지 확인.

### Steps

- [ ] **C.1** `apps/web/eslint.config.*` (또는 `.eslintrc*`) read → `eslint-plugin-react-hooks` 등록 여부 확인
- [ ] **C.2** 다음 규칙이 `error` level인지 확인 (warn 아님):
  - [ ] `react-hooks/rules-of-hooks: error`
  - [ ] `react-hooks/exhaustive-deps: warn` (warn 유지 OK)
- [ ] **C.3** 누락이면 추가
- [ ] **C.4** `pnpm --filter @matchup/web lint` 실행 → hooks rule 위반 0 확인
  - 현재 위반이 더 있으면 모두 같은 PR에서 fix (scope 작아 안전)
- [ ] **C.5** `.github/workflows/deploy.yml`이 lint를 fail-on-error로 돌리는지 확인 (이미 그런 것으로 사전 조사됨)

### Acceptance
- ESLint hooks rule = error
- lint 통과

---

## Phase 2.2D — 다른 페이지 잠재 위반 사전 점검

> Wave 1, Owner: frontend-ui-dev, optional but recommended

### Steps

- [ ] **D.1** Grep으로 의심 패턴 1차 스캔:
  ```
  pattern: "if\s*\([^)]*\)\s*\{[^}]*use(Effect|State|Memo|Callback|Query)"
  glob: apps/web/src/**/*.tsx
  ```
- [ ] **D.2** Grep으로 의심 패턴 2차 (early return 후 hook):
  ```
  pattern: "return\s+null"  → 해당 라인 이후에 hook이 있는지 수동 확인
  pattern: "return\s+<[A-Z]"
  ```
- [ ] **D.3** 발견된 추가 위반은 같은 PR에서 fix하거나, 별도 follow-up issue 생성

### Acceptance
- 진범 외 추가 위반 0건 또는 follow-up 등록

---

## Phase 2.2E — 회귀 검증

> Wave 1, Owner: frontend-ui-dev

### Steps

- [ ] **E.1** Local production build:
  ```bash
  pnpm --filter @matchup/web build
  pnpm --filter @matchup/web start
  ```
- [ ] **E.2** 진범 페이지를 브라우저에서 직접 진입 → DevTools Console에 React #310 없음 확인
- [ ] **E.3** 다음 시나리오 중 해당하는 것 수동 실행 (어떤 페이지였느냐에 따라):
  - 결제 페이지: Toss widget 마운트 → 결제 시도
  - 채팅 페이지: 방 입장 → 메시지 송수신 → 방 나가기 → 재입장
  - 팀매치 상세: status별 분기 (recruiting/in_progress/completed) 모두 진입
  - 레슨 상세: 캘린더 월 변경, 예약 가능/불가능 분기
  - 매치 상세: join/leave 액션
- [ ] **E.4** Network throttling Slow 3G로 한번 더 진입 → loading → success 전환에서 hook 위반 없음
- [ ] **E.5** Vitest:
  ```bash
  pnpm --filter @matchup/web test -- --run <해당 페이지의 test 파일>
  ```
- [ ] **E.6** E2E 1개 시나리오 (해당 페이지 cover):
  ```bash
  cd e2e && npx playwright test <해당 spec>
  ```

### Acceptance
- production build에서 console error 0
- 시나리오 모두 통과
- 기존 unit/e2e 회귀 0

---

## Phase 2.2F — Sourcemap 임시 활성화 revert

> Wave 1, Owner: frontend-ui-dev, **반드시 마지막 단계**

### Steps

- [ ] **F.1** task 16 Phase 1.1에서 `next.config.ts`에 `productionBrowserSourceMaps: true` 추가했다면 revert
- [ ] **F.2** `git diff apps/web/next.config.ts`로 잔여 변경 0 확인
- [ ] **F.3** prod 빌드 산출물에 .map 파일 없는지 재확인 (`.next/static/chunks/*.map` 확인)

### Acceptance
- next.config.ts 변경 없음
- prod sourcemap 노출 없음

---

## User Scenarios

### Happy
1. 사용자가 진범 페이지에 진입 → 정상 렌더
2. loading → success 전환 → console error 없음
3. 사용자 액션 (탭 전환, refetch, 상태 변경) → 추가 hook 위반 없음

### Edge
- 데이터 fetch가 매우 느림 (loading 5초 이상) → spinner 후 정상 렌더
- 데이터가 빈 배열/null → empty state 표시 후 다른 작업 시 정상

### Error
- API 500 → ErrorState 표시, 재시도 버튼 동작 (hook 안정성 유지)
- 인증 만료 → useRequireAuth가 redirect (이 자체가 hook 호출이므로 첫 hook이어야 함)

---

## Test Scenarios

| 종류 | 케이스 | 위치 |
|------|--------|------|
| Happy | 페이지 mount → unmount → re-mount | manual + e2e |
| Happy | loading → success state 전환 | unit (Vitest) |
| Edge | network slow 3G | manual |
| Edge | 인증 만료 시 redirect | e2e |
| Error | API 500 → ErrorState → 재시도 | unit + e2e |
| Mock update | 진범 페이지의 mock 응답이 spec/msw에 있는지 | grep |

---

## Parallel Work Breakdown

| Wave | Phase | Owner | 의존성 |
|------|-------|-------|--------|
| 1 | A (식별) | frontend-ui-dev | task 16 Phase 1.1 |
| 1 | B (수정) | frontend-ui-dev | A |
| 1 | C (lint) | frontend-ui-dev | 병렬 가능 |
| 1 | D (전수 점검) | frontend-ui-dev | 병렬 가능 |
| 1 | E (회귀) | frontend-ui-dev | B+C+D |
| 1 | F (sourcemap revert) | frontend-ui-dev | 마지막 |

**Do NOT touch (다른 task 영역)**:
- `apps/api/**` 전체 (task 17, 19, 20)
- `apps/web/src/types/api.ts` (task 17이 수정)
- `apps/web/src/components/ui/image-upload.tsx` (task 19 신규)
- 이 task는 단일 page 파일 + eslint config만 변경

---

## Acceptance Criteria

- [ ] 진범 페이지 식별 + 수정
- [ ] React #310 production 재현 안 됨
- [ ] ESLint `react-hooks/rules-of-hooks: error`
- [ ] lint 통과 (위반 0)
- [ ] 추가 위반 페이지 fix 또는 follow-up
- [ ] 수동 production build 시각 검증 통과
- [ ] e2e 1개 시나리오 통과
- [ ] sourcemap 임시 변경 revert 완료

## Tech Debt Resolved

- React hooks rules 위반 (C2 from plan)
- ESLint 강제 부재 (있으면 warning 수준이었던 경우)

## Security Notes

- `productionBrowserSourceMaps: true`는 절대 commit 금지 — 회귀 검증 후 즉시 revert
- 코드 변경 자체는 hooks 순서 정리이므로 보안 영향 없음

## Risks & Dependencies

- **R1**: 진범 페이지 식별 실패 → fallback: 후보 6개 페이지 모두 hooks rule audit, 위반 발견 시 수정
- **R2**: 수정 후 다른 사용자 시나리오에서 회귀 → e2e + 수동 검증으로 cover
- **R3**: ESLint rule을 error로 올렸을 때 다른 페이지에서 대량 위반 발생 → 같은 PR에서 fix 시도 / 너무 많으면 follow-up
- **D1**: blocked by task 16 Phase 1.1
- **D2**: task 17, 19, 20과 file overlap 없음

## Ambiguity Log

- **Q1**: 진범이 단일 페이지가 아닐 가능성? → trace의 `E` 함수가 단일이라 일단 단일 가정. 추가 발견 시 같은 PR로 처리
- **Q2**: ESLint rule을 error로 올렸을 때 빌드가 멈출 정도로 위반이 많으면? → Phase 2.2C에서 정량 측정 후 결정. 5건 이내면 같은 PR, 그 이상이면 follow-up
- **Q3**: hooks 위반이 의도된 것일 수도 있나? (예: dev-only 분기) → 거의 없음. dev/prod 분기는 useEffect 내부 조건으로 처리해야 함
