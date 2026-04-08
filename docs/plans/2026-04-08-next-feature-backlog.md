# Next Product Backlog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 현재 제품 표면에서 사용자 가치가 큰 추가 기능과 실제 미구현 기능을 우선순위별로 정리하고, 다음 구현 라운드의 기준 backlog로 사용한다.

**Architecture:** 이번 문서는 단순 아이디어 목록이 아니라 "현재 비어 있는 제품 기능"과 "이미 UI는 있으나 backend/runtime이 빠진 기능"을 분리해서 다룬다. 우선순위는 사용자 빈도, 전환/재방문 영향, QA 블로킹 여부, 구현 의존성 기준으로 정한다.

**Tech Stack:** Next.js 15, React 19, NestJS 11, Prisma 6, PostgreSQL, Socket.IO, Playwright

---

# 2026-04-08 Next Product Backlog

## 목적

이 문서는 "다음에 무엇을 만들 것인가"를 정리하는 제품 backlog다. 디자인 리뷰, QA 시나리오, 실제 코드 상태를 함께 반영한다.

판단 기준:

- 자주 쓰는 화면에서 체감되는가
- 현재 UI가 약속한 기능을 실제로 제공하는가
- 멀티탭/멀티브라우저/재로그인에서도 일관되게 유지되는가
- 이후 Playwright 시나리오로 옮기기 쉬운가

## Summary

가장 먼저 잡아야 할 축은 아래 다섯 개다.

1. 이미지 surface의 공통 gallery / lightbox 경험
2. 매치 찾기 개선
3. 알림의 actionability와 실제 delivery
4. 매치 lifecycle 완결
5. 업로드/첨부 인프라

이 다섯 개가 정리돼야 상세 페이지, 채팅, 생성/수정 흐름, 재방문 경험이 같이 좋아진다.

## Priority 0. Now

### FTR-001. Shared media lightbox / gallery

**Status**

- 2026-04-08 구현 완료
- 범위: `matches/[id]`, `lessons/[id]`, `marketplace/[id]`, `teams/[id]`, `venues/[id]`
- 검증: `media-lightbox` unit `7/7` pass, `pnpm --filter web exec tsc --noEmit` pass, `venue` detail browser smoke pass
- 잔여: dedicated Playwright spec은 아직 미작성, multi-surface browser smoke는 follow-up

**왜 먼저 필요한가**

- 팀, 매치, 레슨, 시설, 장터 상세에 이미지가 이미 들어가는데 대부분은 썸네일 선택만 가능하고 확대 viewing이 없다.
- 모바일에서는 "사진이 있긴 한데 자세히 보기 어렵다"는 체감 손실이 크다.

**현재 근거**

- `apps/web/src/app/(main)/matches/[id]/page.tsx`
- `apps/web/src/app/(main)/teams/[id]/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/page.tsx`
- `apps/web/src/app/(main)/venues/[id]/page.tsx`
- `apps/web/src/app/(main)/marketplace/[id]/page.tsx`

**필요 기능**

- 이미지 클릭/터치 시 full-screen modal open
- 좌우 swipe / arrow navigation
- thumbnail strip 또는 index indicator
- ESC / backdrop close / pinch-zoom friendly mobile layout
- 여러 surface에서 재사용 가능한 공용 `MediaLightbox` 컴포넌트

**테스트 포인트**

- Desktop click, keyboard left/right, ESC close
- Mobile tap, swipe, close gesture
- 이미지가 1장일 때와 여러 장일 때 모두 동작

### FTR-002. Match discovery 2.0

**Status**

- 2026-04-08 v1 구현 완료
- 범위: `/home -> /matches?sport=...` deep link 유지, `/matches` URL filter sync, quick filters(`today/free/beginner/available`), advanced filters(`region/level/sort`), backend query 확장(`q/city/district/freeOnly/availableOnly/beginnerFriendly/sort`)
- 검증: `pnpm --filter api test -- matches.service.spec.ts` `252/252` pass, `pnpm --filter web test -- src/lib/__tests__/match-discovery.test.ts src/hooks/__tests__/use-api-matches.test.tsx` `11/11` pass, `pnpm --filter web exec tsc --noEmit` pass, `pnpm --filter api exec tsc --noEmit` pass, `e2e/tests/match-discovery.spec.ts` `Desktop Chrome 3/3` pass
- 런타임 메모: dev compose `api` watch는 unrelated compile blocker가 있으면 stale contract를 남길 수 있었다. 이번 live rerun은 `curl -> transpile-only api -> Playwright` 순서로 실제 `8111` 응답을 다시 확인했다.
- 잔여: saved search, personalized recommendation, why-recommended badge, GPS distance filter는 다음 epic

