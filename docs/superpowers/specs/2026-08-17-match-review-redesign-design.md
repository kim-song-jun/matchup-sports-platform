# 대회 상대 평가 재설계 (Match Review Redesign)

- 상태: **설계 초안 — §14 미결 확정 필요** (4항목 개별 채점 방향은 사용자 확정, 세부 구현 결정 다수는 이 문서의 권고안)
- 근거 기획 문서: `01_상대평가_기능정의서.txt` (v1.0, 기준일 2026-08-12, 평가 시스템 정본)
- 기준 커밋: `36cbf281` (origin/dev, 최초 조사 시점)
- 관련 스펙: `docs/superpowers/specs/2026-08-17-tournament-league-format-design.md` — **병행 진행, 파일 충돌 없음** (근거 §1.3)
- 리비전 노트: 적대적 리뷰 6건(blocking 1 · major 2 · minor 3) 반영판. blocking·major 3건은 코드 재확인 후 **설계를 수정해 해결**했고(§4.6/§7.2/§7.3/§10/§6.1), minor 3건은 코드 근거를 다시 확인해 사실 정정했다(§3.1/§4.4/§5.2). 새로 사용자 확인이 필요해진 항목은 없다 — 기존 §14 항목만 유지된다.
- **리비전 노트(2026-08-18 현행화, 재확인 커밋 `204eb246`)**: 최초 조사(2026-08-17) 이후 dev에 리뷰 도메인 커밋 6건이 추가로 머지돼 §1.2·§1.4의 "현행" 서술 일부가 낡았다. 코드로 재확인해 고쳤다 — ① **`hidden`은 더 이상 죽은 값이 아니다**(`cba61c75`가 `PATCH /reviews/admin/:reviewId/hide|unhide`를 추가해 실제 write path 2곳이 생겼다) — 다만 D-9가 기대는 "13개 집계 호출부가 전부 `status:'submitted'`로 게이트한다"는 핵심 근거는 재확인 결과 그대로 참(13곳 그대로)이라 D-9의 **결론(신규 enum 값도 자동 제외)은 안전**하고, 인용 근거 문장만 고쳤다. `removed`는 여전히 write 0건으로 죽은 값이다. ② **팀매치에 개인(선수) 평가 경로가 신설됐다**(`68cc67bc`) — D-2의 "team_match는 개인 평가 경로 자체가 없음"이라는 전제가 깨져 근거 문장을 고쳤다(결정 자체는 유지, §3 D-2 참조). ③ 팀매치 팀 후기의 역할 게이트가 "active 멤버 전원"에서 대회와 동일한 "팀장·운영진만"으로 되돌아갔다(`68cc67bc`). ④ 팀매치·개인매치 후기가 "받은 후기" 화면에 처음으로 노출되기 시작했다(`61fac30d`) — 그 전엔 작성은 가능해도 수신자가 영영 못 봤다. ⑤ 개인 매너점수 집계가 team_match를 포함하도록 버그가 고쳐졌다(`673cbf9b`). ⑥ `f575e5ac`(대회 후기 "팀당 1건" 제약 완화)와 `dee10932`(종목 배지 표시 버그)는 이 스펙이 다루는 `V1PostEventReview`(경기 후기) 도메인이 아니라 별도 모델 `V1TournamentReview`(대회 자체 후기, `tournament-reviews.service.ts`)와 프론트 표시 버그라 §1.2 서술에 영향 없음 — 확인만 하고 넘어간다.

## 1. 배경

### 1.1 사용자가 확정한 방향

> 문서01대로 4항목(SKILL/MANNER/PUNCTUALITY/SAFETY) 개별 채점으로 전면 재설계한다. 현행 단일 rating+태그 구조를 유지하지 않는다.

문서01은 "평가 기능은 아직 구현되지 않은 개선 범위"라고 적고 있으나(`01_상대평가_기능정의서.txt:34`), **실제로는 이미 프로덕션 수준으로 구현된 "경기 후기(Post-Event Review)" 시스템이 존재한다.** 문서와 구현이 서로 다른 세계를 그리고 있으므로, 이 스펙은 먼저 구현 실태를 정밀 조사한 뒤 그 위에 4항목 재설계를 얹는다.

### 1.2 현행 구현 정밀 조사

전체 리뷰 모듈: `apps/v1_api/src/reviews/` (최초 조사 시점 13개 파일 — `reviews.service.ts` 1,041줄 + `tournament-fixture-reviews.service.ts` 506줄이 핵심. **2026-08-18 재확인**: `cba61c75`가 `dto/moderate-review.dto.ts`를 추가해 14개 파일이 됐고, 6커밋 중 5건이 `reviews.service.ts`를 건드리며 **1,041줄 → 1,390줄**로 늘었다. `tournament-fixture-reviews.service.ts`는 이번 6커밋 어디에도 손대지 않아 506줄 그대로다).

| 항목 | 현행 | 근거 |
|---|---|---|
| 누가 평가하는가 (팀) | 대회·팀매치 **둘 다** 팀 대표(owner/manager)만 상대팀 1회. 팀매치는 2026-08-12~08-17 사이 "active 멤버 전원"으로 잠깐 열렸다가 **2026-08-17(`68cc67bc`)에 대회와 같은 규칙으로 되돌아갔다**(같은 사용자가 대회에선 되고 팀매치에선 안 되는 모순 해소 목적) | `tournament-fixture-reviews.service.ts:177-179`, `reviews.service.ts:628,801-816,1334-1336` `canReviewOpponentTeam()`(두 파일에 동일 규칙: `role === 'owner' \|\| 'manager'`) |
| 누가 평가하는가 (개인) | 대회: **상대팀 active 멤버 누구나**(실출전 여부 무관). 개인 매치: `V1MatchParticipant.status in (active,completed)`. **팀매치: 2026-08-17(`68cc67bc`)에 신설** — 역할 무관(팀원도 가능), 대상은 그 경기의 **제출된 라인업**(`V1GameParticipant.userId not null`)에 있는 상대팀 선수만(팀 멤버십 전원이 아님, §1.2.3) | `tournament-fixture-reviews.service.ts:318-337` `resolveReviewerTeams()` — 역할만 확인, 실출전 확인 없음. 팀매치 신설분: `reviews.service.ts:644-659`(role-agnostic 대상 생성) `675-723` `teamMatchOpponentRosters()`(라인업 기반 명단) |
| 언제 평가하는가 | 시간 마감 없음 — 무기한 제출 가능 | `grep 'REVIEW_WINDOW_CLOSED\|opensAt\|expiresAt' apps/v1_api/src/reviews/*.ts` → 0건(2026-08-18 재확인해도 0건 — 이 스펙 이전엔 아무도 마감을 추가하지 않았다) |
| 무엇을 평가하는가 | 단일 `rating`(1~5) + `tagCodes`(8종 프리셋, 자유 텍스트 아님) | `dto/submit-review.dto.ts:22-41`, `schema.prisma:1388` |
| 스키마 모델명 | `V1PostEventReview`(단일 테이블, 3개 sourceType 공유) + `V1PostEventReviewTag`(1:N). **참고**: 이름이 비슷한 `V1TournamentReview`(대회 자체에 대한 후기 — 운영·시설 평가, `tournament-reviews.service.ts`)는 완전히 별도 모델·별도 도메인이며 이 스펙의 대상이 아니다(§리비전 노트 2026-08-18) | `schema.prisma:1378-1439` vs `schema.prisma:2120-2150`(별도 모델) |
| 상태 enum | `submitted \| hidden \| removed` — **`hidden`은 2026-08-17(`cba61c75`)부터 더 이상 죽은 값이 아니다**: 어드민 전용 `PATCH /reviews/admin/:reviewId/hide`\|`unhide`가 write path로 신설됐고, hide/unhide 트랜잭션이 영향받는 평판·신뢰점수를 즉시 재계산한다. **`removed`는 여전히 죽은 값**(write 0건, 복구 대상에서도 명시적으로 제외됨). 다만 "모든 집계가 `status:'submitted'`로 게이트"라는 핵심 사실은 재확인해도 그대로 참(13곳) — 이 사실에 의존하는 D-9의 결론(신규 enum 자동 제외)은 안전하다(§3 D-9) | `grep "status: 'hidden'\|status: 'removed'"` → hidden 쓰기 2곳(`reviews.service.ts:81,107`), removed 쓰기 0건; 라우트 `reviews.controller.ts:76-87`; 집계 쿼리 13곳 전부 `status:'submitted'`(2026-08-18 재카운트 동일) |
| 공개 규칙 | "서로 다른 상대팀 3건" 아님 — **상호 제출 OR 72시간 경과**(쌍 단위), 3건은 별도의 `trustState` 등급 배지(verified/estimated/sample/none)일 뿐 개별 리뷰 공개 게이트가 아님. **다만 2026-08-17(`61fac30d`) 이전엔 이 reveal 로직 자체가 `team_match`/`match` 후기엔 적용되지 않았다** — `received()` 조회가 `tournament_fixture`(+레거시)만 읽어서, 팀매치·개인매치 후기는 작성은 됐지만 수신자가 영영 볼 수 없었다(집계에만 반영). 이제는 세 sourceType 모두 같은 reveal 규칙을 탄다 | `review-visibility.ts:22-37`, `team-trust-aggregation.ts:158-162`, `reviews.service.ts:182-206`(received 조회 범위 확장) |
| 개인 평가 대상 명단 | **대회**: 상대팀 "등록 로스터"(`V1TournamentPlayer`, `removedAt: null`) — 실제 출전 여부와 무관(§5의 실출전 게이트가 노리는 갭이 바로 이것, 미변경). **팀매치(신설, 2026-08-17)**: 등록 로스터가 아니라 **그 경기 제출 라인업**이라 이미 대회보다 좁다 — 단, "공식 결과 리비전에 확정된 실제 출전"(§1.2.1의 `V1GameResultParticipant`)까지는 아니고 "제출된 라인업"(`V1GameParticipant`) 단계에서 멈춘다(§1.2.3) | `tournament-fixture-reviews.service.ts:353-360`; 팀매치: `reviews.service.ts:675-723` |
| 익명성 | `received()` 응답에서 `reviewerUser/reviewerTeam`을 null 처리, 정확한 제출 시각도 숨김 — 구현됨(2026-08-18 재확인: 로직 자체는 불변, 다만 위 "공개 규칙" 행처럼 적용 대상 sourceType이 넓어졌다) | `reviews.service.ts:1193-1199`(`toAnonymousReceivedReview`, 최초 조사 시점엔 853-863 — 파일이 349줄 늘며 이동) |
| 팀신뢰/평판 집계 | `V1TeamTrustScore`/`V1UserReputationSummary` — **대회 전용 컬럼**(`tournament*`)과 **비대회 컬럼**(`mannerScore`/`reviewCount` 등, match+team_match 공유)을 **의도적으로 분리**(과거 last-write-wins 충돌 실사고 예방, 코드 주석에 명시). **2026-08-17(`673cbf9b`) 전에는 버그가 있었다**: 개인 비대회 집계(`recalculateUserReputation`)가 `sourceType='match'`만 셌고 `team_match`는 빠졌다 — 팀매치 개인 후기가 막 생긴 참이라(`68cc67bc`) 그 즉시 노출된 버그. `PERSONAL_REPUTATION_SOURCES = ['match','team_match']`로 고쳐 지금은 둘 다 같은 컬럼에 합산된다 | `schema.prisma:1030-1057`, `1352-1376`; `reviews.service.ts:47`(`PERSONAL_REPUTATION_SOURCES` 정의) |
| 이상 탐지 | 없음 | `grep 'flag\|anomaly\|이상'` → 0건 |
| 부정확한 코멘트 | `tournament-fixture-reviews.service.ts:216-218`가 **정확히** 이 갭을 명문화: "대회 경기 라인업(V1GameParticipant)에는 userId 컬럼이 없어서... 실제로 누가 뛰었는지 사용자 단위로 알 수 없다" — **이 주석 자체가 지금은 낡았다**(§1.2.1) | — |

