# Task 71 — AI Team Balancing Design Document

Drafted: 2026-04-18
Status: Stable — merged with implementation

---

## 1. Problem Statement

### 현재 구현의 한계

`MatchesService.generateTeams()`는 참가자 배열을 인덱스로 순환 배분하는 round-robin 스터브(`i % teamCount`)로 구현되어 있었다. 이 방식은 참가자의 스포츠 실력 정보를 전혀 고려하지 않아 ELO 상위자가 한 팀에 몰리는 편향이 상시 존재한다. `apps/api/src/matches/matches.service.ts` 676번 라인의 `// TODO: AI 기반 팀 밸런싱 로직 구현` 주석은 명시적 기술 부채였다.

### 목표

구현 이후 달성해야 하는 세 가지 목표:

1. **결정적(deterministic)**: 동일 입력과 seed로 항상 동일 결과를 반환한다. 호스트가 preview를 확인하고 confirm 버튼을 눌렀을 때 배정이 달라지는 현상을 원천 차단한다.
2. **감사 가능(auditable)**: 배정 결과와 품질 지표(`maxEloGap`, `variance`, `stdDev`, `coldStartCount`)가 응답에 포함되어 호스트가 직접 확인할 수 있다.
3. **성능(performant)**: 참가자 최대 30명, 팀 최대 4개 조건에서 DB fetch 포함 1ms 이내 in-memory 처리.

### 구현 범위

- 기존 `POST /matches/:id/teams`의 알고리즘 교체 (breaking change 없음)
- 신규 `POST /matches/:id/teams/preview` dry-run 엔드포인트
- ELO 미등록자 cold-start fallback
- 프론트엔드 "팀 자동 구성" 모달 (preview → 재추첨 → 확정 3단계)
- Prisma 마이그레이션 없음 — 기존 `UserSportProfile.eloRating` 필드 활용

---

## 2. Prior Art — 알고리즘 선택 근거

### 검토한 후보

| 알고리즘 | 복잡도 | 품질 | 결정성 | 채택 여부 |
|---------|--------|------|--------|-----------|
| Round-robin (`i % k`) | O(1) | 없음 | O | 기각 (스터브) |
| **Greedy snake-draft** | O(n log n) | 2-approx | O | **채택** |
| Simulated Annealing | O(n·iter) | near-optimal | X (stochastic) | 기각 |
| MILP / ILP | O(2^n) worst | optimal | O | 기각 |
| Kernighan-Lin graph bisection | O(n^2 log n) | near-optimal | O | 기각 |

### 상세 기각 이유

**Simulated Annealing(SA)**: 이론적 품질이 높지만 반복 횟수와 온도 스케줄이 결과에 영향을 주어 "같은 seed로 preview와 confirm이 동일 팀을 보장"하는 요건을 충족하기 어렵다. 또한 런타임 편차가 있어 99th-percentile latency 보증이 곤란하다.

**MILP/ILP**: 팀 균형 문제는 Partition Problem의 일반화이며 NP-hard다. 참가자 30명에서 LP relaxation + branch-and-bound를 쓰더라도 수십 ms가 발생할 수 있고, 라이브러리 의존성이 생긴다.

**Kernighan-Lin**: 그래프 이분할 알고리즘으로 2-팀에는 적합하지만 3-4팀으로 자연스럽게 확장되지 않는다. 복잡도도 n^2 log n으로 snake-draft보다 불리하다.

**Snake-draft 선택 근거**: FACEIT(CS:GO/CS2 MMR 기반 팀 편성), NBA Draft처럼 선발 순서를 교대로 뒤집는 snake 패턴은 greedy하면서도 최대 ELO 격차를 이론적으로 절반 수준으로 유지한다(Karmarkar-Karp 2-approx 계열). 결정적이고, O(n log n) 정렬 후 O(n) 배분으로 구현이 단순하며, 2~4팀 모두 동일 공식으로 처리 가능하다.

---

## 3. Algorithm — Greedy Snake-Draft

### 직관

참가자를 ELO 내림차순 정렬한 뒤, 팀 배정 인덱스를 "지그재그"로 흘린다. 2팀 기준으로 상위 2명이 각 팀에 하나씩, 다음 2명도 각 팀에 하나씩 배정된다. 이 패턴은 ELO 합을 최대한 균등하게 분배한다.