**왜 먼저 필요한가**

- `/matches`는 현재 제목/시설 검색, 종목 칩, 날짜, 정원 임박 정렬 정도만 제공한다.
- 홈의 종목별 deep link가 실제 query param state로 이어지지 않아 탐색 맥락이 끊긴다.
- 추천/탐색이 제품의 핵심 가치인데 아직 "목록 보기" 수준에 머물러 있다.

**현재 근거**

- `apps/web/src/app/(main)/matches/page.tsx`
- `apps/web/src/app/(main)/home/page.tsx`
- `apps/api/src/matches/matching-engine.service.ts`

**필요 기능**

- URL 기반 filter state sync (`sport`, `date`, `level`, `fee`, `availability`, `sort`)
- 지역/거리 필터
- 무료/유료, 초보 가능, 마감 임박, 오늘 경기 같은 quick filters
- 최근 사용 필터 유지 또는 saved search
- 프로필 기반 추천 매치 API 초안
- "왜 이 매치를 추천하는지" 이유 badge

**테스트 포인트**

- `/home -> /matches?sport=futsal` 진입 시 필터 유지
- 새로고침 후 필터 상태 유지
- 다중 탭에서 동일 query state 재현
- 비로그인/로그인 추천 표면 차등 노출

**이번 라운드에서 실제 반영한 것**

- 홈의 `/matches?sport=...` deep link를 실제 `/matches` 필터 상태와 연결
- URL 기반 탐색 상태와 로컬 draft state를 분리해 rapid toggle/query overwrite race 제거
- 지역 텍스트 검색, level band, 무료/모집중/초보/오늘 quick filter 추가
- backend 검색을 title/description/venue/city/district까지 확장
- discovery helper/unit test와 Playwright smoke를 함께 추가

**이번 라운드에서 미룬 것**

- saved search / 최근 필터 복원
- GPS/거리 기반 정렬
- 추천 이유 badge 및 personalized recommendation explanation
- 로그인/비로그인별 discovery surface 차등

### FTR-003. Notifications: delivery + action center

**Status**

- 2026-04-08 v1 구현 완료
- 범위: `match_created`, `player_joined`, `payment_confirmed`, `payment_refunded` 생산자 연결, notification serialization(`category/link/ctaLabel/data`), `/notifications` API 기반 action center, websocket read/read-all sync, badge source 정렬
- 검증: `pnpm --filter api test -- notifications.service.spec.ts matches.service.spec.ts payments.service.spec.ts` `253/253` pass, `pnpm --filter web test -- src/lib/__tests__/notification-center.test.ts` `5/5` pass, `pnpm --filter api exec tsc --noEmit`, `pnpm --filter web exec tsc --noEmit` pass
- 브라우저 검증: `notification-center.spec.ts` `Desktop Chrome 3/3` 통과. 안정화 포인트는 explicit in-app navigation, socket connect-time backfill, focus/visibility backfill, lighter `global-setup` bootstrap, fresh dev-login token for API mutations다.
- 잔여: `/settings/notifications` 영속화, chat-originated notification producer, unrelated `teams` seed drift 정리

**왜 먼저 필요한가**

- 알림은 재방문과 즉시 대응을 만드는 핵심인데 현재는 local store 의존이 강하고 실제 push delivery가 없다.
- "알림이 왔는가"보다 "바로 무엇을 할 수 있는가"가 더 중요하다.

**현재 근거**

- `apps/web/src/app/(main)/notifications/page.tsx`
- `apps/web/src/stores/notification-store.ts`
- `docs/IMPLEMENTATION_STATUS.md`

**필요 기능**

- FCM/Web Push 실제 연동
- notification type별 deep link + CTA
- read/unread multi-tab sync
- 설정 페이지에서 알림 수신 범주 on/off
- match/team/chat/payment/admin event별 payload 정규화

