# MatchUp QA Scenario Index

이 문서는 실제 검증의 허브다. 개별 시나리오 체크는 각 문서에서 진행하고, 전체 상태 집계와 discussion은 이 파일에서 관리한다.

## Status Convention

- `[ ]` 미실행
- `[x]` 통과
- 체크박스를 유지한 채 이슈가 있으면 옆에 짧게 메모를 남긴다.

## Canonical Documents

- 상세 초안: [real-flow plan](./../plans/2026-04-07-real-flow-qa-scenarios.md)
- 기술 계획 보고서: [tech-planner remediation report](./../plans/2026-04-07-tech-planner-qa-remediation-report.md)
- 실제 실행 허브: 이 문서

## Preflight

- API는 Playwright가 자동 기동하지 않는다. 실행 전 백엔드가 먼저 떠 있어야 한다.
- 권장 개발 스택:
  - `make dev`
  - 또는 API와 Web을 각각 실행
- 기본 확인:
  - Web: `http://localhost:3003`
  - API: `http://localhost:8111/api/v1/health`
- E2E preflight 정책:
  - 기본: strict fail-fast (`global-setup`에서 API/Web/dev-login 실패 시 즉시 종료)
  - 예외: 런타임 디버깅 목적일 때만 `E2E_ALLOW_OFFLINE=1`로 완화 실행
  - 로컬 기본값은 `workers=1`, `fullyParallel=false`, `navigationTimeout=60_000`, `line` reporter
  - 병렬도를 높일 때는 `PW_WORKERS`, `PLAYWRIGHT_REPORTER`를 명시적으로 override한다.

## Auth Wall Contract

- 비로그인 보호 경로 판정은 아래 둘 중 하나면 통과로 본다.
  - `/login` 리다이렉트
  - canonical auth wall 렌더링 (`data-testid="auth-wall"` + `data-testid="auth-wall-login-link"`)
- 단순 `a[href="/login"]` 존재 여부만으로 판정하지 않는다. 반드시 visible 상태를 확인한다.

## Master Checklist

- [x] [01-auth-and-session.md](./01-auth-and-session.md)
- [ ] [02-home-and-discovery.md](./02-home-and-discovery.md)
- [ ] [03-match-flows.md](./03-match-flows.md) - `MATCH-001/002` passed, `MATCH-003` blocked
- [ ] [04-team-and-membership.md](./04-team-and-membership.md)
- [ ] [05-team-match-flows.md](./05-team-match-flows.md)
- [ ] [06-mercenary-flows.md](./06-mercenary-flows.md)
- [ ] [07-chat-and-notifications.md](./07-chat-and-notifications.md)
- [ ] [08-marketplace-and-lessons.md](./08-marketplace-and-lessons.md)
- [ ] [09-payment-review-badge.md](./09-payment-review-badge.md)
- [ ] [10-profile-settings-admin.md](./10-profile-settings-admin.md)

## Recommended Execution Order

1. 인증 / 세션 / 권한
2. 개인 매치
3. 팀 / 팀 권한
4. 팀 매치
5. 채팅 / 알림
6. 용병
7. 장터 / 레슨
8. 결제 / 리뷰 / 배지
9. 프로필 / 설정 / 관리자

## Coverage Matrix

| Area | Single Tab | Multi Tab | Multi Browser | Persistence | Notes |
|------|------------|-----------|---------------|-------------|-------|
| Auth / Session | Yes | Yes | Yes | Yes | |
| Home / Discovery | Yes | No | No | Yes | |
| Match | Yes | Yes | Yes | Yes | |
| Team / Membership | Yes | No | Yes | Yes | |
| Team Match | Yes | No | Yes | Yes | |
| Mercenary | Yes | No | Yes | Yes | |
| Chat / Notification | Yes | Yes | Yes | Yes | |
| Marketplace / Lesson | Yes | No | Yes | Yes | |
| Payment / Review / Badge | Yes | No | Yes | Yes | |
| Profile / Settings / Admin | Yes | Yes | Yes | Yes | |

## Automation Mapping