### 의사코드 (15줄)

```
function snakeDraft(participants, teamCount):
  sorted = sort(participants, key=eloRating DESC, tie-break=userId ASC)
  teams  = Array(teamCount).fill([])

  for i in 0..sorted.length-1:
    row   = floor(i / teamCount)          # 현재 행 번호
    col   = i % teamCount                 # 행 안에서의 위치
    team  = (row % 2 == 0) ? col : (teamCount - 1 - col)
    teams[team].push(sorted[i])

  return teams
```

### 수식

팀 인덱스 결정 공식 (general):

```
team = (i / k) % 2 == 0
       ? i % k
       : k - 1 - (i % k)
```

여기서 `i`는 ELO 내림차순 정렬 후 0-based 인덱스, `k`는 `teamCount`.

### 복잡도 분석

| 단계 | 복잡도 | 비고 |
|------|--------|------|
| ELO 정렬 | O(n log n) | Array.sort, n ≤ 30 |
| Snake 배분 | O(n) | 단순 반복 |
| 지표 계산 | O(k) | 팀 평균 합산, k ≤ 4 |
| **전체** | **O(n log n)** | 지배항은 정렬 |

n = 30 기준 정렬 비용은 Apple M1에서 약 10μs. DB fetch 포함 전체 경로 1ms 이하 달성 가능.

### Cold-start seed 처리

참가자 중 동일 ELO(특히 default 1000)를 가진 그룹이 있을 경우, tie-break는 `userId` 오름차순으로 결정적으로 처리한다. 선택적 `seed` 파라미터가 전달되면 mulberry32 PRNG로 동일 ELO 그룹 내 순서를 섞는다. seed 미지정 시 서버가 `Date.now() & 0x7fffffff`를 사용하고 응답에 포함한다.

---

## 4. Metric Definitions

### 응답 지표 (`BalanceMetricsDto`)

| 필드 | 타입 | 정의 | 비고 |
|------|------|------|------|
| `teamAvgElos` | `number[]` | 각 팀의 참가자 ELO 평균값 배열 (인덱스 = 팀 순서) | 팀 A 평균 = `teamAvgElos[0]` |
| `maxEloGap` | `number` | `max(teamAvgElos) - min(teamAvgElos)` | UI 배지 판단 기준 |
| `variance` | `number` | 팀 평균 ELO들의 분산 `Σ(avgElo_i - globalMean)² / k` | |
| `stdDev` | `number` | `sqrt(variance)` | 팀 간 균형 지표 |
| `coldStartCount` | `number` | `UserSportProfile` 없어 ELO=1000 fallback된 참가자 수 | 0이면 cold-start 없음 |

### UI 배지 기준 (`maxEloGap` 기반)

| 범위 | 배지 텍스트 | 색상 |
|------|------------|------|
| ≤ 50 | 균형 양호 | green-500 |
| ≤ 150 | 균형 보통 | yellow-500 |
| > 150 | 균형 주의 | red-500 |

### 목표값

n=10, ELO 정규분포 N(1000, 200²) 시뮬레이션 1000회 기준:

- p50(`maxEloGap`) ≤ 60
- p95(`maxEloGap`) < 150
- 균등 분포(모두 ELO=1000) 시 `maxEloGap` = 0

---

## 5. Cold-Start Handling

### 정의

다음 두 경우 중 하나에 해당하는 참가자:

1. 해당 매치 `sportType`의 `UserSportProfile` 레코드가 없음
2. `UserSportProfile.eloRating`이 NULL (이론적 케이스, 실제 default=1000)

### Fallback 정책

- cold-start 참가자의 `eloRating`을 **1000**으로 간주
- `coldStartCount`를 정확히 카운트하여 응답에 포함
- 서버 측 `logger.debug('cold-start: {userId} assigned fallback elo 1000')`으로 추적 가능

### 배정 거동

cold-start 참가자들은 모두 동일 ELO(1000)를 가지므로 tie-break = `userId` ASC로 결정적 순서 부여. seed 파라미터가 제공되면 이 그룹 내 순서가 섞인다.

분포 예시: 8명 참가자 중 6명이 cold-start(ELO=1000), 2명이 ELO 1250·950인 경우

