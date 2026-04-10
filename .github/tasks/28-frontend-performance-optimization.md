# Task 28 — Frontend Performance Optimization

## Context

페이지 이동 시 렉이 많이 걸리고 로딩이 느린 체감 문제가 보고됨. 기획팀 분석 결과, 프론트엔드 데이터 fetching 전략, 소켓 리스너 관리, 알림 폴링 구조의 복합적인 문제로 확인.

## Goal

페이지 전환 체감 속도 개선 및 불필요한 네트워크 요청 제거.

## Original Conditions (체크박스)

- [x] 홈 재방문 시 5개 API가 동시 refetch 발생하지 않아야 함
- [x] BottomNav의 채팅 unread 배지가 전체 채팅방 목록을 fetch하지 않아야 함
- [x] 알림 폴링이 소켓 연결 시 과도하게 동작하지 않아야 함
- [x] 소켓 이벤트 리스너가 페이지 전환마다 중복 등록되지 않아야 함
- [x] ProgressBar의 전역 click 리스너 제거
- [x] 소켓 미연결 시 폴링 fallback이 동작해야 함 (보안 알림 누락 방지)
- [x] 기존 테스트 전체 통과 (`pnpm test`)

## Root Causes (기획팀 분석 결과)

### Critical

| # | 원인 | 증거 |
|---|------|------|
| C1 | 홈페이지 5개 API 동시 호출 — staleTime 없어 60초마다 전부 재발사 | `home/page.tsx:41-45`, `use-api.ts` useMatches/useTeams/useLessons/useListings/useTeamMatches (staleTime 미설정) |
| C2 | `useRealtime()` 다중 인스턴스 — 4곳에서 호출, 페이지 전환마다 connect/disconnect 리스너 중복 등록/해제 | `use-realtime.ts:86,105,132,154` |

### High

| # | 원인 | 증거 |
|---|------|------|
| H1 | 알림 폴링 5초 간격 — Socket.IO 있음에도 상시 HTTP GET | `use-api.ts:1097` `refetchInterval: 5_000` |
| H2 | `useChatUnreadTotal()` — 전체 채팅방 목록 fetch 후 reduce로 합산, BottomNav에 탑재 | `use-api.ts:831-834`, `bottom-nav.tsx:12` |
| H3 | 홈페이지에서 전체 목록 fetch 후 클라이언트 `.slice(0, N)` — `limit` 파라미터 미전달 | `home/page.tsx` slice 패턴 |

### Medium

| # | 원인 | 증거 |
|---|------|------|
| M1 | 전 페이지 `'use client'` — 170개 파일, SSR/RSC 미활용 | grep 결과 |
| M2 | ProgressBar 전역 click 리스너 + setTimeout 3중 체인 | `progress-bar.tsx:26-37` |

## User Scenarios

1. 홈 진입 → 다른 탭 이동 (30초) → 홈 복귀 → API 재호출 없이 캐시 데이터 즉시 표시
2. 홈 진입 → 다른 탭 이동 (5분) → 홈 복귀 → staleTime 초과, 데이터 갱신
3. BottomNav 채팅 뱃지 — 채팅방 전체 목록 대신 count API 1건으로 표시
4. 알림 수신 — 소켓 연결 중에는 폴링 없이 실시간 반영
5. 소켓 연결 실패 시 — 30초 폴링 fallback으로 알림 수신

## Test Scenarios

### Happy path
- 홈 진입 후 3분 내 복귀 → Network 탭에 API 호출 0건 (캐시 히트)
- BottomNav 뱃지 → `/chat/unread-count` 1건만 호출 (rooms 목록 호출 없음)
- 소켓 연결 상태 → 알림 HTTP 폴링 없음

### Edge case
- 소켓 연결 실패 → 30초 폴링 자동 전환
- staleTime 만료 후 복귀 → refetch 정상 동작
- mutation 발생 → invalidateQueries로 즉시 refetch

### Error path
- API 타임아웃 → 에러 상태 표시 (기존 동작 유지)
- 소켓 5회 재연결 실패 → 폴링 fallback 동작