| Scenario File | Primary Spec | Status |
|---------------|--------------|--------|
| `01-auth-and-session.md` | `e2e/tests/auth-session-matrix.spec.ts` | Verified (`Desktop Chrome 7/7`, `Mobile Chrome 7/7`) |
| `02-home-and-discovery.md` | `e2e/tests/home.spec.ts`, `e2e/tests/match-discovery.spec.ts` | Home smoke passed (`Desktop Chrome`, `Mobile Chrome`), discovery deep-link/url persistence `Desktop Chrome 3/3`, `HOME-002` pending |
| `03-match-flows.md` | `e2e/tests/match-join-flow.spec.ts` | `MATCH-001/002` verified (`Desktop Chrome 13/13`, `Mobile Chrome deep 2/2`), `MATCH-003` blocked |
| `04-team-and-membership.md` | `e2e/tests/team-owner-flow.spec.ts`, `e2e/tests/team-manager-membership.spec.ts` | Partial + `TEAM-003` visual fallback verified |
| `05-team-match-flows.md` | `e2e/tests/team-owner-flow.spec.ts` | Smoke verified |
| `06-mercenary-flows.md` | `e2e/tests/mercenary-flow.spec.ts` | Partial |
| `07-chat-and-notifications.md` | `e2e/tests/chat-realtime.spec.ts`, `e2e/tests/notification-center.spec.ts` | Chat smoke verified, notification center `Desktop Chrome 3/3` verified (`match_created`, `player_joined`, `payment_confirmed`) |
| `08-marketplace-and-lessons.md` | `e2e/tests/marketplace-flow.spec.ts` | Partial + `MKT-003` / `LES-003` visual fallback verified |
| `09-payment-review-badge.md` | TBD | Planned |
| `10-profile-settings-admin.md` | `e2e/tests/admin-dashboard.spec.ts` | Partial |

## Discussion

이 섹션은 시나리오 설계 변경, 테스트 우선순위, 재현 이슈를 논의하는 단일 장소다.

### Open Questions

| Date | Scenario | Question | Owner | Status |
|------|----------|----------|-------|--------|
| 2026-04-07 | Global | 결제/환불은 외부 PG mock 기준으로 어디까지 자동화할지 확정 필요 | TBD | Open |

### Decisions

| Date | Decision |
|------|----------|
| 2026-04-07 | 시나리오 문서는 기능 영역별 파일로 관리하고, 진행 상태와 discussion은 `index.md`에 집중한다. |
| 2026-04-07 | Playwright 자동화는 `Auth -> Match -> Team Match -> Chat/Notification` 순서로 확장한다. |
| 2026-04-07 | QA remediation 실행 순서는 `runtime source of truth -> Docker bootstrap -> API health -> E2E DB topology -> Playwright dependency -> selector stabilization`으로 고정한다. |
| 2026-04-07 | 이번 QA remediation round는 `Conditional`로 진행하며, 기능 확장보다 `Runtime -> DB topology -> Playwright runtime -> Harness fail-fast -> Priority spec rerun` 순서를 우선한다. |
| 2026-04-07 | 로컬 Next dev 기반 Playwright는 `workers=1`, `fullyParallel=false`, `navigationTimeout=60_000`, `line` reporter를 기본으로 둔다. 6-worker 병렬은 dev compile saturation으로 false negative를 만들었다. |
| 2026-04-08 | `matches` 생성/참가 deep flow는 우선 `reload-based persistence`까지 검증하고, 호스트 상세의 새로고침 없는 실시간 sync는 별도 follow-up으로 분리한다. |
| 2026-04-08 | `MATCH-003`는 테스트 미작성보다 기능 공백에 가깝다. 프론트의 수정/취소 UI를 유지하려면 backend `PATCH /matches/:id` 또는 동등한 API가 먼저 필요하다. |
| 2026-04-08 | photoreal fallback QA는 사용자 노출 image slot 중 `mock/local fallback`이 발생하는 표면을 인스코프로 본다. 업로드 원본과 관리자 전용 이미지는 제외하되, 사용자-facing 생성/수정 폼의 빈 업로드 슬롯은 예외적으로 포함한다. |
| 2026-04-08 | query-sync discovery 화면은 URL만 단일 source로 두더라도 빠른 입력/연속 토글이 있는 경우 pending local filter state를 같이 유지해야 한다. stale query snapshot 병합은 실제 필터 유실 버그를 만든다. |
| 2026-04-08 | notification center v1은 설정 영속화보다 `producer wiring -> action center -> read sync -> deep link`를 우선한다. `/settings/notifications`는 device-local 명시를 유지하고 false affordance를 만들지 않는다. |
| 2026-04-08 | notification card는 읽음 mutation과 라우팅을 같은 `Link` 기본 동작에 맡기지 않는다. in-app navigation이 필요한 카드 액션은 explicit handler와 connect-time backfill을 같이 둬서 websocket late-connect race를 막는다. |

