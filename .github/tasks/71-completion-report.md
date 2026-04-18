# Task 71 Completion Report — 2026-04-18

## Summary

`MatchesService.generateTeams()`의 round-robin 스터브와 line 676의 TODO 주석을 ELO snake-draft 기반 `TeamBalancingService`로 완전 대체했다. 호스트가 확정 전 팀 배정을 미리 확인할 수 있는 Preview API와 3단계 모달 UI(preview → 재추첨 → 확정)를 추가했으며, cold-start fallback, 지표 계산, `$transaction` 원자성이 모두 단위·통합 테스트로 보증된다. Prisma 마이그레이션 없음 — 기존 `UserSportProfile.eloRating` 필드만 사용.

## Original Conditions Met

- [x] **C1** `MatchesService.generateTeams()`의 round-robin 스터브를 ELO-aware 알고리즘으로 교체하고, line 676의 `// TODO: AI 기반 팀 밸런싱 로직 구현` 주석을 제거했다 (Principle 1).
- [x] **C2** 팀 배정 **Preview API**(dry-run)를 추가하여 호스트가 확정 전 분산 지표(팀별 평균 ELO, 최대 ELO 격차, 표준편차)를 확인할 수 있게 했다.
- [x] **C3** 프론트엔드 매치 상세 페이지에 "팀 자동 구성" 모달을 추가하여 preview → 재추첨 → 확정 플로우를 제공했다.
- [x] **C4** `UserSportProfile`이 없거나 default 1000 ELO인 참가자에 대한 **cold-start fallback** 전략을 구현하고 문서화했다.
- [x] **C5** 알고리즘 선택 근거와 fallback 정책, 한계를 정리한 **설계 문서** `docs/design/task-71-team-balancing.md`를 작성했다.
- [x] **C6** 알고리즘 공정성 단위 테스트(다양한 ELO 분포 + 팀 수 + cold-start 시나리오)와 preview→assign 통합 테스트를 추가했다.
- [x] **C7** CLAUDE.md의 API 엔드포인트 섹션과 커스텀 훅 섹션에 신규 엔드포인트·훅을 반영했다.
- [x] **C8** 본 기능은 **기존 필드만 사용** — Prisma 마이그레이션 없음.

## Scope Shipped

**Backend**
- 1 신규 서비스: `apps/api/src/matches/team-balancing.service.ts` (순수 함수, I/O 없음)
- 2 신규 엔드포인트: `POST /matches/:id/teams/preview` + `POST /matches/:id/teams` 확장
- 5 신규 DTO: `ComposeTeamsDto`, `PreviewTeamsResponseDto`, `BalanceMetricsDto`, `TeamPreviewItemDto`, `ParticipantPreviewDto`
- 1 통합 테스트 파일: `apps/api/test/integration/matches-team-balancing.e2e-spec.ts` (10 케이스)
- 단위 테스트: `apps/api/src/matches/team-balancing.service.spec.ts` (18 케이스)

**Frontend**
- 1 신규 모달 컴포넌트: `apps/web/src/components/match/auto-balance-modal.tsx`
- 1 신규 표시 컴포넌트: `apps/web/src/components/match/team-assignment-display.tsx` (확정 후 읽기 전용)
- 2 신규 훅: `usePreviewTeams`, `useComposeTeams` (`apps/web/src/hooks/use-api.ts`)
- 2 MSW 핸들러: preview + compose (`apps/web/src/test/msw/handlers.ts`)
- 2 신규 테스트 파일: `auto-balance-modal.test.tsx` (6 케이스) + `team-assignment-display.test.tsx` (4 케이스)

**Design**
- 1 신규 설계 문서: `docs/design/task-71-team-balancing.md` (~400 LOC)

**Migration**
- 0 — 기존 `UserSportProfile.eloRating` 필드 활용

## Pipeline Metrics

| 단계 | 에이전트 | 병렬도 |
|------|---------|--------|
| Plan | project-director + tech-planner | 2 parallel |
| Build | backend-data-dev + backend-api-dev + frontend-ui-dev + frontend-data-dev | 4 parallel |
| Review | backend-review + frontend-review + infra-review | 3 parallel |
| Design | design-main + ux-manager + ui-manager | 3 parallel |
| QA | qa-beginner + qa-regular + qa-power + qa-uiux | 4 parallel |

- 리뷰 라운드: 2회 (initial + fix)
- 디자인 라운드: 1회
- QA 라운드: 1회
- 변경 파일: ~15 파일
- 최종 테스트: Backend 638+ unit + 10 new integration (DB required), Frontend 352 tests

## Key Decisions

- **알고리즘**: greedy snake-draft 채택 (SA/MILP/KL 기각). 결정성·단순성·성능 세 요건 모두 충족
- **Preview idempotency**: `seed` 파라미터로 구현. 미지정 시 서버가 `Date.now() & 0x7fffffff` 생성 후 응답에 포함. 재추첨 = 새 seed 전달
- **Cold-start**: `UserSportProfile` 없으면 eloRating=1000 fallback, `coldStartCount` 응답 포함, 서버 debug 로그 기록
- **TEAM_COLORS**: blue 계열만 사용 (브랜드 컴플라이언스). A=blue-500, B=blue-400, C=blue-300, D=blue-200
- **MemberRow vs UserCard**: 모달 내부 참가자 목록은 밀도 요건으로 `UserCard` 대신 경량 `MemberRow` 변형 사용. 의도적 편차
- **Team assignment display**: 확정 후 매치 상세에 팀 배정 결과를 보여주는 별도 읽기 전용 컴포넌트 신규 추가

## Known Minor Issues (Non-blocking, Tracked)

- **Rate limiting on preview**: v1 미포함. v2에서 "매치당 10분 100회" 알람 조건 설계 예정
- **Preview/confirm 참가자 목록 변화**: preview 후 새 신청자가 추가되면 동일 seed라도 다른 팀 구성 가능. `participantHash` 응답 포함 + 불일치 시 409 처리는 v2로 이연
- **Strategy 토글**: v1에서 'random'/'balanced' 모두 snake-draft 사용. UI 토글은 UX용 힌트이며 실제 알고리즘 차이 없음
- **3-4팀 모달 그리드**: 모바일에서 단일 컬럼. `sm:grid-cols-2` 추가는 별도 UX 후속 작업으로 추적 (UX-W1)

## Deferred

없음 — 전체 scope 출시 완료.

## References

- Task doc: `.github/tasks/71-ai-team-balancing.md`
- Design doc: `docs/design/task-71-team-balancing.md`
- Prior task: `.github/tasks/69-completion-report.md`
