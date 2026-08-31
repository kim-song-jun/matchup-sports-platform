# 리그 시즌 백필 `--apply` — 실행 전 점검과 되돌리기

> `league-competition-backfill.cli.ts` 를 **실제로 실행**하기 전에 읽는다.
>
> ## ⚠️ alpha 에서는 **이미 실행됐다** (2026-08-31 실측 정정)
> 이 문서는 오래도록 *"아직 한 번도 실행되지 않았다(alpha·prod 모두)"* 라고 적고 있었는데
> **alpha 에서는 사실이 아니다.** 읽기 전용 조회로 확인했다:
> ```
> v1_leagues                                    88
> v1_tournaments WHERE kind='regular_league'    88   ← 백필 결과. 1:1 이다
> ```
> 즉 **되돌리기 창은 이미 열려 있고 그 안에 88행이 들어 있다.** 이 문서를 "선행 조건이
> 아직 안 됐다"로 읽으면 후속 백필을 불필요하게 막고, "그럼 지금 돌리자"로 읽으면
> **이미 있는 것을 다시 만들려 한다**(가드가 막지만 승인 한 번을 헛되이 쓴다).
>
> **prod 는 그대로다** — prod 에는 리그 자체가 없다(맨 아래 절).
>
> ## ✅ 참가팀 백필도 실행됐다 (2026-08-31, 사용자 승인)
> `league-team-registration-backfill.cli.js --apply` → **`created: 211`**.
> alpha `5196a6ee4` 이미지에서 SSM → `docker exec` 경로로 실행했다.
> ```
> v1_tournament_registrations            248 → 459
> 그중 리그 대회에 달린 것                     211
> v1_league_teams 와 1:1 매칭                211
> status/entry_source/appliedBy 위반          0
> ```
> **되돌리기 창은 그대로 열려 있다** — Restrict 여섯 자리 전부 0행(실행 후 재확인).
> 봉쇄도 유지: 리그 id 로 `/tournaments/:id`·`/standings`·`/matches` **전부 404**,
> `/league-matches/:id` 는 200.
>
> **다음에 이 문서를 읽는 사람에게**: 두 백필 모두 **실행 완료** 상태다. 다시 돌리지 마라 —
> 가드가 막긴 하지만(`alreadyPresent` 로 세고 `idConflicts` 로 멈춘다) alpha 데이터 변경
> 승인을 헛되이 쓴다.
>
> **아직 참인지 확인하는 법**: 아래 "실행 직전 점검 1" 의 SSM → psql 경로로
> `SELECT count(*) FROM v1_tournaments WHERE kind='regular_league';` 을 본다.
> 88 이면 실행됨, 0 이면 이 정정이 틀린 것이니 되돌려 적는다.

## 무엇이 만들어지나

alpha 리그 **88개**(2026-08-30 전수 실측) → `V1Tournament(kind='regular_league')` 행 88개.

| 필드 | 값 |
|---|---|
| `id` | **리그 id 와 같다** — 대응표를 따로 두지 않기 위해서다 |
| `kind` | `regular_league` |
| `status` | **`draft` 고정** — 매핑하지 않는다 |
| `seriesId`·`tier`·`seasonNo` | 리그에서 그대로 |
| `competitionConfigVersionId` | 종목 canonical (futsal → `FUTSAL_COMPETITION_CONFIG_ID`) |

**화면에는 아무 변화가 없다.** read-swap 이 아직 없고, `draft` 는 공개 status 필터
(`open|closed|in_progress|completed`)에 없어 **두 겹으로** 안 보인다.

## 실행 직전 점검

### 1. id 충돌 — 이때 값이 생기는 조회
```sql
SELECT count(*) FROM v1_tournaments t JOIN v1_leagues l ON l.id = t.id;
```
**0 이어야 한다.** 0 이 아니면 그 행이 우리가 만든 `kind='regular_league'` 인지 확인한다
(재실행이면 정상, 아니면 **멈춘다** — CLI 가드가 같은 판단을 하지만 미리 알면 놀라지 않는다).

공개 API 로는 이 값을 완전히 못 본다 — 대회 공개 목록이 `draft` 를 제외하기 때문이다.
**SSM → EC2 → psql 경로**(문서화된 유일한 경로)로 조회한다.

### 2. 미지원 종목
```sql
SELECT s.code, count(*) FROM v1_leagues l JOIN v1_sports s ON s.id = l.sport_id GROUP BY 1;
```
`soccer|football|futsal` **외의 종목이 있으면 CLI 가 아무것도 만들지 않고 멈춘다.**
그건 버그가 아니라 설계다 — `assertAllSourcesHaveSupportedSport` 가 `v1_tournaments`
**전 행**을 스캔하므로, 미지원 종목 행이 하나라도 생기면 설정 백필 도구 전체가 죽는다.

