# read-swap 착수 전 확인 목록

> 통합(대회·리그 스키마 통합)의 **화면 전환(read-swap)** 을 시작하기 전에 **이 문서만 읽으면
> 되도록** 정리했다. 여기 적힌 것은 전부 봉쇄 작업(#864 · #865 · #866 · #867)이 남긴
> 것이다 — 우리가 대회 표면을 좁히면서 생겼으므로 우리가 적는다.
>
> **코드는 게이트가 지킨다. 이 문서에만 있는 것은 "왜 이렇게 했는가"와 "무엇이 아직
> 안 됐는가"다.**

## 0. 지금 상태 한눈에

```
apps/v1_api 에서 `v1Tournament` 단건 조회는 전부 findTournamentOnSurface(OrThrow) 를 거친다.
게이트(scripts/v1-surface-check.mjs)가 CI 에서 세 가지를 묶는다:

  원시 대회 단건 조회   0곳 (baseline 0)   ← 새 원시 호출은 CI red
  raw SQL 대회 테이블   7곳 (baseline 7)   ← 헬퍼를 못 쓰는 자리, 각 항목에 why
  리그 허용 지점        1곳 (baseline 1)   ← ALL_COMPETITION_KINDS 를 넘기는 자리
```

허용 종류는 **호출부 인자로 코드에 적혀 있다**(`TOURNAMENT_KINDS` / `ALL_COMPETITION_KINDS`).
baseline 주석이 아니라 코드에 둔 이유는 **주석은 드리프트하지만 인자는 못 하기 때문**이다.

---

## 1. 넓혀야 하는 자리 — **에러 없이 기능이 사라지는 곳**

봉쇄 대부분은 행이 없으면 **404 를 던진다 — 시끄럽게 실패하므로 즉시 드러난다.**
위험한 것은 **조용히 기본값으로 가는 자리**다. read-swap 이 리그를 그 경로로 흘려보내면
**에러 없이 기능이 사라지고, 아무것도 던지지 않으니 테스트도 안 잡는다.**

그리고 **그 사고를 내는 사람은 그 파일을 열지 않는다** — read-swap 은 *무엇이 그 경로에
도달하는지*를 바꿀 뿐이다. 그래서 줄 옆 주석만으로는 부족하고 이 목록이 필요하다.

| # | 자리 | 리그가 도달하면 |
|---|---|---|
| 1 | `games.service.ts` `suspensionVerdicts` | **리그 징계 규정이 에러 없이 꺼진다.** 행이 없으면 `?? null` → `suspensionRulesEnabled` false → 경고 누적·퇴장 정지가 통째로 동작하지 않는다 |
| 2 | `tournament-standings-recalculation.ts` | **리그 순위가 에러 없이 갱신되지 않는다.** `if (!tournament) continue` 로 조용히 건너뛴다 |
| 3 | `tournament-fixture-completion-notification.service.ts` | 결과 확정 알림 본문의 대회명이 `'대회'` 로 폴백된다(`tournament?.title ?? '대회'`). 기능은 살아 있고 **라벨만** 어긋난다 |

1·2 는 **기능이 사라지는** 급이고 3 은 문구다. 셋 다 코드에도 같은 경고를 달아 뒀다.

> **2번은 이미 한 번 터졌다.** 이관 중 그 스펙의 mock 이 `where.id` 를 직접 읽어
> `undefined` 가 되면서 정확히 이 `continue` 경로로 빠졌고, **에러 없이 3건이 조용히
> 스킵**됐다. 잡힌 이유는 그 테스트가 **`upsert` 호출을 단언**하고 있어서다 —
> **404 만 봤으면 안 보인다.** "조용히 꺼지는 자리"는 **결과를 단언해야만** 보인다.

### 확인 방법
read-swap 을 붙인 뒤 리그 경기로 각각을 실제로 통과시킨다:
1. 리그 경기에 경고를 누적시켜 **정지 판정이 나오는지**
2. 리그 결과를 확정하고 **순위가 갱신되는지**
3. 결과 확정 알림 본문에 **리그명이 들어가는지**

**"에러가 안 났다"는 통과가 아니다** — 셋 다 에러 없이 실패하는 종류다.

---

## 2. 되돌리기 창 — **read-swap 이 그것을 영구히 닫는다**

백필로 만든 `kind='regular_league'` 88행은 **지금은 지울 수 있다.** 그 창을 닫는 것은
`onDelete: Restrict` 로 대회를 참조하는 **세 관계**다
(`docs/ops/league-competition-backfill-apply.md` 참조). **쓰기 위치를 전수 확인했다:**

| 관계 | 쓰는 곳 | 상태 |
|---|---|---|
| `V1TournamentStaffAssignment` | `tournaments/staff/tournament-staff.service.ts` | 봉쇄됨 · 테스트로 고정 |
| `V1OperationAudit` | `tournament-operations/fields/…-fields.service.ts` 외 공용 라이터 | 봉쇄됨 · 테스트로 고정 |
| `V1GameOfficialResultCache` | `game-operations/game-result-public-cache.service.ts` (**raw SQL**) | **read-swap 이 여는 자리** |

> **세 번째는 Prisma 접근자가 아니라 raw SQL 이다**
> (`INSERT INTO v1_game_official_result_cache … tournament_id`).
> 그래서 **우리 게이트 둘 다 못 본다** — 조회 게이트는 `v1Tournament`(접근자)를,
> raw SQL 게이트는 `v1_tournaments`(테이블명)를 세기 때문이다.
> **접근자로 검색하면 0건이 나와서 놓칠 뻔했다.**

**결과**: read-swap 이 붙고 **리그 경기 결과가 한 건이라도 공식 확정되면, 백필 88행은
더 이상 지울 수 없다.** 그 뒤로는 되돌리는 것이 아니라 고치는 것만 가능하다.

### 그래서 착수 전에 결정해야 한다 — **사람이**
- 되돌릴 필요가 없다고 판단했는가? (그 판단을 어딘가에 남겼는가)
- 아니면 read-swap 을 **단계로 나눠** 결과 확정 경로를 마지막에 붙일 것인가?

창이 닫히는 것은 되돌릴 수 없다. **코드가 정할 일이 아니다.**

---

## 3. 아직 검증 안 된 지점 — 두 이유를 갈라 적는다

봉쇄는 **49곳 전부**에 걸었지만, **봉쇄를 증명하는 테스트는 그중 일부**에만 있다.
"이관했다"와 "검증했다"는 다르다.

### 3-a. 할 수 있었는데 **비용 때문에 안 함** (4파일 9지점)
```
tournament-sponsors            1
tournament-campaign-admin      1
league-fixture-generator       2
tournament-bracket   나머지    2   (조 생성 1곳만 테스트)
admin-registrations  나머지    3   (목록 1곳만 테스트)
tournament-players   나머지    4   (선수 추가 1곳만 테스트)
```
**파일 단위로 "테스트했다"고 읽으면 안 된다** — 같은 파일의 다른 지점은 미검증이다.

### 3-b. 해도 **증명력이 낮음** (5지점)
```
games.service            징계 규정 조회
fixture-completion-notification
tournament-standings-recalculation
tournament-standings-reconcile.cli
competition-config-version-repoint
```
전부 **내부 호출**이라 id 가 이미 검증된 문맥에서 온다. 억지로 재현하면 배선 단언에
가까워져 비용 대비 증명력이 낮다.

### 3-c. **의도적 리그 허용** (1지점)
```
competition-config-version-repoint   ALL_COMPETITION_KINDS
```
설정은 대회와 리그가 **이미 공유하는 축**이다. 여기서 종류를 가르면 리그만 옛 설정에
남거나 설정 없는 상태로 방치돼 통합을 되돌리는 셈이 된다(`tournament-surface.ts` 의
"여기 걸지 않는 곳"). **게이트가 이 개수를 묶으므로 늘리려면 리뷰를 거친다.**

---

## 4. 남은 선행 결함 하나 — 409 / `TOURNAMENT_NOT_FOUND`

```
tournament-registrations.service.ts   throw new ConflictException({ code: 'TOURNAMENT_NOT_FOUND' })
```
이 코드를 던지는 곳 중 **유일하게 409** 다(나머지는 전부 404). **선행 결함이고 봉쇄
작업이 만든 것이 아니다** — 커밋 `1fa57256e`(보안 수정)가 `FOR UPDATE` 잠금 뒤 재검증
블록을 넣으며 **그 블록의 throw 를 전부 409 로** 통일했고, 이웃은
`TOURNAMENT_ALREADY_CANCELLED` · `TOURNAMENT_CAPACITY_FULL` 로 conflict 형태 이름이다.

> **의도는 일관되고 어긋난 것은 코드 *이름*이다.** 상태(409)를 유지하고 이름을 바꾸는
> 것이 맞다(`TOURNAMENT_STATE_CHANGED` 류). 404 로 뒤집으면 그 보안 수정이 세운 계약을
> 깬다. 에러 코드도 클라이언트 계약이므로 **별도 변경으로 다룬다.**

---

## 5. 로컬에서 `Suites failed 5` 를 보면 — **당신 변경이 아니다**

```
src/profile/*.spec.ts ×5   TS2339 'preferredPosition' does not exist
```
D14(`20260830000000_v1_preferred_position`) 이후 **공유 Prisma 클라이언트가 스테일**이면
난다. 스키마에는 컬럼이 있고 생성물에는 없는 상태다. **CI 에서는 안 난다**(체크아웃마다
클라이언트를 새로 생성한다).

> **재생성하지 말 것.** 생성물이 모노레포 전체 공유라 지금 그 클라이언트를 쓰는 다른
> 세션이 깨진다.

그리고 이때 `Tests: N passed / N total` 은 **전부 통과로 보인다** — 컴파일 실패한 스위트는
테스트 수에 아예 안 잡히기 때문이다. **`Suites` 줄을 따로 본다.**

---

## 6. 이 목록을 늘리는 법

새로 좁히는 자리가 생기면 그 호출이 **행이 없을 때 던지는지**를 본다.
던지지 않고 `?? 기본값` · `continue` · `return null` 로 가면 **1절에 추가한다.**

```bash
# 헬퍼를 쓰는 파일들
grep -rl findTournamentOnSurface apps/v1_api/src --include='*.ts'

# 게이트 세 숫자 확인
cd apps/v1_api && node scripts/v1-surface-check.mjs
```
