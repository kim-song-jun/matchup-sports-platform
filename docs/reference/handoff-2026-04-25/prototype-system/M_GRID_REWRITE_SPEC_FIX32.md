# M-Grid Rewrite Spec (fix32)

**Mission**: m{NN}-grid 보드들을 해당 모듈의 canonical 디자인 visual vocabulary로 재작성한다. simplified illustration이 아니라 **canonical 컴포넌트의 직접 재사용 또는 동일한 시각 언어로 다각화**한다.

## Input — Read only

### 모든 agent가 참조하는 공통 자산
- `lib/tokens.jsx` — token 정의 (`var(--*)`, `tm-text-*` 등)
- `lib/signatures.jsx` — production primitives (`NumberDisplay`, `MoneyRow`, `KPIStat`, `StackedAvatars`, `WeatherStrip`, `Skeleton`, `SectionTitle`)
- `lib/data.jsx` — fixture 데이터 (MATCHES, TEAMS, LESSONS, VENUES, CHATS 등)
- `docs/reference/handoff-2026-04-25/prototype-system/CANONICAL_ID_MAP_FIX32.md` — 모듈별 alias 매핑표
- `docs/reference/handoff-2026-04-25/prototype-system/PROTOTYPE_ID_SCHEMA_FIX29.md` — ID schema 정의

### 모듈별 canonical reference (해당 agent만 자기 모듈 분 사용)
- M01 인증: `lib/screens-more.jsx` (Login), `lib/screens-other.jsx` (Onboarding), `lib/screens-readiness.jsx` (AuthStateEdgeBoard, AuthControlStatesBoard, AuthValidationAndPermissionBoard, AuthMotionContractBoard, MiniAuthLayout)
- M02 홈/추천: `lib/screens-hero.jsx` (HomeToss, ActivityToss), `lib/screens-match.jsx` (Home variant), `lib/screens-variants.jsx`, `lib/screens-refresh1.jsx`
- M03 개인 매치: `lib/screens-match.jsx` (MatchesList, MatchDetail, JoinSheet, MatchCreate, MatchCard, SportPill)
- M04 팀/팀매칭: `lib/screens-team.jsx` (TeamMatchesList, TeamMatchDetail, TeamDetail, TeamMatchCard, GradeBadge), `lib/screens-extras.jsx` (TeamMembers, TeamMatchHistory)
- M05 레슨: `lib/screens-team.jsx` (LessonsList, LessonCard), `lib/screens-deep.jsx` (LessonPass, LessonPassBuy), `lib/screens-v2main.jsx`, `lib/screens-v2main2.jsx`
- M06 장터: `lib/screens-other.jsx` (Marketplace, ListingCard), `lib/screens-v2main.jsx`, `lib/screens-deep.jsx`
- M07 시설: `lib/screens-other.jsx` (Venues, VenueCard), `lib/screens-v2main.jsx`, `lib/screens-v2main2.jsx`
- M08 용병: `lib/screens-hero.jsx` (refresh-merc 보드), `lib/screens-readiness-wave21*.jsx` (mercenary)
- M09 대회: `lib/screens-hero.jsx` (refresh-tourn 보드), `lib/screens-readiness-wave21a.jsx` (Tournaments*)
- M10 장비 대여: `lib/screens-deep.jsx` (EquipmentRental), `lib/screens-readiness-wave21a.jsx` (Rental*)
- M11 종목/실력: `lib/screens-sport.jsx` (Futsal/Basket/Tennis/Badminton/Hockey), `lib/screens-deep.jsx` (LevelCert per sport)
- M12 채팅/알림: `lib/screens-other.jsx` (Chat, ChatRoom, Notifications), `lib/screens-extras.jsx` (Feed, ChatEmbed), `lib/screens-hero.jsx` (refresh-chat)
- M13 마이/프로필: `lib/screens-my.jsx`, `lib/screens-other.jsx` (MyPage)
- M14 결제/환불/분쟁: `lib/screens-extras.jsx` (PaymentDetail, PaymentRefund), `lib/screens-hero.jsx` (WalletToss, refresh-pay), `lib/screens-readiness-wave21*.jsx`
- M15 설정/약관/상태: `lib/screens-ops.jsx` (SettingsAccount, SettingsNotifs, StatePages)
- M16 공개/마케팅: `lib/screens-extras.jsx` (Feed/landing 일부), `lib/screens-readiness*.jsx`
- M17 데스크탑 웹: `lib/screens-desktop.jsx`, `lib/screens-desktop2.jsx`
- M18 관리자/운영: `lib/screens-ops.jsx` (Admin*), `lib/screens-desktop.jsx` (AdminDashboard, AdminMatches, AdminUserDetail)
- M19 공통/모션: `lib/screens-system-foundation.jsx`, `lib/screens-extras.jsx`, `lib/screens-readiness.jsx` (Motion 보드들)

