# Task 153 — 리그 티어(1부/2부/3부) + 시즌·승강 시스템

> **선행 문서**: [Task 152 — 리그전 진행 플로우·진입점 확정](./152-v1-league-flow-and-entrypoints.md).
> 이 문서는 152 가 확정한 설계 결정 **D-1**(순위는 저장하지 않고 조회 시점 재계산) ·
> **D-2**(참가팀은 운영자 지정) · **D-3**(전 대진 확정 시 자동 종료) 위에 얹힌다.
> 특히 승강 계산은 **D-3 이 만든 리그 종료 상태(`state === 'completed'`)를 게이트로 쓴다** —
> "미확정 경기 수"가 아니다(그 게이트는 대진이 0건인 리그를 통과시켜 한 경기도 치르지 않은
> 시즌의 승강을 확정시켰다, 2026-08-21 정정).

## Context

현재 `V1League`는 (종목 × 지역 × 기간) 단발 컨테이너다. 시즌 간 연결이 없어서
"다음 시즌"이라는 개념 자체가 존재하지 않고, 실력 격차가 큰 팀들이 한 리그에
섞여 학살 경기(20:0)가 발생한다. 생활체육 이탈의 1순위 원인이며, 리그가 끝나면
팀이 다시 돌아올 훅도 없다.

기존 자산 중 재사용 가능한 것:
- `apps/v1_api/src/league-matches/league-standings.ts` — `calculateLeagueStandings()`
  가 tie-break 재귀 정렬까지 포함해 완성돼 있다. **승강 후보 계산은 이 함수를
  그대로 재사용한다. 순위 로직을 새로 만들지 않는다.**
- `V1LeagueTeam` — 시즌별 참가 팀 join. 다음 시즌 생성 시 이 테이블에 행을 만든다.

## Goal

리그를 티어(1부/2부/3부)로 나누고, 시즌 종료 시 순위표 기반으로 승격·강등
후보를 **자동 계산해 제안**하되 **확정은 어드민 수동**으로 하는 시스템을 만든다.

## Original Conditions (사용자 확정 — 2026-08-20)

- [ ] **범위**: 1단계(티어 라벨) + 2단계(시즌·승강)까지. 3단계(ELO 자동 시딩)는 제외.
- [ ] **1시즌차 시딩**: 어드민 수동 배정. 자기신고/ELO 자동 배정 안 함.
- [ ] **승강 규칙은 어드민이 설정한다.** 코드 하드코딩 아님 — 시리즈 생성 시
      `promotionRuleJson` 으로 입력하고 이후 수정 가능.
      - **기본값**: 팀 수 비례 20%, **올림(ceil)**, 최소 1팀 (5팀→1 / 8팀→2 / 12팀→3)
      - 올림 기준. 반올림 아님(12x0.2=2.4 → 3)
- [ ] **계산 결과도 어드민이 개별 수정 가능**하고, **최종 승인** 단계를 거쳐야 반영된다.
      계산(preview) → 개별 수정(override) → 최종 승인(commit) 3단계.
- [ ] **티어 명칭**: 사용자 노출 문구는 **"1부 / 2부 / 3부"**. A/B/C·챌린지/오픈/루키 아님.
      - 1부가 최상위. DB는 `tier: Int` (1=최상위).
- [ ] **승강 자동 확정 금지**: 계산은 자동, 다음 시즌 `V1LeagueTeam` 생성은 어드민 확정 후.
- [ ] **티어 수 가변(1~3)**: 시리즈별 설정. 아이스하키·지방 지역은 3티어가 빈 껍데기가 됨.
- [ ] **하위호환**: 기존 단발 리그(`seriesId = null`)는 마이그레이션 없이 그대로 동작.

## 데이터 모델