#### 1.2.1 중요한 발견 — "실출전" 데이터는 이미 존재한다

위 주석은 작성 당시엔 사실이었지만, 그 이후 두 마이그레이션이 정확히 이 문제를 풀었다:

- `20260813190000_v1_game_participant_user_id` — `V1GameParticipant.userId` 컬럼 추가
- `20260813200000_v1_appearance_gate_backfill` — 백필

`games.service.ts:4600-4639`의 `deriveAppearedParticipantIds()`가 만드는 `V1GameResultParticipant`(공식 결과 리비전의 참가자별 기록, `started` + 이벤트 파생) 행이 바로 "실제 출전" 진실 원천이며, `PublicUserRecordsService`의 "출전 N경기" 표시가 이미 이 데이터를 쓴다(`games.service.ts:4605-4610` 코드 주석). 즉 **리뷰 모듈이 쓰지 않고 있을 뿐, 실출전 판정에 필요한 데이터 배관은 4일 전(2026-08-13)에 이미 다른 목적으로 완성돼 있다** — 이번 재설계는 새 데이터 소스를 만들 필요 없이 기존 배관을 재사용하면 된다(§5).

#### 1.2.2 중요한 발견 — `match`(개인 매치) 완료(complete) 플로우가 존재하지 않는다

§6.1의 48시간 마감 앵커를 `V1Match.completedAt`으로 설계하기 전에, 그 컬럼을 실제로 채우는 코드 경로가 있는지 전수 확인했다(major 결함 반영).

- `matches.controller.ts`에는 `POST :matchId/cancel`은 있지만 **완료(complete) 엔드포인트 자체가 없다.**
- `matches.service.ts`에도 `complete()`류 메서드가 없다 — `cancel()`(360-430행)이 `status: 'cancelled'`만 쓴다.
- `V1Match.completedAt`을 채우는(write) 코드는 이 저장소 전체에서 **0건**이다. 유일하게 `status`를 `'completed'`로 바꿀 수 있는 경로는 `admin.service.ts:414`의 `changeMatchStatus()`(`AdminGuard`, `ChangeMatchStatusDto`가 `@IsIn(['recruiting','closed','cancelled','completed','archived'])`로 `completed`를 허용 — `admin.dto.ts:362-369`) — **운영자가 수동으로 상태만 바꾸는 경로이고, 이 경로도 `completedAt`은 건드리지 않는다**(`admin.service.ts:419`: `data: { status: dto.status }`뿐).
- 대조: `V1TeamMatch.completedAt`은 `games.service.ts:2807`(`data: { status: V1TeamMatchStatus.completed, completedAt: new Date() }`)에서 결과 확정과 함께 실제로 채워진다. `match`만 이 배관이 없다.
- `reviews.service.ts:1282-1284`의 `isCompleted()`(`status === 'completed' || Boolean(completedAt)`, 최초 조사 시점엔 942-944 — 그 사이 파일이 349줄 늘며 이동, 로직은 불변)는 `status`만으로도 통과하므로 **관리자 수동 개입을 거친 매치의 리뷰 제출 자체는 가능하다** — 다만 그 경로로 완료된 매치는 전부 `completedAt = null`이다.

**결론**: `match` 리뷰는 "도달 불가"가 아니라 "도달 가능하지만 §6.1이 지정한 앵커 컬럼이 실제 사용 경로에서 항상 비어 있다." `anchor + 48h`를 `null + 48h`로 계산할 수는 없으므로, §6.1·§7의 `match` 행은 이 사실을 반영해 이번 웨이브에서 제외한다(§3 D-12). 이 결론은 2026-08-18 재확인에도 그대로다 — `matches.controller.ts`/`matches.service.ts`/`admin.service.ts`는 6개 재확인 대상 커밋 어디에서도 건드리지 않았다.

#### 1.2.3 현행화(2026-08-18) — 팀매치에 개인(선수) 평가 경로가 신설됐다

최초 조사 시점엔 "`team_match`는 팀 평가만 있고 개인 평가 경로가 없다"가 사실이었다(당시 근거로 D-2가 이 사실에 기대 실출전 게이트 범위를 `tournament_fixture`로만 좁혔다). `68cc67bc`(2026-08-17)가 이걸 바꿨다:

- **팀 후기 역할 게이트 원복**: 2026-08-12에 "참가팀 active 멤버 전원"으로 풀렸던 상대 **팀** 후기 작성 권한이 다시 "팀장·운영진(owner/manager)만"으로 돌아갔다 — 대회 경기(`tournament_fixture`)와 동일 규칙(`canReviewOpponentTeam()`, `reviews.service.ts:1334-1336`).
- **선수 후기 신설**: 상대 **선수** 후기는 역할 무관 — 팀원 누구나 쓸 수 있다(`reviews.service.ts:644-659`). 대상 명단의 근거는 그 경기에 **제출된 라인업**(`V1GameParticipant.userId not null`, `teamMatchOpponentRosters()` — `reviews.service.ts:675-723`)이지, 팀 멤버십 전체가 아니다. 게스트(연동 계정 없는 참가자, `userId = null`)는 애초에 평가 대상 명단에 들지 않는다.
- **이 라인업 기준은 §1.2.1·§5가 논의하는 "실출전"(`V1GameResultParticipant`, 공식 결과 리비전에서 파생된 실제 출전 기록)과 다른, 더 약한 필터다** — "제출됐다"이지 "실제로 뛰었다/출전했다"가 아니다. 즉 라인업엔 있지만 실제로는 출전하지 않은 후보 선수도 현재는 팀매치 평가 대상에 포함된다.

**§3 D-2에 대한 영향**: D-2의 원래 근거("`team_match`는 개인 평가 경로 자체가 없음")는 이제 거짓이다. 다만 D-2가 확정한 **범위 자체**("§5의 신규 실출전 게이트는 `tournament_fixture`에만 적용")는 이 사실만으로 뒤집히지 않는다 — 팀매치는 이미 대회보다 좁은 "제출 라인업" 필터를 스스로 갖고 있어서(등록 로스터 전체보다는 낫다), §5의 미적용이 대회처럼 "출전 여부와 완전히 무관"한 상태로 방치되는 것은 아니기 때문이다. 다만 이 스펙이 실제 구현되면 **두 sourceType의 엄격도가 서로 어긋나는 새로운 비일관성**이 생긴다 — `tournament_fixture`는 §5 적용 후 "공식 결과에 확정된 실제 출전"까지 요구하는데 `team_match`는 여전히 "라인업 제출"에서 멈춘다. 이 비일관성을 이번 웨이브에서 함께 해소할지는 새로운 사용자 결정 사항이므로 D-2를 임의로 확장하지 않고 §13 리스크에 기록해 둔다(아래).

### 1.3 리그전(병행 스펙)과의 충돌 확인

```
git worktree list  → 9개 worktree 확인
각 worktree: git status --porcelain -- apps/v1_api/src/reviews apps/v1_api/prisma/schema.prisma
→ 전부 빈 결과 (미커밋 변경 없음)

각 worktree 브랜치: git diff --stat origin/dev...<branch> -- apps/v1_api/src/reviews ...
→ reviews/ 를 건드리는 브랜치 0건
```

`feat/v1-tournament-league-format`(이 저장소의 다른 worktree, 리그전 스펙 구현 예정 브랜치)은 `tournament-bracket.service.ts`, `competition-standings.ts` 등 대진·순위 영역만 건드리고 `reviews/` 디렉터리와 겹치지 않는다. **두 스펙은 코드 충돌 없이 병행 가능**하다. 다만 `fix/v1-goal-event-backfill-idempotency` 브랜치가 `tournament-fixture-official-result.ts`를 대폭 수정 중이며(diff 72줄), 이 파일의 `resolveTournamentFixtureOfficialTimestamp()`는 이 스펙의 48시간 마감 앵커(§6)가 직접 의존하는 함수다 — §13 리스크에 기록.

