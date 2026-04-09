# 19 — Admin DTO 정형화 & 이미지 업로드 UI (P0)

> **Parent plan**: `/Users/kimsungjun/.claude/plans/enumerated-scribbling-popcorn.md`
> **Wave**: 2 (P0, task 17/18 머지 후 시작 권장 — 충돌 위험 낮지만 reviewer 부하 분산)
> **Owner**: 병렬 (backend-api-dev: admin DTO + frontend-ui-dev: image-upload)
> **Status**: pending
> **Estimated PRs**: 1 또는 2 (분리 가능)
> **Blocked by**: task 16 (검증 결과로 추가 untyped DTO 발견 시 scope 확장)

---

## Context

두 개의 critical 부채를 한 task로 묶음 (둘 다 새 파일 위주, 충돌 위험 낮음, 동일한 P0 priority).

### 부채 1: Admin/Marketplace untyped DTO (C3)

- `apps/api/src/admin/admin.controller.ts:77, 95, 105`의 `createLesson()`, `createTeam()`, `createVenue()`가 `body: Record<string, unknown>`을 받음
- `apps/api/src/admin/admin.service.ts:206-284`가 `prisma.X.create({ data: body as never })`로 unsafe cast
- 결과: class-validator가 동작 안 함 → 잘못된 body로 incomplete record 생성, prisma type error 런타임 발생 가능
- 같은 패턴이 marketplace에도 있을 가능성 (사전 조사에서 marketplace.controller.ts ~line 60 추정)

### 부채 2: 이미지 업로드 UI 부재 (C4)

- 백엔드 `/uploads` 파이프라인은 task 14에서 완성됨 (`apps/api/src/uploads/`)
- multer + sharp + 로컬 저장 + 정적 서빙 OK
- **frontend 컴포넌트 부재**: `apps/web/src/components/ui/image-upload.tsx` 파일 없음 (CLAUDE.md Known Blockers + 사전 조사로 확인)
- 영향: 매치 사진, 도착 인증, 마켓플레이스 사진, 프로필 이미지 모두 업로드 불가

## Goal

1. Admin/Marketplace mutation 엔드포인트가 typed DTO + class-validator로 검증
2. `image-upload.tsx` 컴포넌트로 매치 생성/팀 매치 생성에서 사진 업로드 가능
3. 백엔드 응답이 typed → frontend type 안전성 회복

## Original Conditions

- [ ] Admin createLesson/createTeam/createVenue가 typed DTO 사용
- [ ] DTO validator로 잘못된 body 거부
- [ ] `as never` 캐스팅 제거
- [ ] image-upload.tsx 컴포넌트 신규 구현
- [ ] 매치/팀매치 생성에서 사진 첨부 가능
- [ ] 업로드 UI 접근성 (44x44, aria-label, focus ring)

---

## Track A — Admin/Marketplace DTO 정형화

> Wave 2A, Owner: backend-api-dev

### Phase 19.A1 — 현황 파악

- [ ] **A1.1** `apps/api/src/admin/admin.controller.ts` 전체 read → 모든 mutation 메서드 시그니처 정리
- [ ] **A1.2** `apps/api/src/admin/admin.service.ts` 전체 read → `as never` 또는 `Record<string, unknown>` 사용처 grep
- [ ] **A1.3** `apps/api/src/marketplace/marketplace.controller.ts` 동일 점검
- [ ] **A1.4** 다른 모듈에서도 같은 안티패턴 grep:
  ```
  pattern: "Record<string,\s*unknown>"  + glob: apps/api/src/**/*.controller.ts
  pattern: "as never"  + glob: apps/api/src/**/*.service.ts
  ```
- [ ] **A1.5** 발견된 모든 케이스를 표로 정리:

| Controller | Method | Body type | Service cast | 신규 DTO 명 |
|------------|--------|-----------|--------------|-------------|
| admin | createLesson | Record<string, unknown> | as never | CreateLessonAdminDto |
| admin | createTeam | Record<string, unknown> | as never | CreateTeamAdminDto |
| admin | createVenue | Record<string, unknown> | as never | CreateVenueAdminDto |
| admin | updateMatchStatus | Record<string, unknown>? | ? | UpdateMatchStatusDto |
| admin | updateLessonStatus | ? | ? | UpdateLessonStatusDto |
| admin | updateVenue | ? | ? | UpdateVenueDto |
| marketplace | createListing | ? | ? | CreateListingDto |

