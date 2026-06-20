# 페르소나 플로우 전수 검증 findings (Workflow wf_eff1a745-5c3)

> 17 페르소나 by-persona 추적(sonnet ×17) + opus 적대 종합. 도메인축 ws11이 놓친 cross-screen/flow 이슈 포착.
> blocked(완전차단) 0건 · P13만 clean pass · 나머지 16 issues. deployBlocking 3건은 즉시 수정 완료.

## ✅ deployBlocking critical (3건 — 수정 완료, `93873e97`)
1. **매치 위저드 종목/지역 소실** — selectedSportId/regionId가 persisted draft 아닌 로컬 useState → step 라우트 재마운트 시 축구/첫지역으로 리셋 → 잘못된 종목 생성. **fix**: selectionKey localStorage hydrate-once. 라이브 검증(수영 유지).
2. **팀매치 위저드 팀/종목/지역 소실** — 동일 안티패턴(P08 tracer가 놓침). **fix**: 동일 패턴 + creatable 가드 보존.
3. **edit page sync params** — matches·team-matches edit이 동기 params 접근 → Next16에서 id='' → 수정폼 무한로딩. **fix**: async + await params(detail page와 통일).

## ⏭ 비차단 findings (22건) — batch 집행

### Batch A — my 영역 (my-api-clients/my-page/reviews-page)
- **#3 [high] my 팀 isError silent mock** (P05/06/07) `my-api-clients.tsx:77-87,89-96` — query.data 부재 시 가짜 3팀 노출. → isError→ErrorState, isLoading→스켈레톤, mock 폴백 제거.
- **#4 [high] 회원 탈퇴 no confirm** (P14) `my-api-clients.tsx:895-902` — 비가역 탈퇴가 즉시 mutate. → ConfirmModal(tone danger).
- **#10 [medium] my/teams/[id] 운영메뉴 role 가드 없음** (P06/07) `my-api-clients.tsx:100-104` — member에게 팀설정 노출→403. → viewer.role 기반 노출.
- **#12 [medium] 알림설정 master isError 미처리** `my-api-clients.tsx`(NotificationSettings) — → isError→ErrorState.
- **#14 [medium] my 빈 상태 EmptyState 누락** (P03/06/07) `my-page.tsx:95-98,108-128,319-327` — → EmptyState + 탐색 CTA.
- **#24 [low] reviews/received backHref 오류** (P12) `reviews-page.tsx:171` — pending 탭으로 회귀. → `/my/reviews?tab=received`.

### Batch B — tournament/정산 (use-v1-api/tournament-apply/my-registration/roster/admin tournament-detail)
- **#5 [high] 대회신청 invalidate 누락** (P10) `use-v1-api.ts:1338-1361` — submit/cancel이 myTournamentRegistration 미invalidate → /my stale. → invalidate 추가.
- **#11 [medium] admin 대회취소/신청취소 no confirm** (P16/17) `admin/.../tournament-detail-client.tsx:1894-1910,455-464` — → useConfirm(danger).
- **#17 [medium] CancelModal ESC/focus-trap 누락** (P10/11) `my-registration-client.tsx:302-379` — → ESC/trap.
- **#23 [low] 결제 안내 문구 모순 + bank 정보 미렌더** (P10) `tournament-apply-client.tsx:874-876`, `my-registration-client.tsx:627-657` — → 문구 수정 + bank 필드 렌더.
- **#22b [low] 로스터 선수삭제 no confirm + 추가 피드백 없음** (P11) `tournament-roster-client.tsx:458-470` — → useConfirm + 토스트.

### Batch C — auth/onboarding (auth.view-model/auth-page/onboarding-client/signup-client)
- **#6 [high] 로그인 redirect param 유실** (P15) `auth.view-model.ts:9`,`auth-page.tsx:34` — 이메일로그인 링크가 redirect 미전파 → 복귀 끊김. → sanitizeRedirect로 전파.
- **#7 [high] onboarding isError 미처리 빈 draft 덮어쓰기** (P15/02) `onboarding-client.tsx` — 3쿼리 실패 시 빈 draft 저장 위험. → isError→ErrorState+CTA disable.
- **#12b [medium] signup sport step isError 미처리** `signup-client.tsx:363-383` — → isError→ErrorState.

### Batch D — team-matches/copy/community/backend (team-matches-page/-client/-create-client/community-page/v1_api matches.service)
- **#9 [medium] 목록 로딩 중 mock 카드 클릭 404** (P03/09) `team-matches-client.tsx:119-133`,`team-matches.view-model.ts:10-13` — → 로딩 중 스켈레톤 또는 Link 비활성(match-1 패턴 확장).
- **#19 [medium] lockedReason raw enum 노출** (P08) `team-matches-create-client.tsx:139`,`team-matches-page.tsx:349`,`v1_api .../team-matches.service.ts:279` — → enum→한글 라벨 단일소스.
- **#20 [low] 무료초청 뱃지 무조건 렌더** (P08) `team-matches-page.tsx:631` — → opponentCost===0 조건부(목록/상세와 일치).
- **#21 [low] 매치 신청불가 사유 합니다체** (P03) `v1_api matches.service.ts:1037-1049` — → 해요체.
- **#22a [low] 채팅 이미지버튼 no-op** (P13) `community-page.tsx:89` — → disabled 또는 '준비 중'.
- **#13 [medium] 신청 후 도달 동선 약함 + 비인증 CTA dead-end** (P03/09) `matches-page.tsx:264,318`,`team-matches-client.tsx:447-449` — → 신청현황 CTA + 미인증/무팀 분기 CTA.

### Batch E — a11y 터치타깃 (globals.css)
- **#18 [medium] 리뷰 별점/태그/탭 터치 미달** (P12) `globals.css:3827-3836(별점 28px),3855-3865(태그 32px),3741-3750(탭 38px)` — → 44px hit area(시각크기 유지).
- **#16 [medium] my edit 복귀 경로 공개로 이탈** (P05/06/07) `teams-page.tsx:361,407,410`,`teams-form-client.tsx:144` — → my 경유 시 /my/teams/[id] 복귀.

## 🔴 제품 결정 필요 (자동수정 금지 — 사용자 게이트)
- **#8 onboarding status 'signup_done' 잔류** (P01) — 이메일 가입이 /onboarding/complete 미호출. 간소화(현 동작 유지+status 'completed' 명시) vs 위저드 경유. 제품 의도 확인.
- **#15 orphan 라우트** — `/teams/search`,`/auth/provider-denied`,`/auth/account-conflict`,`/my/reviews/received` 정상 플로우 미연결. account-conflict·MISSING_EMAIL은 백엔드 미구현 dead code. → 라우트 연결 vs 삭제 결정.
- (기존) **landing 11종목 vs seed 4종목** — 제품 로스터 결정.

## systemicGaps (opus)
1. 다단계 위저드 선택상태 소실(critical) — ✅ 수정.
2. [id] async params 불일치(high) — ✅ edit 2건 수정, 레포 전반 점검 권고.
3. my 영역 isError silent mock 폴백 — Batch A/D.
4. RQ invalidation 누락 패턴 — Batch B.
5. 비가역 액션 confirm 게이트 부재 — Batch A/B/D.
6. 인라인 모달 ESC/focus-trap 결손 — Batch B.
7. orphan/dead 라우트 — 제품 결정.
