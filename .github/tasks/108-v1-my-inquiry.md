# Task 108 - V1 My Inquiry

## Summary

마이(`/my`) 하단 영역에 `문의` 카테고리를 추가하고, 사용자가 앱 안에서 간단한 문의를 접수할 수 있는 v1 기능을 만든다. 기존 `/terms?document=support`의 이메일 안내는 유지하되, 앱 내 문의 폼은 가짜 완료나 로컬 mock 성공으로 처리하지 않고 실제 v1 API와 저장소에 연결한다.

## Scope

Target: both

Frontend:

- `apps/v1_web/src/components/my/*`
- `apps/v1_web/src/app/my/*`
- `apps/v1_web/src/hooks/use-v1-api.ts`
- `apps/v1_web/src/types/api.ts`
- `apps/v1_web/src/test/msw/*`

Backend:

- `apps/v1_api/src`
- `apps/v1_api/prisma/schema.prisma`
- `apps/v1_api/prisma/migrations`
- `apps/v1_api/test/fixtures`
- `docs/api/domains/*`

Design source:

- `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html`

## Product Direction

`문의`는 마이페이지의 보조 기능이므로 신규 하단 탭을 추가하지 않는다. 기존 하단바의 `마이` 탭 안에서 프로필, 활동, 커뮤니티, 설정 아래에 별도 섹션으로 노출한다. 위치는 설정 섹션 아래 또는 서비스 섹션 안쪽이 적절하며, 진입 라벨은 `문의하기`, 보조 문구는 `계정, 매치, 대회, 결제 문제를 운영팀에 남겨요` 수준으로 간결하게 둔다.

문의 화면은 사용자가 빠르게 작성할 수 있어야 한다. 1차 폼 필드는 `문의 유형`, `제목`, `내용`, `관련 항목 선택` 정도로 제한한다. 로그인 사용자 문의이므로 별도 연락처는 필수로 받지 않고, 필요 시 선택 필드로만 둔다. 첨부파일은 v1 첫 구현에서는 제외하거나 별도 후속으로 둔다. 결제, 환불, 제재, 신고처럼 운영 판단이 필요한 항목은 성공 토스트만으로 끝내지 말고 접수 상태와 처리 주체가 남아야 한다.

접수 후에는 `내 문의` 목록에서 상태를 확인할 수 있게 한다. 최소 상태는 `접수됨`, `확인 중`, `답변 완료`, `종료`로 둔다. 답변 기능까지 한 번에 만들기 어렵다면 관리자 답변 UI는 후속으로 분리하되, 사용자 화면에는 접수 번호, 접수일, 상태, 문의 내용 요약을 보여준다.

## Proposed Routes

- `/my/inquiries`: 내 문의 목록
- `/my/inquiries/new`: 문의 작성
- `/my/inquiries/[id]`: 문의 상세

마이 홈에서는 `문의` 섹션을 추가하고 첫 항목을 `/my/inquiries/new` 또는 `/my/inquiries`로 연결한다. 사용자가 이미 문의 이력을 확인해야 하므로 추천 진입은 `/my/inquiries`이고, 목록 상단에 `문의하기` CTA를 둔다.

## API Contract Draft

Auth: `JwtAuthGuard` 필수.

- `GET /api/v1/inquiries`
  - 내 문의 목록 조회
  - cursor pagination 기본
  - 다른 사용자의 문의는 조회 불가

- `POST /api/v1/inquiries`
  - 문의 생성
  - DTO 필드: `category`, `title`, `body`, `contact?`, `relatedType?`, `relatedId?`
  - 서버는 `userId`, `status=received`, `createdAt`을 기록

- `GET /api/v1/inquiries/:id`
  - 내 문의 상세 조회
  - 작성자 본인 또는 관리자만 접근 가능

Admin 후속 후보:

- `GET /api/v1/admin/inquiries`
- `GET /api/v1/admin/inquiries/:id`
- `PATCH /api/v1/admin/inquiries/:id/status`
- `POST /api/v1/admin/inquiries/:id/replies`

## Data Model Draft

Prisma 모델 후보:

- `V1Inquiry`
  - `id`
  - `userId`
  - `category`
  - `title`
  - `body`
  - `contact`
  - `relatedType`
  - `relatedId`
  - `status`
  - `createdAt`
  - `updatedAt`
  - `closedAt`

- `V1InquiryReply` 후속 후보
  - `id`
  - `inquiryId`
  - `authorUserId`
  - `authorAdminUserId`
  - `body`
  - `createdAt`