### Findings Log

| Date | Scenario | Result | Summary | Follow-up |
|------|----------|--------|---------|-----------|
| 2026-04-07 | Initial | Drafted | 시나리오 문서 구조 생성 완료 | 실제 실행 후 업데이트 |
| 2026-04-07 | Auth + Home + Match + Team + Chat | Failed | 96 tests run, 3 passed, 93 failed. Main blockers were API container health failure, host Prisma DB access mismatch, and Playwright worker dependency instability. | `docs/plans/2026-04-07-qa-remediation-plan.md` 기준으로 runtime → harness → suite rerun 순서로 수정 |
| 2026-04-07 | Auth / Home / Match / Team / Chat | Failed | Playwright 데스크톱 스모크 실행 48건 중 11건 통과, 37건 실패. 핵심 장애는 API 컨테이너 비정상, DB 포트 드리프트, Playwright 의존성 해상 실패, 일부 brittle selector. | `docs/plans/2026-04-07-agent-all-qa-remediation-plan.md` 기준으로 정리 및 수정 |
| 2026-04-07 | Harness hardening | Updated | `expectLoginRedirectOrLink`를 visible/canonical contract로 강화하고, `global-setup` preflight를 strict fail-fast 기본으로 전환했다. | 런타임 복구 후 auth/team/chat 묶음 재실행으로 false negative 감소 확인 |
| 2026-04-07 | Teams unauth single run | Blocked | `E2E_ALLOW_OFFLINE=1`로 단건 실행 시도했지만 `global-setup/global-teardown`에서 `Cannot find module '@prisma/client'`로 시작 전 실패. | e2e hook의 Prisma 의존 해상 경로를 런타임 복구 단계에서 우선 정리 |
| 2026-04-07 | Planning | Updated | tech-planner 보고서에서 dev runtime instability, API health, DB topology mismatch, Playwright drift, selector brittleness의 root cause와 수정 순서를 고정했다. | `docs/plans/2026-04-07-tech-planner-qa-remediation-report.md`를 기준선으로 build/review/QA 진행 |
| 2026-04-07 | Project-Director Round Gate | Planned | 이번 라운드 종료 기준을 `gate 통과 + priority rerun + 결과 재분류 + docs write-back`으로 고정했다. | runtime gate부터 순차 복구 후 findings 갱신 |
| 2026-04-07 | Runtime recovery | Updated | API health, host Playwright resolution, DB setup/teardown topology, auth storage injection, home/chat selector 안정화를 반영했다. | priority bundle 재실행 결과를 기준으로 remaining scenario expansion 계획 수립 |
| 2026-04-07 | Auth / Home / Match / Team / Chat | Passed | 로컬 기본 Playwright 설정을 직렬화한 뒤 Desktop Chrome priority bundle `48/48` 통과. 이전 `36/48` 및 `11/48` 실패는 주로 dev-server compile saturation과 brittle selector에서 발생한 false negative로 재분류했다. | Mobile Chrome 재실행, multi-browser matrix 확대, deeper create/join/notification flow 자동화 추가 |
| 2026-04-07 | Auth mobile cross-check | Passed | `auth-session-matrix`를 `Mobile Chrome`에서 `7/7` 통과시켰다. hidden desktop/mobile DOM이 섞이는 화면은 `:visible` selector와 stable `data-testid`를 기본 계약으로 삼는다. | 다음 mobile spec 작성 시 동일 selector 규칙 재사용 |
| 2026-04-07 | Home mobile cross-check | Passed | `home.spec.ts`를 `Mobile Chrome`에서 `14/14` 통과시켰다. 종목 칩 클릭은 모바일 숨김 중복 DOM을 피하도록 `button:visible` 계약으로 보정했다. | match/team/chat mobile coverage 확대 |
| 2026-04-07 | Backend auth unit | Passed | `pnpm --filter api test -- auth.service.spec.ts` 재검증 후 `242/242` 통과. `findUnique` mock 누락을 수정하고 soft-delete 사용자 `dev-login` 복구 케이스를 회귀 테스트로 고정했다. | auth integration/e2e와 연결된 soft-delete edge case 추가 검토 |
| 2026-04-07 | Persona QA | Passed | Beginner/Regular/Power/UIUX 모두 현재 validated scope에서 blocking issue를 보고하지 않았다. 남은 이슈는 deep flow coverage와 소규모 UX polish다. | `MATCH-001~003`, `TM-002~004`, `NOTI-001`, unread/read sync, restart persistence 자동화 확장 |
| 2026-04-08 | Match deep flow | Passed with follow-up | `e2e/tests/match-join-flow.spec.ts`에서 `MATCH-001` 생성->목록/상세/내 매치/새 탭/새로고침과 `MATCH-002` 다중 컨텍스트 참가/정원 초과 차단을 Desktop Chrome `13/13`, Mobile Chrome deep `2/2`로 검증했다. 실행 중 `/matches/new`가 UI 전용 필드를 DTO 그대로 POST해 실패하던 버그를 수정했다. | `MATCH-003`용 backend patch route 추가, custom venue 지원 여부 결정, host detail live sync 검증 |
| 2026-04-08 | Photoreal fallback rollout | Passed | `/home`, `/marketplace/new`, `/my/listings`, `/matches/[id]`, `/lessons/[id]`, `/venues`, `/matches/new`, `/matches/[id]/edit`까지 실사형 로컬 fallback이 정리됐다. `sport-image` unit `21/21`, `tsc --noEmit`, 주요 페이지 `200 OK`, 디자인 `🔴 0 / 🟡 0`, QA 4개 페르소나에서 검증된 26개 체크 무실패를 확인했다. | 보호 경로 auth-injected visual smoke와 `/venues` skeleton 이후 이미지 대기 조건 보강 |
| 2026-04-08 | Trust / Transaction / Admin remediation | Passed with scoped gaps | 결제 상세/환불은 owner-bound real data로 바뀌었고, 리뷰/뱃지에는 trust signal이 추가됐다. 유료 매치 결제는 `join -> participant -> prepare/confirm` 순서로 정렬했고, lesson/marketplace commerce는 fake success 없이 명시적 미지원으로 전환했다. 관리자 쪽은 user moderation audit log, dispute history, settlement partial-failure flow, admin team-match shell continuity를 반영했다. Backend service tests `247/247`, web `tsc --noEmit` 통과. | payment/review/badge 및 admin 시나리오의 실제 Playwright coverage 확장, lesson/marketplace commerce backend 구현 시 unsupported state 해제 |
| 2026-04-08 | Shared media lightbox rollout | Passed with follow-up | `MediaLightbox`를 추가해 `matches/[id]`, `lessons/[id]`, `marketplace/[id]`, `teams/[id]`, `venues/[id]` 상세 이미지에서 full-screen viewer, index, keyboard navigation, backdrop close, swipe를 공통화했다. `media-lightbox` unit `7/7`, web `tsc --noEmit`, `venue` detail browser smoke(`open -> Escape close`) 통과. dedicated Playwright spec은 아직 없어 follow-up으로 남긴다. | detail image lightbox Playwright spec 추가, mobile/desktop smoke 고정 |
| 2026-04-08 | Match discovery 2.0 v1 | Passed with scoped gaps | `/matches`가 URL 기반 필터 상태를 읽고 quick filter, 지역/레벨/정렬 패널을 유지하도록 바뀌었다. backend는 `q/city/district/freeOnly/availableOnly/beginnerFriendly/sort`를 지원하고, discovery helper unit `6/6`, backend match spec `252/252`, Playwright discovery subset `Desktop Chrome 3/3`를 통과했다. saved search와 recommendation reason badge는 이번 범위에서 제외했다. | saved search, personalized recommendation reason, distance/GPS filtering, multi-tab query-state matrix |
| 2026-04-08 | Discovery live-contract rerun | Passed with runtime note | DTO/query 변경 후 `localhost:8111`이 stale contract를 계속 서빙할 수 있어 `curl`로 먼저 검증했고, dev compose `api` watch compile blocker를 우회해 transpile-only runtime에서 `e2e/tests/match-discovery.spec.ts` `Desktop Chrome 3/3`를 다시 확인했다. | dev compose `api` watch 정상화, `teams` seed/create runtime drift 정리 |
| 2026-04-08 | Notification center v1 | Passed | `match_created`, `player_joined`, `payment_confirmed`, `payment_refunded` producer를 backend에 연결했고, `/notifications`를 API + websocket action center로 전환했다. `Desktop Chrome`에서 `notification-center.spec.ts` 전체 `3/3`를 통과했고, explicit in-app navigation, socket connect backfill, focus/visibility backfill, lighter `global-setup` bootstrap, fresh mutation token 패턴까지 고정했다. | chat-origin notification producer, `/settings/notifications` 영속화, unrelated `teams` seed drift 정리 |

