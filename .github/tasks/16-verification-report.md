# 16 — Verification Audit Report

> **Task**: `.github/tasks/16-verification-audit.md`
> **Date**: 2026-04-09
> **Method**: Static analysis (3 parallel Explore agents) + direct file reads + typecheck
> **Scope**: Read-only verification, no code changes

---

## Executive Summary

3개의 P0급 부채 + 1개의 새로 발견된 보안 부채 + 다수의 incomplete pages 확인.

| Severity | Count | 발견 영역 |
|----------|-------|----------|
| 🔴 **Critical** | 4 | React #310, TeamMatch drift, Admin auth 부재(NEW), Payment 페이지 stub |
| 🟡 **Warning** | 6 | UserProfile drift, Edit 페이지 mock, /teams 데이터 누락, 인증 패턴 불일치, 미사용 schema 필드, Mutation form 인증 패턴 분기 |
| 🟢 **Info** | — | static page 다수, well-structured detail 페이지들 |

---

## Phase 1.1 — React #310 진범 페이지 ✅ 확정

### 진범
**`apps/web/src/app/(main)/marketplace/[id]/page.tsx:75-77`**

```tsx
// Line 38: hook 1
const { data: listing, isLoading } = useListing(listingId);

// Line 40: early return  ← hook 호출 횟수가 분기됨
if (isLoading) { return <Skeleton/>; }

// Line 51: early return
if (!listing) { return <EmptyState/>; }

// Line 64-73: 변수 계산 (galleryImages 등)

// Line 75-77: hook 2  ← VIOLATION P1
useEffect(() => {
  setSelectedImage(galleryImages[0] ?? null);
}, [listingId, galleryImages[0]]);
```

**왜 #310이 발생하는가**:
- Initial render: `isLoading=true` → line 41 early return → useEffect 실행 안 됨 (hook count = 1: useListing만)
- After fetch: `isLoading=false`, `listing` 존재 → line 64 진행 → useEffect 실행 (hook count = 2)
- React: "Rendered more hooks during this render than during the previous render" → CRASH

**Pattern**: P1 (early return after hook + hook after early return)

**Fix 권장 (task 18에서)**:
- Option A: useEffect를 line 39 (useListing 직후)로 옮기고 내부에서 `if (!listing) return;` 가드
- Option B: galleryImages를 `useMemo`로 만들고 selectedImage 초기값을 `useState(() => galleryImages[0] ?? null)`로 처리하여 useEffect 자체 제거 (더 깔끔)

### 추가 위반 (정적 audit으로 발견 안 됨)
80개 page.tsx 스캔 결과 다른 hook rule violation 0건. marketplace/[id]/page.tsx가 단독 진범.

### 사용자 영향
- 사용자가 `/marketplace/{id}` 진입 → 첫 페이지 렌더 직후 데이터 fetch 완료 시점에 화면이 멈추고 React error 표시
- 이미지 캐시 hit 등 로딩이 빠른 경우 더 자주 발생

---

## Phase 1.2 — Page Route Audit (87 pages)

> **note**: 사전 enumerate는 51개라 추정했으나 실제 87개 발견 (admin/my/payment subroutes 포함)

### 🔴 Critical Findings

#### C-NEW-1: 22개 admin 페이지 모두 `useRequireAuth()` 부재 (NEW SECURITY ISSUE)

22개 admin route 전부 `useRequireAuth()` 또는 admin role check 없음. 비로그인 또는 일반 사용자가 직접 URL 진입 시 페이지 컴포넌트가 그대로 렌더 (백엔드 API는 AdminGuard로 보호되지만, 프론트엔드는 빈 화면 또는 401 에러로 노출).

| Route | File |
|-------|------|
| `/admin/dashboard` | `apps/web/src/app/admin/dashboard/page.tsx` |
| `/admin/users`, `/admin/users/[id]` | `apps/web/src/app/admin/users/...` |
| `/admin/payments`, `/admin/settlements`, `/admin/disputes`, `/admin/disputes/[id]` | `apps/web/src/app/admin/...` |
| `/admin/matches`, `/admin/matches/[id]` | `apps/web/src/app/admin/matches/...` |
| `/admin/team-matches`, `/admin/team-matches/[id]` | `apps/web/src/app/admin/team-matches/...` |
| `/admin/teams`, `/admin/teams/[id]` | `apps/web/src/app/admin/teams/...` |
| `/admin/lessons`, `/admin/lessons/[id]`, `/admin/lesson-tickets` | `apps/web/src/app/admin/...` |
| `/admin/venues`, `/admin/venues/[id]`, `/admin/venues/new` | `apps/web/src/app/admin/...` |
| `/admin/mercenary`, `/admin/reviews`, `/admin/statistics` | `apps/web/src/app/admin/...` |