```
V1LeagueSeries (신규)
  id, title, sportId, regionId
  tierCount            Int      (1~3)
  promotionRuleJson    Json     ← 어드민 설정. 아래 "승강 규칙 설정" 절 참조
  createdByAdminUserId
  state                draft | active | archived
  @@index([sportId, regionId, state])

V1League (기존 확장 — "시리즈의 N시즌 × T티어" 인스턴스)
  + seriesId  String?  @map("series_id")
  + tier      Int?     ← nullable (구현 중 변경, 아래 이유)
  + seasonNo  Int?     @map("season_no")

  ※ tier/seasonNo 를 NOT NULL DEFAULT 1 로 두려다 nullable 로 바꿨다. 두 가지 이유:
    ① 의미: 단발 리그는 티어가 "1부"인 게 아니라 티어 개념 자체가 없다. 기본값 1 을 주면
       화면에 "1부" 뱃지가 잘못 붙고, 나중에 시리즈로 편입할 때 진짜 1부와 구분이 안 된다.
    ② 게이트: expand-contract 게이트가 NOT NULL DEFAULT 컬럼이 낀 UNIQUE 인덱스를 additive 로
       증명하지 못해 REVIEWED_NON_ADDITIVE 예외 등록이 필요해진다. nullable 이면 자동 통과한다.
  @@unique([seriesId, seasonNo, tier], map: "v1_leagues_series_season_tier_key")
  ※ seriesId 가 null 인 행은 unique 제약이 걸리지 않는다(Postgres NULL 동작) —
    기존 단발 리그가 서로 충돌하지 않는다.

V1LeaguePromotion (신규 — 승강 이력/감사 추적)
  id, fromLeagueId (출발 시즌), teamId
  fromTier Int, toTier Int
  kind     promoted | relegated | stayed | withdrawn
  computedKind         ← 규칙이 계산한 원래 값 (어드민 수정 전)
  overriddenByAdmin    Boolean  ← kind != computedKind 이면 true
  overrideNote         String?  ← 수정 사유 (어드민 입력)
  decidedByAdminUserId, decidedAt
  @@unique([fromLeagueId, teamId])
```

## 승강 규칙 설정 (어드민) — 2026-08-20 사용자 추가 요구

**승강 규칙은 코드에 하드코딩하지 않는다.** 어드민이 시리즈 생성 시 설정하고,
시즌 진행 중에도 수정할 수 있다. 계산된 결과 역시 어드민이 개별 수정한 뒤
최종 승인해야 반영된다.

### `promotionRuleJson` 스키마

```jsonc
{
  "mode": "ratio",        // "ratio" | "fixed"
  "ratio": 0.2,           // mode=ratio 일 때. 팀 수 대비 비율
  "rounding": "ceil",     // "ceil" | "floor" | "round"
  "minSlots": 1,          // 최소 승강 팀 수
  "fixedCount": null,     // mode=fixed 일 때. 티어 팀 수와 무관한 고정값
  "tierOverrides": {      // 특정 티어의 슬롯 수만 직접 지정 (선택)
    "1": { "relegate": 4 }
  }
  // relegateOnly/promoteOnly 같은 플래그는 두지 않았다 — 1부에 승격이 없고 최하위에 강등이
  // 없는 것은 티어 위치로 이미 결정되므로 플래그가 중복이다. override 는 "몇 팀"만 정한다.
}
```

**기본값(신규 시리즈 생성 시 폼에 미리 채워짐)**: `mode=ratio`, `ratio=0.2`,
`rounding=ceil`, `minSlots=1`.

### 설정값 검증 (저장 시점)

잘못된 규칙은 **저장 자체를 막는다** — 시즌 종료 후에 발견하면 이미 늦다.

- `ratio` 는 `0 < ratio <= 0.5` (0.5 초과 = 과반 이동, 리그가 성립 안 함)
- `fixedCount` 는 `1 이상`
- `rounding` 은 열거값 3개 중 하나
- `minSlots >= 1`
- 규칙 저장 시 **현재 각 티어의 팀 수로 시뮬레이션**해서 잔류 과반 가드
  (`승격+강등 > floor(n/2)`)에 걸리는 티어가 있으면 **경고를 표시**한다.
  저장은 허용하되(팀 수가 아직 변할 수 있으므로) 어드민이 인지하게 한다.

### 승강 확정 3단계 흐름

```
[1] preview  — 규칙 + 확정 순위표로 승격/강등/잔류 후보 계산. DB 변경 없음.
                POST /admin/league-series/:id/seasons/:no/promotions/preview
                응답: 티어별 목록 + 경고 + 다음 시즌 예상 팀 수

[2] override — 어드민이 개별 팀의 kind 를 수동 변경 (불참팀 withdrawn 처리 등).
                규칙이 계산한 값은 computedKind 에 보존하고,
                바뀐 값은 kind + overriddenByAdmin=true + overrideNote 로 기록.
                이 단계는 몇 번이든 반복 가능하며 아직 다음 시즌은 생성되지 않는다.

[3] commit   — 최종 승인. 이때 비로소 다음 시즌 V1League(seasonNo+1) 와
                V1LeagueTeam 행이 생성된다. 멱등 —
                재호출 시 409 PROMOTION_ALREADY_DECIDED + 기존 결과 반환.
```