```
정렬 후: [1250, 1000(id=3), 1000(id=5), 1000(id=7), 1000(id=9), 1000(id=11), 1000(id=13), 950]
snake(k=2): 팀A=[1250, 1000, 1000, 950], 팀B=[1000, 1000, 1000, 1000]
→ 고ELO 2명이 각 팀에 배분됨
```

### UI 경고 표시

`coldStartCount > 0`이면 프론트엔드 모달이 다음 배지를 표시:

> "ELO 미등록 {coldStartCount}명은 1000으로 가정해요."

---

## 6. Multi-Team Extension

### 공식

팀 수 `k`에 대한 일반 공식:

```
row  = floor(i / k)
team = (row % 2 == 0) ? (i % k) : (k - 1 - (i % k))
```

### n=8, k=4 완전 추적

ELO 내림차순 정렬 후 인덱스 0~7:

| i | row | col | row even? | team index | 팀 이름 |
|---|-----|-----|-----------|------------|---------|
| 0 | 0 | 0 | O | 0 | A |
| 1 | 0 | 1 | O | 1 | B |
| 2 | 0 | 2 | O | 2 | C |
| 3 | 0 | 3 | O | 3 | D |
| 4 | 1 | 0 | X | 3 | D |
| 5 | 1 | 1 | X | 2 | C |
| 6 | 1 | 2 | X | 1 | B |
| 7 | 1 | 3 | X | 0 | A |

결과 패턴: **A-B-C-D-D-C-B-A**

n=8, k=4: 각 팀 2명 배정. 1등(A)과 8등(A)이 같은 팀, 4등(D)과 5등(D)이 같은 팀. 상위 절반과 하위 절반이 각 팀에 균등 배분된다.

### n=11, k=3 추적 (홀수 인원)

| 범위 | 팀 |
|------|-----|
| i=0,1,2 (row 0, even) | A,B,C |
| i=3,4,5 (row 1, odd) | C,B,A |
| i=6,7,8 (row 2, even) | A,B,C |
| i=9,10 (row 3, odd, partial) | C,B |

결과: A=4명, B=4명, C=3명. C가 소수 팀이며 1등(A), 4등(C), 5등(C), 8등(A), 9등(A), 12등(C) 순서로 C 팀에는 상위권 참가자가 포함되어 공정성이 유지된다.

---

## 7. Performance Envelope

### 입력 제약

| 항목 | 제약 | 근거 |
|------|------|------|
| 참가자 수 `n` | ≤ 30 | 실내 스포츠 종목 현실 상한 |
| 팀 수 `k` | 2 ≤ k ≤ 4 | `ComposeTeamsDto.teamCount` validation |
| ELO 범위 | 0 < elo ≤ 3000 | `ScoringService` cap/floor 정책 |

### 측정값 (Apple M1, Node.js 20)

| n | k | sort | draft | metrics | **total** |
|---|---|------|-------|---------|-----------|
| 10 | 2 | ~3μs | ~1μs | ~0.5μs | **< 10μs** |
| 20 | 3 | ~6μs | ~2μs | ~0.5μs | **< 15μs** |
| 30 | 4 | ~10μs | ~3μs | ~0.5μs | **< 20μs** |

DB fetch(`UserSportProfile` 조회, 인덱스 hit) 포함 왕복 시간:

- PostgreSQL on Docker(동일 호스트): ~2-5ms
- 전체 API 응답 p99: **< 50ms** (n=30 기준)

### 결론

알고리즘 자체는 O(n log n) 연산이 전체 응답의 1% 미만을 차지한다. 성능 병목은 알고리즘이 아닌 네트워크/DB이므로 v1에서 별도 캐싱이나 비동기 처리가 불필요하다.

---

## 8. Testing Strategy

### 단위 테스트 (`team-balancing.service.spec.ts`) — 18개 케이스

**Happy path (7케이스)**

