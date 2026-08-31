# read-swap 착수 전 확인 목록

> 통합(대회·리그 스키마 통합)의 **화면 전환(read-swap)** 을 시작하기 전에 읽는다.
> 여기 적힌 것은 전부 **봉쇄 작업(#864·#865·#866·P3)이 만든 미래 부채**다 — 우리가 대회
> 표면을 좁히면서 생겼으므로 우리가 적는다.

## 왜 이 문서가 필요한가

봉쇄는 `findTournamentOnSurface(db, TOURNAMENT_KINDS, …)` 로 **리그 행을 안 보이게** 한다.
대부분의 자리는 행이 없으면 **404 를 던진다 — 시끄럽게 실패하므로 즉시 드러난다.**

위험한 것은 **행이 없을 때 조용히 기본값으로 가는 자리**다. read-swap 이 리그를 그 경로로
흘려보내면 **에러 없이 기능이 사라진다.** 테스트도 안 잡는다 — 아무것도 던지지 않기 때문이다.

그리고 그 사고를 내는 사람은 **그 파일을 열지 않는다.** read-swap 은 *무엇이 그 경로에
도달하는지*를 바꿀 뿐이므로, 줄 옆 주석은 안 읽힐 수 있다. 그래서 목록을 여기 둔다.

## 넓혀야 하는 자리 (`TOURNAMENT_KINDS` → `ALL_COMPETITION_KINDS`)

| # | 자리 | 리그가 도달하면 벌어지는 일 |
|---|---|---|
| 1 | `games.service.ts` `suspensionVerdicts` | **리그 징계 규정이 에러 없이 꺼진다.** 행이 없으면 `?? null` → `suspensionRulesEnabled` false → 경고 누적·퇴장 정지가 통째로 동작하지 않는다 |
| 2 | `tournament-standings-recalculation.ts` | **리그 순위가 에러 없이 갱신되지 않는다.** `if (!tournament) continue;` 로 조용히 건너뛴다 |
| 3 | `tournament-fixture-completion-notification.service.ts` | 결과 확정 알림 본문의 대회명이 `'대회'` 로 폴백된다(`tournament?.title ?? '대회'`). 기능은 살아 있고 **라벨만** 어긋난다 |

1·2 는 **기능이 사라지는** 급이고, 3 은 문구다. 셋 다 코드에도 같은 경고를 달아 뒀다.

## 확인 방법

read-swap 을 붙인 뒤, 리그 경기로 각각을 실제로 통과시켜 본다:
1. 리그 경기에 경고를 누적시켜 **정지 판정이 나오는지**
2. 리그 결과를 확정하고 **순위가 갱신되는지**
3. 결과 확정 알림 본문에 **리그명이 들어가는지**

**"에러가 안 났다"는 통과가 아니다** — 셋 다 에러 없이 실패하는 종류다.

## 이 목록을 늘리는 법

새로 좁히는 자리가 생기면, 그 호출이 **행이 없을 때 던지는지**를 본다.
던지지 않고 `?? 기본값` · `continue` · `return null` 로 가면 **여기에 추가한다.**

```bash
# 던지지 않는 헬퍼 호출 찾기 (16줄 안에 throw 가 없는 것)
grep -rl findTournamentOnSurface apps/v1_api/src --include='*.ts'
```

---

## 되돌리기 창 — **read-swap 이 그것을 영구히 닫는다**

백필로 만든 `kind='regular_league'` 88행은 지금은 지울 수 있다. 그 창을 닫는 것은
`onDelete: Restrict` 로 대회를 참조하는 **세 관계**다
(`docs/ops/league-competition-backfill-apply.md` 참조). 그 **쓰기 위치**를 전수 확인했다:

| 관계 | 쓰는 곳 | 리그 행에 붙는 조건 |
|---|---|---|
| `V1TournamentStaffAssignment` | `tournaments/staff/tournament-staff.service.ts` | 운영자가 리그 id 에 스태프 배정 — **P3 가 막았고 테스트로 고정** |
| `V1OperationAudit` | `tournament-operations/fields/…-fields.service.ts` 외 공용 라이터 | 필드 운영 감사 로그 — **P3 가 막았고 테스트로 고정** |
| `V1GameOfficialResultCache` | `game-operations/game-result-public-cache.service.ts` (**raw SQL**) | **read-swap 이 리그 경기를 이 경로로 보내는 순간** |

> **세 번째가 read-swap 의 부작용이다.** 이 서비스는 Prisma 접근자가 아니라
> `INSERT INTO v1_game_official_result_cache … tournament_id` 로 **raw SQL** 을 쓴다 —
> 그래서 `v1Tournament` 를 세는 게이트에도, `v1_tournaments` 를 세는 raw SQL 게이트에도
> **걸리지 않는다.** (Prisma 접근자로 찾으면 0건이 나온다. 실제로 그렇게 놓칠 뻔했다.)

**결과**: read-swap 이 붙고 **리그 경기 결과가 한 건이라도 공식 확정되면, 백필 88행은
더 이상 지울 수 없다.** 그 뒤로는 되돌리는 것이 아니라 고치는 것만 가능하다.

**그래서 read-swap 착수 전에 결정해야 한다:**
- 되돌릴 필요가 없다고 판단했는가? (그 판단을 어딘가에 남겼는가)
- 아니면 read-swap 을 **단계로 나눠** 결과 확정 경로를 마지막에 붙일 것인가

이 결정은 코드가 아니라 **사람이 해야 한다** — 창이 닫히는 것은 되돌릴 수 없다.