**[2] 의 상태는 어디에 저장하나**: `V1LeaguePromotion` 행을 [1] 시점에 미리
쓰지 않는다. override 중간 상태는 **프론트 로컬 상태로만** 들고 있다가 [3]
commit 요청 body 에 최종 목록을 담아 보낸다. 이유 — [1] 을 여러 번 다시 돌릴 수
있어야 하는데(경기 결과 정정 등) 미리 쓰면 매번 정리해야 한다.
commit body 는 서버가 규칙으로 재계산해 **검증**한 뒤 저장한다(클라이언트 값을
그대로 믿지 않는다 — `computedKind` 는 반드시 서버 계산값을 쓴다).

## 승강 계산 규칙 (명세)

입력: 시리즈 S의 시즌 N, 각 티어 T의 확정 순위표.

1. 티어 T의 팀 수 `n(T)` 에 대해 `slots(T) = max(1, ceil(n(T) * 0.2))`
2. **승격**: 티어 T(T≥2)의 상위 `slots(T)` 팀 → 티어 T-1
3. **강등**: 티어 T(T≤tierCount-1)의 하위 `slots(T)` 팀 → 티어 T+1
4. **최상위(1부)는 승격 없음, 최하위 티어는 강등 없음.**
5. **잔류 과반 가드**: 한 티어에서 `승격수 + 강등수 > floor(n(T)/2)` 이면 그 티어의
   승강 계산을 **skip 하고 어드민에게 경고를 표시**한다.
   - 예: 3팀 리그 → 1승격+1강등=2 > floor(3/2)=1 → skip. 중간 1팀만 잔류하는 상황 방지.
6. **정원 불일치는 허용한다.** 승격수와 강등수가 티어별로 다르면 다음 시즌 팀 수가
   변한다(예: 1부 12팀 강등3 + 2부 승격2 → 다음 1부 11팀). 고정 정원이 아니므로
   정상 동작이며, 어드민 확정 화면에 **"다음 시즌 예상 팀 수"** 를 티어별로 표시한다.
7. **시즌이 끝나지 않았으면 계산 불가** — 시즌의 티어 리그 중 `state !== 'completed'` 인
   것이 하나라도 있으면 409 `LEAGUE_SEASON_NOT_FINISHED`.
   ※ 2026-08-21 정정. 원래는 `pendingFixtures > 0` 이었는데, `pendingFixtures` 는
   **존재하는** 대진 중 미확정인 것만 세므로 대진이 아직 하나도 없는 리그(`draft`)나 전
   대진이 취소된 리그는 pending 이 0 이라 게이트를 그냥 통과했다. 그러면 전 팀 0승0무0패인
   순위표가 넘어가고 tie-break 가 모두 소진된 뒤 팀ID 사전순 폴백이 순위를 정한다 —
   **강등 팀이 UUID 사전순으로 뽑혔다**(alpha 실측 재현). Task 152 **D-3** 이 이미
   "취소 제외 전 대진 확정"을 뜻하는 상태를 만들어 두었으므로 그것을 그대로 쓴다.

## User Scenarios

1. **어드민 — 시리즈 개설**: 종목·지역·티어 수(1~3) 선택 → 시즌 1 생성 → 티어별로
   신청 팀을 수동 배정 → 각 리그 `active` 전환.
2. **어드민 — 시즌 마감**: 마지막 경기 확정 → "승강 후보 계산" → 티어별 승격/강등/잔류
   목록 + 경고(과반 가드 걸린 티어) 확인 → 불참 팀을 `withdrawn` 으로 조정 → 확정 →
   다음 시즌 리그 3개(티어별)와 `V1LeagueTeam` 자동 생성.
3. **팀 사용자 — 리그 탐색**: 리그 목록에서 "1부 / 2부 / 3부" 뱃지를 보고 자기 수준의
   리그를 확인한다. **신청 경로는 없다** — 참가 팀은 운영자가 지정한다
   (Task 152 **D-2**). 2026-08-21 정정: 이 항목은 원래 "자기 수준의 리그에 **신청**"이라고
   적혀 있었는데, 그건 D-2 가 확정한 "운영자 일방 지정 · 팀장 신청 절차 없음"과 정면으로
   충돌한다. 두 문서가 서로를 참조하지 않아 양쪽 다 "확정"으로 남아 있었다.
   **D-2 를 정본으로 채택**한다 — 신청을 넣으면 티어 배정의 의미(실력 기반 배치)가
   흐려지고, 마감 전까지 대진을 만들 수 없어 운영 리드타임이 늘며, 미달 리그 처리 정책이
   새로 필요해진다. 대신 D-2 가 그 대가로 약속한 **노출**을 실제로 완성해야 이 결정이
   성립한다(목록 티어 뱃지 · 리그 목록 진입점 · 팀 상세 "내 리그").