### Phase 19.A2 — DTO 작성

- [ ] **A2.1** 디렉토리 생성: `apps/api/src/admin/dto/` (이미 있으면 추가)
- [ ] **A2.2** Lesson 모델을 schema.prisma에서 read → 필드 매핑하여 `create-lesson-admin.dto.ts` 작성
  - required: `name`, `sportType`, `instructorId`, `venueId`, `startDate`, ...
  - optional: `description`, `imageUrl`, ...
  - validator: `@IsString`, `@IsUUID`, `@IsDateString`, `@IsEnum(SportType)`, `@IsInt @Min`, etc.
- [ ] **A2.3** Team, Venue도 동일 패턴
- [ ] **A2.4** Update DTO는 `PartialType(CreateXxxDto)` 사용
- [ ] **A2.5** Status update DTO는 작은 클래스 (예: `{ status: 'completed' | 'cancelled' }`)
- [ ] **A2.6** Marketplace `create-listing.dto.ts` (이미 있으면 보강)

### Phase 19.A3 — Controller/Service 교체

- [ ] **A3.1** 각 controller 메서드 시그니처를 `body: Record<string, unknown>` → `body: CreateXxxDto`로 교체
- [ ] **A3.2** Service의 `as never` 제거 → DTO 타입 그대로 prisma create에 전달
- [ ] **A3.3** 누락된 default 값이 있다면 service에서 보충
- [ ] **A3.4** `tsc --noEmit` 통과 확인

### Phase 19.A4 — 테스트

- [ ] **A4.1** 각 DTO에 대해 admin.controller.spec.ts에 케이스 추가:
  - [ ] valid body → 200 + create 호출
  - [ ] missing required field → 400
  - [ ] invalid type (string에 number) → 400
  - [ ] enum 위반 → 400
- [ ] **A4.2** integration 테스트 (admin.e2e-spec.ts 있으면) 동일 cover
- [ ] **A4.3** main.ts의 ValidationPipe 글로벌 설정 확인 (`whitelist: true`, `forbidNonWhitelisted: true`)

### Acceptance Track A
- [ ] `as never` / `Record<string, unknown>` 0건 (admin/marketplace 모듈)
- [ ] 모든 mutation에 typed DTO + validator
- [ ] tests 추가 + 통과
- [ ] tsc 통과

---

## Track B — Image Upload UI

> Wave 2B, Owner: frontend-ui-dev (병렬 가능 with Track A)

### Phase 19.B1 — 백엔드 API 확인

- [ ] **B1.1** `apps/api/src/uploads/uploads.controller.ts` read:
  - [ ] 엔드포인트 path 확인 (`POST /uploads` 또는 `/uploads/image`)
  - [ ] multipart field 이름 (예: `file`, `images`)
  - [ ] 응답 shape (`{ url: string, width: number, height: number }`?)
  - [ ] 인증 필요 여부 (JwtAuthGuard?)
  - [ ] 파일 제한 (max size, MIME)
- [ ] **B1.2** `apps/web/src/lib/api.ts`에서 기존 axios instance 확인 → `Authorization` 헤더 자동 주입 여부

### Phase 19.B2 — 컴포넌트 설계

- [ ] **B2.1** Props 인터페이스:
  ```ts
  interface ImageUploadProps {
    value: string[];                // uploaded URLs
    onChange: (urls: string[]) => void;
    max?: number;                   // default 5
    accept?: string;                // default 'image/jpeg,image/png,image/webp'
    maxSizeMB?: number;             // default 10
    label?: string;                 // a11y label
    disabled?: boolean;
  }
  ```
- [ ] **B2.2** 내부 상태:
  - [ ] `uploading: boolean[]` (인덱스별 진행 중)
  - [ ] `error: string | null`
  - [ ] file input ref
- [ ] **B2.3** 동작:
  - [ ] 파일 선택 → 클라이언트 검증 (size, MIME, 개수)
  - [ ] FormData 생성 → POST /uploads → 응답 url을 value 배열에 push
  - [ ] 미리보기 그리드 (썸네일, 제거 버튼)
  - [ ] drag & drop (선택)
  - [ ] 실패 시 toast로 에러 표시 (`useToast` 사용)

### Phase 19.B3 — 컴포넌트 구현