2026-08-30 실측: 88개 전부 `futsal`, 미지원 0.

### 3. dry-run 을 **실제 CLI 로** 한 번
```bash
DATABASE_URL=<alpha> ts-node src/tournaments/migration/league-competition-backfill.cli.ts
# --apply 없으면 dry-run 이 기본이다. --dry-run 과 --apply 를 함께 주면 멈춘다.
```
`--apply` 전에 **한 번은 진짜 CLI 로** 돌려 `scanned`·`unsupportedSports`·`idConflicts`
실제 출력을 본다 — SQL 로 같은 값을 재현하는 것은 **가드 코드를 우회한 재현**이라
가드 자체의 동작을 증명하지 않는다.

> ## ⚠️ "CLI 를 붙일 길이 없다" 도 옛 상태다 (2026-08-31 정정)
> 이 자리에는 *"문서화된 DB 접근 경로가 psql 뿐이라 Node/Prisma CLI 를 붙일 길이 없었다"*
> 라고 적혀 있었다. **그 뒤로 경로가 생겼고 문서가 안 따라왔다.** 같은 디렉터리의 형제
> CLI 두 개가 **alpha 컨테이너 안에서 이미 그렇게 돈다**:
> ```
> deploy/deploy-alpha.sh:389
>   cd /app/apps/v1_api && node dist/src/tournaments/migration/tournament-award-recipient-backfill.cli.js
> deploy/deploy-alpha.sh:405
>   cd /app/apps/v1_api && node dist/src/games/migration/fixture-game-backfill.cli.js
> ```
> 즉 **SSM → EC2 → `docker exec <api> node dist/src/…/<cli>.js`** 가 검증된 경로다.
> `DATABASE_URL` 은 컨테이너 환경에 이미 있어 따로 넘기지 않는다.
>
> **주의 — 새 CLI 는 배포 뒤에야 `dist` 에 생긴다.** 머지만으로는 안 된다. 실행 전
> `ls dist/src/tournaments/migration/` 로 그 파일이 **실제로 있는지** 먼저 본다.
>
> **아직 참인지 확인하는 법**: `grep -n 'migration/.*cli\.js' deploy/deploy-alpha.sh` 가
> 비면 이 정정이 낡은 것이다.

## 되돌리기 — **창이 언제 닫히는가**

되돌리기는 `DELETE FROM v1_tournaments WHERE kind='regular_league'` 다. **지금은 된다** —
자식 행이 하나도 없기 때문이다.

**창을 닫는 것은 `onDelete: Restrict` 관계 셋이다.** 이 중 하나라도 백필 행을 참조하면
그 행은 **더 이상 지워지지 않는다**:

| 모델 | 언제 붙나 |
|---|---|
| `V1GameOfficialResultCache` | 경기 **공식 결과가 확정**될 때 |
| `V1TournamentCampaign` | 대회 캠페인이 생길 때 |
| `V1OperationAudit` | 운영 감사 로그가 그 대회를 참조할 때 |

> **2026-08-31 정정**: 이 표에는 `V1TournamentStaffAssignment` 가 있었고
> `V1TournamentCampaign` 이 없었다. pg 카탈로그 실측 결과 스태프 배정의 `tournament`
> 관계는 **`Cascade`** 이고, 캠페인이 **직접 `Restrict`** 다. 다만 스태프 배정도 창을 닫기는
> 한다 — 대회가 아니라 **필드**를 Restrict 하고 대회→필드가 Cascade 라 **한 다리 건너**
> 막는다(같은 경로: `v1_tournament_fixtures`·`v1_operation_audits`).
> 전체 표와 근거 SQL 은 `docs/ops/read-swap-preflight.md` 2절.

`Cascade` 관계 12개(`registrations`·`groups`·`fixtures`·`awards`…)는 함께 지워지므로
**창을 닫지 않는다.** 위험한 것은 Restrict 셋뿐이다.

> **되돌릴 수 있는 창 = read-swap 이 리그 화면을 이 행으로 옮기기 전까지.**
> read-swap 이 붙는 순간 결과 캐시·스태프 배정·감사 로그가 생기기 시작하고, 그 뒤로는
> 지우는 것이 아니라 **고치는 것**만 가능하다.

그래서 순서가 이렇다: **백필 → (검증 창) → read-swap.** 백필과 read-swap 을 같은 릴리스에
넣으면 창이 0 이 된다.

## alpha 와 prod 의 차이

- **prod 에는 리그 자체가 없다**(`/api/v1/league-matches` → 404, 2026-08-30 실측).
  백필의 프로덕션 폭발 반경은 현재 **0** 이다.