첫 구현에서 답변까지 포함하지 않더라도, 상태 추적이 가능한 모델명과 enum은 미리 확장 가능하게 둔다.

## UX Requirements

- 마이 홈은 기존 `MenuSection`/`Card`/`ListItem` 리듬을 유지한다.
- 문의 작성 화면은 utility page이므로 히어로형 홍보 화면처럼 만들지 않는다.
- 제출 중, 성공, 실패 상태를 명확히 보여준다.
- API 실패 시 성공처럼 보이는 toast나 임시 완료 화면으로 넘기지 않는다.
- 인증 만료, 필수값 누락, 네트워크 실패, 권한 없음은 각각 사용자에게 다른 문구로 안내한다.
- 모바일에서는 `MobileGlassHeader`/`AppChrome` 기존 마이 하위 화면 패턴을 따른다.
- 데스크톱에서는 현재 `/my`의 2-column rhythm과 과도하게 분리되지 않게 한다.

## Acceptance Criteria

- Given 로그인한 사용자가 `/my`에 진입했을 때, When 하단 영역을 확인하면, Then `문의` 섹션 또는 서비스 섹션의 문의 항목이 보인다.
- Given 사용자가 문의를 작성하고 필수값을 채웠을 때, When 제출하면, Then 서버에 실제 문의가 생성되고 내 문의 목록에 표시된다.
- Given 문의 생성 API가 실패했을 때, When 제출하면, Then 완료 화면으로 이동하지 않고 실패 원인과 재시도 액션이 보인다.
- Given 다른 사용자의 문의 ID로 접근했을 때, When 상세 조회를 시도하면, Then API가 접근을 차단한다.
- Given 모바일, 태블릿, 데스크톱 viewport에서 `/my`, `/my/inquiries`, `/my/inquiries/new`를 확인했을 때, Then 하단바, sticky chrome, 입력 폼, CTA가 서로 겹치지 않는다.

## Validation Plan

- Backend unit: `pnpm --filter v1_api test`
- Backend integration: 문의 생성, 목록, 상세 권한 차단 테스트
- Frontend unit: `pnpm --filter v1_web test`
- Frontend build: `pnpm --filter v1_web build`
- Visual/manual QA: `/my`, `/my/inquiries`, `/my/inquiries/new`, `/my/inquiries/[id]` desktop/tablet/mobile screenshot 및 console/network 확인
- Diff hygiene: `git diff --name-only`, `git diff --check`, touched path tech-debt grep

## Phased Plan

Phase 1 - Contract and data:

Prisma 모델과 enum을 추가하고, NestJS `inquiries` 모듈의 controller/service/DTO를 만든다. 생성, 목록, 상세 조회, 본인 권한 차단을 먼저 통합 테스트로 고정한다.

Phase 2 - Frontend data layer:

`types/api.ts`, `use-v1-api.ts`, MSW handler를 API 계약에 맞춰 추가한다. 문의 목록/상세/생성 mutation의 loading, error, success state를 실제 route contract 기준으로 맞춘다.

Phase 3 - User UI:

마이 홈에 `문의` 카테고리를 추가하고 `/my/inquiries`, `/my/inquiries/new`, `/my/inquiries/[id]` 화면을 구현한다. 기존 마이 UI 컴포넌트 패턴을 우선 재사용한다.

Phase 4 - Admin follow-up:

1차 범위에 포함할지 별도 task로 분리할지 결정한다. 운영자가 앱 안에서 답변해야 한다면 admin inquiry queue와 reply/status update API가 필요하다. 단순 접수만이면 1차에서는 admin UI를 제외하고 DB 조회 및 후속 운영 도구로 넘긴다.

## Open Questions

- 1차 문의는 앱 내 DB 접수까지 할지, 이메일 안내형 MVP로 먼저 둘지 결정이 필요하다. 저장소 규칙상 “문의 완료”를 보여주려면 실제 API 접수가 필요하다.
- 문의 유형 범위는 `계정`, `매치`, `팀`, `대회`, `결제/환불`, `신고`, `기타` 중 어디까지 열지 정해야 한다.
- 운영자 답변을 v1 안에서 바로 제공할지, 1차에서는 접수 상태만 제공할지 정해야 한다.
- 첨부파일은 업로드 정책과 보관 경로가 필요하므로 1차 범위에서 제외하는 것을 권장한다.