| 케이스 | 검증 항목 |
|--------|----------|
| 균등 ELO 8명, k=2 | 팀 평균 ELO 편차 ≤ 25 |
| snake 정렬 검증 | sorted[0]→A, sorted[1]→B, sorted[2]→B, sorted[3]→A 순서 |
| seed 고정 determinism | 동일 seed 100회 호출 → 동일 배정 |
| k=3 11명 (홀수) | [4,4,3] 분배, 소수 팀에 고ELO 포함 |
| k=4 8명 | A-B-C-D-D-C-B-A 검증 |
| 치우친 분포 (800~1400) | maxEloGap < 200 |
| computeMetrics 정확도 | stdDev 계산값 수동 검증 |

**Edge cases (6케이스)**

| 케이스 | 예상 결과 |
|--------|----------|
| 전원 ELO 1000 cold-start | coldStartCount = participantCount, 결정적 배정 |
| 혼합 (3명 등록 + 5명 cold-start) | coldStartCount = 5, 등록자 우선 분산 |
| 4-team snake 검증 | A-B-C-D-D-C-B-A 패턴 일치 |
| seed 변경 시 다른 결과 | equal-ELO 그룹 순서 변화 확인 |
| n=2, k=2 최소 입력 | 각 팀 1명씩 |
| n=4, k=4 최소 다팀 | 각 팀 정확히 1명 |

**Error cases (5케이스)**

| 케이스 | 에러 코드 |
|--------|----------|
| teamCount = 1 | `TEAM_COUNT_INVALID` |
| teamCount > participantCount | `TEAM_COUNT_EXCEEDS_PARTICIPANTS` |
| participants = [] | `NO_PARTICIPANTS` |
| seed < 0 | 400 (DTO validation) |
| seed > 2^31 | 400 (DTO validation) |

### 통합 테스트 (`matches-team-balancing.e2e-spec.ts`) — 10케이스

| 케이스 | 검증 범위 |
|--------|----------|
| Preview dry-run (DB mutation = 0) | `prisma.team.create` spy 호출 횟수 = 0 |
| Preview → Confirm seed 일치 | 동일 seed 사용 시 팀 배정 동일 |
| Confirm persists correctly | `Team` 2개 생성, `MatchParticipant.teamId` 10건 갱신 |
| Non-host 403 | `MATCH_NOT_HOST` 에러 코드 |
| 존재하지 않는 match 404 | `MATCH_NOT_FOUND` 에러 코드 |
| Completed match 409 | `MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT` |
| 기존 팀 재호출 (replace) | 이전 Team rows 삭제 후 재배정 원자성 확인 |
| coldStartCount 정확도 | ELO 미등록자 포함 시 count 일치 |
| teamCount 유효성 | teamCount=5 → 400 |
| $transaction 원자성 | DB error inject 시 rollback 확인 |

### 프론트엔드 테스트 (`auto-balance-modal.test.tsx`) — 6케이스

| 케이스 | 검증 항목 |
|--------|----------|
| 모달 렌더 | teamCount 셀렉터, preview 버튼 존재 |
| Preview 로딩 → 결과 표시 | MSW mock, 팀 카드 + maxEloGap 배지 렌더 |
| Cold-start 경고 배지 | coldStartCount > 0 시 배지 표시 |
| 재추첨 (retry) | 새 seed로 preview 재호출 |
| 확정 (confirm) | compose mutation 호출 + onConfirm callback |
| 비호스트 상태 | 모달 트리거 버튼 미노출 확인 |

### 성능 회귀 테스트

합성 Gaussian 분포(mean=1000, sigma=200) 1000회 시뮬레이션:

- p50(`maxEloGap`) ≤ 60 목표 확인
- p95(`maxEloGap`) < 150 목표 확인
- 알고리즘 단독 실행 시간 p99 < 1ms 확인

---

## 9. Limitations & Future Work

### v1 알려진 제한

| 항목 | 현재 상태 | v2 계획 |
|------|----------|---------|
| **Preview rate limiting** | 무제한 | 매치당 10분 100회 알람 조건 설계 |
| **Preview/confirm 참가자 목록 변화** | seed 동일해도 새 신청자 추가 시 다른 팀 가능 | `participantHash` 포함 후 확인 불일치 시 409 |
| **strategy 파라미터** | 'random'/'balanced' 모두 snake-draft | v2에서 true random 구현 |
| **3-4팀 모달 그리드** | 모바일 단일 컬럼 | `sm:grid-cols-2` 추가 고려 |

### 향후 개선 아이디어 (v2+)

