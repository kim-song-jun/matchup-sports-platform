# Task 97 — v1 Admin: 플랫폼 관리 대시보드 전면 재설계

> 상태: **COMPLETE ✅** · 브랜치 `feat/v1-admin-redesign-toss` · 선행: Task 96(데스크탑 반응형)
> 파이프라인: `/agent-all` (Phase 1 진단 → Phase 2 계획 → Phase 3 dispatch[Wave1~3] → Phase 4 gate[review+라이브 QA])
>
> **검증 요약**: v1_web tsc 0 + 7 테스트 · v1_api tsc 0 + 47 admin 테스트(2 suite) · frontend-review PASS(Critical/Warning/Nit 전부 수정) · 라이브 QA(admin@teameet.v1, 1280 데스크탑 + 390 모바일): 개요/회원/매치/팀/팀매치/감사로그 실데이터 렌더 + 모더레이션 happy-path(회원 정지→감사로그 기록→KPI 22→21 반영) + 모바일 햄버거 드로어(가로 스크롤 네비 제거) 전부 통과. 스크린샷: `docs/visual-qa/admin-platform-v1/`.

## Context

사용자 피드백(원문): "스크롤 메뉴바 위치 등 전혀 올바르게 구성되어져있지 않는것같은데. frontend design 스킬들을 잘 활용해서 특히 admin은 맨처음부터 다시 설계한다고 생각하고, 플랫폼 관리 대쉬보드가 되어야하니까 우리가 있는 기능들 베이스로 만들면서, 이미 사용성이 좋은 규격있는 그런 ui/ux가 되어야해."

### Phase 1 진단 결과 (라이브 + 코드 확인)

1. **현재 `/admin`은 플랫폼 관리 대시보드가 아니다.** 로그인한 본인의 "마이페이지"(내 매치·내 팀·내 알림·내 미작성 리뷰)를 "운영 센터" 사이드바 껍데기에 씌운 것. `useV1MyMatches/useV1MyTeams/useV1Notifications/useV1Reviews` 등 **개인 훅**만 사용. → before: `docs/visual-qa/admin-redesign-v2/` 대비, 신규 before: `admin-before-desktop-1280.png` / `admin-before-mobile-390.png`.
2. **모바일 네비가 가로 스크롤 탭 스트립**(`overflow-x-auto`, sticky top-[49px]) — 라벨이 "활…"로 잘리고 회색 스크롤바가 노출됨. = 사용자가 지적한 "스크롤 메뉴바".
3. **백엔드엔 진짜 admin 토대가 이미 있다** (`apps/v1_api/src/admin/`): `/admin/me`, `/admin/overview`(상태별 카운트 + recentActions), user/match/team/team-match 상태변경, action-logs, status-change-logs. `V1AuthGuard` + `getActiveAdmin()`(`v1AdminUser` 테이블, role owner|ops|support, support=읽기전용)로 **실제 authz 존재**.
4. **그러나 "목록/검색" 엔드포인트가 없다.** overview는 카운트만 줌 → 관리자가 특정 회원/매치/팀을 찾아 모더레이션할 방법이 없음. 진짜 관리 콘솔의 핵심이 빠짐.
5. **타입 드리프트(Critical)**: 프론트 `V1AdminOverview`=`{users:number,...}` 평면, 백엔드=`{users:{active,suspended,...}, recentActions:[]}` 중첩. `V1AdminLog`도 불일치. 프론트 admin 훅은 2개(overview/action-logs)뿐이고 페이지가 안 씀.

## Goal