**테스트 포인트**

- 다른 브라우저에서 이벤트 발생 후 현재 브라우저 알림 수신
- 알림 클릭 시 정확한 detail/action page로 이동
- 읽음 처리 후 badge/unread count 동기화

### FTR-004. Match lifecycle completion

**Status**

- 2026-04-09 구현 완료
- 범위: `PATCH /matches/:id` (호스트 수정), `POST /matches/:id/cancel` (CancelMatchDto: reason), `POST /matches/:id/close` (recruiting → full), 프론트 edit 페이지 API 연결, 상세 호스트 관리 영역, 상태 배지
- 참가자 변경 알림 발송 (`player_joined` → `match_updated` producer 연결)

**왜 먼저 필요한가**

- 개인 매치 핵심 flow 중 `MATCH-003`가 아직 backend route 공백으로 막혀 있다.
- 생성과 참가는 검증했지만 수정/취소/종료가 비면 운영 플로우가 완결되지 않는다.

**현재 근거**

- `docs/scenarios/03-match-flows.md`
- `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`
- `apps/api/src/matches/*`

**필요 기능**

- `PATCH /matches/:id`
- host cancel / close 모집 / reschedule
- 참가자에게 변경 알림 발송
- 변경 이력 또는 최소한 changed fields summary 노출

**테스트 포인트**

- 호스트 수정 후 상세/목록/내 매치에 즉시 반영
- 이미 참가한 사용자 탭에서 상태 갱신
- 일정/장소 변경 시 알림 생성

### FTR-005. Upload pipeline for user-generated media

**Status**

- 2026-04-09 백엔드 완료, 프론트엔드 UI 미구현
- 백엔드 범위: `POST /uploads` (멀티파트, 최대 5개·10MB·jpeg/png/webp/gif), `GET /uploads/:id`, `DELETE /uploads/:id` (소유자만), sharp webp 변환 + 1200px 리사이즈 + 300px 썸네일, 로컬 스토리지 (`uploads/` 디렉토리), Prisma `Upload` 모델 추가
- 잔여: 프론트엔드 드래그&드롭 UI (`components/ui/image-upload.tsx`), 매치 생성/수정·팀 프로필·장터·구장 리뷰·프로필 사진 연결 (Phase 2 채팅 이미지, 도착 인증 사진 이전 착수 필요)

**왜 먼저 필요한가**

- 생성/수정 화면에서 이미지 선택 UI는 많지만 실제 업로드 인프라가 없다.
- lightbox를 만들더라도 실제 유저 이미지가 안정적으로 쌓이지 않으면 가치가 제한된다.

**현재 근거**

- `apps/web/src/app/(main)/matches/new/page.tsx`
- `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`
- `apps/web/src/components/venue/review-form.tsx`
- `docs/IMPLEMENTATION_STATUS.md`

**필요 기능**

- presigned upload 또는 서버 업로드 경로
- 업로드 중 progress / 실패 재시도
- 이미지 정렬, 대표 이미지 선택, 삭제
- resize/compression policy
- 업로드 asset validation

**테스트 포인트**

- 업로드 성공 후 새로고침 시 유지
- 느린 네트워크에서 progress 노출
- 모바일 촬영 이미지 업로드

## Priority 1. Next

### FTR-006. Team detail real-data conversion

**왜 필요한가**

- 팀 상세는 중요한 신뢰 surface인데 아직 mock trust score, recent result, mercenary indicator가 섞여 있다.
- 이 화면이 실데이터로 굳어야 팀 매칭과 용병 흐름이 설득력을 가진다.

**현재 근거**

- `apps/web/src/app/(main)/teams/[id]/page.tsx`

**필요 기능**

- 실제 전적/최근 경기/노쇼/지각/정보 일치도 연동
- 실존 mercenary 모집 여부 연동
- 뱃지/신뢰 점수 산식 설명

### FTR-007. Chat rich actions

**왜 필요한가**

- 채팅은 이미 real-time 기반인데, 신고/차단/이미지 전송/파일 첨부가 모두 준비 중 상태다.
- 장터, 팀 매칭, 용병은 결국 채팅 완성도에 크게 의존한다.

**현재 근거**

- `apps/web/src/app/(main)/chat/[id]/chat-room-embed.tsx`

