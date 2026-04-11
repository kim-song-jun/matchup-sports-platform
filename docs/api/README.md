# MatchUp API Integration Docs

이 디렉터리는 프론트엔드 통합을 위한 실행 계약 문서다. Swagger는 참고용이고, 실제 구현 기준은 이 문서 세트다.

## 문서 읽는 순서

1. [global-contract.md](./global-contract.md)
2. [auth-and-session.md](./auth-and-session.md)
3. [errors-and-validation.md](./errors-and-validation.md)
4. [pagination-filtering-and-sorting.md](./pagination-filtering-and-sorting.md)
5. [uploads-and-media.md](./uploads-and-media.md)
6. [realtime-and-notifications.md](./realtime-and-notifications.md)
7. 도메인 문서

## 범위

- 기준 API prefix: `/api/v1`
- success envelope: `{ status: "success", data, timestamp }`
- error envelope: `{ status: "error", statusCode, message, timestamp }`
- strict validation: `whitelist + forbidNonWhitelisted + transform`

## 도메인 문서

빠른 진입 가이드:

- Tier 1:
  - 인증/세션부터 붙으면 `auth`, `users`
  - 매치/팀 플로우를 붙이면 `matches`, `teams`, `team-matches`
- Tier 2:
  - 거래/예약 플로우를 붙이면 `venues`, `lessons`, `marketplace`, `payments`, `mercenary`
- Tier 3:
  - 실시간/운영/지원 플로우를 붙이면 `chat`, `notifications`, `admin-and-ops`, `supporting-domains`

- [domains/auth.md](./domains/auth.md)
- [domains/users.md](./domains/users.md)
- [domains/matches.md](./domains/matches.md)
- [domains/teams.md](./domains/teams.md)
- [domains/team-matches.md](./domains/team-matches.md)
- [domains/venues.md](./domains/venues.md)
- [domains/lessons.md](./domains/lessons.md)
- [domains/marketplace.md](./domains/marketplace.md)
- [domains/payments.md](./domains/payments.md)
- [domains/mercenary.md](./domains/mercenary.md)
- [domains/chat.md](./domains/chat.md)
- [domains/notifications.md](./domains/notifications.md)
- [domains/admin-and-ops.md](./domains/admin-and-ops.md)
- [domains/supporting-domains.md](./domains/supporting-domains.md)

## 공통 횡단 문서

- [global-contract.md](./global-contract.md)
- [auth-and-session.md](./auth-and-session.md)
- [errors-and-validation.md](./errors-and-validation.md)
- [pagination-filtering-and-sorting.md](./pagination-filtering-and-sorting.md)
- [uploads-and-media.md](./uploads-and-media.md)
- [realtime-and-notifications.md](./realtime-and-notifications.md)

## CAUTION Hotspots

- DTO 없이 `Record<string, unknown>` body를 받는 surface:
  - `POST /venues/:id/reviews`
  - `POST /reviews`
  - 일부 admin/disputes/settlements mutation
- optional-auth로 응답 shape가 달라지는 surface:
  - `GET /mercenary/:id`
  - `GET /teams/:id/hub`
  - `GET /venues/:id/hub`
- 프론트 훅/타입 드리프트가 문서에 이미 표시된 surface:
  - `notifications`
  - 일부 payment/upload 응답 타입

## Source Of Truth 우선순위

1. `apps/api/src/**/*controller.ts`
2. `apps/api/src/**/dto/*.ts`
3. `apps/api/src/**/*.service.ts` 상태 전이/권한 gate
4. `apps/api/test/integration/*.e2e-spec.ts`, `apps/api/src/**/*.spec.ts`
5. `apps/web/src/hooks/use-api.ts`, `apps/web/src/types/api.ts`
6. Swagger (`/docs`)

## 문서 유지보수 규칙

- controller/DTO/service/test/hook/type 중 하나라도 계약이 바뀌면 같은 PR에서 이 문서를 함께 갱신한다.
- DTO 없는 endpoint, optional-auth endpoint, 프론트 타입 드리프트 지점은 반드시 `CAUTION`으로 표기한다.
- `status`/enum/권한/중복요청 동작은 "추정"으로 쓰지 않고 코드 근거를 확인해서 쓴다.