- 다만 `dev → main` 승격은 사용자만 하므로, **승격하는 순간 이 상태가 바뀐다.**
- alpha 는 **배포마다 QA 시드가 다시 돈다.** 백필 행 88개가 생긴 뒤의 시드 동작은
  아무도 테스트한 적이 없다 — 그 조합이 이 실행의 유일한 미지수다.

## 실행 권한

**이 CLI 의 `--apply` 는 사용자 승인 사항이다.** 라이브 환경에 데이터를 새로 만드는
일이라 에이전트가 단독으로 판단하지 않는다. `deploy.yml` 에 배선하지 않는 이유도 같다 —
파이프라인에 들어가면 나중에 누가 `--apply` 로 바꾸는 경로가 생긴다.

---

## 표시 필드 백필(R4-a) `--apply` — 실행 전 판정표

**2026-08-31 실측 기준선** (읽기 전용):
```
v1_leagues                                              88
kind='regular_league' 거울                               88
그중 status <> 'draft'                                    0
그중 scheduled_at / scheduled_end_at / region_id 채워진 것  0 / 0 / 0
리그 축 상태 분포        draft 35 · active 15 · completed 38
```

### dry-run 출력을 이렇게 읽는다

| 값 | 기대 | 다르면 |
|---|---|---|
| `scanned` | **88** | 늘었으면 dual-write 배포 후 리그가 생긴 것 — 늘어난 수가 `skipped` 와 같은지 본다 |
| `planned` | **88** | — |
| `skipped` | **0** | ⚠️ 아래 |
| `mirrorCount` | **88** | 리그 수와 다르면 불변식이 이미 던진다 |

> **`updated: 0` 은 dry-run 에서 항상 0 이다.** "아직 안 바꿨구나" 로 읽히지만 그건
> 정상 신호가 아니라 **아무 정보도 아니다** — 몇 건이 바뀌는지는 `planned` 로만 알 수 있다.
> 그래서 `planned` 를 넣었다(그전에는 그 숫자가 아예 없었다).

### ⚠️ `skipped ≠ 0` 은 **두 가지 뜻이 있다. 구분해야 한다**
`skipped` 는 "이미 목표값과 같다" 인데 그렇게 되는 길이 둘이다:
```
① dual-write 가 만든 새 리그        정상
② 88행 중 일부가 이미 채워졌다      비정상 — 우리가 모르는 쓰기 경로가 있다는 뜻
```
`planned + skipped == scanned` 는 **둘 다 성립하므로 판정이 안 된다.**

**구분법:**
```
scanned == 88,  skipped > 0   → ②다. 멈춘다
scanned  > 88,  skipped > 0   → ①일 수 있다. (scanned − 88) == skipped 인지 확인
```
**②면 승인 요청으로 넘어가지 않는다** — dual-write 목록(`scripts/league-write-site-baseline.json`)이
불완전하다는 신호이고, 그건 백필보다 먼저 풀어야 한다.

> **위 기준선이 ②를 지금 시점에 배제한다** — 채워진 행이 0 이므로, dry-run 에서 `skipped > 0`
> 이 나오면서 `scanned == 88` 이면 **그 사이에 무언가 채웠다**는 뜻이고 원인이 반드시 있다.

### `--apply` 전후 분포 — **전을 적어 두지 않으면 후를 봐도 증명이 안 된다**

**BEFORE (2026-08-31 실측, 직접 조회 — 파생값 아님):**
```sql
SELECT status, count(*) FROM v1_tournaments WHERE kind='regular_league' GROUP BY 1;
--  draft | 88          ← 한 줄뿐이다. 다른 status 는 아예 없다

SELECT state, count(*) FROM v1_leagues GROUP BY 1;
--  draft | 35   active | 15   completed | 38
```

**AFTER (기대):**
```
통합 축   draft 35 · in_progress 15 · completed 38    ← 리그 축과 1:1
```

> **`in_progress` 다.** 리그의 `active` 가 대회 축에서는 `in_progress` 로 옮겨진다
> (`STATUS_BY_LEAGUE_STATE`). 같은 이름을 찾으면 안 맞는 것으로 오해한다.

### 검증 — **개수만 보지 않는다**
```
거울 수 == 리그 수                    ← CLI 가 자동으로 던진다
상태 분포 == 위 AFTER                  ← 이건 따로 확인한다
```
**개수 불변식은 값이 틀린 것을 못 본다.** 88행이 전부 `draft` 로 남아 있어도 개수는 맞다 —
그게 정확히 BEFORE 상태이므로, **개수만 보면 `--apply` 를 안 돌린 것과 구분되지 않는다.**
분포 대조가 실제로 먹었는지의 유일한 지표다.