4. **팀 사용자 — 시즌 결과**: 시즌 종료 후 순위표에서 자기 팀 행에 "승격 / 강등 / 잔류"
   상태가 표시된다.

## Test Scenarios

### Happy
- 8팀 2부 리그 → `slots = ceil(1.6) = 2` → 상위 2팀 promoted
- 5팀 리그 → `slots = max(1, ceil(1.0)) = 1`
- 12팀 리그 → `slots = ceil(2.4) = 3`
- 확정 시 다음 시즌 `V1League` (seasonNo+1) 3개 + `V1LeagueTeam` 행 생성 확인

### Edge
- **3팀 티어**: 과반 가드 발동 → skip + 경고. 승강 0건.
- **tierCount=1 시리즈**: 승격·강등 모두 없음. 계산 결과 전원 `stayed`.
- **1부**: 승격 없음(상위 티어 부재). 강등만.
- **최하위 티어**: 강등 없음. 승격만.
- **동점 팀이 승강 경계에 걸침**: `calculateLeagueStandings` 의 tie-break 순서를
  그대로 따른다(별도 규칙 없음). tie-break 로도 갈리지 않으면 어드민 수동 결정.
- **`seriesId = null` 인 기존 리그**: 승강 API 호출 시 400 `LEAGUE_NOT_IN_SERIES`.

### Error
- `pendingFixtures > 0` 상태에서 계산 요청 → 409 `LEAGUE_SEASON_NOT_FINISHED`
- 이미 확정된 시즌 재확정 → 409 `PROMOTION_ALREADY_DECIDED` (멱등: 기존 결과 반환)
- 비-어드민 접근 → 403

### Mock updates
- `apps/v1_api` 테스트 픽스처에 `V1LeagueSeries` 팩토리 추가
- 기존 리그 픽스처는 `seriesId: null` 유지 — 하위호환 회귀 방지

## Parallel Work Breakdown

**순차 (선행)**
- S1. Prisma 스키마 + 마이그레이션 (`V1LeagueSeries`, `V1League` 3필드, `V1LeaguePromotion`)
  - 게이트: 게임 스키마 소스 스냅샷 해시 재핀 필요 여부 확인

**Backend ⟂**
- B1. `league-promotion.ts` — 순수 함수 `calculatePromotions()`. `calculateLeagueStandings`
      결과를 입력으로 받는다. **DB 접근 없음, 유닛 테스트 대상.**
- B2. 시리즈 CRUD API (`/admin/league-series`)
- B3. 승강 계산·확정 API (`POST /admin/league-series/:id/seasons/:no/promotions/preview`,
      `POST .../commit`)

**Frontend ⟂**
- F1. 어드민 — 시리즈 생성/티어 배정 화면
- F2. 어드민 — 승강 확정 화면 (승격/강등/잔류 목록 + 경고 + 다음 시즌 예상 팀 수)
- F3. 공개 — 리그 목록/상세에 "N부" 뱃지, 순위표에 승강 경계선 + 상태 표시

## Acceptance Criteria

- [ ] `calculatePromotions()` 유닛 테스트 통과 (위 Edge 케이스 전부)
- [ ] 기존 단발 리그(`seriesId=null`)의 모든 기존 테스트가 그대로 통과 (회귀 0)
- [ ] 마이그레이션 replay + drift gate 통과 (CI test job)
- [ ] 어드민 승강 확정 → 다음 시즌 리그/팀 생성까지 통합 테스트 1건
- [ ] UI 변경분 3폭 스크린샷 갤러리(📱390/📲768/🖥1440) PR 코멘트 게시
- [ ] tsc 0 / lint 0

## Tech Debt Resolved

- 없음(신규 기능). 단, `V1League` 를 "시즌×티어 인스턴스"로 재해석하므로
  스키마 주석(현재 1638~1642행)을 새 의미에 맞게 갱신한다 — 옛 주석을 남기지 않는다.

## Security Notes