### Mock updates
- Phase 1C 완료 시: `apps/web/src/test/msw/` 핸들러에 `GET /api/v1/chat/unread-count` 추가
- Phase 2A 완료 시: `use-realtime.test.tsx` Provider 래핑 업데이트

## Parallel Work Breakdown

### Phase 1 — 즉시 수정 (1-2일, 리스크 낮음, frontend-data-dev 단독)

순차 실행 (같은 파일 `use-api.ts` 수정):

**1A. React Query staleTime 튜닝**
- `useMatches`, `useTeams`, `useLessons`, `useListings`, `useTeamMatches`: `staleTime: 3 * 60 * 1000` 추가
- `useChatRooms`: `staleTime: 30 * 1000` 추가
- 글로벌 `staleTime` 60초 → 2분 상향 (`providers.tsx`)
- 파일: `apps/web/src/hooks/use-api.ts`, `apps/web/src/app/providers.tsx`

**1B. 알림 폴링 간격 조정**
- `useNotifications`: `refetchInterval: 5_000` → `refetchInterval: 30_000`
- `useUnreadCount`: `refetchInterval: 15_000` → `refetchInterval: 60_000`
- 파일: `apps/web/src/hooks/use-api.ts`

**1C. useChatUnreadTotal 경량화**
- `useChatUnreadTotal()` 내부를 `GET /chat/unread-count` 직접 호출로 교체
- `useChatRoomSocket`에서 메시지 수신 시 `['chat', 'unread-count']` 쿼리 invalidate
- 파일: `apps/web/src/hooks/use-api.ts`, `apps/web/src/components/layout/bottom-nav.tsx`

**1D. 홈 API 호출에 limit 파라미터 추가**
- `useTeams({ limit: 6 })`, `useLessons({ limit: 4 })`, `useListings({ limit: 4 })`, `useTeamMatches({ limit: 3 })`
- 파일: `apps/web/src/app/(main)/home/page.tsx`

### Phase 2 — 단기 수정 (3-5일)

병렬 실행 가능 (파일 겹침 없음):

**2A. useRealtime Context 전환 (frontend-data-dev)**
- `RealtimeProvider` + `useRealtimeContext()` 패턴 도입
- 소켓 상태를 Context로 공유하여 중복 리스너 제거
- 파일: `apps/web/src/hooks/use-realtime.ts`, `apps/web/src/app/providers.tsx`
- 테스트: `apps/web/src/hooks/__tests__/use-realtime.test.tsx` 업데이트

**2B. ProgressBar 리팩토링 (frontend-ui-dev)**
- 전역 click 리스너 제거 → `usePathname()` 기반 또는 CSS-only 방식으로 교체
- 파일: `apps/web/src/components/layout/progress-bar.tsx`

### Phase 3 — 중기 개선 (1-2주)

**3A. 핵심 페이지 Server Component 전환 (공동)**
- 대상: `home/page.tsx`, `matches/page.tsx`, `teams/page.tsx` (공개 데이터만, 인증 불필요 부분)
- `HydrationBoundary` + `dehydrate` 패턴
- 제약: localStorage JWT → 서버 컴포넌트 접근 불가. 공개 목록만 서버 prefetch

**3B. 번들 분석 + dynamic import (frontend-ui-dev)**
- `@next/bundle-analyzer` 도입 후 대형 컴포넌트 `next/dynamic` 적용
- 파일: `apps/web/next.config.ts`

## Acceptance Criteria

- [x] 홈 진입 → 3분 내 복귀 시 API 재호출 0건 (React Query DevTools 확인)
- [x] BottomNav 채팅 뱃지 → rooms fetch 대신 `/chat/unread-count` 사용
- [x] 알림 폴링 간격 5초 → 30초 이상
- [x] 소켓 연결/해제 리스너가 페이지 전환 시 중복 등록되지 않음
- [x] `pnpm test` 전체 통과
- [x] `npx tsc --noEmit` 오류 없음

## Tech Debt Resolved