### 1.4 문서01 요구 vs 현행 대조표

| 영역 | 문서01 요구 | 현행 | 갭 | 조치 |
|---|---|---|---|---|
| 채점 항목 | SKILL/MANNER/PUNCTUALITY/SAFETY 4항목 각 1~5 | 단일 rating + 8종 태그 | 항목 세분화 전무 | §4 스키마 확장 |
| 평가 기간 | 경기 확정 후 48시간 | 무기한 | 마감 없음 | §6 신규(`team_match`/`tournament_fixture`만 — §1.2.2·D-12) |
| 평가 자격(선수) | 실제 출전 선수만 | `tournament_fixture`: 상대팀 등록 로스터(실출전 무관, §1.2). `team_match`: **2026-08-17(`68cc67bc`) 신설** — 등록 로스터보다는 좁은 "제출 라인업" 기준이지만 "공식 결과 확정 실출전"보다는 넓음(§1.2.3) | `tournament_fixture`는 자격 기준 자체가 다름(문서01 요구와 갭 그대로). `team_match`는 이미 부분적으로 좁혀져 있어 갭이 최초 조사 시점보다 작지만, 여전히 "실제 출전"과 정확히 일치하지 않음 | §5 신규(`tournament_fixture`만, D-2). `team_match`의 잔여 격차는 이번 웨이브 범위 밖(§1.2.3, §13) |
| 공개 기준 | 상대팀 단위 3건부터 | 상호제출 OR 72h(쌍 단위) | 기준 불일치 — 다만 3건 임계값은 `trustState` 등급으로 **이미 존재**. **2026-08-17(`61fac30d`) 전에는 `team_match`/`match` 후기가 이 기준 자체를 적용받지 못하고(수신자에게 영영 비공개) 집계에만 반영됐는데, 지금은 세 sourceType 전부 동일 기준을 탄다**(§1.2) | §14 미결(D-3, 옵션은 §3.1) |
| 이상 탐지 | 3종 규칙 → FLAGGED → 운영 검토 | 없음 | 전무 | §7 신규 |
| 데이터 모델 | ReviewTask/MatchReview/MatchReviewScore/ReviewAggregateUnit/ReviewSummary/ReviewRiskFlag | V1PostEventReview 단일 테이블 + live 재계산 | 모델명·구조 상이 | §4 매핑 결정 |
| 정정 시 처리 | 마감 후 정정 → 대상 재계산 없음, 운영 플래그만 | 없음(48h 자체가 없으므로) | §6에서 자연 해결 | §6 |
| 무효 시 평가 | 관련 평가 ARCHIVED, 공개 평균 제외 | 반응 없음 | 갭 | §7.4 |
| 익명성 | 작성자·평가팀·원본 미노출 | 이미 구현됨 | 없음 | 변경 없음 |
| MatchResultVersion/Correction | 신규 엔티티 제안 | **이미 존재** — `V1GameResultRevision` + `supersedesId` 체인(별도 조사축에서 gap 0건 확인) | 문서가 낡음, 구현이 앞섬 | 신규 작업 불필요 |

## 2. 목표 / 비목표

### 목표
1. 4항목(SKILL/MANNER/PUNCTUALITY/SAFETY) 개별 채점으로 전환한다. 태그는 폐지한다(사용자 결정).
2. 경기 확정(또는 최신 정정 확정) 시각 기준 48시간 마감을 강제한다 — **`team_match`/`tournament_fixture`부터 적용**한다. `match`는 완료 시각을 기록하는 배관이 아직 없어(§1.2.2) 이번 웨이브에서는 현행대로 마감 없이 유지하고, 완료 플로우가 도입되면 그 앵커에 맞춰 확장한다(D-12).
3. 대회 경기(`tournament_fixture`) 개인 평가의 자격 판정을 "등록 로스터"에서 "실제 출전"으로 교정한다.
4. 이상 평가 탐지 3종 규칙 → `FLAGGED` → 운영 검토 큐를 만들고, **판정에 관련된 리뷰 전부가 실제로 flagged로 전이**되도록 한다(§7.2).
5. 기존 리뷰 데이터를 파괴하지 않고 안전하게 이관한다.

### 비목표
- 자유 텍스트 코멘트 도입(문서01이 명시적으로 배제)
- 개인 매치(`sourceType=match`)의 참가자 자격 모델 변경 — 이미 `V1MatchParticipant.status` 기반으로 "실제 참가"를 대표하고 있어 문제가 없다(§5.3)
- `match`의 48시간 마감·이상 탐지 적용 — 완료 플로우 부재로 이번 웨이브에서 제외(D-12, §1.2.2)
- `V1PostEventReviewTag` 테이블/과거 태그 데이터 삭제 — 레거시 리뷰는 계속 태그를 보존한다(§8)
- 공개 검색·매칭 필터 UI 재설계(스코어 필드 추가는 이 스펙, 필터 UX는 프론트 후속)

## 3. 확정된 설계 결정

| ID | 항목 | 결정 | 근거 |
|---|---|---|---|
| D-1 | 적용 범위 | **`match`/`team_match`/`tournament_fixture` 3종 sourceType 전체**에 4항목 채점 구조를 통일 적용 | "현행 단일 rating+태그 구조를 유지하지 않는다"는 사용자 결정은 공유 스키마(`V1PostEventReview`) 전체를 가리킴 — 2종만 남기면 두 개의 평가 시스템이 영구 공존(기술부채). `scoringVersion` 컬럼으로 sourceType별 차등 롤아웃도 사후에 가능해 리스크는 낮음. **주의**: 이 D-1은 "4항목 채점 스키마" 범위만 확정한다 — 48h 마감·이상탐지의 `match` 적용 여부는 별도 결정(D-12) |
| D-2 | 실출전 자격 게이트 범위 | **`tournament_fixture` 개인 평가에만** 적용. `match`는 기존 참가자 상태 필터가 이미 동등한 역할을 함(§5.3). `team_match`는 **2026-08-17(`68cc67bc`)에 개인(선수) 평가 경로가 신설됐지만**(§1.2.3 — 최초 조사 시점의 "경로 자체가 없음"은 더 이상 사실이 아니다), 이미 대상 명단이 "등록 로스터 전체"가 아니라 **그 경기 제출 라인업**으로 좁혀져 있어(`teamMatchOpponentRosters`, §1.2.3) §5 신규 게이트를 이번 웨이브에 함께 적용하지 않아도 대회처럼 "출전 여부 완전 무관" 상태는 아니다 — 범위는 그대로 `tournament_fixture`만 유지 | 근거 데이터(V1GameResultParticipant)가 Game 엔진 경유 소스에만 존재. `match`는 Game 엔진을 타지 않음(§1.2.1). `team_match`는 게임 엔진을 타지만(라인업 기준 필터가 이미 있음) "제출 라인업"과 "공식 결과 확정 실출전"의 엄격도 차이가 새 비일관성으로 남는다(§1.2.3, §13 리스크) — 이 격차 해소는 §14 미결이 아니라 이번 스펙 범위 밖의 별도 후속 결정으로 남긴다(사용자가 명시 요청하지 않은 scope 확장 금지) |
| D-4 | `rating` 컬럼 | **유지**(NOT NULL). 4항목 신규 리뷰는 `rating = round(avg(4항목))`을 계속 채운다 | 13개 기존 집계 호출부가 `.rating`을 읽는다 — 컬럼을 없애면 전체를 같은 PR에서 재작성해야 함. 항목별 평균은 신규 컬럼으로 **추가**(§4), 기존 경로는 무변경 |
| D-5 | 항목별 평균 저장 위치 | `V1TeamTrustScore`/`V1UserReputationSummary`에 `metric*Score` 8컬럼씩 **확장**(신규 `ReviewSummary` 테이블 신설 아님) | 두 모델이 이미 "대회/통산 공개용 항목 평균"이라는 `ReviewSummary`의 역할을 정확히 수행 중(scope 분리 컬럼 컨벤션도 이미 확립돼 있음) — 신규 테이블은 그 역할을 복제할 뿐 |
| D-6 | ReviewTask | **신설 안 함** — 마감은 `officialAt + 48h`를 매 요청 시점에 계산(저장 안 함) | `LINEUP_DEADLINE_PASSED` 등 이 저장소의 기존 마감 판정이 전부 이 패턴(계산, 미저장). 저장하면 정정 시 마감을 갱신하는 동기화 책임이 새로 생긴다(§6) |
| D-7 | 태그 폐기 | 신규 리뷰는 태그를 쓰지 않는다. `V1PostEventReviewTag` 테이블·과거 태그 데이터는 **삭제하지 않고** 레거시 리뷰 조회 시에만 노출 | `sportId: null` 레거시 마커 패턴이 이미 이 파일에 확립돼 있음(§8에서 동일 패턴 재사용) |
| D-8 | 이상 탐지 실행 방식 | 신규 cron 프로세스가 아니라 **기존 outbox+worker 패턴** 재사용(`registerHandler`, `availableAt` 스케줄) | `v1-game-operations-worker.service.ts:73`의 확립된 패턴 — 새 배포 단위 없이 기존 worker에 핸들러만 등록 |
| D-9 | FLAGGED 처리 | 신규 enum 값 `flagged`/`archived` 추가(status 필터가 이미 `submitted`로 게이트하므로 13개 호출부 무변경으로 자동 제외) | **(2026-08-18 근거 정정)** 최초 근거였던 "hidden/removed가 둘 다 죽은 값"은 더 이상 사실이 아니다 — `hidden`은 `cba61c75`(2026-08-17)로 실제 write path(`PATCH /reviews/admin/:reviewId/hide`\|`unhide`)가 생겼다(§1.2). 그런데 이 결정이 실제로 기대는 안전 근거는 "hidden/removed가 안 쓰인다"가 아니라 **"13개 집계 호출부가 전부 `status:'submitted'`로 게이트한다"**였고, 이 사실은 재확인해도 그대로 참(여전히 13곳) — 그래서 결론(신규 enum 값도 코드 변경 없이 자동 제외)은 안 바뀐다. 오히려 `cba61c75`의 hide/unhide 구현은 이 스펙의 §7.2·§7.3이 요구하는 "상태 전이 시 반드시 관련 재계산 함수를 같은 트랜잭션에서 호출" 패턴을 이미 실제 코드로 증명한 선례라 D-9·§7의 설계를 강화한다(`reviews.service.ts:73-146`의 `hideReview`/`unhideReview`/`recalculateForReview`) |
| D-10 | API 경로 | 신규 배치 엔드포인트 만들지 않음 — 기존 `POST /reviews`(단건) 유지, 페이로드만 변경 | 프론트가 이미 타깃별 순차 제출 루프 + throttle 여유(110/60s)를 갖추고 있음(`reviews.controller.ts:53-64` 주석) — 배치화는 사용자가 요청한 스코프(4항목 재설계) 밖 |
| D-11 | `rating` → `compositeScore` API 리네이밍 | DB 컬럼명은 `rating` 유지, **API JSON 응답 키만** `compositeScore`로 변경(breaking) | 프론트는 어차피 4항목 표시를 위해 재작성 필요 — 같은 파도에 계약을 문서 어휘와 맞추는 것이 저비용 |
| D-12 | `match`의 48h 마감·이상탐지 적용 시점 | **이번 웨이브 제외.** `match`는 D-1의 4항목 채점 스키마만 적용하고, §6(48h 마감)·§7(이상탐지)은 `V1Match` 완료(complete) 플로우가 도입된 뒤 후속 처리한다 | `V1Match.completedAt`을 채우는 코드 경로가 0건(§1.2.2) — 존재하지 않는 앵커에 마감을 걸면 `anchor + 48h`가 항상 `null`이 되어 미정의 동작(항상 즉시 마감 또는 항상 무제한)이 된다. 이건 제품 선호가 아니라 구현 공백이 강제하는 조건이라 사용자 확인 없이 확정한다(§14의 "사용자만 답할 수 있는 결정"에 해당하지 않음) |

