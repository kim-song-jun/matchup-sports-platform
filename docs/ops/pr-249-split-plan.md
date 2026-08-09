# PR #249 (`codex/teameet-task9-ci`) Copilot 리뷰용 분할 계획

> **이 문서는 계획서다. 아직 실제로 브랜치를 쪼개거나 PR을 만들지 않았다.**
> PR #249는 27개 태스크를 통합 브랜치에 스택으로 쌓은 것으로, Copilot 리뷰
> 한도(300파일/20,000줄)를 초과해 자동 리뷰가 거부된다(2026-08-04·05·06,
> 3회 연속 "exceeds the maximum number of files (300)"). 이 문서는 그 PR을
> 리뷰 가능한 단위로 나누는 순서와 방법을 제안한다.

## 규모 (2026-08-06 `origin/dev...origin/codex/teameet-task9-ci` 실측)

```
402 files changed, 105,484 insertions(+), 9,534 deletions(-)
```

Copilot 한도(300파일) 대비 1.3배, 라인 한도(20,000줄) 대비 약 5배 초과.

## 왜 커밋 단위로 못 자르는가

`git log`의 커밋 메시지에 붙은 태스크 번호가 매우 뒤섞여 있다(예: `task27` 47회,
`task9` 44회, PR 설명에 없는 `task-127` 33회, 나머지 task10~26이 각 1~10회씩
산발적으로 등장). 즉 "태스크 하나 = 커밋 구간 하나"가 아니라 같은 파일
(`games.service.ts` 등)을 수십 개 커밋에 걸쳐 반복 수정한 결과다. 따라서
분할은 **커밋 범위 추출이 아니라, 최종 트리 상태를 도메인별로 재구성하는
post-hoc file-based split**이어야 한다 — 각 PR은 dev 위에 새 브랜치를 만들고
해당 도메인 파일만 `git checkout <통합브랜치> -- <경로들>`로 가져와 새로
커밋하는 방식.

## 도메인별 파일 수 (실측, 402개 전수 분류)

| 그룹 | 파일수 | 비고 |
|---|---:|---|
| PR-0: 공유 기반(hooks/types/audit/fixture factory) | 29 | 모든 후속 PR의 전제 |
| PR-1: 스키마/마이그레이션 | 11 | 모든 후속 PR의 마이그레이션 체인 전제 |
| PR-2: games 백엔드 코어 | 94 | 단일 최대 클러스터, 그래도 300 미만 |
| PR-2c: 배포/인프라(워커 컨테이너 등) | 7 | PR-2와 함께 가도 되고 별도여도 됨 |
| PR-3: tournament-operations 백엔드 | 52 | PR-2 의존(games.service.ts 소비) |
| PR-4: 프론트 tournament-ops/tournaments | 58 | PR-2·3 의존(API 계약 소비) |
| PR-5a: team-schedules | 37 | PR-2에 약하게 의존 |
| PR-5b: team-matches | 29 | PR-2에 약하게 의존 |
| PR-5c: public-game-records(전적 공개) | 14 | PR-2·3 의존 |
| PR-6a: e2e | 6 | 모든 기능 PR 이후 |
| PR-6b: scripts/qa | 17 | 캡처/검증 스크립트, 일부는 임시 게시용이라 최종 트리에 실제로 남아있는지 재확인 필요 |
| PR-6c: docs | 21 | 아무 때나 가능, 마지막 권장 |
| **PR-잔여: task-127 추정/무관 파일(재확인 필요)** | **27** | 아래 참조 |

합계 402.

### PR-잔여 27개 상세

이 파일들은 tournament/game 도메인과 직접 관련이 없거나(auth, notifications,
admin-terms, phone-verification, my-inquiries, reviews-page, teams-page,
public-profile-client, global-popup, globals.css, pitch-formation-editor 등),
PR 설명이 언급하지 않은 `task-127`(미문서화 작업)에 속할 가능성이 높다.

```
.changeset/live-tournament-takeover-safety.md
.omo/start-work/host-pressure-override-task-5-11.json
apps/v1_api/src/admin/admin-terms.service.spec.ts
apps/v1_api/src/admin/admin.service.ts
apps/v1_api/src/auth/auth.controller.spec.ts
apps/v1_api/src/auth/auth.controller.ts
apps/v1_api/src/auth/auth.service.ts
apps/v1_api/src/notifications/notifications-service.module.ts
apps/v1_api/src/notifications/notifications.module.ts
apps/v1_api/src/notifications/notifications.service.spec.ts
apps/v1_api/src/notifications/notifications.service.ts
apps/v1_api/src/notifications/realtime-notifier.port.ts
apps/v1_api/test/admin/task7-platform-ops-boundary.integration-spec.ts
apps/v1_api/test/integration/roster-cleanup.e2e-spec.ts
apps/v1_api/test/integration/tournament-campaign.e2e-spec.ts
apps/v1_api/test/jobs/v1-game-operations-worker.integration-spec.ts
apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-bracket-publish.test.tsx
apps/v1_web/src/app/admin/tournaments/[id]/tournament-detail-client.tsx
apps/v1_web/src/app/globals.css
apps/v1_web/src/components/auth/phone-verification/phone-verify-page-client.tsx
apps/v1_web/src/components/lineup/pitch-formation-editor.tsx
apps/v1_web/src/components/my/my-api-clients.tsx
apps/v1_web/src/components/my/my-inquiries-client.tsx
apps/v1_web/src/components/popups/global-popup.tsx
apps/v1_web/src/components/reviews/reviews-page.tsx
apps/v1_web/src/components/teams/teams-page.tsx
apps/v1_web/src/components/users/public-profile-client.tsx
```

