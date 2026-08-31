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
게이트(scripts/v1-surface-check.mjs)가 CI 에서 **네 가지**를 묶는다:

  원시 대회 단건 조회   0곳 (baseline 0)   ← 새 원시 호출은 CI red
  raw SQL 대회 테이블   9곳 (baseline 9)   ← 헬퍼를 못 쓰는 자리, 각 항목에 why
  리그 허용 지점        1곳 (baseline 1)   ← ALL_COMPETITION_KINDS 를 넘기는 자리
  v1League 쓰기 자리    9곳 (baseline 9)   ← 앞 셋과 달리 **쓰기**를 센다
```

앞 셋은 전부 *읽기*를 센다. 그래서 리그를 만들거나 상태를 바꾸는 자리가 늘어도 아무 검사에
안 걸렸고, 실제로 **dual-write 없이 7곳이 살아 있었다**(2026-08-31). 거울을 안 만든 리그는
read-swap 뒤 **에러 없이 화면에서 사라진다** — 읽는 코드를 아무리 세도 이건 안 보인다.
네 번째 검사는 새 쓰기 자리가 늘면 CI 를 멈춰 *"dual-write 붙였나"* 를 묻게 하는 일을 한다.

허용 종류는 **호출부 인자로 코드에 적혀 있다**(`TOURNAMENT_KINDS` / `ALL_COMPETITION_KINDS`).
baseline 주석이 아니라 코드에 둔 이유는 **주석은 드리프트하지만 인자는 못 하기 때문**이다.

> **아직 참인지 확인**: `cd apps/v1_api && node scripts/v1-surface-check.mjs` 가 통과하는가.
> 숫자가 위와 다르면 그 뒤로 작업이 더 있었다는 뜻이니 **이 문서를 먼저 갱신**하고 진행한다.
>
> **게이트를 raw grep 으로 재확인하려 하지 말 것.**
> `grep -rn 'v1Tournament\.\(findUnique\|findFirst\)' apps/v1_api/src` 는 **1건을 준다** —
> `tournament-surface-lookup.ts` 의 **헬퍼 자신**이다. 게이트는 그 파일을 일부러 제외하므로
> **0 이 정확하다.** 이 1건을 "게이트가 새고 있다"로 읽지 않는다.
> (실제로 그렇게 오해할 뻔한 일이 있었다 — 셀 때는 **무엇을 세는지**부터 본다.)
>
> **2026-09-01 재발**: 두 세션이 각각 `grep -rn TOURNAMENT_KINDS` 로 세어 **49 와 71** 을
> 얻고 *"이 중 어디를 넓힐지가 개별 판단"* 이라고 결론냈다. 둘 다 **세는 단위가 틀렸다** —
> 그건 **호출 수**이고, 판단이 필요한 것은 **행이 없을 때 조용히 넘어가는 자리**뿐이다(§1).
> 실측(2026-09-01): 헬퍼 호출 **51곳**, §6 스캔 후보 **9건**, 그중 실제 판단 대상 **4건**
> (2건은 주석 오탐, 2건은 16줄 밖에서 `throw`, 1건은 의도적 허용 §3-c).
> **호출 수를 판단 수로 착각하지 말 것.**

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

| 4 | `tournament-registrations.service.ts` `loadPaymentInstructionSource` | **입금 안내(계좌·금액)가 응답에서 조용히 빠진다.** `serialize` 가 `tournament?.entryFee ?? 0 > 0 && tournament?.bankName?.trim()` 로 판정하므로 행이 없으면 블록 자체가 안 실린다 |

1·2·4 는 **기능이 사라지는** 급이고 3 은 문구다. 1~3 은 코드에도 같은 경고를 달아 뒀다.

> **4는 2026-09-01 에 §6 절차로 새로 찾았다** — 이 문서가 쓰인 뒤 후보가 **6건 → 9건**으로
> 늘었고, 그중 이 자리만 새 판단 대상이었다. **다만 리그가 이 경로에 도달하는지는 별개다**:
> 참가 신청은 대회 전용 개념이라, 통합 화면이 리그에 신청 UI 를 안 보이면 도달하지 않는다.
> **도달 가능성이 정해지기 전까지는 "넓힌다"가 아니라 "지켜본다"** — 안 오는 곳을 넓히면
> 리그가 대회 신청 흐름에 들어갈 수 있게 되어 오히려 문을 하나 더 여는 셈이다.
> 여기에는 코드 주석을 아직 안 달았다(1~3 과 달리 결론이 안 났다).

### 1-a. R4-a 로 넘어간 것은 `listMine` 의 **목록 조회뿐**이다

`listMine` 이 통합 축을 읽는다고 해서 그 화면이 전부 넘어간 게 아니다. 항목별
**순위·다음 경기(`standings()`)는 여전히 `v1League.findUnique` 를 읽는다** — R4-b 대상이다.
여기를 "이미 넘어갔다"고 읽고 리그 축을 정리하면 **순위가 통째로 사라진다**(위 표 2번과
같은 모양 — 조용히 사라지는 쪽이다).

> **반증**: `grep -n "v1League.findUnique" apps/v1_api/src/league-matches/league-match-public.service.ts`
> 가 **0** 이 되면 이 줄은 낡았다. 그때까지는 유효하다.

### 1-b. read-swap 은 **백필보다 먼저 배포되면 안 된다** (Copilot #876 지적)

`listMine` 은 거울의 `status` 를 `state` 로 되돌려 쓰고, **`state === 'draft'` 인 항목은
`standings()` 를 아예 부르지 않는다.** 그래서 거울의 status 가 리그보다 뒤처져 있으면
(백필 전 상태) 진행 중인 리그가 `draft` 로 보여 **순위·다음 경기가 에러 없이 사라진다.**
불완전 검사(`LEAGUE_MIRROR_INCOMPLETE`)는 `region`·`scheduledAt`·`scheduledEndAt` 만 보므로
**틀린 status 는 잡지 못한다** — null 이 아니라 *틀린 값*이기 때문이다.

지금은 순서가 지켜져 있다. `--apply` 를 먼저 돌렸고, 배포를 여러 번 거친 뒤 다시 쟀다:

| 측정 | 값 |
|---|---|
| 리그 축 분포 | `draft 35 · active 15 · completed 38` |
| 거울 축 분포 | `draft 35 · in_progress 15 · completed 38` |
| 행 단위 status 불일치 | **0** / 88쌍 |
| `region` 불일치 · 날짜 null | **0** · **0** |

> **반증**: 아래 SQL 의 `status_mismatch` 가 0 이 아니면 이 줄은 낡았고, read-swap 을
> 배포하면 안 된다.
> ```sql
> SELECT count(*) FROM v1_leagues l
>   JOIN v1_tournaments t ON t.id = l.id AND t.kind = 'regular_league'
>  WHERE t.status::text <> CASE l.state::text
>    WHEN 'draft' THEN 'draft' WHEN 'active' THEN 'in_progress'
>    WHEN 'completed' THEN 'completed' END;
> ```


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

> **아직 참인지 확인**: 세 파일에서 각각 `?? null` · `if (!tournament) continue` · `?? '대회'`
> 가 **여전히 있는가**. 누가 그 자리를 `throw` 로 바꿨다면 그 항목은 **더 이상 위험이 아니다**
> (시끄럽게 실패하므로). 행 번호는 바뀌니 **패턴으로 찾는다** — 6절의 grep 참조.

---

## 2. 되돌리기 창 — **read-swap 이 그것을 영구히 닫는다**

백필로 만든 `kind='regular_league'` 88행은 **지금은 지울 수 있다** — 2026-08-31 실측으로
아래 여섯 자리가 **전부 0행**이다.

### ⚠️ 2026-08-31 정정 — **"세 관계"가 아니고, 목록도 하나 틀렸다**
이 자리에는 `V1TournamentStaffAssignment`·`V1OperationAudit`·`V1GameOfficialResultCache`
**세 관계**라고 적혀 있었다. **pg 카탈로그로 직접 확인하니 다르다**(스키마 서술이 아니라
실제 제약을 봤다):

```sql
SELECT c.conrelid::regclass, c.confdeltype FROM pg_constraint c
 WHERE c.contype='f' AND c.confrelid='v1_tournaments'::regclass AND c.confdeltype <> 'c';