> D-3(공개 임계값)은 이 표에서 뺐다 — 초안의 근거 칸이 스스로 "사용자 확인 필요"라고 적어 "확정"이라는 표 제목과 모순됐다(minor 결함 반영). 옵션 비교는 §3.1, 최종 결정 요청은 §14에 있다.

### 3.1 D-3 — 공개 임계값 (미확정, 권고안만)

| 옵션 | 내용 | 장점 | 단점 |
|---|---|---|---|
| 현행 유지(권고) | 상호제출 OR 72h(쌍 단위) | 이미 구현·검증됨. 소규모 대회에서도 빠르게 공개되고 익명성 보호 수준은 동일(§1.2 확인됨) | 문서01의 "서로 다른 상대팀 3건" 문구와 문자 그대로 일치하지 않음 |
| 3건 게이트로 승격 | 서로 다른 상대팀 3건 미만이면 개별 리뷰 자체를 비공개 | 문서01 문구와 정확히 일치 | 팀 2~3개 규모 대회에서 영구히 "집계 중" 상태가 되는 회귀 위험(§1.4) — 이미 존재하는 `trustState` 3건 등급 배지와 별개로 게이트를 하나 더 두는 셈이라 사용자가 "왜 두 가지 3건 기준이 있냐"고 혼란을 겪을 수 있음 |

**권고: 현행 유지.** 두 옵션 모두 §1.2에서 검증된 익명성 보호 수준을 그대로 유지하므로 보안·프라이버시 트레이드오프는 없다 — 순수하게 "공개 속도 vs 문서 문구 일치" 트레이드오프다. 최종 결정은 §14에서 사용자가 내린다.

## 4. 데이터 모델

마이그레이션 `20260817010000_v1_post_event_review_scoring_redesign` 단일 파일로 묶는다(§12에서 drift gate 재핀 1회로 끝내기 위함).

### 4.1 `V1PostEventReviewStatus` — 추가값 2개

```prisma
enum V1PostEventReviewStatus {
  submitted
  hidden
  removed
  flagged   // NEW — §7
  archived  // NEW — §7.4 (경기 무효 시)
}
```

`ALTER TYPE ... ADD VALUE`만 실행하고 같은 마이그레이션 파일 안에서 새 값을 사용하는 DML을 넣지 않는다(Postgres 제약 — 새 enum 값은 커밋 후에만 사용 가능).

### 4.2 신규 enum

```prisma
enum V1PostEventReviewMetric {
  SKILL
  MANNER
  PUNCTUALITY
  SAFETY
}

enum V1PostEventReviewScoringVersion {
  legacy_single_rating
  four_metric
}

enum V1PostEventReviewRiskRule {
  EXTREME_LOW_OUTLIER
  UNIFORM_TEAM_EXTREME
  REPEATED_LOW_PAIR
}

enum V1PostEventReviewRiskFlagStatus {
  pending
  resolved_active
  resolved_excluded
}
```

### 4.3 `V1PostEventReview` — 컬럼 1개 추가

```prisma
model V1PostEventReview {
  // ...기존 필드 전부 유지, rating 포함(D-4)...
  scoringVersion V1PostEventReviewScoringVersion @default(legacy_single_rating) @map("scoring_version")

  metricScores V1PostEventReviewMetricScore[]
  riskFlags    V1PostEventReviewRiskFlag[]
}
```

### 4.4 신규 — `V1PostEventReviewMetricScore`

```prisma
model V1PostEventReviewMetricScore {
  id       String                    @id @default(uuid())
  reviewId String                    @map("review_id")
  metric   V1PostEventReviewMetric
  score    Int

  review V1PostEventReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  @@unique([reviewId, metric])
  @@map("v1_post_event_review_metric_scores")
}
```

migration.sql에 raw SQL로 CHECK 추가(Prisma는 CHECK를 네이티브 지원하지 않음):

```sql
ALTER TABLE "v1_post_event_review_metric_scores"
  ADD CONSTRAINT "v1_post_event_review_metric_scores_score_range"
  CHECK ("score" BETWEEN 1 AND 5);
```

**(minor 결함 반영 — 선례 정정)** 초안은 "이 저장소에도 선례 없어 직접 작성"이라고 적었지만 이는 사실이 아니다. 같은 패턴(Prisma 모델 뒤에 raw SQL `ADD CONSTRAINT ... CHECK`)이 이미 최소 두 곳에 있다:
- `20260630000000_v1_chat_room_team_target_constraint/migration.sql` — `v1_chat_rooms_exactly_one_target_check`
- `20260716010000_v1_tournament_gender_quota/migration.sql` — `v1_tournaments_gender_min_male_nonnegative` 등 6개 CHECK 제약

제약명 네이밍은 `<table>_<column(들)>_<의미>`(`_check`/`_nonnegative`/`_range` 등) 컨벤션을 그대로 따른다 — 위 예의 `v1_post_event_review_metric_scores_score_range`가 이미 이 컨벤션을 따르고 있다.

### 4.5 `V1TeamTrustScore` / `V1UserReputationSummary` — 항목별 컬럼 8개씩 추가

기존 `mannerScore`/`tournamentMannerScore`는 **의미를 바꾸지 않는다**(계속 `rating` 기반 종합점수 소스, API 레이어에서만 `compositeScore`로 리네이밍 — D-11). 신규 컬럼은 `metric` 접두사로 명확히 구분한다:

```prisma
// V1TeamTrustScore, V1UserReputationSummary 양쪽에 동일 패턴으로 추가
metricSkillScore              Decimal? @db.Decimal(4, 2) @map("metric_skill_score")
metricPunctualityScore        Decimal? @db.Decimal(4, 2) @map("metric_punctuality_score")
metricSafetyScore             Decimal? @db.Decimal(4, 2) @map("metric_safety_score")
metricMannerScore             Decimal? @db.Decimal(4, 2) @map("metric_manner_score")
metricReviewCount             Int      @default(0)       @map("metric_review_count")
tournamentMetricSkillScore       Decimal? @db.Decimal(4, 2) @map("tournament_metric_skill_score")
tournamentMetricPunctualityScore Decimal? @db.Decimal(4, 2) @map("tournament_metric_punctuality_score")
tournamentMetricSafetyScore      Decimal? @db.Decimal(4, 2) @map("tournament_metric_safety_score")
tournamentMetricMannerScore      Decimal? @db.Decimal(4, 2) @map("tournament_metric_manner_score")
tournamentMetricReviewCount      Int      @default(0)       @map("tournament_metric_review_count")
```

`metricMannerScore`(신규, MANNER 항목 단독 평균)와 `mannerScore`(기존, 종합점수)가 **다른 컬럼**이라는 점이 이 설계의 핵심 — 이름이 비슷하지만 legacy 리뷰 데이터를 섞어 재계산하면서 의미가 시간에 따라 바뀌는 사고를 피한다(§8에서 상세).

`metricReviewCount`는 `reviewCount`(레거시 포함 전체)와 별개 — 4항목 리뷰만 세므로 초기엔 항상 `reviewCount`보다 작거나 같다. 프론트는 두 카운트를 비교해 "세부 항목은 O건부터 제공돼요" 문구를 낼 수 있다.

### 4.6 신규 — `V1PostEventReviewRiskFlag`

