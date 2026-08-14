# 135. In-progress tournament fixture review entry

Status: Complete
Owner: Codex
Scope: `apps/v1_api`, `apps/v1_web`, `docs/api`, `docs/scenarios`
Design source: `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html` section `14 리뷰 최종`

## Goal

진행 중인 대회 상세에서 이미 종료되고 공식 결과가 공개된 경기만 경기별 리뷰 작성 화면으로 직접 연결한다. 기존 `/my/reviews` 전체함 진입만 제공하던 UI를 실제 fixture 단위 계약에 맞춘다.

## Current contract

- `TournamentFixtureReviewsService`는 대회 전체 상태와 무관하게 fixture가 `completed`이고 공식 결과가 있을 때만 리뷰 소스를 연다.
- 참가 양 팀 중 정확히 한 팀의 active 멤버만 fixture 리뷰를 작성한다. `owner | manager`는 상대팀과 상대 등록 선수를, `member`는 상대 등록 선수만 평가한다.
- 대회 자체 참가 후기는 별도 계약이며 대회 전체가 `completed`된 뒤 참가 확정팀의 `owner | manager`만 작성한다.
- 대회 상세의 진행 중 후속 허브는 완료 fixture 존재 여부만 확인한 뒤 `/my/reviews` 전체함으로 연결해 어느 경기를 리뷰하는지 바로 알 수 없다.

## Acceptance criteria

- [x] `in_progress` 대회 상세는 `status=completed`이면서 `result != null`인 fixture만 리뷰 가능 경기로 표시한다.
- [x] 각 행은 홈/원정 팀, 라운드, 점수를 보여주고 `/my/reviews/tournament_fixture/:fixtureId`로 직접 이동한다.
- [x] `owner | manager` source는 상대팀+상대 등록 선수를, `member` source는 상대 등록 선수만 반환하며 member의 팀 대상 제출은 서버가 차단한다.
- [x] 대회 전체 후기는 기존대로 전체 종료 뒤 참가 확정팀 `owner | manager`만 작성한다.
- [x] 공개 상세의 CTA는 `GET /reviews?tab=pending&tournamentId=:id` 결과를 사용해 비로그인·비참가자·작성 완료·같은 상대 재대결 중복을 숨긴다.
- [x] 예정·진행·취소 경기와 결과가 없는 완료 fixture에는 리뷰 CTA를 노출하지 않는다.
- [x] 완료 경기별 UI가 생긴 뒤 기존 `/my/reviews` 일반 리뷰 행을 중복 노출하지 않는다.
- [x] 대회 전체가 `completed`인 기존 결과·대진표·리뷰 액션 목록은 회귀 없이 유지한다.
- [x] 모바일/태블릿/데스크톱에서 44px 이상 터치 영역, 다크 모드 토큰, 명확한 텍스트 계층을 유지한다.
- [x] 승부차기 경기는 정규 점수와 `PK` 점수를 함께 표시하고, `null=비공개`, `TBD=미정` 상태를 구분한다.
- [x] 관련 단위 테스트, API 통합 문서, 시나리오 문서를 같은 변경에서 동기화한다.

## Owned files

- `apps/v1_api/src/reviews/dto/list-reviews.dto.ts`
- `apps/v1_api/src/reviews/reviews.service.ts`
- `apps/v1_api/src/reviews/reviews.service.spec.ts`
- `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts`
- `apps/v1_api/src/reviews/tournament-fixture-reviews.service.spec.ts`
- `apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx`
- `apps/v1_web/src/app/tournaments/[id]/tournament-detail-page-client.test.tsx`
- `apps/v1_web/src/components/tournaments/tournament-venue-retention-sections.tsx`
- `apps/v1_web/src/components/tournaments/tournament-venue-retention-sections.test.ts`
- `docs/api/domains/supporting-domains.md`
- `docs/scenarios/12-v1-sm-new-e2e-scenarios.md`
- `docs/scenarios/index.md`
- `scripts/qa/capture-task135-tournament-reviews.mjs`
- `docs/visual-qa/task-135-tournament-reviews/**`
- `.github/tasks/135-in-progress-tournament-fixture-review-entry.md`

## Out of scope

- 대회 자체 참가 후기(`/tournaments/:id/reviews`) 변경
- Prisma schema/migration 변경
- 리뷰 작성 폼 재설계
- 완료 대회 상세의 기존 액션 정보구조 변경

## Validation

- Targeted backend unit: `tournament-fixture-reviews.service.spec.ts`, `reviews.service.spec.ts`
- Targeted frontend unit: `tournament-venue-retention-sections.test.ts`
- Backend/frontend typecheck
- Responsive visual QA: 390 / 768 / 1440
- `git diff --check`, touched-path tech-debt grep, committed-tree scope check

## Progress snapshot

- 2026-08-14: 서버의 fixture 단위 완료/공식 결과/참가팀 멤버 권한 게이트가 이미 존재함을 확인했다. 변경은 frontend direct-entry UI와 문서 동기화로 한정한다.
- 2026-08-14: 사용자 확인으로 역할 계약을 확정했다. `owner | manager`는 상대팀+상대 선수, `member`는 상대 선수만 평가하며 대회 자체 후기는 기존 owner/manager 완료 후기를 유지한다.
- 2026-08-14: tournamentId pending 필터, 역할별 source/submit/pending, 개인화 CTA, PK 점수, 비공개/미정 구분을 구현했다. 최신 dev의 양 팀 겸직 계약을 보존한 통합 타깃 API 41건과 Web 18건이 통과했다.
- 2026-08-14: 실제 v1 route에서 member-light와 owner-dark를 390x844, 768x1024, 1440x900으로 검증했다. 6/6 캡처에서 review API 200, console/page/request 오류 0, member 남은 대상 1건, owner 2건, 정규 `2:2`와 `PK 5:4` 표시를 확인했다. 브라우저 PID 52824와 parent PID 50380은 종료했고 고정 UUID QA 데이터도 0건으로 정리했다.

## Ambiguity log

- 2026-08-14 resolved: 역할과 무관한 상대팀 리뷰 허용은 사용자 의도와 달랐다. 상대팀 target은 owner/manager로 제한하고 member는 선수 target만 유지한다.