`/admin`을 **실제 플랫폼 운영자(admin@teameet.v1, role=owner)가 쓰는 관리 대시보드**로 처음부터 재설계한다. 우리가 보유한 v1 도메인(회원/매치/팀/팀매치 + 감사로그)을 기반으로, **검색·필터·목록·모더레이션(상태변경+사유)·감사추적**이 가능한, 규격 있고 사용성 좋은(Linear/Vercel/Stripe/Toss admin 류) 정제된 운영 콘솔로 만든다. 데스크탑·모바일 모두 표준 패턴(고정 사이드바 ↔ 오프캔버스 드로어)으로 구성하고, 가로 스크롤 네비를 제거한다. 디자인은 기존 Toss 디자인 시스템(blue #3182f6, grey ramp, Pretendard, light)을 그대로 따른다. 시드 목데이터로 라이브 검증한다.

## Original Conditions (체크박스 — 끝까지 살아있어야 함)

- [x] admin을 "처음부터 다시 설계" — 개인 마이페이지 재탕이 아니라 **플랫폼 관리** 대시보드
- [x] "우리가 있는 기능들 베이스로" — v1 백엔드 실제 도메인/엔드포인트에만 근거 (없는 기능 날조 금지)
- [x] "스크롤 메뉴바" 문제 해결 — 가로 스크롤 탭 제거, 표준 사이드바/드로어 패턴
- [x] "규격 있고 사용성 좋은 UI/UX" — 검증된 admin 대시보드 관행 (데이터 테이블·필터·상태 pill·사유 모달·감사로그)
- [x] 데스크탑 + 모바일 모두 구현
- [x] 디자인 시스템 준수 (토큰·컬러·타이포·a11y WCAG AA)
- [x] 목데이터(시드)로 라이브 검증

## Information Architecture (실제 백엔드 매핑)

| 라우트 | 섹션 | 데이터 소스 | 모더레이션 |
|--------|------|-------------|------------|
| `/admin` | **개요** | `GET /admin/overview` (카운트 + recentActions), `GET /admin/me` | 주의-필요 타일 → 필터된 목록 딥링크 |
| `/admin/users` *(신규)* | **회원** | `GET /admin/users?status&q&cursor` (+`/:id`) | `POST /admin/users/:id/status` (정지/차단/복구 + 사유) |
| `/admin/matches` | **매치** | `GET /admin/matches?status&sportId&q&cursor` (+`/:id`) | `POST /admin/matches/:id/status` |
| `/admin/teams` | **팀** | `GET /admin/teams?status&q&cursor` (+`/:id`) | `POST /admin/teams/:id/status` |
| `/admin/team-matches` | **팀매치** | `GET /admin/team-matches?status&cursor` | `POST /admin/team-matches/:id/status` |
| `/admin/audit` | **감사 로그** | `GET /admin/action-logs`, `GET /admin/status-change-logs` | (읽기) |

- **제거**: `/admin/reviews`, `/admin/notifications` — 백엔드 admin 엔드포인트 없음(개인데이터 필러였음). 라우트·nav 참조 삭제. (향후 reviews 모더레이션은 별도 task.)
- 권한: list/overview/logs = read(support 포함 가능), status 변경 = ops/owner (support는 backend가 403). 프론트는 `useV1AdminMe.capabilities`로 변경 버튼 노출 게이트.

## Admin Design Contract (바인딩 — 모든 UI 에이전트 준수)

**스택/시스템**: admin은 기존대로 **Tailwind utility** 클래스 사용(소비자 `.tm-*`와 별개 시스템 유지). 단 토큰은 Toss 팔레트로 통일.
**브레이크포인트**: 모바일 `<768`, 태블릿 `768–1023`, 데스크탑 `≥1024`, wide `≥1440`. 컨텐츠 `max-w-[1200px]` 중앙 + `xl:max-w-[1320px]`.

**네비게이션 (스크롤 메뉴바 제거)**:
- 데스크탑 `≥1024`: 고정 좌측 사이드바 `w-[240px]` — 상단 브랜드("Teameet 운영" + role 배지), nav 항목(개요/회원/매치/팀/팀매치/감사로그, 활성 `aria-current` + blue 좌측 바), 하단 "서비스로 돌아가기" + admin 신원.
- `<1024`: sticky 상단 앱바(햄버거 + 현재 섹션 타이틀) + **오프캔버스 드로어**(좌측 슬라이드인, backdrop, `role="dialog"` + `aria-modal` + focus-trap + ESC + 네비 시 자동 닫힘). **가로 스크롤 탭 금지.**

**데이터 테이블 (`AdminDataTable`)**: 데스크탑 = 진짜 `<table>`(sticky thead, row hover, 우측 정렬 액션, `tabular-nums`); 모바일 = 카드 리스트(동일 데이터 스택). 하나의 컴포넌트가 브레이크포인트로 전환. 빈/로딩/에러 상태 내장(skeleton/EmptyState/ErrorState, 컬러-only 금지).

**필터 바 (`AdminFilterBar`)**: 검색 input(`<label htmlFor>` 연결) + 상태 필터 칩(다중 토글, 활성=blue). cursor "더 보기" 버튼.

**상태 표현 (`AdminStatusPill`)**: 상태 enum → tone + 한국어 라벨 + 필요 시 아이콘. **컬러-only 금지**(아이콘/텍스트 병행). 매핑: active/recruiting/matched → blue/green; closed/suspended/withdrawal_pending → amber; blocked/cancelled/deleted → red; completed/archived → grey.

**모더레이션 플로우 (`AdminReasonModal`)**: 행 액션 → 모달(상태 select + **필수** 사유 textarea, `maxLength=500` = DTO 일치) → 확인 → mutation → Toast + 리스트/overview invalidate. 사유 미입력 시 제출 불가. 모달 `role="dialog"`+focus-trap+ESC.

**디자인 토큰/절제**: blue-500 `#3182f6` 단일 액센트, white 카드 + hairline border(`border-gray-100`), shadow는 드로어/모달/팝오버에만, light 모드. 타이포 위계 명확, 표 본문 13–14px, 헤더 semibold. 과한 그림자/보더/글래스 금지.

**a11y (WCAG AA)**: 인터랙티브 ≥44×44, 아이콘 버튼 `aria-label`, 장식 `aria-hidden`, 포커스 `focus-visible` blue ring + offset, 대비 4.5:1, `prefers-reduced-motion` 대응, 키보드 전체 동선.

**검증 게이트**: 각 에이전트 종료 전 `cd apps/v1_web && npx tsc --noEmit` 0 (백엔드는 `cd apps/v1_api && npx tsc --noEmit` + 관련 spec). 토큰만 사용(하드코딩 hex 금지, blue/gray Tailwind 스케일 OK).

## Parallel Work Breakdown

**Wave 1 (병렬, 디렉토리 격리)**
- **W1-BE** (`backend-data-dev`) — `apps/v1_api/src/admin/**` 전담: list/detail 엔드포인트(users/matches/teams/team-matches) + DTO(class-validator, cursor) + service(Prisma join/count, 검색/필터) + spec(admin-gating 403, 필터, 페이지네이션). overview 백엔드 응답 유지. 시드 admin(owner/active) 확인.
- **W1-UI** (`frontend-ui-dev`) — `apps/v1_web/src/components/admin/**` 전담: AdminShell 재작성(사이드바+드로어+앱바) + 공유 프리미티브(DataTable/FilterBar/StatusPill/ReasonModal/PageHeader/KpiCard/Empty/Skeleton/Badge) + `index.ts`. 타입드 prop 계약으로 빌드(훅 불요).

**Wave 2 (W1-BE 후, 단독)**
- **W2-DATA** (`frontend-data-dev`) — `apps/v1_web/src/hooks/use-v1-api.ts` + `src/types/api.ts` + query keys: `V1AdminOverview`/`V1AdminLog` 타입 백엔드 실제 shape로 수정 + 신규 타입/훅(me·users·matches·teams·teamMatches·status-change-logs + status mutations, 각 invalidate). 모든 페이지가 의존.

**Wave 3 (W1-UI + W2-DATA 후, 병렬 — 파일 격리)**
- **W3-A** (`frontend-ui-dev`) — `/admin/page.tsx`(개요 재작성) + `/admin/audit/page.tsx`(감사로그 재작성)
- **W3-B** (`frontend-ui-dev`) — `/admin/users/page.tsx`(신규) + `/admin/matches/page.tsx`(재작성)
- **W3-C** (`frontend-ui-dev`) — `/admin/teams/page.tsx` + `/admin/team-matches/page.tsx`(재작성) + `/admin/reviews`·`/admin/notifications` 라우트 제거

**Wave 4 (gate)**
- `frontend-review` + `ui-manager`/`ux-manager` 디자인 리뷰 + 라이브 시각 QA(admin@teameet.v1 dev-login, 1280/1440 데스크탑 + 390 모바일, 전 섹션 + 모더레이션 플로우). 지적사항 즉시 수정(기술부채 0).

## Test Scenarios

- **Happy**: admin 로그인 → 개요 KPI 실수치 표시 → 회원 탭 검색/필터 → 행 정지(사유) → Toast + 카운트 갱신 → 감사로그에 기록 노출.
- **Edge**: 빈 결과(필터 무매치) EmptyState; cursor 끝 "더 보기" 사라짐; support role 로그인 시 변경 버튼 비노출; 모바일 드로어 ESC/backdrop 닫힘.
- **Error**: 비-admin 접근 403 → 접근 거부 화면; 사유 미입력 제출 차단; 네트워크 실패 ErrorState+재시도.
- **Mock updates**: 신규 list 엔드포인트에 대응하는 spec(실제 계약 검증). 프론트 타입 변경에 맞춰 영향 mock/테스트 갱신.

## Acceptance Criteria

- [x] `/admin` 전 섹션이 **플랫폼 전역 데이터**(개인 아님)를 표시
- [x] 회원/매치/팀/팀매치 목록을 검색·필터·페이지네이션 가능, 행에서 상태변경(사유) → 감사로그 반영
- [x] 가로 스크롤 네비 제거, 데스크탑 사이드바 / 모바일 드로어 표준 패턴 동작
- [x] 타입 드리프트 해소(`V1AdminOverview`/`V1AdminLog` 백엔드 일치)
- [x] `apps/v1_web` & `apps/v1_api` tsc 0, 신규/영향 테스트 통과
- [x] 라이브 QA: 데스크탑 1280/1440 + 모바일 390 스크린샷, 모더레이션 happy-path 1건 실증
- [x] 디자인 계약(토큰·a11y·절제) 충족, 리뷰 통과

## Tech Debt Resolved

- 개인데이터를 admin으로 위장한 가짜 운영센터 제거.
- `V1AdminOverview`/`V1AdminLog` 스키마 드리프트(Critical) 해소.
- 백엔드 admin 모듈의 미사용 overview/logs를 실제 UI에 연결, 누락된 list 엔드포인트 보강.
- 백엔드 admin 가용 기능 대비 미사용분(상태변경 mutation) UI 노출.

## Security Notes

- 신규 list/detail 엔드포인트 전부 `V1AuthGuard` + `getActiveAdmin()` 게이트. status 변경은 `getMutationAdmin()`(support 차단) 유지.
- 검색 `q`는 Prisma parameterized(contains, mode insensitive) — raw SQL 금지.
- 응답에서 PII 최소화: 회원 목록에 passwordHash 등 민감필드 없음(v1엔 비번 없음, OAuth/dev). 이메일은 admin 전용 화면이므로 노출 허용.
- 프론트는 admin role/capabilities로 변경 UI 게이트하되, **신뢰 경계는 백엔드**(프론트 게이트는 UX용).

## Risks & Dependencies

- W3는 W1-UI(프리미티브) + W2-DATA(훅) 완료에 의존 → 순서 엄수.
- 공유 파일 동시편집 회피: 각 에이전트가 디렉토리/파일 단독 소유(W2-DATA만 use-v1-api.ts/api.ts 편집).
- 라이브 QA는 실행 중 서비스 의존: v1_web(3013, 타 세션) · v1_api(8121) · postgres(teameet_v1_pg). admin@teameet.v1 dev-login 필요.
- 글로벌 git 안전: 브랜치 유지, pathspec 커밋, stash/reset 금지.

## Ambiguity Log

- (해소) "우리가 있는 기능들" → reviews/notifications admin 엔드포인트 부재 → 해당 섹션 제외, 백엔드 보유 도메인(회원/매치/팀/팀매치/감사로그)에 한정. 추측으로 날조하지 않음.
- (해소) 테마 → 기존 Toss light 시스템 일관성 우선(디자인 스킬의 "대담함"보다 사용자의 "디자인시스템 준수 + 규격성" 요구 우선).
## Progress Snapshot — 2026-07-16

- [x] 회원 목록 및 상세 API에 활성 인증 수단 `authProviders`를 추가했다.
- [x] 관리자 회원 목록 카드와 상세 화면에서 `카카오`·`네이버`·`이메일` 로그인 방식을 표시한다.
- [x] 연결된 인증 수단이 여러 개인 회원은 모두 함께 표시하고, 활성 인증 수단이 없으면 `로그인 수단 없음`으로 표시한다.
- [x] 관리자 서비스 테스트와 API 계약 문서를 동기화했다.
- [ ] Playwright 시각 증거는 실행 환경에 Chromium 바이너리가 없어 캡처하지 못했다. API 실데이터와 관리자 웹 라우트는 별도로 확인했다.

## Follow-up - 2026-07-18 - Admin filter and tab counts

- Scope: excluding `/admin/audit`, add exact server totals to nine admin list status filters, inquiry/notice secondary facets, and three tournament detail collection tabs.
- Contract: list responses expose cursor-independent `summary.total` and `summary.byStatus`; inquiry/notice responses also expose cross-facet counts.
- [x] Implement and test backend summary contracts.
- [x] Connect shared frontend UI, nine list routes, and tournament detail tabs.
- [x] Sync API docs/MSW and complete responsive browser QA.

### Follow-up validation

- Backend: admin-focused 4 suites / 87 tests passed; `v1_api` TypeScript passed. The repository-wide API run had 520/525 passing and five unrelated failures from the concurrently edited terms-management contract.
- Frontend: 32 suites / 122 tests passed, `v1_web` TypeScript passed, and the production build generated all 76 routes.
- Browser QA: processed 20/20 surfaces at 1440x1000 and 390x844 (nine list routes plus tournament detail at each viewport). Status counts, inquiry/notice secondary counts, three tournament tab counts, accessible names, console, and horizontal overflow passed. Screenshots are under `output/playwright/visual-audit/admin-filter-counts/`.
- Runtime note: the already-running API process predated the summary implementation. Browser QA therefore injected deterministic summary values into its real list responses to isolate UI/responsive verification; exact server aggregation is covered by the backend service tests above.