## Latest Run Summary

- 실행 명령:
  - `pnpm --filter api test -- auth.service.spec.ts`
  - `pnpm --filter web test -- src/stores/__tests__/auth-store.test.ts`
  - `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
  - `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts e2e/tests/match-join-flow.spec.ts e2e/tests/team-owner-flow.spec.ts e2e/tests/chat-realtime.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome'`
  - `pnpm exec playwright test e2e/tests/auth-session-matrix.spec.ts e2e/tests/home.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome'`
  - `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 --reporter=line`
  - `pnpm exec playwright test e2e/tests/match-join-flow.spec.ts --config=e2e/playwright.config.ts --project='Mobile Chrome' --workers=1 --reporter=line --grep 'Deep match flows'`
  - `pnpm --filter api test -- notifications.service.spec.ts matches.service.spec.ts payments.service.spec.ts`
  - `pnpm --filter web test -- src/lib/__tests__/notification-center.test.ts`
  - `pnpm --filter web test -- src/hooks/__tests__/use-realtime.test.tsx`
  - `pnpm exec playwright test e2e/tests/notification-center.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' -g 'payment-confirmed notification opens the payment detail route' --workers=1`
  - `pnpm exec playwright test e2e/tests/notification-center.spec.ts --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1`
- 결과:
  - backend auth unit: `242/242` passed
  - `auth-store` unit: `6/6` passed
  - `match-join-flow + team-owner-flow` diagnostic rerun: `20/20` passed with `--workers=1`
  - priority desktop bundle: `48/48` passed
  - auth + home mobile bundle: `21/21` passed
  - match flow desktop full file: `13/13` passed
  - match flow mobile deep: `2/2` passed
  - notification center backend/unit bundle: `253/253` passed
  - `notification-center` unit: `5/5` passed
  - `use-realtime` unit: `8/8` passed
  - notification center payment deep-link rerun: `Desktop Chrome 1/1` passed
  - notification center full-file rerun: `Desktop Chrome 3/3` passed
- 재분류:
  - 해결된 환경 블로커: API `:8111` health, host Playwright module resolution, E2E DB setup/teardown topology
  - 해결된 스펙 품질 문제: broad selector, auth wall 판정, bottom-nav contract, chat room response shape, hidden duplicate DOM 대응
  - 해결된 제품 문제: `/matches/new` create payload가 DTO에 없는 UI 필드를 전송하던 버그
  - 남은 갭: `MATCH-003`, unrelated `global-setup` team seed/runtime drift, team-match approval/notification deep flows, persistence/realtime depth expansion, multi-browser 확대

## How To Use

1. `index.md`에서 현재 우선순위와 열린 논점을 확인한다.
2. 해당 기능 문서로 이동해 체크박스를 직접 갱신한다.
3. 이슈가 생기면 개별 문서에도 적고, 최종 판단/논의는 `Discussion`에 요약한다.
4. Playwright 구현이 시작되면 시나리오 ID를 테스트 파일명 또는 테스트 제목에 그대로 반영한다.