**(blocking 결함 반영 — 설계 변경)** 초안은 `reviewId`를 nullable로 두고 "리뷰 1건이 아니라 패턴(예: 관계 기준) 대상"이라며 패턴 단위 플래그를 허용했다. 그런데 §7.2의 3규칙을 하나씩 뜯어보면 판정 시점에 항상 **구체적인 리뷰 id 집합**으로 환원된다 — "패턴이라 리뷰를 특정할 수 없는" 경우가 실제로는 존재하지 않는다(§7.2 표). `reviewId`가 nullable인 채로 패턴 row만 만들면, 그 패턴을 구성한 리뷰들은 어떤 것도 `flagged`로 전이되지 않고 13개 집계 호출부에 계속 반영된다 — 목표 4("이상 평가 탐지 → FLAGGED → 운영 검토 큐")가 특히 `REPEATED_LOW_PAIR`에서 사실상 무력화되는 결함이었다.

**수정**: `reviewId`를 **NOT NULL**로 바꾸고, 규칙이 N건을 가리키면 N개의 row를 만든다. 같은 판정 이벤트에서 나온 여러 row를 운영 화면에서 하나의 패턴으로 묶어 보여주기 위해 `groupKey` 컬럼을 추가한다(신규 조인 테이블 없이 컬럼 하나로 해결 — `RiskFlag:Review`는 여전히 N:1).

```prisma
model V1PostEventReviewRiskFlag {
  id               String                           @id @default(uuid())
  /// 한 판정 이벤트(규칙 1회 위반 판정)에서 나온 N개 row를 묶는 키. unique 아님 —
  /// 운영 화면에서 "이 N건이 같은 패턴에서 나왔다"를 보여주는 용도일 뿐, 조인 테이블을
  /// 대신하지 않는다(review와의 관계는 여전히 reviewId FK 1개로 충분).
  groupKey         String                           @map("group_key")
  reviewId         String                           @map("review_id")
  ruleCode         V1PostEventReviewRiskRule         @map("rule_code")
  riskScore        Int                              @map("risk_score")
  signal           Json                             // 판정 근거 스냅샷(평균 대비 편차 등) — PII 없음
  status           V1PostEventReviewRiskFlagStatus   @default(pending)
  resolvedByUserId String?                           @map("resolved_by_user_id")
  resolvedAt       DateTime?                         @map("resolved_at")
  createdAt        DateTime                          @default(now()) @map("created_at")

  review V1PostEventReview @relation(fields: [reviewId], references: [id], onDelete: Cascade)

  // 같은 리뷰가 같은 규칙으로 재판정(스윕 재실행)돼도 row가 늘어나지 않고 최신 스냅샷으로
  // upsert된다 — 이 저장소 전역의 idempotent 컨벤션과 동일한 형태.
  @@unique([reviewId, ruleCode])
  @@index([status, createdAt])
  @@index([groupKey])
  @@map("v1_post_event_review_risk_flags")
}
```

## 5. 실출전(appeared participant) 자격 판정

### 5.1 신규 헬퍼 — `apps/v1_api/src/reviews/tournament-fixture-appearance.ts`

```ts
export async function appearedUserIdsBySide(
  prisma: PrismaLike,
  fixture: { game: { id: string; currentOfficialRevision: { id: string; state: string } | null } | null },
): Promise<{ home: Set<string>; away: Set<string> } | null> // null = 폴백 필요(§5.2)
```

구현: `fixture.game.currentOfficialRevision.state === 'OFFICIAL'`일 때만 진행. `V1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } })` → `participantId`로 `V1GameParticipant`를 조회해 `userId`를 얻고, `V1GameSide.sideKey`(HOME/AWAY)로 홈/원정을 나눈다. `V1GameParticipant.userId`가 `null`인 행(신원 미연결 라인업)은 판정에서 제외한다.

### 5.2 폴백 — Game 백필 이전 픽스처

**(minor 결함 반영 — 선행 작업 명시)** `appearedUserIdsBySide()`가 `V1GameResultParticipant.findMany({ where: { resultRevisionId: revision.id } })`를 호출하려면 `fixture.game.id`와 `fixture.game.currentOfficialRevision.id`가 필요하다. 그런데 현재 `tournamentFixtureSelect()`(`tournament-fixture-review-mappers.ts:28-51`)의 `game` select는 다음처럼 `state`와 `officialAt`만 고른다:

```ts
game: { select: { currentOfficialRevision: { select: { state: true, officialAt: true } } } },
```

즉 `game.id`도 `currentOfficialRevision.id`도 빠져 있어, 초안이 "별도 쿼리 없이 같은 select에서 판단 가능"이라고 단정한 것과 달리 **현재 상태로는 판단할 수 없다.** 이 스펙 구현의 **선행 작업**으로 select를 아래처럼 확장한다(2줄 추가, 별도 쿼리 불필요 — select 확장 후에는 "같은 select에서 판단 가능"이라는 원래 전제가 맞아떨어진다):

```ts
game: {
  select: {
    id: true,
    currentOfficialRevision: { select: { id: true, state: true, officialAt: true } },
  },
},
```

`appearedUserIdsBySide()`가 `null`을 반환하면(Game 미연결 또는 OFFICIAL 리비전 없음) **현행 동작으로 폴백**한다 — 상대팀 등록 로스터 전체를 대상으로 유지, `NOT_ACTUAL_PARTICIPANT` 게이트를 건너뛴다. 이는 `officialResultTimestamp()`가 이미 쓰고 있는 "새 경로 우선, 없으면 레거시 폴백" 패턴과 동일한 조건 분기를 재사용한 것이다(`tournament-fixture-review-mappers.ts:63-77` 주석 참조).

### 5.3 `match`(개인 매치)는 변경 없음

개인 매치의 참가자 자격은 이미 `V1MatchParticipant.status in (active, completed)`로 게이트돼 있다(`reviews.service.ts:37`). 개인 매치에는 라인업/교체/선발-후보 개념 자체가 없으므로 "참가 신청이 승인된 사람 = 실제 참가자"가 이미 정확한 등식이다 — 실출전 게이트를 별도로 만들 필요가 없다.

### 5.4 적용 지점

`tournament-fixture-reviews.service.ts`의 두 곳을 수정한다:
- `reviewContexts()` — `roster`(대상 명단)를 "등록 로스터 전체"에서 "등록 로스터 ∩ 실출전 userId"로 좁힌다.
- `submitPlayerReview()` — 작성자(`user.id`)도 자신이 속한 사이드의 실출전 집합에 있는지 확인, 아니면 `NOT_ACTUAL_PARTICIPANT`(403, 신규 코드).

## 6. 48시간 평가창

### 6.1 앵커 시각

| sourceType | 앵커 | 상태 |
|---|---|---|
| `match` | (앵커 없음) | **§6·§7 미적용(D-12).** `V1Match.completedAt`을 채우는 코드 경로가 0건(§1.2.2) — 이번 웨이브는 현행대로 마감 없이 유지하고, 4항목 채점(scores)만 적용한다. 완료 플로우가 생기면 이 행을 채운다 |
| `team_match` | `V1TeamMatch.completedAt` | 적용 |
| `tournament_fixture` | `officialResultTimestamp(fixture)`(기존 함수 그대로 재사용) | 적용 |

`team_match`/`tournament_fixture`에 한해, **저장하지 않고 매 제출 시점에 계산**(D-6): `now() > anchor + 48h` → `410 REVIEW_WINDOW_CLOSED`. 이 설계의 부수 효과 — 정정이 승인되어 `officialAt`이 갱신되면(정정 후 재확정 시각) 마감도 자동으로 그 시각 기준 48시간 연장된다. 별도의 "정정 시 마감 재계산" 로직이 필요 없다 — 문서01 §17 예외표의 "정정으로 출전자가 변경됨: 평가창 내라면 대상 재계산" 요구를 계산-미저장 설계가 부작용으로 충족한다.

### 6.2 적용 지점

`ReviewsService.teamMatchSource`(`reviews.service.ts:423`), `TournamentFixtureReviewsService.reviewContexts()` — 각 소스 조회 직후 앵커+48h 체크를 추가해 `source()`/`submit()` 양쪽에서 공유한다(현재도 `source()`가 `submit()` 내부에서 재사용되는 구조이므로 한 곳만 고치면 됨 — `submitPersonalReview`가 `this.matchSource(user, dto.sourceId)`를 호출하는 패턴 재확인, `reviews.service.ts:489`).

**`ReviewsService.matchSource`(`reviews.service.ts:361`)에는 이 체크를 추가하지 않는다**(D-12) — 앵커가 없는 소스에 마감을 걸면 항상 미정의 동작이 된다. `match`는 4항목 스코어 스키마(§4)만 새로 적용받고, 마감 판정은 §1.2.2에서 확인한 현행 `isCompleted()` 게이트(무기한) 그대로 유지한다.

## 7. 이상 탐지 · FLAGGED 큐

### 7.1 트리거

기존 결과 확정(officialize) 트랜잭션이 `V1OutboxEvent`를 쓰는 지점(`games.service.ts` 결과 제출/확정 경로)에 이벤트 1건을 추가한다:

```
businessKey: `review-risk-sweep:${sourceGroupOrSourceId}`
type: 'REVIEW_RISK_SWEEP_DUE'
availableAt: anchor + 48h + 10분(버퍼 — 마지막 순간 제출까지 반영되도록)
```

`v1-game-operations-worker.service.ts:73`의 `registerHandler('REVIEW_RISK_SWEEP_DUE', handler)` 패턴으로 등록 — 신규 프로세스·cron 없이 기존 worker가 소비한다. `match` 소스에는 이 이벤트를 스케줄하지 않는다 — §6.1에 앵커가 없으므로 `availableAt`을 계산할 기준 시각 자체가 없다(D-12).