- [ ] **B3.1** `apps/web/src/components/ui/image-upload.tsx` 신규 작성
- [ ] **B3.2** 디자인 토큰 준수 (utility-first Tailwind):
  - [ ] 빈 상태: `border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl`
  - [ ] 업로드 영역: `min-h-[120px]` 클릭 영역
  - [ ] 썸네일: `aspect-square rounded-lg overflow-hidden`
  - [ ] 제거 버튼: `min-h-11 min-w-11` (44x44 터치 타겟)
  - [ ] 다크모드: 모든 색상 `dark:` 변형
- [ ] **B3.3** 접근성:
  - [ ] `<label htmlFor>` + `<input type="file" id>` 연결
  - [ ] `aria-label="이미지 업로드"` (label prop 우선)
  - [ ] 제거 버튼 `aria-label={`이미지 ${i+1} 제거`}`
  - [ ] 키보드 포커스 ring `focus:outline-blue-500 focus:outline-2 focus:outline-offset-2`
  - [ ] 업로드 진행 시 `aria-busy="true"` + `role="status"` 메시지
- [ ] **B3.4** 모션:
  - [ ] 썸네일 등장 `animate-fade-in`
  - [ ] `prefers-reduced-motion` 대응 (글로벌 CSS에 이미 있음)

### Phase 19.B4 — 통합 (Wave 1차 통합)

- [ ] **B4.1** `apps/web/src/app/(main)/matches/new/page.tsx`:
  - [ ] form state에 `images: string[]` 추가
  - [ ] form 적절한 단계에 `<ImageUpload value={images} onChange={...} max={5} />`
  - [ ] handleSubmit payload에 `imageUrl: images[0]` (Match 모델이 단일 이미지면) 또는 `images` 배열
- [ ] **B4.2** `apps/web/src/app/(main)/team-matches/new/page.tsx`:
  - [ ] 동일 패턴 (필요 시 — TeamMatch 모델에 image 필드 있는지 확인)
- [ ] **B4.3** 매치/팀매치 상세 페이지가 이미지 표시 로직이 있는지 확인 → 없으면 해당 PR에 추가하지 말고 별도 follow-up
- [ ] **B4.4** 통합 검증: 실제 업로드 → 백엔드 디스크 저장 → `imageUrl` DB 영속 → 상세 페이지 표시

### Phase 19.B5 — 단위 테스트

- [ ] **B5.1** `apps/web/src/components/ui/image-upload.test.tsx` 신규:
  - [ ] 파일 선택 → onChange 호출
  - [ ] max 초과 → 거부 + toast
  - [ ] MIME 위반 → 거부 + toast
  - [ ] size 초과 → 거부 + toast
  - [ ] 제거 버튼 클릭 → onChange로 해당 url 제거
  - [ ] disabled 상태 → 클릭/포커스 차단
- [ ] **B5.2** MSW에 `/uploads` POST 핸들러 추가 → 가짜 url 반환
- [ ] **B5.3** matches/new 페이지 test에 이미지 시나리오 추가 (있으면)

### Phase 19.B6 — 회귀 검증

- [ ] **B6.1** `pnpm --filter @matchup/web exec tsc --noEmit`
- [ ] **B6.2** `pnpm --filter @matchup/web test`
- [ ] **B6.3** local dev (`pnpm dev`)에서 매치 생성 → 사진 첨부 → 상세 페이지 표시 시각 검증
- [ ] **B6.4** e2e 추가:
  - [ ] `e2e/tests/matches.spec.ts`에 "사진 첨부 후 매치 생성" 시나리오 (Playwright `page.setInputFiles`)

### Acceptance Track B
- [ ] `apps/web/src/components/ui/image-upload.tsx` 존재
- [ ] matches/new에서 사진 업로드 동작
- [ ] team-matches/new에서 사진 업로드 동작 (TeamMatch 모델이 지원하면)
- [ ] 컴포넌트 단위 테스트 통과
- [ ] e2e 1개 추가/통과
- [ ] 접근성 체크리스트 통과

---

## User Scenarios

### Track A — Admin
- **Happy**: 관리자가 새 강좌 등록 → 모든 필수 필드 입력 → 201
- **Edge**: optional 필드만 누락 → 201, default 값 적용
- **Error**: 필수 필드 누락 → 400 + 어떤 필드인지 응답
- **Error**: 잘못된 enum 값 → 400

