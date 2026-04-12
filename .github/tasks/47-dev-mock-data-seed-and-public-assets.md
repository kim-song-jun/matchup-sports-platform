# Task 47 — Dev Mock Data Seed And Public Assets

Owner: codex -> backend-dev / frontend-dev / docs-writer
Date drafted: 2026-04-11
Status: Completed
Priority: P1

## Context

현재 dev runtime은 `seed.ts`가 만든 샘플 데이터, E2E가 생성한 테스트 데이터, 일부 프런트 하드코딩 mock이 섞여 있다. 이 상태에서는 “안정적으로 다시 채울 수 있는 canonical mock dataset”이 없고, 화면 검증 시 어떤 레코드가 신뢰 가능한 기준 mock인지 설명하기 어렵다.

이미지 쪽도 `public/mock/` 기반 photoreal fallback과 `db:seed:images` 보강 흐름은 존재하지만, 사용자 프로필 같은 일부 mock asset surface는 전용 public catalog가 없다. backend mock script와 public mock asset이 하나의 계약으로 묶여 있지 않아 dev DB와 UI 자산이 쉽게 drift한다.

## Goal

- destructive full seed와 별도로, 현재 DB를 지우지 않고 실행할 수 있는 idempotent mock DB script를 추가한다.
- script가 넣는 canonical mock dataset이 `public/mock/` 자산을 직접 참조하도록 정리한다.
- deploy 시점에는 checksum 기반으로 canonical mock dataset sync 필요 여부를 판단하고, 환경변수가 정확히 `false`일 때만 비활성화할 수 있게 한다.
- mock data / public asset / 실행 명령 / 문서를 같은 변경에서 맞춘다.

## Evidence

- `apps/api/prisma/seed.ts`
- `apps/api/prisma/seed-images.ts`
- `apps/api/prisma/sync-image-data.ts`
- `apps/api/prisma/mock-image-catalog.ts`
- `apps/web/public/mock/**`
- `apps/web/src/lib/sport-image.ts`
- `.github/tasks/07-refresh-mock-visual-assets.md`
- `.github/tasks/12-diversify-image-data-and-deploy-sync.md`

## Owned Write Scope

- `apps/api/prisma/**` for mock seed tooling
- `apps/web/public/mock/**` for new public mock assets
- `Makefile`
- `apps/api/package.json`
- `package.json` if root script exposure is useful
- `README.md`
- related task / work summary docs

## Original Conditions

- mock DB script는 unrelated runtime/test 데이터를 지우지 않고도 반복 실행 가능해야 한다.
- canonical mock dataset은 stable natural keys 또는 explicit managed IDs를 사용해 중복 생성되지 않아야 한다.
- public mock asset은 remote URL이 아니라 저장소 내부 `public/mock/` 경로만 사용한다.
- 기존 `db:seed` / `db:seed:images` contract를 깨지 않는다.
- production deploy는 checksum-gated mock sync를 기본값으로 사용해야 하며, operator가 명시적으로 `false`를 넣지 않는 이상 매 배포마다 검증 경로가 실행되어야 한다.

## User Scenarios

1. 개발자는 기존 dev DB를 wipe하지 않고도 “화면 확인용 기준 mock 데이터”를 추가/갱신할 수 있다.
2. 디자이너/QA는 팀, 매치, 레슨, 장터, 프로필 썸네일이 모두 local public mock asset으로 안정적으로 채워진 상태를 재현할 수 있다.
3. 프런트 화면 검증 시 “이 값은 DB mock이고 이 이미지는 public mock asset이다”를 설명할 수 있다.

## Test Scenarios

1. `db:seed:mocks`를 두 번 실행해도 managed mock dataset이 중복 생성되지 않는다.
2. script 실행 후 canonical mock users는 `profileImageUrl`이 `public/mock/` 경로를 가진다.
3. script 실행 후 canonical mock teams / matches / lessons / listings / venues는 이미지 필드가 채워지거나 기존 `syncImageData`로 보강된다.
4. `make db-seed-mocks`가 dev container에서 동작한다.
5. checksum-gated deploy mock sync는 checksum 동일 시 skip되고, `DEPLOY_SYNC_MOCK_DATA=false`면 항상 skip된다.
6. 기존 `db:seed:images`는 계속 동작하고 mock script와 충돌하지 않는다.

