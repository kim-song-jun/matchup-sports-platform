# Bottom Nav Contract Fix27

`fix27`은 prototype과 production source의 bottom navigation contract를 **단 하나의 canonical 5-tab 정의**로 고정한다.

## Conflict

| | Prototype (until fix26) | Source (`apps/web`) |
|---|---|---|
| Tab 1 | `home` | `home` |
| Tab 2 | `matches` | `matches` |
| Tab 3 | **`lessons`** | **`teams`** |
| Tab 4 | `marketplace` | `marketplace` |
| Tab 5 | **`my`** (마이) | **`more`** (더보기) |
| Tab 5 사용 | 마이페이지 + 일부 메뉴 | 메뉴 시트 (lessons / tournaments / venues / chat / notifications / badges / team-matches / mercenary / profile / settings) |

prototype의 `lessons`는 Academy를 강조한 디자인 결정이었지만, **source에서 lessons는 4 routes에 그치고 marketplace/teams보다 traffic가 낮다**. 반면 `teams`는 11 routes(개인 매치 다음으로 큰 도메인)이고, 매칭 흐름의 한 축이다. `my`는 사용자 컨텍스트와 메뉴를 동시에 담아 IA 충돌을 만든다.

## Decision

**Canonical = source의 5 tab.**

| Slot | id | label | href | icon (lucide) | Active rule |
|---|---|---|---|---|---|
| 1 | `home` | 홈 | `/home` | `Home` | `pathname.startsWith('/home')` |
| 2 | `matches` | 매치 | `/matches` | `Search` | `pathname.startsWith('/matches')` (`/team-matches`는 제외) |
| 3 | `teams` | 팀 | `/teams` | `Users` | `pathname.startsWith('/teams')` |
| 4 | `marketplace` | 장터 | `/marketplace` | `ShoppingBag` | `pathname.startsWith('/marketplace')` |
| 5 | `more` | 더보기 | sheet (no href) | `LayoutGrid` | sheet 열림 OR `MORE_PATHS` 중 일치 |

**More 시트 항목 (4개 그룹, 9 + ext)**:

- **matching**: `/team-matches`, `/mercenary`
- **explore**: `/lessons`, `/tournaments`, `/venues`
- **communication** (auth-only): `/chat`, `/notifications`
- **activity**: `/badges`
- **service**: `/settings`

profile 진입은 시트 상단 사용자 row에서 직접 `/profile`로.

### 왜 source 정의를 채택하는가

1. **Source는 production traffic을 이미 갖는다.** 11개 teams routes를 third-tier로 내리면 회귀가 크다.
2. **`/lessons`는 더 작다 (4 routes).** more 메뉴에 두면 충분하고, Academy hub는 detail 페이지 안에서 강조 가능.
3. **`my`는 IA 모호함을 만든다.** profile vs more vs my 페이지가 셋 다 등장. source의 `more` 시트가 더 깔끔한 분리.
4. **재구현 비용이 가장 낮다.** prototype 수렴이 source rebuild보다 작다.

## Variant Preservation Rule

> 사용자 지시: **기존 variant는 삭제하지 말고 모두 살려라.**

prototype에 이미 존재하는 `lessons`/`my` variant는 다음 규정으로 보존한다.

1. `lib/tokens.jsx`의 `GLOBAL_BOTTOM_TABS`는 `home/matches/teams/marketplace/more`로 갱신한다.
2. `normalizeNavId`는 다음 별칭을 추가해 **legacy variant가 그대로 렌더된다**:
   - `lesson | lessons → more`
   - `lesson_tab → more`
   - `my | mypage → more`
   - `match → matches`
   - `venue | venues → more`
   - `market → marketplace`
   - `team_match → teams`
3. legacy `lessons`/`my` variant artboard는 prototype에 그대로 남는다 — `more` icon으로 정렬되지만 캡션에 `legacy` 표기를 유지한다.
4. 신규 board는 모두 canonical 5 tab 기준으로 그린다.

## Migration Delta from Source

source 자체는 이미 canonical이라 변경 없음. 다만 다음 보완은 별도 task로 진행한다 (이 PR은 prototype에서만):

- [ ] `/lessons`, `/tournaments`, `/venues` 등 more 시트 항목 active 상태에서 bottom-nav `more` icon이 `bg-blue-500/10` 강조 안 되는 케이스 (현재는 시트 내부 active만)
- [ ] more 시트 sticky CTA 충돌 (시트 열려있을 때 sticky 모달 z-index)
- [ ] 종목 종류별 home banner와 bottom nav 색상 합산 보정 (sportCardAccent 컬러가 진할 때)

## Active State Rule

| State | Visual |
|---|---|
| active | icon stroke 2 + label `text-blue-500 dark:text-blue-400` + `aria-current="page"` |
| inactive | icon stroke 1.5 + label `text-gray-400 dark:text-gray-500` |
| more, sheet open | active treatment (sheet open OR pathname matches MORE_PATHS) |
| more, unread badge | red dot + count `99+` cap |

## Hidden / Suppressed States

bottom nav는 다음 경로에서 **숨긴다** (source 기존 규칙 유지):

- `/matches/new`
- `/teams/new`
- `/mercenary/new`
- `/lessons/new`

이유: full-bleed form step shell. sticky CTA가 nav와 충돌.

prototype에도 같은 규칙을 표기하고, form step shell board 캡션에 `bottom nav suppressed` 명시.

## Acceptance

- [ ] prototype `GLOBAL_BOTTOM_TABS` 가 `home/matches/teams/marketplace/more`로 정의된다.
- [ ] `normalizeNavId`가 legacy `lessons`/`my`를 `more`/`teams`로 매핑한다.
- [ ] legacy variant artboard는 캡션에 `legacy` 표기 후 보존된다.
- [ ] 신규 `00m` 보드(BottomNavContractBoard)가 source canonical과 prototype 변경을 같은 그림에 보여준다.
- [ ] form step shell들은 bottom nav suppressed 상태 표기.