```

**① 대회를 직접 Restrict 하는 것 — 3개 (하나가 목록에 없었다)**

| 자식 테이블 | 언제 붙나 | 알파 현재 |
|---|---|---|
| `v1_tournament_campaigns` | 대회 캠페인이 생길 때 — **문서에 아예 없던 관계다** | 0 |
| `v1_operation_audits` | 운영 감사 로그가 그 대회를 참조할 때 | 0 |
| `v1_game_official_result_cache` | 경기 **공식 결과가 확정**될 때 (**raw SQL**) | 0 |

**② `V1TournamentStaffAssignment` 는 직접 Restrict 이 아니다**
그 모델의 `tournament` 관계는 **`onDelete: Cascade`** 다. 창을 닫는 것은 대회가 아니라
**필드**를 향한 `v1_staff_field_fk`(Restrict)이고, 대회 → 필드가 Cascade 라서
**한 다리 건너** 막는다. 같은 경로로 막는 것이 셋이다:

| 자식 테이블 | 무엇을 Restrict 하나 | 알파 현재 |
|---|---|---|
| `v1_tournament_fixtures` | `v1_tournament_fields` | 0 (필드 자체가 0) |
| `v1_tournament_staff_assignments` | `v1_tournament_fields` | 0 |
| `v1_operation_audits` | `v1_tournament_fields` | 0 |

> **왜 이게 중요한가**: PostgreSQL 의 `RESTRICT` 는 **즉시 검사**라, 그 자식이 다른 경로로
> 함께 지워질 예정이어도 삭제를 막는다. 즉 "어차피 Cascade 로 같이 지워지니 괜찮다"가
> **성립하지 않는다.**

> **원래 표가 "쓰는 곳"까지 전수 확인했다고 적고 있었다.** 관계 목록이 틀린 채로
> 쓰는 곳을 전수 확인하면, **없는 관계를 봉쇄하고 있는 관계를 놓친다.**

**아직 참인지 확인하는 법**: 위 SQL 을 다시 돌린다(SSM → psql). 행이 늘었으면 이 표를 갱신한다.
직접 Restrict 셋과 필드 경유 셋 **양쪽 다** 세야 한다 — 직접만 세면 스태프·대진을 놓친다.

**쓰는 곳** (①의 셋):

| 관계 | 쓰는 곳 | 상태 |
|---|---|---|
| `V1TournamentCampaign` | 캠페인 도메인 | **미확인 — 이 정정에서 새로 드러난 자리다** |
| `V1OperationAudit` | `tournament-operations/fields/…-fields.service.ts` 외 공용 라이터 | 봉쇄됨 · 테스트로 고정 |
| `V1GameOfficialResultCache` | `game-operations/game-result-public-cache.service.ts` (**raw SQL**) | **read-swap 이 여는 자리** |

> **세 번째는 Prisma 접근자가 아니라 raw SQL 이다**
> (`INSERT INTO v1_game_official_result_cache … tournament_id`).
> 그래서 **우리 게이트 둘 다 못 본다** — 조회 게이트는 `v1Tournament`(접근자)를,
> raw SQL 게이트는 `v1_tournaments`(테이블명)를 세기 때문이다.
> **접근자로 검색하면 0건이 나와서 놓칠 뻔했다.**

**결과**: read-swap 이 붙고 **리그 경기 결과가 한 건이라도 공식 확정되면, 백필 88행은
더 이상 지울 수 없다.** 그 뒤로는 되돌리는 것이 아니라 고치는 것만 가능하다.

### ✅ 결정됨 — **2026-08-31 사용자 확정**

> **결과 확정 경로를 마지막 단계로 미룬다 — 그때까지 되돌릴 수 있게.**

그래서 **R4-c 를 둘로 쪼갠다**:

| 단계 | 내용 | 창 |
|---|---|---|
| R4-a | 공개 리그 조회 | 열림 — 진행 가능 |
| R4-b | 전적 3종 | 열림 — 진행 가능 |
| **R4-c-1** | 운영(스태프·분쟁·승강 등) — **결과 캐시를 안 쓰는 것들** | 열림 — 진행 가능 |
| **R4-c-2** | **결과 확정** | **여기서 닫힌다** |

**`c` 를 한 덩어리로 두면 이 결정을 지킬 수 없다.** `V1GameOfficialResultCache` 에 쓰는 경로
(`game-operations/game-result-public-cache.service.ts`)가 붙는 단계를 **분리해 맨 뒤로** 뺀다.

### c-2 착수는 **별도 승인**이 필요하다
`--apply` 와 같은 급이다 — 되돌릴 수 없는 지점을 넘는다. c-1 까지 끝난 뒤,
**c-2 착수 직전에 사용자에게 직접 확인을 받는다.** 그때 함께 낼 것:
- 그 시점의 **창 상태 실측** — cache 에 리그 `tournament_id` 행이 **0인지**(위 반증 기준)
- a · b · c-1 이 alpha 에서 **실제로 도는지** 확인된 결과
- 넘어가면 되돌리기가 **삭제가 아니라 수정**이 된다는 것

창이 닫히는 것은 되돌릴 수 없다. **코드가 정할 일이 아니다.**

> **아직 참인지 확인**: `SELECT count(*) FROM v1_game_official_result_cache c
> JOIN v1_tournaments t ON t.id = c.tournament_id WHERE t.kind = 'regular_league';`
> **0 이면 창이 아직 열려 있다.** 0 이 아니면 이미 닫혔으니 되돌리기는 선택지가 아니다 —
> 그 사실부터 사용자에게 알린다. **alpha·prod DB 조회 경로는 저장소에 문서가 없다** —
> SSM → EC2 → `docker exec … psql` 이고, 자격증명과 인스턴스 선택법은 저장소 밖 비공개
> 메모리에 있다(이 저장소는 PUBLIC 이라 여기 적지 않는다).

---

## 3. 아직 검증 안 된 지점 — 두 이유를 갈라 적는다

봉쇄는 **호출 전부**(2026-09-01 실측 51곳)에 걸었지만, **봉쇄를 증명하는 테스트는 그중 일부**에만 있다.
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

> **아직 참인지 확인**: 위 지점들에 봉쇄 테스트가 **그 사이 추가됐을 수 있다.**
> 아래로 어느 파일에 봉쇄 테스트가 있는지 보고 이 절의 목록과 대조한다 —
> 늘었으면 **이 목록에서 빼고** 3-a/3-b 를 줄인다.
> ```bash
> grep -rln '리그 id 로는\|리그 id 는\|리그 id 에는' apps/v1_api/src --include='*.spec.ts'
> ```
> **`grep -c` 로 건수만 세지 말 것** — `'리그 id'` 는 이 작업과 무관한 스펙
> (`lineup-todo` · `league-claimable-participants`)에도 나온다. **파일 목록으로 확인한다.**

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

> **아직 참인지 확인**: `grep -rn "ConflictException({ code: 'TOURNAMENT_NOT_FOUND'" apps/v1_api/src`
> 가 **1건인가**. 0 건이면 누가 이미 고쳤으니 **이 절을 지운다.**

---

## 5. 로컬에서 `Suites failed 5` 를 보면 — **당신 변경이 아니다**

> **2026-08-31 실측: 지금은 안 난다.** `jest src/profile` → **8 suites · 83 tests 통과**,
> `tsc --noEmit` 에도 `profile` 오류 0. 공유 클라이언트가 그 사이 갱신됐다.
> **이 절은 "지금 깨져 있다"가 아니라 "이런 증상을 보면 이렇게 읽어라"로 남긴다** —
> 공유 클라이언트는 언제든 다시 스테일이 될 수 있다.
>
> **아직 참인지 확인**: `cd apps/v1_api && ./node_modules/.bin/jest --silent src/profile` 이
> 통과하면 증상 없음. `Suites failed` 가 나오면 아래를 읽는다.
>
> ⚠️ **이 절을 근거로 "profile 오류는 원래 있는 것"이라며 결과에서 빼지 말 것.**
> 실제로 그렇게 매번 `grep -v profile` 을 붙여 보고하다가, **애초에 0 이었다는 것**을
> 뒤늦게 알아차린 일이 있다(문서의 서술을 측정 대신 인용한 것). 빼기 전에 **센다.**

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

> **이 증상인지 확인**: 실패 메시지가 **`TS2339 … 'preferredPosition' does not exist`** 인가.
> **다른 메시지면 이 항목이 아니다** — 원인을 새로 찾아라. 이 절을 근거로 "내 변경이
> 아니다"라고 넘기지 말 것.

---

## 6. 이 목록을 늘리는 법

새로 좁히는 자리가 생기면 그 호출이 **행이 없을 때 던지는지**를 본다.
던지지 않고 `?? 기본값` · `continue` · `return null` 로 가면 **1절에 추가한다.**

**판정은 자동이 아니다.** 아래는 **후보를 좁혀 주는 것**이고, 각 후보가 실제로 위험한지는
직접 읽어 판단한다(1절 세 자리도 이 스캔으로 6건을 뽑아 **3건만** 남긴 것이다).

> **2026-09-01 재실행: 후보가 9건이다.** 늘어난 3건 중 2건은 **주석 안의 함수명**을 문 것이고
> (스캔이 주석을 안 거른다), 1건은 16줄 **밖**에서 `throw` 한다(긴 주석이 창을 밀어냈다).
> 남은 1건이 §1 의 4번이다. **후보 수가 늘었다고 위험이 늘어난 게 아니다** — 오탐이 섞여
> 있으니 §2 를 반드시 거친다.

```bash
# ① 후보 좁히기 — 호출 뒤 16줄 안에 throw 가 없는 자리를 뽑는다.
#    16줄은 임의값이라 놓칠 수 있다(멀리 있는 throw 를 못 보고 후보로 올리거나 그 반대).
#    그래서 결과는 "후보"이지 판정이 아니다.
cd apps/v1_api && python3 - <<'EOF'
import pathlib, subprocess
files = [f for f in subprocess.run(
    ['grep','-rl','findTournamentOnSurface','src','--include=*.ts'],
    capture_output=True, text=True).stdout.split()
    if not f.endswith('.spec.ts') and 'tournament-surface-lookup' not in f]