## Acceptance Criteria

- Given 현재 dev DB에 unrelated test/E2E 데이터가 있어도
  When `db:seed:mocks`를 실행하면
  Then canonical mock dataset만 upsert되고 unrelated 데이터는 유지된다.

- Given canonical mock users가 생성되면
  When profile surface를 렌더링하면
  Then 프로필 이미지는 `public/mock/` 자산을 직접 사용한다.

- Given script를 여러 번 실행해도
  When mock users/teams/matches/lessons/listings count를 확인하면
  Then managed natural key 기준으로 중복이 늘어나지 않는다.

- Given 기존 레코드의 user-provided remote image가 있으면
  When image sync 또는 mock script가 실행되면
  Then remote image를 덮어쓰지 않고 local mock은 비어 있는 slot만 보강한다.

- Given deploy runtime에서 `DEPLOY_SYNC_MOCK_DATA`가 비어 있거나 `true`면
  When checksum-gated mock sync를 실행하면
  Then seed state checksum을 조회해 변경이 있을 때만 canonical mock dataset을 반영한다.

- Given deploy runtime에서 `DEPLOY_SYNC_MOCK_DATA=false`면
  When checksum-gated mock sync를 실행하면
  Then dataset을 건드리지 않고 skip 로그만 남긴다.

## Validation

- `pnpm --filter api build`
- `pnpm --filter web exec tsc --noEmit`
- temporary empty Postgres smoke with `DATABASE_URL=... pnpm --filter api db:bootstrap:deploy`
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'`
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'` (rerun idempotency)
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:images'`
- targeted DB smoke query for canonical mock records and image fields

## Out Of Scope

- production seed policy 변경
- 외부 이미지 다운로드/생성 파이프라인
- mock-only frontend route를 이번 task에서 모두 real contract로 전환하는 작업

## Risks

- natural key 선택이 약하면 rerun 시 duplicate drift가 남을 수 있다.
- mock script가 너무 많은 레코드를 만들면 dev UI에서 E2E/test 데이터와 섞여 우선순위가 애매할 수 있다.
- public mock asset을 늘릴 때 helper/catalog와 실제 사용처가 다시 drift할 수 있다.

## Implementation Notes

- backend mock script는 destructive full seed가 아니라 idempotent sync로 구현한다.
- canonical mock dataset은 users / venues / teams / matches / lessons / marketplace listings / mercenary posts / team matches까지 최소 화면 검증에 필요한 범위를 포함하고, 추가 종목 mock도 점진적으로 확장한다.
- user/coaches profile asset은 새 `public/mock/` 경로를 추가해 직접 참조 가능하게 한다.
- 이미지 필드는 가능한 기존 `mock-image-catalog.ts`와 `syncImageData()`를 재사용한다.
- README와 Makefile에 실행 명령을 함께 노출한다.
- deploy-safe checksum state는 DB table로 관리해 GitHub Actions deploy와 수동 EC2 bootstrap이 같은 계약을 공유하게 한다.

## Ambiguity Log

- 2026-04-11: 기존 `seed.ts`를 전면 리팩터링할 수도 있지만, 이번 task의 1차 목표는 “현재 DB를 지우지 않고 재실행 가능한 mock script”다. Decision: 별도 `db:seed:mocks` 경로를 추가하고 full seed는 유지한다.
- 2026-04-11: public mock asset은 binary photo 추가보다 우선 text-based SVG profile asset과 catalog 정리부터 시작한다. photoreal surface는 기존 vetted local photo set을 재사용한다.

## Implementation Summary

