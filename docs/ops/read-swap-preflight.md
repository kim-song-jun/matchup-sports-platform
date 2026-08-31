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

> **아직 참인지 확인**: `cd apps/v1_api && node scripts/v1-surface-check.mjs` 가 통과하는가.
> 숫자가 위와 다르면 그 뒤로 작업이 더 있었다는 뜻이니 **이 문서를 먼저 갱신**하고 진행한다.
>
> **게이트를 raw grep 으로 재확인하려 하지 말 것.**
> `grep -rn 'v1Tournament\.\(findUnique\|findFirst\)' apps/v1_api/src` 는 **1건을 준다** —
> `tournament-surface-lookup.ts` 의 **헬퍼 자신**이다. 게이트는 그 파일을 일부러 제외하므로
> **0 이 정확하다.** 이 1건을 "게이트가 새고 있다"로 읽지 않는다.
> (실제로 그렇게 오해할 뻔한 일이 있었다 — 셀 때는 **무엇을 세는지**부터 본다.)

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

## 9. `--apply` 전에 닫아야 하는 것 — **dual-write 4곳이 아직 안 막혀 있다**

> 마감은 **참가팀/표시필드 백필 `--apply` 전**이다. 그 자리는 **사용자에게 승인을 요청하는
> 자리**고, 그때 *"거울은 보호돼 있다"* 고 사실대로 말할 수 있어야 한다. 3/7 만 막힌 상태로
> 승인을 요청하면 승인자에게 틀린 그림을 주는 것이다.

**막힌 것 (2026-08-31 실측)**

| 자리 | 어떻게 |
|---|---|
| `league-match-admin` state→active ×2 | 유닛. 변이 2종(dual-write 제거 / `kind` 가드 제거) 각각 1 red |
| `create` (서비스 경로) + 트랜잭션 롤백 | 통합 스펙 `league-competition-dual-write.integration-spec.ts` |

**아직 안 막힌 것 — 3곳** (2026-08-31 갱신: 되돌리기는 통합 스펙으로 덮었다)

```
league-completion-projection    active→completed
league-series-admin.service.ts  시리즈 최초 생성
league-series-admin.service.ts  승강 다음 시즌
```

> **왜 이 셋만 남았나 — 설정 비용이 다르다.** 되돌리기(`revertCompletionInTx`)는 리그를
> `completed` 로 두고 부르면 끝이라 통합 스펙에 바로 얹혔다. 나머지 셋은:
> - `settle` 은 **`currentOfficialRevision.state === 'OFFICIAL'` 인 대진**이 있어야 조건부
>   update 까지 도달한다 → `V1TeamMatch` + `V1Game` + 결과 리비전 + 포인터가 필요하다
> - 시리즈 둘은 `LeagueMatchPublicService` 의존과 승강 확정 시즌 상태가 필요하다
>
> **로컬에 이 프로젝트용 Postgres 가 없어 통합 스펙은 CI 에서 처음 돈다.** 그래서 설정이
> 큰 케이스를 한 번에 얹으면 깨졌을 때 CI 왕복으로만 고쳐야 한다 — 작은 것부터 얹는다.

### 닫혔는지 확인하는 법 — **red 를 3개 세라**

각 자리의 dual-write 한 줄을 지우고 통합 스위트를 돌린다.
**red 가 정확히 3개**여야 하고, **각각 어느 자리인지 이름을 댈 수 있어야 한다.**

> **2개면 하나는 안 막힌 것이다.** 어느 것인지 모른 채 넘어가면 안 막힌 자리가 "통과"로
> 기록된다 — 이 저장소에서 red 개수를 세지 않아 vacuous 테스트를 올린 전례가 있다.

### 함정 둘

1. **리그를 `prisma.v1League.create` 로 만들지 마라.** 그러면 dual-write 를 한 번도 지나가지
   않고, 통과하지만 아무것도 증명하지 않는다. **서비스 메서드로 만든다.**
2. **`jest.config.ts` 에 파일을 명시 등록해라.** `test/league-matches/` 는 와일드카드가
   **아니다.** 등록을 빠뜨리면 스펙이 디스크에만 있고 CI 가 한 번도 선택하지 않는다 —
   이 디렉터리에서 6번 반복된 함정이다. `jest --selectProjects integration --listTests` 로
   실제 선택되는지 확인한다.