**분할 실행 전 반드시 사람이 재확인**: 이 27개 중 실제로 이번 통합 브랜치의
변경사항인지, 아니면 dev에 이미 별도로 머지된 뒤 auto-merge가 잘못 남긴 잔재인지
(`git log -p -- <path>`로 확인). 임의로 아무 PR에나 끼워 넣으면 그 PR의 리뷰
컨텍스트가 왜곡된다.

## 제안 분할 순서 (반드시 이 순서로 dev에 순차 stacked-merge)

| 순서 | PR | 포함 그룹 | 파일수 | 의존성 근거 |
|---|---|---|---:|---|
| 1 | PR-1 | 스키마/마이그레이션 + PR-0 공유 기반 | 40 | 모든 후속 PR이 새 Prisma 필드·hooks·types를 참조 |
| 2 | PR-2 | games 백엔드 코어 + 배포/인프라 | 101 | 단일 최대 클러스터. tournament-ops·team-schedules·team-matches·public-game-records 전부 games.service.ts API를 소비 |
| 3 | PR-3 | tournament-operations 백엔드 | 52 | PR-2 위에 스택 |
| 4 | PR-4 | 프론트 tournament-ops/tournaments | 58 | PR-2·3의 API 계약을 소비하는 프론트 |
| 5 | PR-5 | team-schedules + team-matches + public-game-records | 80 | PR-2에 약하게 의존, 서로 독립적이라 한 PR로 묶어도 리뷰 부담 적음 |
| 6 | PR-6 | e2e + scripts/qa + docs | 44 | 앞의 모든 기능이 머지된 뒤에만 테스트·문서가 의미 있음 |
| — | 재확인 후 배치 | task-127 추정 27개 | 27 | 위 어느 PR에도 강제로 끼워 넣지 않고, 내용 확인 후 해당 도메인 PR에 자연 편입하거나 별도 PR로 분리 |

각 PR은 300파일 미만이며, 라인 수도 전체(105K)/6 ≈ 평균 17.5K로 20K 미만을
목표할 수 있다(단, PR-2는 최대 클러스터라 라인 수 배분을 커밋 시점에 재확인 필요).

## 실행 리스크

- **`schema.prisma`는 물리적으로 한 파일**이라 각 PR이 이전 PR의 머지본 위에
  스택돼야 한다 — Copilot 리뷰는 통과해도 실제로는 **순차 stacked-PR 전략**이지
  병렬 독립 PR이 아니다. dev 머지 = 즉시 alpha 배포이므로(프로젝트 브랜치 정책),
  PR-1부터 순서대로 하나씩 dev에 머지되고 배포된 뒤 다음 PR을 그 위에서 시작해야
  한다.
- **PR-2(games 백엔드, 94~101파일)가 사실상 나머지 전부의 전제**이면서 동시에
  가장 크다 — 여전히 300파일 한도 안에는 들어오지만 리뷰 부담이 가장 큰 단일
  PR로 남는다. 더 잘게 쪼개려면 `games.service.ts` 자체를 커맨드/도메인 단위로
  재구성해야 하는데, 이는 현재 커밋 이력으로는 불가능하고 diff를 수작업 편집해야
  하므로(고위험) 이번 계획에서는 시도하지 않는다.
- **`scripts/qa/` 17개 중 다수가 "게시 후 제거"된 임시 스크린샷 갤러리 커밋**일
  가능성이 있다 — 실행 직전 `git diff origin/dev...origin/codex/teameet-task9-ci --name-only -- scripts/qa/`로
  최종 트리 기준 재확인 권장(이미 삭제됐다면 파일 수가 더 줄어든다).
- **task-127 27개는 반드시 사람이 먼저 판정** — 이 통합 브랜치에 실제로 속한
  변경인지, dev 기준 이미 해소된 잔재인지 `git log -p -- <path>`로 확인 후 배치.
- **F1~F4 최종 게이트는 이 분할과 무관하게 별도 트랙** — PR 설명에 이미 문서화된
  대로 `UNRELATED_DIRTY_FINGERPRINT_DRIFT`로 차단돼 있고, 메인 체크아웃 호스트
  에서만 실행 가능하다. 분할이 끝나도 F1~F4는 별도로 해소해야 한다.

## 실행 체크리스트 (착수 시)

1. `git fetch origin dev codex/teameet-task9-ci` 로 최신화.
2. PR-잔여 27개 각각 `git log -p --follow -- <path>` 로 실제 소속 판정.
3. PR-1부터 순서대로: `git worktree add <path> -b codex/pr249-split-1 origin/dev` →
   해당 그룹 파일만 `git checkout origin/codex/teameet-task9-ci -- <경로들>` →
   커밋 → PR 생성 → Copilot 리뷰 → clean까지 → 사용자 승인 후 dev 머지.
4. PR-2는 PR-1이 dev에 머지된 뒤 그 위에서 동일하게 반복.
5. 이하 PR-3~PR-6까지 순차 반복.
6. 전체 분할 완료 후 원본 통합 브랜치 `codex/teameet-task9-ci`(PR #249)는
   내용이 모두 개별 PR로 흡수됐음을 확인한 뒤 사용자 승인하에 close.