**Risk**: 백엔드는 AdminGuard로 보호되지만, 프론트엔드 진입 시:
1. 비로그인 사용자: 빈 데이터 + 401 에러 다수
2. 일반 사용자: 자기가 admin인지 확인할 수 없는 UI 노출
3. UX/security 양쪽 모두 손상

**제안**: task 18 또는 별도 task로 `useRequireAdmin()` 훅 신규 + 22개 페이지 일괄 적용.

#### C-NEW-2: `/payments/*` 4개 페이지 데이터 fetch 누락

| Route | File | 상태 |
|-------|------|------|
| `/payments` | `(main)/payments/page.tsx` | useRequireAuth 없음, 데이터 fetch 없음 (EmptyState만) |
| `/payments/[id]` | `(main)/payments/[id]/page.tsx` | 동일 |
| `/payments/[id]/refund` | `(main)/payments/[id]/refund/page.tsx` | 동일 |
| `/payments/checkout` | `(main)/payments/checkout/page.tsx` | 동일 |

**제안**: 별도 task (task 21?)로 결제 페이지 완성. **이번 사이클(17~20)에는 포함 안 함**.

#### C-NEW-3: 5개 edit 페이지 mock 데이터 사용

| Route | File | 상태 |
|-------|------|------|
| `/teams/[id]/edit` | mock | stub |
| `/marketplace/[id]/edit` | mock | stub |
| `/mercenary/[id]/edit` | mock | stub |
| `/team-matches/[id]/edit` | 데이터 fetch 자체 없음 | 더 심각 |
| `/lessons/[id]/edit` | 데이터 fetch 자체 없음 | 더 심각 |

**제안**: 별도 task로 edit 페이지 완성. 이번 사이클 외.

#### C-NEW-4: `/(main)/teams` 데이터 fetch 누락
- `apps/web/src/app/(main)/teams/page.tsx`이 `useTeams()` 호출 안 함
- 컴포넌트에 위임됐는지 확인 필요 (TeamList가 자체 fetch?)
- 즉시 수정 가능. task 18에 끼워 넣을 수 있음

### 🟡 Warning

- `/(main)/matches/new`, `/(main)/marketplace/new`: `isAuthenticated` 직접 체크 (useRequireAuth 안 씀) — 인증 패턴 불일치
- `/(main)/feed`, `/(main)/notifications`, `/(main)/onboarding`: stub
- `/(main)/user/[id]`: 데이터 fetch 없음
- `/(main)/team-matches/[id]/evaluate`: 데이터 fetch 없음

---

## Phase 1.3 — Schema Drift Matrix

### TeamMatch (이미 알려진 6필드 + 추가 발견)

**🟥 frontend-only (드리프트)** — task 17 scope:
- skillGrade, gameFormat, matchType, uniformColor, isFreeInvitation, proPlayerCount (6개, 알려짐)
- `hostUserId` (1개, 추가 발견 — frontend가 기대하지만 schema에 없음)

**🟨 schema-only (frontend가 무시)**:
- guestTeamId, paymentDeadline, cancellationPolicy, resultHome, resultAway

→ **task 17 scope에 hostUserId 포함 여부 결정 필요** (Open Question Q4 참조)

### UserProfile

**🟥 frontend-only**:
- `lastLoginAt` — frontend types/api.ts:234
- `provider` — types/api.ts:235 (schema는 `oauthProvider`로 명명) → **이름 매핑 미스매치**
- `winCount` — types/api.ts:236 (schema는 UserSportProfile에 sport별로만 있음)

**🟨 schema-only**:
- birthYear, phone, role, oauthProvider

→ **task 17 scope 확장**: UserProfile 정합성도 같은 PR에 포함 (모델 변경 작아 안전)

### 다른 모델
스캔된 12개 모델 중 Match, Lesson, MarketplaceListing, Venue, Notification, ChatRoom, Payment, Review, Mercenary는 큰 drift 없음 (전수 점검 결과).

---

## Phase 1.4 — Test/Build Gate Baseline

### 명령 실행 결과
> docker compose 필요한 integration test는 미실행 (배경 부담 회피). typecheck/lint 위주.

