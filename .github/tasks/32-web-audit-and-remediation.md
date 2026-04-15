# Task 32 — Web Audit and Remediation

Owner: codex
Date drafted: 2026-04-10
Status: Proposed (partially superseded by tasks 33-40)

## Truth Sync Note (2026-04-11)

- 이 문서는 historical audit baseline으로 유지한다.
- scenario status wording의 최신 기준은 task 40 이후 `docs/scenarios/index.md`가 담당한다.
- mercenary lifecycle follow-up은 task 36, notification preference mismatch는 task 39가 직접 추적한다.

## Execution Progress (2026-04-11)

- `apps/web` 메타데이터, public/auth/main/admin 주요 표기, 랜딩/어바웃/가이드/FAQ 카피를 `Teameet`으로 단일화했다.
- `/favicon.svg`를 추가하고 `Metadata.icons`에 연결해 브라우저 favicon 404를 제거했다.
- `my/matches`, `my/lessons`, `my/listings`에서 local mock/sample fallback을 제거하고 real-data-first + honest empty state로 전환했다.
- `my/matches` 참가 이력 탭은 실데이터 미연동 상태를 `TrustSignalBanner`로 명시하도록 바꿨다.
- `venues/[id]`는 generic mock venue fallback을 제거하고 `loading / empty / error` contract로 전환했다.
- `venues/[id]` 우측 사이드바는 가짜 team-match 카드 대신 실제 `GET /venues/:id/schedule` 응답 기반의 향후 7일 예약 현황으로 교체했다.
- `ReviewForm`과 `venues/[id]` 리뷰 CTA를 실제 review mutation으로 연결하고, 저장되지 않는 사진 업로드는 준비 중 상태로 축소했다.
- 검증 중 호스트에서 실행한 `next build`가 bind-mounted `apps/web/.next`를 덮어 Docker dev `web`이 500을 내는 런타임 꼬임이 발생했다. `apps/web/.next` 삭제 후 `docker compose up -d --force-recreate deps web`으로 정상화했다.
- `admin/payments` / `admin/reviews` mock surface, lesson detail sample content, notification preference drift 같은 남은 갭만 현재 follow-up으로 남기고, 더 이상 유효하지 않은 route-missing 류 지적은 이 문서의 현재 주장으로 재사용하지 않는다.

## Context

사용자는 지금까지 Claude/Codex에 누적된 지시사항, 문서, 구현을 함께 대조해 “내가 만들고 싶은 웹페이지가 실제로 잘 구현되었는지”를 평가하고, 이후 수정 계획까지 세워 달라고 요청했다.

이번 감사에서 확인한 현재 기준선:

- 런타임 접근 가능: `http://localhost:3003/landing`, `http://localhost:8111/api/v1/health`
- 프론트 타입체크 통과: `pnpm --filter web exec tsc --noEmit`
- 프론트 단위 테스트 통과: `pnpm --filter web test` → `24 files / 247 tests passed`
- 공개 랜딩 브라우저 스모크에서 `/favicon.ico` 404 확인
- `docs/scenarios/index.md` 기준 Master Checklist는 2개 영역만 fully verified이고, 나머지 8개는 partial / verification pending / unsupported가 섞여 있다.
- `apps/web/src/app/**/page.tsx` 기준 `mock`/`sample`/`NODE_ENV` fallback이 남아 있는 페이지가 총 18개
  - main app 11개
  - admin 5개
  - auth/public 2개
- 현재 git worktree에는 team membership 관련 미커밋 변경이 이미 존재한다. 이 감사 후속 구현은 해당 변경과 충돌하지 않도록 순서를 잡아야 한다.

## Goal

- 문서, 브랜드, QA 시나리오, 실제 구현 상태 사이의 불일치를 줄인다.
- 사용자-facing 페이지에서 “실제 기능”, “샘플 데이터”, “명시적 미지원”이 뒤섞여 보이는 문제를 정리한다.
- admin 및 거래형 화면에서 mock fallback 의존을 제거하거나 최소한 honest empty/error contract로 바꾼다.
- 이후 수정 라운드가 시나리오 문서와 Playwright 기준으로 이어질 수 있게 canonical plan을 만든다.

## Original Conditions

- [x] 지시사항 / 문서 / 구현을 함께 대조한다.
- [x] 현재 완성도와 남은 갭을 구분해서 평가한다.
- [x] 수정 우선순위와 실행 순서를 문서화한다.
- [ ] 실제 기능 수정은 이번 태스크 범위에 포함하지 않는다.

## Audit Findings

### 1. 브랜드 소스가 둘로 갈라져 있다

- 문서와 manifest는 `Teameet`을 사용한다.
- 실제 웹 메타데이터와 UI 표기는 `TeamMeet`를 사용한다.
- 저장소 내부 문서도 이 충돌을 이미 인지하고 있다.

### 2. “구현됨”과 “검증 완료”가 같은 상태가 아니다

- 시나리오 허브 기준으로 완료 체크가 난 영역은 인증/세션, 팀/멤버십 2개뿐이다.
- 나머지 핵심 도메인(홈/매치/팀매치/용병/장터/레슨/결제/프로필/관리자)은 pending, partial, planned 상태가 섞여 있다.