### 7.2 규칙 3종(문서01 §11 그대로) — 각 규칙이 가리키는 리뷰 건수

**(blocking 결함 반영)** 3규칙 전부 판정 근거가 여러 리뷰에 걸쳐 있다. "패턴이라 리뷰를 특정할 수 없다"는 초안의 전제가 틀렸다 — 아래처럼 규칙마다 판정에 쓰인 구체적 리뷰 id 집합이 항상 존재한다.

| 규칙 | 판정 | 몇 건을 가리키는가 | flagged 전이 대상 |
|---|---|---|---|
| `EXTREME_LOW_OUTLIER` | 특정 작성자의 최근 N건 평균이 전체 평균 대비 2표준편차 이상 낮음 | N건(그 작성자가 판정 시점 기준으로 쓴 최근 N건 전체 — 평균을 구성한 표본 자체) | 그 N건 각각 |
| `UNIFORM_TEAM_EXTREME` | 같은 상대팀 작성분 전원이 모든 대상에게 동일한 극단(1점 또는 5점) | M건(그 소스 1건에 대해 해당 상대팀 작성자들이 쓴 모든 대상별 리뷰) | 그 M건 각각 |
| `REPEATED_LOW_PAIR` | 동일 두 팀/사용자 조합에서 최근 3개 대회 이상 반복 저평가 | K건(K≥3, 조건을 충족한 대회들에서 그 조합이 쓴 리뷰들 — 대회당 최소 1건이므로 K는 관련 대회 수 이상) | 그 K건 각각 |

각 규칙 위반 시 판정에 쓰인 리뷰 집합 전체에 대해 **리뷰마다 개별** `V1PostEventReviewRiskFlag` row를 생성하고(같은 판정 이벤트의 row는 `groupKey`를 공유), 같은 트랜잭션에서 그 리뷰들의 `status`를 `'flagged'`로 전이한다. `status='submitted'` 게이트를 쓰는 13개 집계 호출부는 **코드 변경 없이** 자동으로 flagged 리뷰를 제외한다(§1.2 확인) — N/M/K건 전부가 실제로 제외 대상에 들어간다.

### 7.3 운영 검토 엔드포인트

`GET /admin/reviews/flags?status=pending`(개별 row 목록, `groupKey`로 클라이언트가 그룹핑), `POST /admin/reviews/flags/groups/:groupKey/resolve`(`{ decision: 'active' | 'excluded', note }`) — **단건이 아니라 groupKey 단위로 일괄 처리한다.** 같은 판정 이벤트에서 나온 N/M/K건에 대해 운영자가 하나의 결정을 내리는 것이 자연스럽고(같은 패턴을 절반만 살리는 결정은 의미가 없다), groupKey 목록을 별도로 순회하며 반복 클릭시키지 않기 위함이다.

- `decision: 'active'`(오탐 판정 — 정상 리뷰였음): groupKey에 속한 모든 리뷰의 `status`를 `'flagged'` → `'submitted'`로 되돌리고, 같은 트랜잭션에서 영향받은 대상(팀/유저) 각각에 대해 §10의 재계산 함수를 호출한다(되돌린 리뷰가 다시 집계에 반영되도록).
- `decision: 'excluded'`(실제 이상 판정 확정): 리뷰 `status`는 `'flagged'`로 **유지**한다(이미 집계에서 빠져 있으므로 상태 변경이 필요 없다) — `V1PostEventReviewRiskFlag.status`만 `'resolved_excluded'`로 갱신해 pending 큐에서 제거한다.

`platform_ops` 역할 게이트를 재사용(`tournament-operations-staff.service.ts:258`의 동일 역할 체크 패턴). resolve 시 `OperationAuditWriterService.create()`로 감사 기록(신규 AuditLog 모델 불필요 — 기존 `V1OperationAudit` 재사용).

### 7.4 경기 무효(VOID) 반응

`tournament-result-review.service.ts`의 void 트랜잭션에 훅을 추가 — 해당 `sourceGroupId`(대회)의 해당 `sourceId`(픽스처)에 달린 `submitted` 리뷰를 `status: 'archived'`로 일괄 전이한다. 문서01 §08 "경기가 취소·무효 처리되어 실제 대결 자체가 성립하지 않은 경우에만 ARCHIVED"를 그대로 구현 — 점수 정정만으로는 리뷰를 건드리지 않는다(기존에도 이미 그랬음 — void가 아니면 반응 안 함).

## 8. 기존 리뷰 데이터 이관 계획

**프로덕션 실제 리뷰 건수는 이번 조사에서 확인하지 못했다(미확인)** — 이 저장소에서 읽기 전용 로컬 조사만 수행했고 프로덕션 DB에 연결하지 않았다. 아래는 건수와 무관하게 유효한 기본 설계이며, 건수에 따라 갈리는 지점은 명시한다.

### 8.1 세 가지 선택지

| | (a) 4항목에 동일값 복제 | (b) 레거시 보존, 신규만 4항목(권고) | (c) 레거시 집계 제외 |
|---|---|---|---|
| 구현 비용 | 낮음 — 백필 스크립트 1회 | 낮음 — `scoringVersion` 분기만 | 최저 — 아무것도 안 함 |
| 정직성 | **낮음** — "실력 4점, 안전 4점"을 실제로 채점 안 한 리뷰가 만들어냄. 원래 1개의 뭉뚱그린 판단을 4개의 독립 신호처럼 보이게 함 | 높음 — 항목별 평균은 실제로 그 항목을 채점한 리뷰에서만 산출 | 최고 — 애매함 자체가 없음 |
| 사용자 체감 | 매끄러움 — 마이그레이션 직후부터 4항목 전부 표시 | `metricReviewCount`가 쌓이기 전까지 "세부 항목 준비 중" 문구 노출 | **회귀** — 기존에 쌓인 신뢰 등급(verified 등)이 순간 사라짐, 이미 축적된 사용자에게 "내 평점이 사라졌어요" 민원 유발 가능성 |
| 종합점수(`compositeScore`) | 영향 없음 — `rating` 기반 계산은 D-4로 legacy/신규 모두 무변경 | 영향 없음(동일) | 영향 없음(동일, `rating` 컬럼 자체는 안 건드리므로) |

**세 선택지 모두 종합점수(mannerScore/`compositeScore`)는 그대로 보존된다** — D-4 결정 덕분에 이관 문제는 순수하게 "항목별 세부 평균을 legacy 데이터로 채울 것인가"로 좁혀진다. 이 좁힌 문제에 한정하면 (a)는 데이터 조작에 가깝고 (c)는 이미 잘 작동하는 신뢰 등급 배지(verified/estimated)에 영향이 없으므로(§8.1 표 "종합점수" 행 참조 — `trustState`는 `mannerScore` 기반이 아니라 `reviewCount` 기반이라 legacy 포함 여부와 무관하게 안전) 실질적으로 (b)와 (c)의 차이는 "항목별 세부 막대(실력/매너/시간/안전)가 legacy 리뷰까지 거슬러 올라가 채워지느냐"뿐이다.

**권고: (b).** 이미 이 코드베이스에 확립된 "legacy 마커 컬럼(`sportId: null`) → 조건부 표시" 패턴을 그대로 재사용하고(`reviews.service.ts:113-126`이 정확히 이 패턴), 데이터를 조작하지 않는다.

### 8.2 건수에 따른 재검토 기준

- 건수가 매우 적으면(수십~수백 건 수준, 베타 단계 제품에서 흔함) — (b)의 엔지니어링 비용 대비 이득이 작아진다. 이 경우 **(c)로 단순화해도 사용자 체감 손실이 미미**하므로 재고 가치가 있다.
- 건수가 많고 이미 여러 팀이 `verified` 등급을 노출 중이면 — (c)는 회귀가 눈에 띄므로 배제, (b) 고정.
- 실제 건수 확인이 필요하면(선택): `SELECT source_type, count(*) FROM v1_post_event_reviews GROUP BY source_type;`을 읽기 전용 프로덕션 경로(`prod-db-readonly-via-ssm` 메모리 절차)로 실행 — 이 스펙 작성 시점엔 수행하지 않았다.

## 9. API 계약

### 9.1 `POST /api/v1/reviews` (기존 경로 유지, D-10)

요청 본문 변경:
```jsonc
{
  "sourceType": "tournament_fixture",
  "sourceId": "fx_...",
  "targetType": "user",
  "targetUserId": "usr_...",
  "scores": { "skill": 4, "manner": 5, "punctuality": 4, "safety": 5 }
  // tagCodes 필드 제거(D-7)
}
```
- `scores`의 4개 필드 모두 `@IsInt() @Min(1) @Max(5)` 필수(부분 채점 불허 — 문서01은 4항목 전부를 하나의 폼으로 제출).
- Idempotency: 기존과 동일하게 **DB unique 제약 + P2002 catch → 기존 리뷰 반환**(200 + `alreadySubmitted: true`) 유지. 별도 `Idempotency-Key` 헤더 도입 안 함(D-10 근거) — 이 저장소 전역 컨벤션인 `[idempotent]` 표기(재요청 시 `alreadyProcessed/alreadySubmitted` 반환)와 이미 부합.

응답:
```jsonc
{
  "review": {
    "reviewId": "...",
    "scoringVersion": "four_metric",
    "scores": { "skill": 4, "manner": 5, "punctuality": 4, "safety": 5 },
    "compositeScore": 4.5,   // D-11: 기존 rating 필드를 리네이밍
    "status": "submitted",
    "submittedAt": "..."
  },
  "alreadySubmitted": false
}
```
레거시 리뷰 조회 시(`scoringVersion: 'legacy_single_rating'`): `scores: null`, `tags: [{ tagCode, label }]`(레거시 필드 유지), `compositeScore`는 legacy `rating` 그대로.

### 9.2 오류 코드 매핑 (문서01 §16 vs 이 저장소 컨벤션)

