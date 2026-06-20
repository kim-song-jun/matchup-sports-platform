# WS11 종합 화면 감사 findings (run wf_35458427-5d8)

> 8 도메인 병렬 서브에이전트(sonnet) + opus 종합. ~91 findings. 배포 전 처리 우선순위.
> file:line은 감사 시점 기준 — 수정 전 현재 코드 대조(D3). 처리 시 라이브 검증(visual) / tsc·test(logic).

## 우선순위 (opus 종합 top-6)

1. **[a11y/high] 44px 터치타깃 미달** — `globals.css`: `.tm-chip`(1156/3439, 34px), `.tm-list-filter-button`(2207, 40px), `.tm-btn-sm`(1005), `.tm-auth-check-button`(707, 24px), `.tm-auth-agreement-arrow`(720, 18-28px). ~5클래스 44px화로 수십 finding 해소. **모바일 레이아웃 재균형 확인 필요**(chip 시각 높이 vs 토스 clean).
2. **[a11y/high] 필터시트 3중 중복 + 인라인 모달 a11y** — `DraggableFilterSheet`가 matches-page(523-576)·teams-page(735)·team-matches-page(517)에 중복, role=dialog/aria-modal/ESC/focus-trap 없음. community-page(44)·my-registration(307-382) 인라인 모달도. 공유 컴포넌트 추출 → 1수정으로 5건+기술부채 해소.
3. **[usability/high] dead-end CTA** — 완료화면 no-op share, matches가 mock 팀 텍스트 하드코딩(847-852/139/142/904), `match-1` 하드코딩 ID 5곳, 도달불가 dead branch, 영구 disabled created/closed/password CTA(my-page 296, teams-client 465-468, email-login 59). → 완료화면 단일 상세 CTA, created/closed/password href 연결, matchId 동적화, dead branch 제거.
4. **[usability/high] silent API error/loading** — notices-client(10-47)가 실패 시 stale static mock을 실데이터처럼 노출, notifications(community-api-clients 137-171)가 로딩 중 즉시 EmptyState. + window.confirm 비가역 액션 5곳(teams-client 573, my-api-clients 1037, applications 78/95, admin tournament-detail 794). → status loading/error/ready(skeleton/error card, fallback는 ready일 때만), window.confirm → 모달 ConfirmDialog.
5. **[a11y/high] 정적 하드코딩 id + 토글/칩 ARIA** — admin-filter-bar(36)·admin tournament-detail(248/252)·my-api-clients(838/844)·terms(93)·onboarding(265)·community(27/88)·matches-page(583/731). SimpleModal id 3모달 중복. 알림 토글 role=switch 없음(tm-toggle aria-hidden), 칩 aria-pressed 없음, 채팅 input/stepper aria-label 없음. → useId/titleId, role=switch aria-checked, aria-pressed, aria-label, aria-busy.
6. **[copy/high] urgent 오표기 + raw enum** — urgent가 status=open(참가가능) 카운트인데 "마감/마감임박"으로 라벨(의미 정반대, matches-client 103/242, matches-page 42, team-matches-client 405). raw enum UI 노출 6곳(withdrawn/cancelled/inactive/left, onboardingStep — teams-client 563, my-api-clients 1008/1027, onboarding 388). → urgent를 recruiting으로 재라벨 또는 deadline-soon 재계산, status→label 맵(unknown fallback), STEP_LABEL, union literal 좁히기.

## 도메인별 finding 수
matches 17(최다) · community 15 · auth-onboarding 13 · team-matches 12 · tournaments 12 · teams 10 · my-settings 10 · admin 10.

