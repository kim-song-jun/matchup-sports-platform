# Task 58 — Version Upgrade Breaking Changes Migration

## Context
package.json 버전이 다음과 같이 업데이트됐습니다:
- Next.js 15.1.0 → 16.2.3 (major)
- React 19.0.0 → 19.2.5 (minor)
- NestJS 11.0.x → 11.1.18 (minor)
- @nestjs/swagger 11.0.0 → 11.2.7 (minor)

이 마이그레이션 태스크는 이러한 버전 변경으로 인해 breaking change가 발생하는 코드를 전량 수정합니다.

## Goal
버전 업그레이드 후 `tsc --noEmit`, `next build`, `jest`, `vitest` 전체가 오류 없이 통과되도록 코드를 수정한다. 최신 API 문법으로 마이그레이션.

## Original Conditions (체크박스)

### Frontend (apps/web)
- [ ] `React.forwardRef` 패턴 제거 → `ref` prop 직접 전달 (button, input, select, textarea)
- [ ] `next.config.ts` — `experimental.optimizePackageImports` 처리 (Next.js 16 변경)
- [ ] `useSearchParams()` Suspense 래핑 — login, kakao, naver 페이지
- [ ] `next/image` onError 타입 검증 (safe-image.tsx)
- [ ] `vitest run` 전체 통과
- [ ] `tsc --noEmit` (web) 오류 0

### Backend (apps/api)
- [ ] `@nestjs/swagger` 11.2.7 — `@ApiProperty({ enum })` enumName 누락 파일 수정
- [ ] `main.ts` swagger `addBearerAuth()` 타입 파라미터 명시
- [ ] `realtime.gateway.ts` WebSocket 타입 시그니처 확인
- [ ] `jest --selectProjects unit` 전체 통과
- [ ] `tsc --noEmit` (api) 오류 0

## Parallel Work Breakdown

### Frontend (frontend-ui-dev + frontend-data-dev)
**Do NOT touch**: `apps/api/**`, `prisma/**`, `*.spec.ts`

Files:
- `apps/web/src/components/ui/button.tsx`
- `apps/web/src/components/ui/input.tsx`
- `apps/web/src/components/ui/select.tsx`
- `apps/web/src/components/ui/textarea.tsx`
- `apps/web/next.config.ts`
- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/web/src/app/(auth)/callback/kakao/page.tsx`
- `apps/web/src/app/(auth)/callback/naver/page.tsx`
- `apps/web/src/components/ui/safe-image.tsx` (if needed)

### Backend (backend-api-dev + backend-data-dev)
**Do NOT touch**: `apps/web/**`

Files:
- `apps/api/src/main.ts`
- `apps/api/src/realtime/realtime.gateway.ts`
- `apps/api/src/**/*.dto.ts` (enum 관련, swagger 11.2 대응)

## Acceptance Criteria
1. `cd apps/web && npx tsc --noEmit` → 0 errors
2. `cd apps/web && vitest run` → all pass
3. `cd apps/api && npx tsc --noEmit` → 0 errors
4. `cd apps/api && jest --selectProjects unit` → all pass

## Security Notes
- 버전 업 시 의존성 CVE 확인 권장 (`pnpm audit`)

## Risks & Dependencies
- Next.js 16 Turbopack 기본 번들러 전환 → webpack 커스텀 설정 동작 검증 필요
- Docker 이미지 재빌드 필요 (pnpm lockfile 변경)
