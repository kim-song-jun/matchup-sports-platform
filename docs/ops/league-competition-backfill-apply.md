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