for f in files:
    lines = pathlib.Path(f).read_text().split('\n')
    for i, l in enumerate(lines):
        if 'findTournamentOnSurface(' in l and 'OrThrow' not in l:
            if 'throw new' not in '\n'.join(lines[i:i+16]):
                print(f'{f}:{i+1}')
EOF

# ② 후보마다 직접 읽는다 — 행이 없을 때 무엇을 하는가?
#      throw          → 안전(시끄럽게 실패한다)
#      ?? 기본값 · continue · return null → **1절에 추가**

# ③ 게이트 세 숫자 확인
cd apps/v1_api && node scripts/v1-surface-check.mjs
```

---

## 7. 경로 통합(C) 시 **과거 알림 링크는 살리지 않는다**

### ✅ 결정됨 — **2026-08-31 사용자 확정. 되묻지 말 것.**

> **경로 통합 시 과거 알림의 `deepLink` 는 살리지 않는다.** 옛 주소는 제거되고,
> 이미 발송된 알림을 누르면 그 페이지로 갈 수 없다.

사용자가 "사용자 영향" 을 보고 고른 것이다. 리다이렉트 표를 만들거나 옛 경로를
유지하는 방향으로 **다시 설계하지 않는다.**

**단, "살리지 않는다" ≠ "날것의 오류 화면을 보여라".** 옛 주소가 죽더라도
*"더 이상 볼 수 없는 링크예요"* 류 안내 화면으로 착지시키는 것은 이 결정 **안에** 있다.
착지 화면의 문구·모양은 착수 시 별도 확인 대상이다.

### 고쳐야 하는 자리 — **3파일. `notifications.service.ts` 하나가 아니다**

`deepLink` 를 만드는 파일은 13개고, 그중 **경로 리터럴을 직접 쓰는 것이 7개**다.
그 7개 중 **리그 경로라서 통합의 영향을 받는 것은 3개**다:

| 파일 | 경로 | 왜 별개 사본인가 |
|---|---|---|
| `notifications/notifications.service.ts:429` | `/league-matches/${targetId}` | 리그 6종 알림의 라우팅 분기 |
| `notifications/notifications.service.ts:443` | `/team-matches/${targetId}/result` | 리그 결과 확정·이의 5종 |
| `game-operations/team-match-completion-notification.service.ts` | `/team-matches/:id/result` | **위 443 과 같은 목적지를 독립으로 구성** — 파일 주석이 "단일 소스 동기화 대상" 이라고 스스로 적고 있다 |
| `jobs/league-reminders/league-result-entry-reminder.service.ts:74` | `/admin/league-matches/${leagueId}` | **raw SQL `INSERT` 문자열 안**에 박혀 있다 — TS 리팩터·타입 검사·게이트 어느 것도 이걸 못 본다 |

마지막 것이 함정이다. 나머지 4개(`chat`·`game-result-submitted-escalation` 의
`/team-matches/…`, `lineup-todo`·`tournament-fixture-completion` 의 `/tournaments/…`)는
**진짜 팀 매치**거나 **이미 통합 후 모양**이라 대상이 아니다 — 경로 문자열만 grep 해서
7개를 다 고치면 멀쩡한 것을 건드린다.

### 이게 아직 참인지 확인하는 법

```bash
# deepLink 를 만드는 파일 중 경로 리터럴을 직접 쓰는 것
for f in $(grep -rln "deepLink" apps/v1_api/src --include='*.ts' | grep -v spec); do
  p=$(grep -oE "['\`]/(league-matches|team-matches|tournaments|admin/league-matches)[^'\`]*" "$f" | sort -u | tr '\n' ' ')
  [ -n "$p" ] && echo "$(basename $f) :: $p"