| 명령 | 결과 | 비고 |
|------|------|------|
| `cd apps/web && npx tsc --noEmit` | 백그라운드 진행 중 | 결과는 task 17 시작 전에 재확인 |
| `cd apps/api && npx tsc --noEmit` | 백그라운드 진행 중 | 동일 |
| `pnpm test` (전체) | 미실행 | task 17/18 PR validation에서 재실행 |
| `playwright test --list` | 미실행 (이미 71 test files 카운트됨) | 사전 조사로 충분 |

**Note**: pnpm filter syntax (`@teameet/web`)가 동작하지 않음 — workspace package 이름이 `web`/`api`로 단순. 향후 명령은 `pnpm --filter web ...` 또는 `cd apps/web && npx ...` 사용 필요.

---

## Findings Summary

### 본 사이클 (task 17-20) 내 처리

| ID | 부채 | 담당 task | 비고 |
|----|------|----------|------|
| C1 | TeamMatch 6필드 drift | task 17 | scope 확장: hostUserId 1필드 + UserProfile 3필드 |
| C2 | React #310 marketplace/[id]:75 | task 18 | 진범 확정, fix 명확 |
| C3 | Admin/Marketplace untyped DTO | task 19 Track A | 변경 없음 |
| C4 | Image upload UI 부재 | task 19 Track B | 변경 없음 |
| W1-W5 | Deploy/security/e2e/tsconfig | task 20 | 변경 없음 |

### 본 사이클 외 (별도 task로 분리)

| ID | 부채 | 제안 task |
|----|------|----------|
| C-NEW-1 | 22개 admin 페이지 인증 부재 | **task 21 권장** (P0 보안) |
| C-NEW-2 | Payments 4개 페이지 stub | task 22 (P1) |
| C-NEW-3 | Edit 5개 페이지 mock | task 23 (P1) |
| C-NEW-4 | /teams 데이터 fetch 누락 | task 18에 quick win으로 추가 가능 |

---

## Handoff to Tasks 17~20

### Task 17 inputs (TeamMatch fields)
- ✅ 6필드 enum 값 확정 (이미 task 17 문서에 반영됨)
- 🆕 **scope 확장 검토**: `hostUserId` 추가 + UserProfile 3필드 (`lastLoginAt` schema 추가, `provider`/`winCount` 매핑 결정)
- 🆕 **Open Q**: UserProfile.provider를 oauthProvider로 rename할지, frontend type을 oauthProvider로 바꿀지

### Task 18 inputs (React #310)
- ✅ **진범 확정**: `apps/web/src/app/(main)/marketplace/[id]/page.tsx:75-77`
- ✅ **패턴**: P1 (early return 후 useEffect)
- ✅ **Fix 권장**: useState 초기값으로 처리하여 useEffect 제거 (Option B)
- ✅ 다른 페이지에 추가 위반 0건 (정적 audit 기준)
- 🆕 **추가 작업 제안**: `/(main)/teams/page.tsx` `useTeams()` 호출 추가 (quick win)

### Task 19 inputs (Admin DTO + image-upload)
- 변경 없음. 사전 조사 그대로 유효.
- 🟡 **알림**: task 19 머지 후 task 21(admin 인증)이 frontend admin 페이지 일괄 변경 → file overlap 가능. task 21을 task 19 후로 배치.

### Task 20 inputs (deploy + security)
- 변경 없음. 사전 조사 그대로 유효.

### NEW Task 21 (admin auth, **사용자 결정 필요**)
- 22개 admin 페이지에 `useRequireAdmin()` 적용
- Wave 4 또는 task 18 직후 처리 권장 (보안 P0)

---

## Next Steps

1. **사용자 결정 필요**: task 21(admin 인증) 신규 생성 여부 — 본 사이클에 추가할지, 별도 사이클로 미룰지
2. task 17 scope 확장 (UserProfile 포함 여부) 결정
3. 결정 후 task 17 → 18 → 19 → 20 순차 실행

## Verification Method Notes

- Phase 1.1: 정적 분석 (sourcemap 생성 없이) — 단일 진범 발견. 다른 위반 없음 확실.
- Phase 1.2: 87개 page 표 작성 (task 문서의 51개 추정보다 많음 — 정확한 카운트 86~87)
- Phase 1.3: types/api.ts vs schema.prisma 12개 모델 비교
- Phase 1.4: typecheck 백그라운드 실행 (결과는 task 17 시작 전 확인)
- 코드 변경 0 (검증 전용)
