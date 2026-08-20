# Task 131 — 통합 팝업 정확한 경로 타기팅

## Scope

- 기존 `/admin/popups`의 콘텐츠·게시·CTA 계약을 유지한다.
- 화면 그룹보다 구체적인 내부 경로 타기팅을 추가한다.
- 특정 대회 상세를 선택하면 `/tournaments/{id}` 경로를 자동 생성한다.
- 대회 전용 팝업 제거는 후속 단계로 남긴다.

## Acceptance Criteria

- 기존 `targetScreens`만 가진 팝업은 변경 없이 노출된다.
- 팝업은 화면 그룹 또는 정확한 내부 경로 중 하나 이상을 가져야 한다.
- 정확한 경로 팝업이 화면 그룹 팝업보다 우선하며 한 화면에는 최대 1건만 반환된다.
- `/admin`, 외부 URL, query/hash, 공백, 역슬래시가 포함된 target path는 거부한다.
- 관리자는 대회를 선택해 읽기 전용 `/tournaments/{id}` 경로를 설정할 수 있다.
- 기존 리치 콘텐츠, 이미지, CTA, 게시 상태, 노출 기간, 미리보기 동작은 유지된다.
- popup API 문서와 Web/API focused tests가 함께 갱신된다.

## Progress Snapshot

- 2026-08-04: 기존 전역 팝업과 대회 전용 팝업의 중복 노출 원인을 확인하고, 통합 팝업 exact-path 선행 구현 후 대회 전용 팝업을 제거하기로 결정했다.
- 2026-08-04: `targetPaths` schema/API/runtime 우선순위와 `/admin/popups` 대회 선택 UI를 구현했다. 기존 콘텐츠·CTA·기간·화면 그룹 계약은 유지했다.
- 2026-08-04: Prisma Client 생성, Web popup admin 5/5, popup target helper 5/5, Web/API `tsc --noEmit`이 통과했다. Backend Jest는 host Node 18에서 Jest TypeScript config를 정상 실행하지 못해 Node 22 환경 재검증이 필요하다. headed browser 미제공으로 관리자 화면 시각 QA도 후속 확인이 필요하다.

- 2026-08-20: 후속 단계 착수. 프론트가 `/popups/active` 에 `path` 를 넘기지 않아 exact-path 매칭이
  런타임에서 한 번도 동작하지 않고 있었음을 발견하고 배선했다(PR #599). 이어서 Out of Scope 로
  남겨 뒀던 `V1TournamentPopup` UI/API 제거를 진행한다 — prod/alpha 모두 해당 테이블 0행이라
  데이터 이관은 필요 없었다(SSM 읽기 전용 조회로 확인). 테이블 DROP 은 배포 순서상 별도
  릴리스로 미룬다(`prisma migrate deploy` 가 컨테이너 교체보다 먼저 돌기 때문).

## Validation

- `pnpm v1:db:generate` — PASS
- `pnpm --filter v1_web exec vitest run src/app/admin/popups/page.test.tsx --pool=forks --maxWorkers=1` — 5/5 PASS
- `pnpm --filter v1_web exec vitest run src/lib/popup-targets.test.ts --pool=forks --maxWorkers=1` — 5/5 PASS
- `pnpm --filter v1_web exec tsc --noEmit` — PASS
- `pnpm --filter v1_api exec tsc --noEmit` — PASS
- Backend focused Jest — BLOCKED: host Node 18, repository requires Node >=22
- Headed browser visual QA — BLOCKED: headed browser runtime unavailable

## Out of Scope

- `V1TournamentPopup` UI/API/DB 제거
- 기존 대회 팝업 데이터 이관
- wildcard, query-string, 외부 URL 기반 노출 대상