- `apps/api/prisma/mock-data-catalog.ts`에 canonical dev mock dataset과 stable natural key catalog를 추가했다.
- `apps/api/prisma/seed-mocks.ts`에 non-destructive upsert script를 추가했고, users / sport profiles / venues / teams / memberships / matches / lessons / lesson ticket plans / listings / mercenary posts / team matches / team match applications / badges를 반복 실행 가능하게 동기화한다.
- `SeedSyncState` 모델과 migration을 추가해 deploy mock checksum state를 DB에 저장한다.
- `seed-mocks.ts --checksum-gate`는 KST 날짜 anchor + catalog version 기반 checksum을 계산하고, `DEPLOY_SYNC_MOCK_DATA=false`가 아니면 deploy 시점에 state를 비교해 필요할 때만 sync한다.
- `bootstrap-deploy-db.ts`를 추가해 deploy 전 DB bootstrap/migration 경로를 single entry로 통합했고, public table이 없는 DB에서는 orphaned migration history까지 재설정한 뒤 `db push + migrate resolve` fallback을 사용하되 migration history가 없는 비어 있지 않은 DB는 fail-closed 한다.
- `syncImageData(prisma)`를 마지막에 재사용해 teams / matches / lessons / listings / venues 이미지 필드를 local mock catalog로 채운다.
- `apps/web/public/mock/profile/profile-01.svg` ~ `profile-12.svg`를 추가했고 canonical mock users의 `profileImageUrl`은 이 public asset 경로를 직접 참조한다.
- canonical mock dataset 범위를 12 users / 10 venues / 10 teams / 11 matches / 8 lessons / 10 listings / 8 mercenary posts / 6 team matches / 6 badges까지 확장했다.
- `apps/api/package.json`, root `package.json`, `Makefile`, `README.md`, deploy workflow/docs에 `db:seed:mocks`, `db:seed:mocks:deploy`, `db-seed-mocks`, checksum-gated deploy surface를 노출했다.

## Validation Evidence

- `pnpm --filter api exec tsc --noEmit`, `pnpm --filter api build`는 현재 task 외부의 controller/service signature drift(`lessons.controller.ts`, `marketplace.controller.ts`, `teams.controller.ts`) 때문에 실패했다. 이번 변경 범위는 해당 계약을 수정하지 않으므로 deploy bootstrap과 mock sync는 direct script smoke로 검증했다.
- `pnpm --filter web exec tsc --noEmit`는 Task 47 작업 시점 기준 통과했고, 이번 follow-up 범위에서는 재검증 대상에서 제외했다.
- 임시 clean Postgres에서 raw `prisma migrate deploy`는 기존 baseline migration 부재로 실패했지만, 같은 DB에서 `pnpm --filter api db:bootstrap:deploy`가 orphaned `_prisma_migrations`를 재설정한 뒤 `No pending migrations to apply.`까지 통과해 empty DB bootstrap fallback을 검증했다.
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks'` 실행 후 확장 dataset 반영 확인
- `docker compose exec -T api sh -lc 'cd /app/apps/api && pnpm db:seed:mocks:deploy'` 1회차 결과:
  - checksum `2a63f6e48fdb...` 신규 저장
  - users 12 updated
  - sportProfiles 13 updated
  - venues 10 updated
  - teams 10 updated
  - teamMemberships 21 updated
  - matches 11 updated
  - matchParticipants 22 updated
  - lessons 8 updated
  - lessonTicketPlans 16 updated
  - listings 10 updated
  - mercenaryPosts 8 updated
  - teamMatches 6 updated
  - teamMatchApplications 1 updated
  - teamBadges 6 updated
- 같은 checksum-gated 명령 2회차 결과는 `checksum unchanged` skip 로그만 남겨 deploy-safe gate를 확인했다.
- `DEPLOY_SYNC_MOCK_DATA=false npx ts-node prisma/seed-mocks.ts --checksum-gate` 결과는 disabled skip 로그만 남겨 env opt-out을 확인했다.
- DB smoke query 결과:
  - mock users 12
  - mock venues 10
  - mock teams 10
  - mock matches 11
  - mock lessons 8
  - mock listings 10
  - mock mercenary posts 8
  - mock team matches 6
  - mock badges 6
- `seed_sync_states` row 결과:
  - key `deploy-canonical-mock-data`
  - checksum `2a63f6e48fdb2f28251319d7e5c15303e02af4f40112de2df0bb3713f5230821`
  - seedDateKey `2026-04-11`
  - catalogVersion `2`
- image field smoke query 결과:
  - mock profile images 12
  - mock team cover images 10
  - mock team photo arrays 10
  - mock match images 11
  - mock lesson image arrays 8
  - mock listing image arrays 10
  - mock venue image arrays 10