### Track B — Image Upload
- **Happy**: 매치 새 글에서 사진 3장 첨부 → 등록 → 상세 페이지에서 3장 표시
- **Edge**: 사진 0장 → 등록 OK (이미지는 optional)
- **Edge**: 사진 5장 (max) → OK
- **Error**: 6장째 추가 시도 → toast "최대 5장까지 가능합니다"
- **Error**: 11MB 사진 → toast "10MB 이하만 가능합니다"
- **Error**: PDF 업로드 → toast "JPG, PNG, WebP만 가능합니다"
- **Error**: 네트워크 끊김 → toast "업로드 실패"

---

## Test Scenarios

| Track | 종류 | 케이스 | 위치 |
|-------|------|--------|------|
| A | Happy | 7개 DTO 각각 valid body | spec |
| A | Error | 각 DTO 필수 필드 누락 | spec |
| A | Error | enum violation | spec |
| A | Integration | 실제 DB create + read | e2e-spec |
| B | Happy | upload → onChange | unit |
| B | Edge | max, size, MIME 거부 | unit |
| B | Integration | 매치 생성 + 사진 표시 | playwright |
| Mock update | A | spec mock 업데이트 | inline |
| Mock update | B | MSW handler `/uploads` 추가 | `apps/web/src/test/msw/handlers.ts` |

---

## Parallel Work Breakdown

| Wave | Track | Phase | Owner | 병렬 가능 |
|------|-------|-------|-------|-----------|
| 2 | A | A1-A4 | backend-api-dev | B와 병렬 |
| 2 | B | B1-B6 | frontend-ui-dev | A와 병렬 |

Track A와 B는 파일 영역이 완전히 분리됨 → 동시 머지 안전.

**Do NOT touch**:
- Track A: `apps/web/**`, `apps/api/src/team-matches/**` (task 17), `apps/api/src/auth/**` (task 20), `apps/api/prisma/schema.prisma` (task 17)
- Track B: `apps/api/**`, `apps/web/src/types/api.ts` (task 17이 동시 수정 가능 → conflict 시 task 17 우선 머지)

---

## Acceptance Criteria

- [ ] Track A: 7개 이상 DTO 신규 + tests 통과
- [ ] Track A: `as never` / `Record<string, unknown>` 0건
- [ ] Track B: image-upload.tsx 신규 + 통합
- [ ] Track B: 매치 생성 e2e 통과
- [ ] 양 Track tsc + lint 통과
- [ ] 다른 task 영역 변경 없음

## Tech Debt Resolved

- C3: Admin untyped DTO + as never cast (plan 표 참조)
- C4: image-upload UI 부재 (Known Blocker)

## Security Notes

### Track A
- DTO validator로 SQL injection 방지 (UUID, enum, length 제한)
- ownership 검증은 기존 AdminGuard 유지 — 변경 없음

### Track B
- MIME whitelist (server-side에서 sharp가 검증, client-side는 UX 가드)
- size 제한 (server-side가 권위)
- 파일명 sanitization은 백엔드 책임 (이미 task 14에서 처리)
- XSS: imageUrl을 `<img src>`로만 사용, dangerouslySetInnerHTML 금지

## Risks & Dependencies

- **R1**: TeamMatch 모델에 image 필드가 없으면 Track B의 team-matches 통합은 follow-up으로 분리 → schema 변경은 task 17 범위에 포함시키지 않음 (별도 task)
- **R2**: Admin DTO 추가가 기존 admin 페이지 frontend와 type 불일치 → frontend 같은 PR에서 type 동기화 필요할 수 있음
- **R3**: `apps/web/src/types/api.ts`가 task 17과 task 19 둘 다 수정 → task 17 머지 후 task 19 시작 권장
- **D1**: blocked by task 16 결과 (추가 untyped DTO 발견 시 scope 확장)
- **D2**: task 17 머지 후 시작 권장 (types/api.ts conflict 회피)

## Ambiguity Log

- **Q1**: Admin createTeam이 Team이 아닌 SportTeam을 만드는지? → schema.prisma 확인 필요
- **Q2**: Lesson 필수 필드 목록 확정? → schema.prisma의 NOT NULL 컬럼 기준
- **Q3**: image-upload가 단일 모드도 지원해야 하나? (max=1로 처리 가능, 별도 prop 불필요)
- **Q4**: drag & drop 지원 여부? → MVP는 click-to-upload만, drop은 follow-up
- **Q5**: TeamMatch 모델에 image 필드 추가는 이 task 범위? → **범위 외**, 발견 시 별도 task 또는 task 17에 추가