## Output — Edit only

각 agent는 **자기 모듈의 1개 파일만** 수정한다:
- `lib/screens-grid-m{NN}.jsx`

이 파일을 처음부터 다시 쓰는 게 아니라 **현재 파일의 export 이름(M{NN}MobileMain, M{NN}MobileStateLoading 등)을 유지하면서 내부 구현만 canonical visual vocabulary로 교체**한다.

## DO NOT TOUCH (병렬 충돌 방지)

- `Teameet Design.html` — 수정 절대 금지. 이 파일은 이미 fix32 cache buster로 갱신되어 있고 export 이름을 참조하므로 이름이 바뀌면 mount 실패.
- `lib/design-canvas.jsx`, `lib/tokens.jsx`, `lib/signatures.jsx`, `lib/data.jsx` — 절대 수정 금지 (다른 모든 모듈이 의존)
- 다른 모듈의 `lib/screens-grid-m??.jsx` — 자기 모듈만 수정
- `lib/screens-*.jsx` (canonical reference) — 절대 수정 금지. **읽기만**

## Visual vocabulary rules

1. **Canonical 컴포넌트 직접 재사용이 가장 권장**.
   - 예: `M02MobileMain` 본문은 가능한 한 `<HomeToss/>` 같은 canonical 컴포넌트를 직접 렌더링.
   - babel standalone single-scope이므로 import 없이 `HomeToss`, `MatchesList`, `TeamDetail` 같은 이름으로 바로 사용 가능.
2. **State variant 보드**는 canonical 컴포넌트의 wireframe을 살리고 데이터 영역만 변형.
   - `M02MobileStateLoading`: HomeToss 레이아웃을 base로, 헤더/탭/카드/list 자리를 `<Skeleton/>`으로 교체.
   - `M02MobileStateEmpty`: 같은 wireframe 위에 EmptyState 카피 + 부드러운 추천 카드.
   - `M02MobileStateError`: HomeToss 레이아웃 + retry CTA + 토스트.
   - `M02MobileStatePermission`: HomeToss 레이아웃 위 권한 요청 sheet (location/notification/camera 등 모듈에 적합한 권한).
   - `M02MobileStatePending`: HomeToss 레이아웃 + pending state badge + cooldown timer.
3. **Components 보드**는 해당 모듈에서 실제로 등장하는 production primitive와 canonical 컴포넌트를 인벤토리로 나열.
   - 예: M02 → SectionTitle, NumberDisplay, MoneyRow, KPIStat, sportCardAccent chip, weather strip
   - simplified illustration 금지. 실제 컴포넌트 인스턴스를 배치.
4. **Assets 보드**는 해당 모듈에서 실제로 사용되는 토큰 (color, type, spacing, motion) 발췌.
   - 예: M02 → blue-500, gray-150, gray-900, fs-2xl, lh-tight, space-4/8/12, ease-out-quart
   - 색상은 sportCardAccent 11종 모두 노출하는 게 아니라 그 모듈이 *실제로 사용하는* 색만.
5. **Motion 보드**는 해당 모듈의 micro-interaction 가이드.
   - 예: M02 → home pull-to-refresh, badge pulse, tap scale, FAB hover, sticky CTA reveal

## Token / 코드 규칙

- raw `#hex` literal 사용 금지. `var(--blue-500)` 식으로 token 사용.
- inline `fontSize: N` 사용 금지. `tm-text-{token}` class 사용 (`tm-text-2xs/xs/sm/base/lg/xl/2xl/3xl/4xl/5xl/6xl`).
- spacing은 4-multiple만 (`4/8/12/16/20/24/32/40/48/56/64`).
- 인터랙티브 요소는 최소 44x44px (`min-h-[44px]`) + `aria-label`.
- 모든 보드는 light-only. Admin sidebar (M18 일부)는 단독 dark exception (`tm-admin-sidebar` class).
- Babel standalone 단일 scope 주의: 같은 이름의 const 선언이 다른 파일에 있으면 충돌. 모듈별 prefix 사용 (M{NN}로 시작).