| 문서01 제안 | 이 스펙 채택 | HTTP | 사유 |
|---|---|---|---|
| `NOT_TEAM_LEADER`(403) | `TEAM_REVIEW_ROLE_REQUIRED`(기존, 재사용) | 403 | 이미 존재하는 동일 의미 코드 |
| `NOT_ACTUAL_PARTICIPANT`(403) | **신규**, 동일 코드명 채택 | 403 | 신규 게이트(§5) |
| `TARGET_NOT_OPPONENT`(422) | `TARGET_NOT_REVIEWABLE`(기존, 재사용) | **403 유지**(422 아님) | 기존 코드의 HTTP 상태를 바꾸는 churn을 피함 |
| `DUPLICATE_REVIEW`(409) | **채택 안 함** — 200 + `alreadySubmitted:true` 유지 | 200 | 이 저장소 전역 `[idempotent]` 컨벤션과 일치(팀 신청 accept/reject 등과 동일 패턴) |
| `REVIEW_WINDOW_CLOSED`(410) | 그대로 채택(신규, `team_match`/`tournament_fixture`만 — D-12) | 410 | §6 |
| `MATCH_NOT_CONFIRMED`(409) | `SOURCE_NOT_COMPLETED`(기존, 재사용) | 409 | 이미 동일 의미 |

### 9.3 조회 API

`GET /reviews/received`, `GET /reviews/received/summary`, `GET /reviews/sources/:sourceType/:sourceId` — 경로·쿼리 파라미터 불변, 응답 바디의 개별 리뷰 표현만 §9.1 응답 셰이프로 통일 교체.

`GET /teams/:id/review-summary`, `GET /users/:id/review-summary`(문서01 제안) — **이미 동등한 기능이 `receivedSummary()`/`V1TeamTrustScore`/`V1UserReputationSummary` 직접 조회로 존재**하는지 확인 필요(전용 공개 프로필 요약 엔드포인트가 팀/유저 상세 API에 있는지는 이번 조사에서 확인하지 못함 — §14 미결).

### 9.4 관리자

`GET /admin/reviews/flags`, `POST /admin/reviews/flags/groups/:groupKey/resolve` — §7.3.

## 10. 정합성

- **집계 캐시(V1TeamTrustScore/V1UserReputationSummary)는 파생 계산이 아니라 저장값**이다(현행과 동일 — 매 리뷰 제출 시 같은 트랜잭션에서 재계산). 4항목 확장도 같은 트랜잭션 안에서 `metric*` 컬럼을 함께 갱신 — 조별↔통합 순위처럼 별도 정합성 방어가 필요한 "두 write path" 문제가 생기지 않는다(리뷰 제출은 항상 단일 서비스 메서드를 거침).
- **FLAGGED 전이가 집계를 어긋나게 하지 않는지**가 신규 정합성 리스크 — 리뷰가 `flagged`로 전이되는 순간 그 리뷰가 이미 반영된 캐시(`metric*Score`)는 재계산 전까지 과거값을 들고 있다. FLAGGED 전이 트랜잭션에 해당 대상(팀 또는 유저)의 재계산 호출을 반드시 포함시킨다(기존 `recalculateTeamTrust`/`recalculateTournamentFixtureTeamTrust` 등을 그대로 재사용).
- **재계산 동시 실행 경합(major 결함 반영)** — `recalculateUserReputation`(`reviews.service.ts:674`)/`recalculateTeamTrust`(`reviews.service.ts:697`)/`recalculateTournamentFixtureTeamTrust`(`tournament-fixture-review-trust.ts:4`)/`recalculateTournamentUserReputation`(`tournament-fixture-review-reputation.ts:19`)는 전부 `findMany`로 읽고 `upsert`로 쓰는 read-then-write이며 행 잠금(SELECT ... FOR UPDATE)이나 낙관적 버전 컬럼이 없다(코드 확인). §7의 risk-sweep 워커는 원래 제출 트랜잭션과 완전히 분리된 별도 트리거(결과 확정 48h+10분 후, 비동기 백그라운드)로 같은 재계산 함수를 다시 호출한다. 한 팀/유저가 동시에 여러 소스(예: 서로 다른 두 대회)에서 리뷰를 받는 상황이면, risk-sweep의 재계산(방금 flagged 처리를 반영)과 다른 소스의 정상 제출이 유발하는 재계산이 같은 행에서 경합할 수 있다 — 나중 커밋이 먼저 읽은 stale 스냅샷을 그대로 덮어쓰면 flagged 전이로 제외됐어야 할 리뷰가 조용히 다시 집계에 살아난다.
  **해결**: 4개 재계산 함수 모두 진입 직후 대상 단위 **advisory lock**을 건다 — 이 저장소에 이미 확립된 패턴을 그대로 재사용한다: `await tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtextextended(${scope}, 0))\`` (`team-schedules/attendance.service.ts:351`, `tournament-operations/fields/tournament-operations-fields.service.ts:618` 등 7개 파일에 선례). 스코프 키:
  - `review-recalc:user-reputation:${targetUserId}` (recalculateUserReputation)
  - `review-recalc:team-trust:${targetTeamId}` (recalculateTeamTrust)
  - `review-recalc:tournament-team-trust:${targetTeamId}` (recalculateTournamentFixtureTeamTrust)
  - `review-recalc:tournament-user-reputation:${targetUserId}` (recalculateTournamentUserReputation)

  같은 트랜잭션 안에서 잠금 → `findMany` → `upsert` 순서를 지키면 동시 실행이 직렬화되어 lost update가 사라진다.
  **트레이드오프**: 한 팀/유저에게 짧은 시간 안에 여러 재계산이 몰리면(대회 종료 직후 등) 뒤에 도착한 트랜잭션이 advisory lock 대기로 지연될 수 있다 — 다만 lock 범위가 targetId 단위로 좁아 서로 다른 팀/유저 간에는 경합이 전혀 없고, 재계산 자체가 원래도 매 제출마다 일어나는 짧은 트랜잭션이라 대기 시간은 밀리초 단위로 예상된다. "잘못된 신뢰점수가 잠깐 노출되는 것"보다 "짧은 지연"이 명백히 싼 대가라고 판단해 이 트레이드오프를 채택한다.
- **워터마크 불필요** — 리그전 스펙(§7.2)과 달리 이 도메인은 그룹↔통합 같은 이중 저장 구조가 없어 별도 워터마크·reconcile 스크립트를 새로 만들 필요가 없다.

## 11. 검증 전략

문서01 §17 핵심 수용 기준 8개 → 테스트 시나리오:

| # | 수용 기준 | 테스트 |
|---|---|---|
| 01 | 확정되지 않은 경기에서는 어떤 평가 API도 성공하지 않는다 | 기존 `SOURCE_NOT_COMPLETED` 테스트 유지 확인(회귀) |
| 02 | 팀 대표만 상대팀 평가를 1회 제출 | 기존 `canReviewOpponentTeam` 테스트 유지(회귀) |
| 03 | 실제 출전 선수만 상대 실출전 선수를 평가 | **신규** — appeared set 밖의 로스터 대상 제출 시 `NOT_ACTUAL_PARTICIPANT`, appeared set 밖의 작성자 제출 시도 시 동일 코드 |
| 04 | 확정 후 48시간이 지나면 신규 평가 저장 불가 | **신규(`team_match`/`tournament_fixture`만, D-12)** — anchor+48h 경과 후 `REVIEW_WINDOW_CLOSED`(410), 47h59m엔 성공(경계값). `match`는 이 테스트 대상에서 제외하고, 대신 앵커 없이도 무기한 제출 가능함이 유지되는 회귀 테스트 1건을 추가 |
| 05 | 같은 상대팀 선수 2~10명 평가가 있어도 통산엔 1단위로 반영 | 기존 `recalculateTournamentUserReputation`의 "대회×평가한 팀 1표" 로직 회귀 테스트(이미 존재) + `metricReviewCount`가 리뷰 건수가 아니라 팀 단위 수임을 검증하는 신규 케이스 |
| 06 | 서로 다른 상대팀 3건 미만은 비공개(D-3에 따라 재해석) | 기존 reveal(상호성/72h) 테스트 유지 + `trustState` verified 임계값(3건) 회귀 테스트 |
| 07 | 공개 API에 원본 식별자 노출 안 됨 | 기존 `toAnonymousReceivedReview` 회귀 테스트 + `scores`/`compositeScore` 신규 필드도 익명 처리 대상에 포함되는지 확인 |
| 08 | 정정 승인 후 순위·통산·캐시가 재계산됨 | 앵커 재계산(§6.1) 통합 테스트 — 정정으로 officialAt이 밀리면 48h 마감도 함께 밀리는지(`team_match`/`tournament_fixture`) |

추가:
- **이상 탐지 flagged 전이(blocking 결함 검증)**: 3규칙 각각에 대해 판정에 쓰인 리뷰 집합 크기가 N/M/K(N,M,K≥2)일 때, **그 전부**의 `status`가 `flagged`로 바뀌는지 + 같은 판정 이벤트의 row들이 동일한 `groupKey`를 갖는지 + 집계(`metric*Score`)에서 실제로 빠지는지(13개 호출부 코드 변경 없이) 통합 테스트로 확인. `resolve(active)`/`resolve(excluded)` 양쪽 경로에서 groupKey 소속 리뷰 전체가 함께 전이(또는 유지)되는지도 검증.
- **재계산 동시성(major 결함 검증)**: 같은 targetTeamId에 대해 제출 트랜잭션과 risk-sweep 재계산 트랜잭션을 겹치게 실행해 advisory lock 없이는 재현되던 lost update(먼저 반영된 flagged 제외가 되돌아가는 현상)가 lock 적용 후 사라지는지 확인.
- **이상 탐지 positive/negative**: 3규칙 각각 최소 1개의 positive(플래그 발생) + 1개의 negative(정상 분포는 안 걸림) 유닛 테스트.
- **이관**: legacy 리뷰(scoringVersion=legacy_single_rating)가 신규 리뷰와 같은 화면에서 혼재 렌더링될 때 `compositeScore`는 동일하게, `scores`는 legacy는 null·신규는 채워짐을 검증하는 통합 테스트.
- **schema drift 게이트**: `apps/v1_api/test/fixtures/game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema` 재핀 + 근거 주석(§12).