- `useRealtime()` 다중 인스턴스 패턴 → Context 싱글톤
- 알림 5초 폴링 + 소켓 이중 구조 → 소켓 우선, 폴링은 fallback
- `useChatUnreadTotal` 비효율 rooms fetch → 전용 count 엔드포인트

## Security Notes

- Phase 1B: 소켓 미연결 시 폴링 fallback 30초 반드시 유지. 보안 알림(결제 이상, 관리자 경고) 누락 방지
- Phase 3A: 서버 컴포넌트에서 인증 필요 API 호출 금지. 공개 데이터만 서버 prefetch

## Risks & Dependencies

| 리스크 | 대응 |
|--------|------|
| staleTime 상향 시 매칭 인원 수(실시간 변경) 지연 표시 | Socket.IO mutation invalidation으로 보강 |
| useRealtime Context 전환 시 token 변경 감지 타이밍 | Provider에서 authStore 구독, token 변경 시 소켓 재연결 |
| RSC 전환 시 localStorage JWT 접근 불가 | 공개 데이터 목록만 서버 prefetch (인증 데이터는 클라이언트 유지) |

## Ambiguity Log

- Phase 2A에서 `useRealtime` Context 전환 시 `use-realtime.test.tsx` 전면 수정 필요. 기존 테스트 구조 보존 vs 새 API 반영 균형 필요

## 완료 요약 (Task 28)

완료일: 2026-04-10

### Phase 1 (완료)
- `useMatches`/`useTeams`/`useLessons`/`useListings`/`useTeamMatches` staleTime 3분 설정
- 글로벌 staleTime 120초로 상향 (`providers.tsx`)
- `useChatUnreadTotal` → `GET /chat/unread-count` 직접 호출로 교체
- 알림 폴링 30초, unread-count 폴링 60초로 조정
- 홈 API 호출에 `limit` 파라미터 전달, 클라이언트 `.slice()` 제거

### Phase 2 (완료)
- `useRealtime` → `RealtimeProvider`/`RealtimeContext` 싱글톤 패턴 전환, `disconnectSocket` 추가
- `ProgressBar` 전역 click 리스너 제거, `usePathname` 기반 2단계 애니메이션으로 교체
- `@next/bundle-analyzer` devDep 추가 및 `analyze` 스크립트 등록 (`next.config.ts`)

### 백엔드 (완료)
- `GET /chat/unread-count` 엔드포인트 신설 + `ChatService.getUnreadCount()` 메서드
- `ChatService` 단위 테스트 3개 추가
- `Teams`/`Lessons`/`Marketplace` 목록 API에 `limit` 파라미터 지원 (상한 100)

### MSW 핸들러 (완료)
- `apps/web/src/test/msw/handlers.ts`에 `GET /api/v1/chat/unread-count` 핸들러 추가

### Phase 3 (완료)
- `apps/web/src/lib/server-fetch.ts` 신규: 서버 컴포넌트 전용 fetch 유틸 (`INTERNAL_API_ORIGIN` → `localhost:8111` 우선순위, 60s revalidate, `{ data }` 래퍼 자동 언래핑)
- `home/page.tsx` → async RSC shell (`Promise.allSettled` 5개 공개 API 동시 프리페치) + `home-client.tsx` 분리
- `matches/page.tsx` → async RSC shell (URL `searchParams` 파싱 → exact query key 구성 → 서버 프리페치) + `matches-client.tsx` 분리
- `teams/page.tsx` → async RSC shell (팀 목록 서버 프리페치) + `teams-client.tsx` 분리
- `MatchesMapView`: `next/dynamic` + `ssr: false` lazy load (초기 JS 번들 분리), loading skeleton에 `role="status"` + `aria-label` 추가
- 인증 플로우 해결: 공개 데이터만 서버 프리페치, 인증 필요 데이터(사용자 정보·내 팀)는 클라이언트 유지
- `HydrationBoundary` + `dehydrate` 패턴으로 서버 데이터를 React Query 캐시에 주입 → 초기 로딩 스켈레톤 제거, FCP 개선