## ID schema

m-grid 보드 ID는 다음 schema를 따른다:
```
m{NN}-{viewport}-{kind}[-{state|sub}]

NN ∈ 01..19
viewport ∈ mb (375) | tb (768) | dt (1280)
kind ∈ main | list | detail | create | edit | state | flow | components | assets | motion
state (kind=state일 때) ∈ loading | empty | error | success | disabled | pending | sold-out | permission | deadline
```

기존 m{NN}-grid 섹션이 사용하는 보드 ID는 `Teameet Design.html` 안에 이미 정의되어 있고 jsx 컴포넌트 이름으로 mount된다. agent는 ID를 추가/변경하지 말고 **기존 ID와 export 이름만 그대로 유지하면서 내부 구현만 교체**한다.

## 최소 의무 grid (각 모듈 별 — 데스크탑/관리자 모듈은 viewport 차등 가능)

- **mb**: main + list/detail/create/flow (모듈에 적합한 것) + state{loading, empty, error, permission, pending} + components + assets
- **tb**: main + components + motion
- **dt**: main (모듈이 desktop도 가지면) + 그 외 optional
- **motion**: 모듈당 1개

기존 m{NN}-grid 섹션 안에 어떤 보드들이 있는지는 `Teameet Design.html`의 해당 섹션을 직접 확인 (line 311 근처부터 ~1668까지). 이미 있는 export만 재구현하고 새 ID를 추가하지 않는다.

## Self-validation 체크리스트 (PR 전)

각 agent는 작업 완료 시 아래를 self-check:

1. ✅ `lib/screens-grid-m{NN}.jsx` 만 수정됐는가? `git diff --stat`로 다른 파일 변경 없는지 확인
2. ✅ 기존 export 이름이 모두 유지되는가? `grep -E "^const M{NN}" lib/screens-grid-m{NN}.jsx` 출력이 변경 전과 동일한지 확인
3. ✅ raw `#hex` literal 0건? `grep -nE "#[0-9a-fA-F]{3,6}" lib/screens-grid-m{NN}.jsx` 결과 빈 (소셜 브랜드 색 #FEE500/#03C75A/#191919는 예외)
4. ✅ inline `fontSize:` 0건? `grep -nE "fontSize:\s*[0-9]" lib/screens-grid-m{NN}.jsx` 빈
5. ✅ canonical 컴포넌트 사용? grep으로 `HomeToss|MatchesList|TeamDetail|...` 모듈에 적합한 컴포넌트 1개 이상 등장
6. ✅ Babel parse 검증: `npx babel lib/screens-grid-m{NN}.jsx --presets=@babel/preset-env,@babel/preset-react > /dev/null 2>&1` (없으면 syntax check만)
7. ✅ simplified illustration 사용 금지 (예: 그냥 `<div>홈 화면</div>` 같은 placeholder는 안 됨)

## 보고 형식 (15줄 이내)

```
M{NN} rewrite report
- 파일: lib/screens-grid-m{NN}.jsx
- 수정된 export 수: N
- 사용한 canonical 컴포넌트: ['HomeToss', 'Skeleton', 'NumberDisplay', ...]
- raw hex 0건 / inline fontSize 0건 / spacing 4-multiple OK
- 기존 export 이름 모두 유지 (M{NN}MobileMain, M{NN}MobileStateLoading, ...)
- self-check 모두 통과
- TODO if any: ...
```

## Common pitfalls

- **export 이름 변경 시 mount 실패**: `Teameet Design.html`이 globally `M{NN}MobileMain` 같은 이름으로 mount하므로 절대 변경 금지. 새 컴포넌트 추가는 OK지만 기존 이름은 유지.
- **다른 모듈의 export와 이름 충돌**: M{NN} prefix 안 붙은 helper(`MoneyRow`, `Stat`, `Card`, `Header`)는 다른 모듈 jsx와 충돌. 반드시 `M{NN}MoneyRow`, `M{NN}Stat` 식으로 prefix.
- **canonical 컴포넌트의 props 무시**: HomeToss 등은 props 없는 자기완결 컴포넌트. 임의로 props 추가하지 말 것.
- **데이터 fixture 직접 정의 금지**: `data.jsx`의 MATCHES, TEAMS, LESSONS 등을 그대로 사용. 새 fixture 추가는 자기 jsx 안에서만, M{NN} prefix 사용.