done
```
`league-matches` 또는 `admin/league-matches` 가 붙은 줄이 **위 3파일 말고 더 나오면**
표가 낡은 것이다. 반대로 raw SQL 쪽은 **`deepLink` 변수를 거치지 않는 사본**이 생기면 위 루프가 놓친다.
그때는 아래로 본다 — **맨 `grep -n 'admin/league-matches'` 는 쓰지 말 것.**
`@Controller('admin/league-matches')` 같은 **백엔드 라우트 데코레이터가 11건** 잡혀
"경로 사본이 많다"로 읽히는데, 그건 API prefix 지 프론트 딥링크가 아니다:

```bash
grep -rn "\`/admin/league-matches/" apps/v1_api/src --include='*.ts' | grep -v spec
```
(선행 백틱 = 템플릿 리터럴 = 실제로 만들어지는 URL. 현재 1건, 위 표의 reminder.)

---

## 8. read-swap **다음** 단계의 위험 — 게임 소스 승격 (`sourceType`)

> 여기 적는 이유: **이 문서를 읽는 사람이 다음에 마주칠 것**이고, 그 사고는
> **운영자가 경기 조작을 못 하게 되는 것** — 사용자에게 보이는 사고다.

`V1Game.sourceType` 이 `TEAM_MATCH` → `COMPETITION_FIXTURE` 로 바뀌는 순간
**그 경기에 걸린 운영 규칙이 통째로 달라진다.**

```ts
// games.service.ts:7208  requireTakeover
if (sourceType === V1GameSourceType.TEAM_MATCH) {
  return;                      // ← 팀 매치는 그냥 통과
}
const token = context.takeoverToken?.trim();   // ← 그 외 전부 takeover 토큰 필요
```

팀 매치 액터는 **애초에 `authorizationSubject` 를 얻을 수 없다**(`resolveActor`).
그래서 승격이 **진행 중이거나 예정된 경기**에서 일어나면 그 경기의 운영자는
`event_append`/`event_reverse` 에서 **영구히 잠긴다.**

### 완화 셋 — ①은 이미 됐고 ②③이 남았다

| | 완화 | 상태 |
|---|---|---|
| ③ | **enum 에 새 값을 추가하고 구 값은 R5 에서 제거** — 개명하지 않는다 | ✅ **이미 됨.** `COMPETITION_FIXTURE` 가 R1 expand 로 추가돼 있고(`schema.prisma:356` 부근) 구 값 둘은 그대로다. **지금 이 두 값을 쓰는 코드는 없다** |
| ① | 백필은 **종료된 경기부터**. 진행 중·예정은 별도 창 | ⬜ R3 에서 |
| ② | 승격 전 그 리그에 **`state=LIVE` 게임이 0건인지 가드** | ⬜ R3 에서 |

### ⚠️ 네 번째 함정 — Postgres 트랜잭션

`ALTER TYPE … ADD VALUE` 로 추가한 enum 값은 **같은 트랜잭션 안에서 쓸 수 없다.**
→ **R3 백필은 값 추가와 반드시 다른 마이그레이션 파일이어야 한다.**
(이건 스키마 주석에도 적혀 있다 — 완화 목록에는 없던 것이라 여기 함께 둔다.)

### 이게 아직 참인지 확인하는 법

```bash
awk '/private requireTakeover/,/^  }/' apps/v1_api/src/games/games.service.ts \
  | grep -n 'TEAM_MATCH'