### 3. 사용자-facing 페이지에 mock/sample/development fallback이 남아 있다

- 대표 예시:
  - `my/matches`: 참가 히스토리가 dev 전용 mock
  - `my/lessons`: API가 비면 샘플 강좌 사용
  - `venues/[id]`: venue detail 전체가 mock fallback 가능
  - `team-matches/[id]/arrival`, `team-matches/[id]/score`: 핵심 운영 화면이 mock 기반
  - `lessons/[id]`: sample curriculum, sample coach stats, 준비 중 CTA

### 4. 거래형 플로우는 honest하게 막아 둔 곳과 아직 애매한 곳이 공존한다

- 긍정적: 장터/강좌 결제는 “준비 중”을 명시하고 fake success를 줄였다.
- 보완 필요: lesson detail 내부 sample 정보와 CTA 문구, checkout 범위, notification preference mismatch가 도메인 문서와 한 번 더 맞춰져야 한다.

### 5. admin surface는 아직 운영 화면으로 보기 어렵다

- `admin/payments`, `admin/reviews`는 API 데이터가 비면 mock list로 대체된다.
- 그 외 `admin/mercenary`, `admin/teams/[id]`, `admin/venues/[id]`도 mock 기반 흔적이 남아 있다.
- 운영자가 실제 데이터와 샘플 데이터를 구분하지 못하는 상태는 admin UX 기준에서 위험하다.

### 6. 환경 기준도 정리해야 한다

- 현재 로컬 셸 Node는 `v21.7.3`이며 프로젝트 engine은 `>=22`다.
- 테스트는 통과했지만, 이후 full verification과 CI parity를 위해 Node 22 기준으로 맞춰 보는 것이 안전하다.
- full Playwright harness는 여전히 Docker dev stack 전제를 가진다.

## Evidence Pointers

- 브랜드 메타데이터: `apps/web/src/app/layout.tsx`
- manifest 네이밍: `apps/web/public/manifest.json`
- 브랜드 드리프트 메모: `docs/reference/app-icon-prompt-pack.md`
- QA 진행 현황: `docs/scenarios/index.md`
- admin mock fallback 예시: `apps/web/src/app/admin/payments/page.tsx`, `apps/web/src/app/admin/reviews/page.tsx`
- user mock fallback 예시: `apps/web/src/app/(main)/my/matches/page.tsx`, `apps/web/src/app/(main)/my/lessons/page.tsx`, `apps/web/src/app/(main)/venues/[id]/page.tsx`
- unsupported contract 예시: `apps/web/src/app/(main)/lessons/[id]/page.tsx`, `apps/web/src/app/(main)/marketplace/[id]/page.tsx`, `apps/web/src/app/(main)/settings/notifications/page.tsx`

## Acceptance Criteria For Next Execution Round

- 브랜드 명칭이 UI, 메타데이터, manifest, 핵심 문서에서 하나로 수렴한다.
- high-traffic user pages에서 silent mock fallback이 사라지거나, sample badge/empty state로 명확히 드러난다.
- team-match 운영 페이지는 실제 API contract를 쓰거나, 아직 미구현이면 진입점이 정직하게 좁혀진다.
- lesson / marketplace / checkout / notification 화면의 범위가 문서와 동일한 언어로 정리된다.
- admin pages는 mock fallback 대신 real data / empty / error contract를 갖는다.
- `docs/scenarios/index.md`와 관련 scenario docs가 실제 구현 범위를 반영한다.

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 현재 team membership 관련 미커밋 변경과 충돌 가능 | 후속 구현 1순위에서 해당 변경을 먼저 stabilize하거나 별도 커밋으로 분리 |
| backend API가 없는 화면을 프론트만 수정해도 다시 false affordance가 생길 수 있음 | 화면별로 `implement vs hide vs honest unsupported` 결정을 먼저 고정 |
| admin 데이터를 실데이터로 바꾸는 과정에서 DTO drift 발생 가능 | `use-api.ts`, DTO, scenario docs, e2e selector를 같은 라운드에서 sync |
| QA 범위를 한 번에 넓히면 false negative 증가 | 시나리오 index 순서대로 작은 bundle로 검증 |

## Recommended Execution Order

1. 브랜드 기준선 고정 (`Teameet` vs `TeamMeet` 단일화)
2. high-traffic user mock surface 제거 (`my/*`, `venues/[id]`)
3. team-match 운영 페이지 정리 (`arrival`, `score`)
4. lesson / marketplace / checkout / notifications contract 정리
5. admin mock surface 제거
6. scenario / Playwright coverage 확장
7. overview / summary / task docs write-back

## Validation Baseline

- `curl http://localhost:3003/landing`
- `curl http://localhost:8111/api/v1/health`
- `pnpm --filter web exec tsc --noEmit`
- `pnpm --filter web test`
- `pnpm exec playwright test --config=e2e/playwright.config.ts --project='Desktop Chrome' --workers=1 <target specs>`

## Deliverable

- detailed execution plan: `docs/plans/2026-04-10-web-audit-remediation-plan.md`