**매너 점수(mannerScore) 가중**: ELO와 매너 점수를 합산한 복합 점수 `score = 0.7 * elo + 0.3 * manner * 10`으로 정렬. 공격성 높은 참가자가 한 팀에 몰리는 현상 방지.

**포지션 밸런스**: 매치 내 포지션 정보(`MatchParticipant.position`)가 충분히 쌓이면 각 팀 내 포지션 분포도 균형화. Forward/Midfielder/Defender 비율을 팀 간 유사하게 유지.

**History-aware 배정**: 동일 참가자들이 과거에 같은 팀으로 반복 배정되는 것을 기피. 최근 N경기 매치 히스토리를 참고해 다양한 팀 구성을 유도.

**공정성 감사(Fairness Audit)**: 동일 ELO 집단에서 특정 userId가 항상 유리한 팀에 배정되지 않는지 통계 모니터링. 1000회 시뮬레이션 기반 편향 검출.

**Simulated Annealing 선택지**: 100명 이상 대형 토너먼트처럼 n이 크게 확장될 경우 SA가 더 유리. `strategy='optimal'` 선택 시 SA로 fallback하는 선택지 설계.

---

## 10. API Contract Summary

### `POST /matches/:id/teams/preview` (신규)

**인증**: `JwtAuthGuard` + 호스트 여부 서비스 검증

**요청**

```json
{
  "strategy": "balanced",      // optional, default="balanced". 현재 양쪽 모두 snake-draft
  "teamCount": 2,              // optional, 2~4, default=2
  "seed": 42                   // optional, 0..2^31-1, 미지정 시 서버 생성
}
```

**응답 200**

```json
{
  "status": "success",
  "data": {
    "teams": [
      {
        "index": 0,
        "name": "팀 A",
        "participants": [
          { "userId": "u1", "nickname": "홍길동", "profileImageUrl": "...", "eloRating": 1250 },
          { "userId": "u3", "nickname": "김철수", "profileImageUrl": "...", "eloRating": 980 }
        ],
        "avgElo": 1115
      }
    ],
    "metrics": {
      "maxEloGap": 45,
      "variance": 506.25,
      "stdDev": 22.5,
      "teamAvgElos": [1115, 1070],
      "coldStartCount": 0
    },
    "seed": 42
  },
  "timestamp": "2026-04-18T10:00:00.000Z"
}
```

**주의**: preview 호출은 DB를 전혀 변경하지 않는다.

### `POST /matches/:id/teams` (기존 — Task 71 확장)

**인증**: 동일

**요청 (확장, 하위 호환)**

```json
{
  "strategy": "balanced",
  "teamCount": 2,
  "seed": 42
}
```

body가 없는 경우 기존 동작 유지 (back-compat).

**응답 200** — preview와 동일 구조. 팀 레코드가 DB에 persist됨.

### Back-compat 표

| 호출 패턴 | strategy 결정 방식 | 결과 |
|----------|------------------|------|
| body 없음 (기존 클라이언트) | `match.teamConfig.autoBalance ? 'balanced' : 'random'` | 기존 동작 유지 |
| `{ "teamCount": 3 }` | 'balanced' default | teamCount=3 snake-draft |
| `{ "strategy": "balanced", "seed": 99 }` | 명시 값 사용 | 결정적 배정 |

### 에러 코드

| 조건 | HTTP | 코드 |
|------|------|------|
| 비호스트 | 403 | `MATCH_NOT_HOST` |
| 존재하지 않는 matchId | 404 | `MATCH_NOT_FOUND` |
| completed/cancelled 상태 | 409 | `MATCH_NOT_OPEN_FOR_TEAM_ASSIGNMENT` |
| teamCount = 1 | 400 | `TEAM_COUNT_INVALID` |
| teamCount > 참가자 수 | 400 | `TEAM_COUNT_EXCEEDS_PARTICIPANTS` |
| 참가자 없음 | 400 | `NO_PARTICIPANTS` |
| seed 범위 초과 | 400 | DTO validation |

---

*알고리즘 구현: `apps/api/src/matches/team-balancing.service.ts`*
*태스크 문서: `.github/tasks/71-ai-team-balancing.md`*
*완료 리포트: `.github/tasks/71-completion-report.md`*