```
`sourceType === V1GameSourceType.TEAM_MATCH` 로 **일찍 반환하는 줄**이 나오면 위험은 그대로다.
안 나오면 그 분기가 없어진 것이니 이 절을 다시 쓴다.

> **`grep -A<N>` 을 쓰지 말 것.** 이 함수는 **주석이 여덟 줄**이라 `-A3` 로는 정작 `if` 에
> 닿지 않고 **빈 결과**를 준다 — 그걸 "분기가 없어졌다"로 읽으면 위험을 **해소된 것으로
> 오독한다.** (이 문서를 쓰면서 실제로 그 명령을 적었다가 돌려 보고 잡았다.)
> 함수 전체를 뜨는 `awk` 범위를 쓴다.

---

## 9. `--apply` 전에 닫아야 하는 것 — **dual-write 중 아직 봉쇄 테스트가 없는 자리**

> ### 용어 — 여기서 "막혔다" 는 **테스트**를 말한다
> ```
> 막혔다 / 봉쇄됐다  = 그 dual-write 를 지우면 red 가 나는 테스트가 있다
> 안 막혔다          = dual-write 는 **있는데** 지워도 아무도 red 가 안 난다
> ```
> **"안 막혔다" 를 "dual-write 가 없다" 로 읽으면 이미 있는 자리에 두 번째 dual-write 를
> 넣게 된다.** 실제로 그 오해가 한 번 났다(2026-08-31) — 표를 안 보고 요약 문장을 신뢰한 게
> 원인이었다. 그래서 칸 이름을 `봉쇄 수단` 으로 바꿨다.
>
> **dual-write 자체의 유무는 코드로 센다**: `state` 를 바꾸거나 리그를 만드는 **7곳 전부**
> 인접한 거울 쓰기를 갖고 있다(2026-08-31 양 세션 독립 확인).
> 반증: `grep -rn 'v1League\.\(create\|update\|updateMany\|upsert\)' apps/v1_api/src apps/v1_api/prisma`
> 로 나온 자리마다 인접 `v1Tournament` 쓰기가 있는지 본다 — 하나라도 없으면 이 줄이 낡았다.

> 마감은 **참가팀/표시필드 백필 `--apply` 전**이다. 그 자리는 **사용자에게 승인을 요청하는
> 자리**고, 그때 *"거울 쓰기가 회귀로 사라지지 않게 봉쇄돼 있다"* 고 사실대로 말할 수 있어야
> 한다. 봉쇄 없는 자리를 두고 승인을 요청하면 승인자에게 틀린 그림을 주는 것이다.
>
> **숫자는 아래 표에만 둔다.** 제목·도입에 `N곳`·`3/7` 같은 수를 또 적으면 한쪽만 갱신돼
> 문서 안에서 두 값이 싸운다 — 실제로 그렇게 됐다(제목 4 vs 본문 2). 분모가 있는 표기는
> 특히 나쁘다: 자리를 하나 닫을 때마다 **두 곳**을 고쳐야 한다.

**봉쇄된 것 (2026-08-31 실측)**

| 자리 | 봉쇄 수단 |
|---|---|
| `league-match-admin` state→active ×2 | 유닛. 변이 2종(dual-write 제거 / `kind` 가드 제거) 각각 1 red |
| `create` (서비스 경로) + 트랜잭션 롤백 | 통합 스펙 `league-competition-dual-write.integration-spec.ts` |

**아직 봉쇄 테스트가 없는 것 — 1곳** (dual-write 는 있다. 2026-08-31 갱신: 되돌리기·승강 다음 시즌·시리즈 최초 생성을 덮었다)

```
league-completion-projection    active→completed
```

> **"안 막혔다" 는 dual-write 가 없다는 뜻이 아니다 — 이 표는 "무엇이 그것을 봉쇄하는가" 다.**
> 헷갈리면 없는 dual-write 를 새로 넣어 **같은 전이를 두 번 쓰게 된다.** 실제 상태:
> ```
> dual-write        있다. league-completion-projection.service.ts 의
>                   `result.count === 0` 조기 반환 **뒤**(조건부 update 승자만 도달)
>                   커밋 ac933fea4 — origin/dev 에 포함됨
> 봉쇄 테스트        없다. 이 전이를 지나는 유일한 스펙
>                   apps/v1_api/test/league-matches/
>                   league-completion-projection.integration-spec.ts 는
>                   `v1League.state` 와 상태로그만 단언하고 v1Tournament 를 한 번도 조회하지
>                   않는다 → dual-write 를 지워도 전 단언이 green 이다
> ```
> **반증**(레포 루트에서 그대로 붙여넣어 돌아간다 — 실행해서 확인했다):
> ```bash
> grep -c v1Tournament \
>   apps/v1_api/test/league-matches/league-completion-projection.integration-spec.ts
> ```
> 가 0 보다 커지면 이 줄은 낡았다(현재 **0**).
>
> **이 봉쇄를 쓸 때 로컬 green 을 믿지 마라 — 통합 스펙이라 Postgres 가 필요하다.**
> 컨테이너가 없으면 그 스위트는 **실행되지 못하고** 요약에 `Tests: 0` 으로 찍힌다.
> **`Tests: 0` 은 통과가 아니라 "한 개도 안 돌았다" 다** — `Test Suites: N failed` 를 따로 봐야
> 드러난다(2026-08-31 실제로 밟았다: 공유 Prisma 클라이언트가 `V1Tournament.region` 을 몰라
> ts-jest 가 컴파일에서 죽었고, 요약만 보면 실패로 안 읽혔다).
>
> 그래서 이 항목의 변이 확인(거울 쓰기 제거 → red)은 **DB 가 있는 환경 또는 CI 에서** 한다.
> 반증: `docker ps --filter name=teameet --format '{{.Names}}'` 가 비어 있는데 그 스위트가
> green 이면 **안 돈 것**이다.
>
> > `grep postgres` 로 세지 마라 — **다른 프로젝트의 postgres 가 잡힌다.** 이 문장을 쓰면서
> > 실제로 그렇게 됐다(무관한 `posco-mds-db-1` 이 걸려 "떠 있다"로 읽혔다). 이름으로 좁힌다.

> **✅ 필수 마감은 닫혔다.** 시리즈 최초 생성(`seedSeason`)은 유닛으로 막혔다 —
> 변이 둘(dual-write 제거 / 거울을 `tx` 밖으로) 각각 **3/3 red**.
> 남은 하나는 아래 표의 `선택` 항목이라, **`--apply` 를 미룰 이유는 없다.**

> **승강 다음 시즌은 싸게 닫혔다** — `league-promotion.integration-spec.ts` 가 이미 그 경로를
> **실제 API 로** 지나가며 다음 시즌 리그를 단언하고 있었다. 거울 단언만 얹으면 됐다.
> **새 하네스를 만들기 전에 그 경로를 이미 지나는 스펙이 있는지 먼저 본다.**

### ✅ 마감 정책 — **지금 정한다 (승인 요청 직전에 정하지 않는다)**

승인 요청 직전에 "어디까지 막았는가"를 정하면 그건 **승인자에게 불리한 시점**이다.
그래서 미리 박는다:

| 자리 | 봉쇄가 없을 때 무슨 일이 나나 | 봉쇄 마감 | **이 판정이 깨지는 조건** |
|---|---|---|---|
| ~~`league-series-admin` 시리즈 최초 생성~~ | **거울이 아예 없다** → 그 리그가 read-swap 뒤 **화면에서 사라진다** | ✅ **닫혔다** (변이 3/3 red ×2) | — |
| `league-completion-projection` | (dual-write 를 잃으면) 거울 status 가 `in_progress` 로 남는다 → 끝난 리그가 **진행 중으로 보인다** | **선택.** 못 막으면 **승인 요청에 이름과 실패 모습을 그대로 적고** 진행한다 | ⚠️ **시상·결산 경로를 통합 축으로 옮기는 순간 `필수` 로 승격**한다 — 아래. **승격 이유가 하나 더 있다: 여기가 값 불일치의 유일한 회귀 경로다** (§1-b) |

**가르는 축은 "행이 없는가" vs "값이 틀린가"다.** 행이 없으면 화면에서 사라지고 운영자는
"안 보인다"밖에 말할 수 없다.

> **§1-b 의 값 불일치 blind spot 과 이 줄은 같은 구멍이다.** `listMine` 의 불완전 검사는
> null 만 보므로 *틀린* status 는 못 잡는데, status 가 틀어지려면 **리그를 바꾸면서 거울을
> 안 바꾸는 경로**가 있어야 한다. 지금 코드에는 그런 경로가 **없다**(state 를 바꾸는 4곳이
> 전부 dual-write 를 갖고 있다). 즉 남은 위험은 발생이 아니라 **회귀** — 누가 dual-write 를
> 지워도 아무 테스트도 red 가 되지 않는 상태다.
>
> **그래서 해법은 런타임 값 검사가 아니라 봉쇄 테스트다.** 요청마다 "거울 == 리그" 를 확인하려면
> 리그를 읽어야 하고, 그러면 **두 축을 영구히 결합시켜 read-swap 자체가 무의미해진다.**

### ⛔ read-swap 은 **`--apply` 뒤에만** 머지할 수 있다 — 집합 동등성으로는 안 잡힌다

```
1. dual-write 머지     쓰기만 추가. 읽는 화면 안 바뀐다      안전
2. --apply (사용자 승인) 거울 status 가 실제 값이 된다
3. read-swap 머지       이때부터 통합 축을 읽어도 맞다
```

**3을 2보다 먼저 머지하면 alpha 가 조용히 깨진다.** 리그 시즌 백필은 88행을 **전부
`status: 'draft'`** 로 만들었고(`league-competition-backfill.ts:132`), `listMine` 은
`state !== 'draft'` 로 순위·다음 경기를 가른다(`league-match-public.service.ts:183`).

2026-08-31 실측(captain A):
```
리그 축   draft 9 · active 12 · completed 9
통합 축   draft 30                            ← --apply 전이라 전부 draft
```
읽기를 옮기면 **30개 중 21개가 순위·다음 경기를 잃는다. 에러 없이.** 목록에는 30개가
그대로 보이므로 **집합 차집합 검증도 통과한다** — 동등성 증명이 이 결함을 못 잡는다.

> **그래서 동등성 판정에 `상태 분포`를 반드시 포함한다.** 개수·집합만 비교하면 값 오류가
> 통과한다. 그리고 이 분포 비교는 **`--apply` 가 실제로 먹었는지 확인하는 가장 좋은 지표**다 —
> 거울 수 불변식은 **개수만 보고 값은 안 본다.**
>
> `--apply` **전에는 반드시 불일치**해야 하고(전부 draft), **후에 일치**해야 read-swap 이 가능하다.

**read-swap PR 은 `--apply` 전까지 draft 로 두고 제목에 `[--apply 이후 머지]` 를 박는다** —
dev 머지 = 즉시 alpha 실배포라, 실수로 머지되면 그대로 배포된다.

### ⚠️ "값이 틀리면 보이니까 발견된다" 는 **그 값을 게이트로 쓰는 소비처가 없을 때만** 참이다

`settle` 의 `선택` 판정은 **좁은 조건에서만** 성립한다. 이미 그 값을 게이트로 쓰는 자리가 있다:

```ts
// league-match-public.service.ts:508
const champions = league.state !== 'completed' ? [] : resolveLeagueChampions(...);
```
```
apps/v1_web/src/app/league-matches/[leagueId]/awards/page.tsx   ← 시상 화면이 실재한다
```

거울이 `in_progress` 로 남은 채 이 경로가 통합 축을 읽으면 **`champions` 가 `[]` 가 되고
시상 화면이 빈다.** 그리고 **빈 시상 화면은 "우승팀이 없는 리그"와 구분되지 않는다** —
에러도 없다. 즉 **값 오류가 행 부재와 같은 모양이 된다.**

> **지금은 안 터진다.** `:508` 은 아직 `league.state`(**리그 축**)를 읽고, R4-a 는 `listMine`
> 계열만 옮긴다. 그래서 이번 마감의 `선택` 판정은 유효하다.
>
> **그 경로를 통합 축으로 옮길 때(R4-b/c) 이 항목은 `필수` 로 승격한다.**

**일반화**: 값 오류가 "보이니까 발견된다"고 판단하기 전에, **그 값을 분기 조건으로 쓰는
소비처를 먼저 센다.** 게이트가 하나라도 있으면 값 오류도 침묵 실패다. 그래서 이 표에는
`필수/선택` 옆에 **"이 판정이 깨지는 조건"** 칸이 있다 — 없으면 다음 단계에서 이 표를
그대로 재사용하다 틀린다.

**아직 참인지 확인**: `grep -n "state !== 'completed'" apps/v1_api/src/league-matches/league-match-public.service.ts`
가 여전히 `league.state` 를 읽는가. 통합 축(`tournament.status`)으로 바뀌었으면 승격 시점이 온 것이다.

> **`settle` 을 못 막고 진행하기로 했다면 승인 요청에 이 표의 두 번째 줄을 그대로 옮겨 적는다.**
> "일부 미보호" 같은 요약으로 바꾸지 않는다 — 승인자가 판단할 것은 **무슨 일이 나는가**다.

> **왜 이 셋만 남았나 — 설정 비용이 다르다.** 되돌리기(`revertCompletionInTx`)는 리그를
> `completed` 로 두고 부르면 끝이라 통합 스펙에 바로 얹혔다. 나머지 셋은:
> - `settle` 은 **`currentOfficialRevision.state === 'OFFICIAL'` 인 대진**이 있어야 조건부
>   update 까지 도달한다 → `V1TeamMatch` + `V1Game` + 결과 리비전 + 포인터가 필요하다
> - 시리즈 둘은 `LeagueMatchPublicService` 의존과 승강 확정 시즌 상태가 필요하다
>
> **로컬에 이 프로젝트용 Postgres 가 없어 통합 스펙은 CI 에서 처음 돈다.** 그래서 설정이
> 큰 케이스를 한 번에 얹으면 깨졌을 때 CI 왕복으로만 고쳐야 한다 — 작은 것부터 얹는다.

### 롤백 케이스는 **변이로 red 를 한 번 봐야** 값이 있다

이 케이스는 **mock 으로 측정 불가능해서 통합까지 온 항목**이다. 여기서 red 를 한 번도 안 보면
그 우회의 값을 회수하지 못한다 — **red 를 본 적 없는 green 은 "보호됨" 이 아니라 "측정 불가" 다.**

```
1. 기준선 확보    머지된 커밋의 CI run 에서 `PASS integration <파일명>` 확인
2. 스크래치 브랜치  그 커밋에서 따고 변이만 얹는다 (PR 을 만들지 않는다)
3. workflow_dispatch 로 기동
4. 판정
5. 브랜치 삭제
```

**1번을 건너뛰면 3번의 red 를 해석할 수 없다** — 변이 때문인지 그 사이 커밋 때문인지 못 가른다.
**기준선은 변이를 얹은 코드와 같은 커밋이어야 한다.**

**판정 기준 (미리 박는다 — 없으면 이 확인도 vacuous 해진다):**

| 결과 | 뜻 |
|---|---|
| "같은 트랜잭션" 케이스만 red | ✅ 보호된다 |
| 전부 red | ❌ **설정이 깨진 것**이지 증명이 아니다 |
| 전부 green | ❌ **변이가 대상에 안 닿았다** |

**개수와 케이스 이름을 적는다.** "red 를 봤다" 로 끝내지 않는다.

### 닫혔는지 확인하는 법 — **red 를 1개 세라**

각 자리의 dual-write 한 줄을 지우고 통합 스위트를 돌린다.
**red 가 정확히 1개**여야 하고, **각각 어느 자리인지 이름을 댈 수 있어야 한다.**

> **0개면 안 막힌 것이다.** 어느 것인지 모른 채 넘어가면 안 막힌 자리가 "통과"로
> 기록된다 — 이 저장소에서 red 개수를 세지 않아 vacuous 테스트를 올린 전례가 있다.

### 통합 스펙이 **어느 스텝에서 도는지** — 이름이 오해를 부른다

```
job   API
step  V1 migration replay + drift gate     ← 여기서 pnpm test:integration 이 돈다 (deploy.yml:274)
step  V1 API unit tests                    ← 여기는 jest --selectProjects unit 뿐이다
```

**스텝 이름만 보면 마이그레이션 검사로 읽힌다.** `V1 API unit tests` 만 뒤지면 통합 스펙 로그를
못 찾고 **"안 돈다"고 결론내게 된다** — 이 저장소에서 반복된 "확인 안 한 것을 확인한 것으로
취급" 의 또 다른 자리다.

**확인법**: CI 로그에서 **`PASS integration <스펙 파일명>`** 한 줄을 직접 찾는다.
> **"CI green" 을 "그 스펙이 돌았다" 로 읽지 않는다.** 통과와 미실행은 로그 없이 구분되지 않고,
> 등록이 빠진 스펙은 **정확히 green 처럼 보인다.**

### 함정 둘

1. **리그를 `prisma.v1League.create` 로 만들지 마라.** 그러면 dual-write 를 한 번도 지나가지
   않고, 통과하지만 아무것도 증명하지 않는다. **서비스 메서드로 만든다.**
2. **`jest.config.ts` 에 파일을 명시 등록해라.** `test/league-matches/` 는 와일드카드가
   **아니다.** 등록을 빠뜨리면 스펙이 디스크에만 있고 CI 가 한 번도 선택하지 않는다 —
   이 디렉터리에서 6번 반복된 함정이다. `jest --selectProjects integration --listTests` 로
   실제 선택되는지 확인한다.