**필요 기능**

- 이미지 첨부
- 신고/차단 실제 처리
- room-level pinned info 또는 거래 요약
- 상대방 typing/presence 개선

### FTR-008. Team invite and member search

**왜 필요한가**

- 멤버 관리 화면은 운영 기능이 있지만 초대 flow가 비어 있어 팀 확장이 끊긴다.

**현재 근거**

- `apps/web/src/app/(main)/teams/[id]/members/page.tsx`

**필요 기능**

- 닉네임/이메일 검색
- 초대 pending state
- 수락/거절, 만료, 재초대

### FTR-009. OAuth social login

**왜 필요한가**

- 로그인 화면에 카카오/네이버 버튼이 노출되는데 현재는 disabled다.
- 초기 전환률과 온보딩 이탈에 직접 영향이 있다.

**현재 근거**

- `apps/web/src/app/(auth)/login/page.tsx`
- `apps/api/src/auth/auth.service.ts`

**필요 기능**

- 카카오/네이버 actual login
- 신규 유저 onboarding 연결
- 기존 계정 linking 정책

## Priority 2. After Core

### FTR-010. Marketplace / lesson commerce completion

**왜 필요한가**

- 현재는 fake success를 제거한 상태라 오히려 제품적으로는 "명시적 미지원"이다.
- 결제/예약/환불이 완성돼야 장터와 레슨이 독립 사업 축으로 작동한다.

**현재 근거**

- `apps/web/src/app/(main)/marketplace/[id]/page.tsx`
- `apps/web/src/app/(main)/lessons/[id]/page.tsx`

**필요 기능**

- order entity
- 결제 준비/확정/환불
- 예약 상태 관리
- 판매자/강사 정산 연결

### FTR-011. Real arrival verification

**왜 필요한가**

- 팀 매치 도착 인증의 가치가 높은데 GPS와 사진이 아직 시뮬레이션/미연동 상태다.

**현재 근거**

- `docs/PAGE_FEATURES.md`
- `docs/IMPLEMENTATION_STATUS.md`

**필요 기능**

- Geolocation API 실제 반영
- 사진 업로드
- 지각/미도착 이벤트 자동 기록

### FTR-012. Recommendation / ranking / discipline automation

**왜 필요한가**

- 제품의 차별점이 "그냥 게시판"을 넘어 추천과 신뢰 시스템에 있어야 한다.
- 다만 이건 위의 core surfaces가 정리된 뒤 들어가는 게 맞다.

**현재 근거**

- `apps/api/src/matches/matching-engine.service.ts`
- `docs/IMPLEMENTATION_STATUS.md`

**필요 기능**

- 추천 점수 계산
- ELO 실전 반영
- 지각/노쇼 자동 제재
- 팀/유저 trust score 갱신 자동화

## Recommended Execution Order

1. `shared-media-lightbox`
2. `match-discovery-v2`
3. `notification-delivery-and-action-center`
4. `match-lifecycle-completion`
5. `media-upload-pipeline`
6. `team-detail-real-data`
7. `chat-rich-actions`
8. `team-invite-and-member-search`
9. `oauth-login`

commerce, GPS, recommendation automation은 위 항목들이 안정화된 뒤 별도 epic으로 분리하는 편이 안전하다.

## Immediate Recommendation

지금 바로 착수할 첫 묶음은 아래가 가장 효율적이다.

- `Batch 1`: `FTR-001` + `FTR-005`
  - 이유: 같은 media foundation을 공유한다.
- `Batch 2`: `FTR-002` + `FTR-004`
  - 이유: 매치 핵심 journey를 한 번에 닫을 수 있다.
- `Batch 3`: `FTR-003`
  - 이유: cross-cutting concern이라 독립 epic으로 관리하는 편이 낫다.

## Exit Criteria

- 상세 페이지의 이미지는 클릭/터치로 확대 viewing이 된다.
- `/home`에서 들어온 탐색 맥락이 `/matches`에서 유지된다.
- 중요한 이벤트는 알림으로 오고, 알림에서 바로 행동할 수 있다.
- 매치는 생성/참가뿐 아니라 수정/취소/종료까지 완결된다.
- 업로드된 이미지는 실제로 저장되고 재방문 후에도 유지된다.