## 12. 마이그레이션·배포

1. **additive 마이그레이션 1건** — enum 값 추가 2개, enum 신규 4개, 컬럼 추가(리뷰 1 + 신뢰점수 모델 2×10), 테이블 신규 2개(`metric_scores`, `risk_flags` — `risk_flags.review_id`는 NOT NULL FK, `group_key` 컬럼 포함). 기존 데이터 무영향, 백필 불필요(D-4가 `rating` 컬럼을 그대로 두므로).
2. `game-schema.fixture.ts`의 `gameSchemaSourceManifest.schema` 재핀 — 근거 주석: "리뷰 스코어링 재설계, 게임 도메인 로직 무관, additive, 뒷받침 마이그레이션 `20260817010000_v1_post_event_review_scoring_redesign`". 재핀하지 않으면 CI `V1 migration replay + drift gate`가 `SOURCE_SNAPSHOT_DRIFT`로 실패(레포 규약).
3. PR 분리: `스키마+어펄런스 게이트+48h(team_match/tournament_fixture)` → `이상탐지+운영큐` → `프론트 4항목 폼·프로필 표시`. 리그전 스펙과 마찬가지로 한 거대 PR로 합치지 않는다. `tournamentFixtureSelect()`의 select 확장(§5.2)은 첫 PR에 함께 포함한다.
4. base는 `dev`. dev 머지 = alpha 즉시 실배포이므로 머지 전 검증(§11)을 실배포 게이트로 취급한다.
5. **레거시 클라이언트 호환 창**: `POST /reviews`의 `scores` 필수화는 breaking change다. 프론트 배포가 백엔드보다 늦으면 기존 `rating`+`tagCodes` payload가 400을 받는다 — 프론트·백엔드 PR을 같은 배포 윈도우에 묶거나, 백엔드가 과도기 동안 두 셰이프를 모두 수락하도록 짧은 이중 지원 기간을 둘지 §14에서 결정.

## 13. 리스크

| 리스크 | 대응 |
|---|---|
| `fix/v1-goal-event-backfill-idempotency` 브랜치가 `tournament-fixture-official-result.ts`를 대폭 수정 중(§1.3) — 48h 앵커(§6.1)가 이 함수에 의존 | 착수 전 해당 브랜치 머지 여부 재확인. 머지됐다면 `resolveTournamentFixtureOfficialTimestamp()` 시그니처가 바뀌었는지 diff 재확인 후 진행 |
| `rating`을 legacy/신규 양쪽에서 계속 채우는 D-4 설계가 "진짜 재설계인가"라는 의문 | 의도적 트레이드오프 — 항목별 세부 데이터(진짜 신규 요구사항)는 완전히 새 컬럼·새 테이블로 분리되므로 문서01의 핵심 가치(4항목 개별 신호)는 100% 구현됨. `rating` 유지는 순수 하위호환 비용 절감이며 문서01도 종합점수 자체의 존재를 부정하지 않음 |
| 프론트-백엔드 배포 순서 어긋남으로 breaking change 노출(§12.5) | PR 시퀀싱에서 프론트를 백엔드 바로 다음 배포로 고정, 또는 §14에서 이중 지원 여부 결정 |
| 이상 탐지 규칙 임계값(표준편차 배수 등)이 처음엔 근거 데이터 없이 추정치 | 초기 배포는 `riskScore`만 기록하고 자동 FLAGGED 전이는 임계값 튜닝 전까지 보류하는 단계적 롤아웃 고려(§14) |
| 프로덕션 리뷰 건수 미확인 상태로 §8 이관 설계를 확정 | §8.2에 재검토 기준 명시 — 실제 착수 전 건수 확인 권장 |
| `match` 리뷰의 48h 마감·이상탐지가 이번 웨이브에서 빠짐(D-12) — 완료 플로우 도입 시점이 불확실해 "언제 후속으로 채워지는지"가 열려 있음 | `match` 완료 플로우 도입 PR과 함께 §6.1·§7.1의 `match` 행을 채우는 후속 작업을 명시적으로 백로그에 남긴다. 그 전까지 `match` 리뷰는 4항목 채점만 적용되고 마감·이상탐지는 현행(무기한·미탐지) 그대로다 — 사용자에게 "48h 안에 평가해주세요" 문구를 `match` 화면에는 노출하지 않도록 프론트 PR에서 sourceType별 분기 필요 |
| 재계산 advisory lock이 대회 종료 직후 리뷰 폭주 구간에서 재계산 트랜잭션을 지연시킬 수 있음(§10) | targetId 단위로 lock 범위가 좁아 서로 다른 대상 간 경합은 없음. 필요 시 지연 지표를 모니터링하고 심하면 배치 재계산으로 전환 검토 |
| **(2026-08-18 신규)** `68cc67bc`가 `team_match`에 개인 평가를 신설하면서 대상 명단 필터가 "제출 라인업" 기준으로 생겼다(§1.2.3). 이 스펙이 §5를 `tournament_fixture`에만 적용하면, 구현 완료 후 두 sourceType의 실출전 엄격도가 서로 달라진다 — `tournament_fixture`는 "공식 결과 확정 실출전", `team_match`는 "라인업 제출"에 머무름 | D-2 범위는 이번 웨이브에서 바꾸지 않는다(§3 D-2). `team_match`를 §5와 같은 엄격도로 올릴지는 이 스펙의 확정 방향(4항목 채점·48h·실출전·이상탐지) 밖의 새 결정이므로, 사용자가 명시적으로 범위 확장을 요청하면 별도 후속 스펙으로 다룬다 |

## 14. 미결

- **D-3 재검토**: 문서01의 "3건 공개" 요구를 개별 리뷰 reveal 게이트로 승격할지, 현행 상호성/72h 기준을 유지할지 — 사용자 확인 필요(옵션 비교는 §3.1).
- **레거시 payload 이중 지원 기간**: `POST /reviews`의 breaking change를 프론트·백엔드 동시 배포로 처리할지, 짧은 과도기 동안 두 셰이프를 모두 수락할지.
- **이상 탐지 임계값의 초기 자동화 수준**: 첫 배포부터 자동 FLAGGED 전이를 켤지, 관찰 모드(리스크 스코어만 기록, 전이는 수동)로 시작할지.
- **`GET /teams/:id/review-summary`, `/users/:id/review-summary` 전용 엔드포인트 존재 여부**: 이번 조사에서 팀/유저 상세 API 전체를 열어보지 않아 확인 못 함 — 있다면 §9.3에서 응답 셰이프만 확장, 없다면 신규 엔드포인트 필요.
- **프로덕션 리뷰 실제 건수**: §8.2 재검토 트리거.

---

## 부록 — 조사 근거 파일 목록

- `apps/v1_api/prisma/schema.prisma:103-108, 195-210, 1030-1057, 1352-1439, 2214-2237, 2528-2572, 2593-2606, 2623-2660, 2657-2680, 2853-2871, 2887-2910`
- `apps/v1_api/src/reviews/reviews.service.ts` (전문, 특히 361-489·640-740·942-944)
- `apps/v1_api/src/reviews/tournament-fixture-reviews.service.ts` (전문)
- `apps/v1_api/src/reviews/tournament-fixture-review-mappers.ts` (전문, 특히 28-51)
- `apps/v1_api/src/reviews/tournament-fixture-review-reputation.ts`, `tournament-fixture-review-trust.ts` (전문)
- `apps/v1_api/src/reviews/review-visibility.ts`, `team-trust-aggregation.ts` (전문)
- `apps/v1_api/src/reviews/dto/*.ts` (전문)
- `apps/v1_api/src/reviews/reviews.controller.ts` (전문)
- `apps/v1_api/src/games/games.service.ts:2807, 4580-4650` (V1TeamMatch.completedAt 기록 지점 — match와의 대조군, deriveAppearedParticipantIds)
- `apps/v1_api/src/matches/matches.controller.ts`, `matches.service.ts:355-430` (complete 엔드포인트/메서드 부재 확인)
- `apps/v1_api/src/admin/admin.service.ts:414-424` (changeMatchStatus — match 완료의 유일한 수동 경로, completedAt 미기록)
- `apps/v1_api/src/admin/dto/admin.dto.ts:362-369` (ChangeMatchStatusDto)
- `apps/v1_api/src/jobs/v1-game-operations-worker.service.ts:73` (registerHandler 패턴)
- `apps/v1_api/src/common/audit/operation-audit-writer.service.ts` (전문)
- `apps/v1_api/src/tournament-operations/staff/tournament-operations-staff.service.ts:228-280` (platform_ops 역할 게이트 패턴)
- `apps/v1_api/src/team-schedules/attendance.service.ts:351`, `apps/v1_api/src/tournament-operations/fields/tournament-operations-fields.service.ts:618` (pg_advisory_xact_lock 선례)
- `apps/v1_api/prisma/migrations/20260813190000_v1_game_participant_user_id/`, `20260813200000_v1_appearance_gate_backfill/`
- `apps/v1_api/prisma/migrations/20260630000000_v1_chat_room_team_target_constraint/migration.sql`, `20260716010000_v1_tournament_gender_quota/migration.sql` (raw SQL CHECK 제약 선례)
- `docs/superpowers/specs/2026-08-17-tournament-league-format-design.md` (형식·스타일 참고)