- 시리즈 CRUD·승강 계산·확정 전부 `AdminGuard` 필수
- 승강 확정은 `decidedByAdminUserId` 기록 (감사 추적)
- `V1LeaguePromotion` `@@unique([fromLeagueId, teamId])` 로 중복 확정 차단
- 공개 API는 티어·순위만 노출. 어드민 배정 근거/메모는 노출하지 않음

## Risks & Dependencies

| 리스크 | 영향 | 완화 |
|---|---|---|
| **팀 유동성** — 승격팀이 다음 시즌 불참 | 상위 티어 붕괴 | 확정 전 어드민이 `withdrawn` 으로 조정 가능. 자동 확정 안 함 |
| **밀도 부족** — 지역/종목당 팀 수 미달 | 티어가 빈 껍데기 | `tierCount` 가변(1~3). 팀 부족 시 1티어로 운영 |
| **정원 불일치** | 다음 시즌 팀 수 변동 | 의도된 동작. 어드민 화면에 예상 팀 수 표시 |
| `V1League` 확장이 기존 리그 API 전반에 파급 | 회귀 | `seriesId` nullable + 기존 테스트 회귀 0 을 AC로 강제 |

## Ambiguity Log

| # | 질문 | 결정 | 근거 |
|---|---|---|---|
| 1 | 20% 반올림 vs 올림 | **올림(ceil)** | 사용자가 선택 시 본 프리뷰(12팀→3)와 일치. 2026-08-20 세션에서 정정 확정 |
| 2 | 승강 플레이오프(2부 3위 vs 1부 하위) | **미도입** | 범위 밖. 시즌 데이터 쌓인 뒤 재검토 |
| 3 | 자진 강등 허용 여부 | **미도입** | 어드민이 확정 화면에서 수동 조정하면 같은 효과. 별도 기능 불필요 |
| 4 | 티어 경계 동점 처리 | 기존 tie-break 순서 따름 | `calculateLeagueStandings` 재사용. 갈리지 않으면 어드민 수동 |


---

## 구현 완료 기록 (2026-08-20)

### 커밋
1. `feat(v1-league): 리그 티어·시즌·승강 스키마 확장` — schema.prisma + 마이그레이션
2. `feat(v1-league): 리그 승강 계산 + 시리즈 어드민 API` — 순수 함수 + 서비스 + 컨트롤러
3. `feat(v1-league): 리그 티어·승강 어드민 화면 + 공개 티어 뱃지` — 프론트 전체
4. `feat(v1-league): 어드민 내비게이션에 '리그 체계' 진입점 추가`

### 검증 결과
| 게이트 | 결과 |
|---|---|
| 백엔드 유닛 테스트 | 26건 통과 (`league-promotion.spec.ts`) |
| 프론트 테스트 | 15건 통과 (규칙 폼 10 + 확정 패널 5) |
| API tsc | 0 (격리 Prisma 클라이언트 기준) |
| 웹 tsc | 0 |
| v1 패턴 검사 | 통과 (합니다체 0 · 미정의 토큰 0) |
| expand-contract 게이트 | passed |
| 스키마 스냅샷 해시 | 재핀 완료 |

### 로컬 tsc 검증 방법 (이 저장소 특유)
공유 Prisma 클라이언트에는 `v1League` 모델이 아예 없다(리그 재명명 이후 generate 된 적이
없음). 그래서 `tsc` 를 그냥 돌리면 **내 변경과 무관하게** 127개 오류가 나고, 기존 파일도
똑같이 깨져 있어 baseline 과 구분이 안 된다.

`prisma generate` 는 생성물이 모노레포 전체 공유 경로에 쓰여 다른 세션을 깨뜨리므로 금지다.
대신 **generator `output` 을 scratchpad 로 고정한 스키마 사본**으로 격리 클라이언트를 만들고,
`paths` 로 `@prisma/client` 를 거기로 매핑한 임시 tsconfig 로 검사했다. 공유 클라이언트가
오염되지 않았음을 검사 전후로 확인했다(`grep -c "get v1League("` → 0 유지).

### 남은 것
- **시각 검증(3폭 스크린샷)**: 이 저장소는 로컬 next 서버 기동이 금지돼 있고 alpha 배포가
  ground truth다. dev 머지 → alpha 배포 후 📱390 / 📲768 / 🖥1440 갤러리를 PR 에 게시해야 한다.
- **통합 테스트**: preview → commit → 다음 시즌 생성 경로는 DB 가 필요해 CI 통합 테스트에서
  커버한다. 순수 함수(승강 계산)와 프론트 상태 전이는 유닛으로 이미 덮었다.