## 도메인 한줄평
- auth-onboarding: 약관 터치/focus, ResumePanel raw enum, 비번찾기 dead-end. 양호.
- matches: 핵심 플로우 실데이터 견고. 완료 dead 버튼·edit 하드코딩 ID·필터시트·summary 오표기.
- team-matches: 구조 안정. 칩 터치타깃·raw enum·confirm 무료초청 오표시·complete dead button.
- teams: 필터시트 a11y·마감 CTA dead-end·window.confirm. raw enum·빈/에러 누락.
- tournaments: 로직 탄탄. 칩 32px·CancelModal ESC/trap·'4강'vs'준결승'·토글 focus·로컬 포맷터 4중 중복.
- my-settings: 알림 토글 aria·'내가 만든 매치' dead-end CTA. 탭 ARIA·false-chevron·무음 실패.
- community: 알림 로딩 중 premature empty·공지 오류 무음(stale fallback). 채팅 aria·모달 trap·검색 44px.
- admin: 전반 양호. SimpleModal/AdminFilterBar 정적 id 중복·window.confirm·토스트 모호·shadow 토큰.

## 처리 현황
- ✅ **Rank1 터치타깃 44px** 5클래스(.tm-chip/.tm-list-filter-button/.tm-btn-sm/.tm-auth-check-button/.tm-auth-agreement-arrow) — `2bc49f08`, 라이브 검증.
- ✅ **Rank6 urgent 오표기** matches·team-matches summary "마감"→"모집중"(open count와 일치) — `243541d4`, 라이브 검증.
- ✅ **Rank6 raw enum** 4곳(teams-client 563·my-api-clients 1008/1027·onboarding 388) → 신규 `lib/v1-status-labels.ts` 단일소스 라벨(미매핑도 안전 한글). `1a6944f5`. **Rank6 완료.**
- ✅ **Rank5 a11y aria**(서브에이전트): useId(admin-filter-bar·SimpleModal 3인스턴스 id 중복), role=switch(알림토글), aria-pressed(칩 4종), aria-label(채팅입력·stepper), aria-busy. `553936dc`. **Rank5 완료.**
- ✅ **테스트 정리**(서브에이전트): 전 기존 테스트 감사 → FAKE 0(제거 불필요), home thin-smoke 강화. `553936dc`.
- ✅ **Rank4 silent API**(서브에이전트, D3 실버그 확인): notices 실패/로딩 중 정적 mock 노출 + notifications premature empty → loading/error/ready 분기(PageSkeleton/ErrorState 재사용). `16871608`, 라이브 검증. (window.confirm→modal은 잔여.)
- ✅ **패턴 enforcement 인프라**(pillar 1): docs/v1-coding-patterns.md + scripts/v1-pattern-check.mjs(합니다체·미정의토큰) + pnpm lint 연결. `639f68bb`. (WS6-a 에이전트 중간종료 작업의 일관성을 이 검사가 즉시 검증 — undefined 토큰 0.)
- ✅ **WS6-a consumer 색 토큰화**(서브에이전트): tint/scrim/overlay/brand 토큰(동일값) → matches/applications/my/auth. `d83285de`, 시각 변화 0.
- ✅ **Rank3 dead-end CTA**(서브에이전트, D3): match-1 하드코딩 3곳 동적화 + no-op 공유버튼 2곳(navigator.share) + disabled CTA 2곳(참가관리·비밀번호찾기 Link). `26bc6849`. **Rank3 완료 → top-6 중 5개(Rank1/3/4/5/6) 완료, Rank2만 잔여.**
- ✅ **데드코드 MatchParticipantsPageView + 'participants' state 제거**(서브에이전트, D3): match-1 하드코딩 2건 동반 제거. `d3a26ff8`.
- ⏭ 다음: Rank2 필터시트(고위험 refactor — 배포 임박이라 a11y만 in-place 검토) → window.confirm 5곳→modal → 클러스터 medium → mock view-model match-1 broken href(fallback-only) → WS6-b → WS7 API·WS10 admin 토큰·deploy.yml.
- 🔴 **OPEN DECISION(사용자)**: landing 11종목 광고 vs 실제 seed 4종목 — seed 추가 vs 카피 조정(v1-persona-flows.md 참조).
