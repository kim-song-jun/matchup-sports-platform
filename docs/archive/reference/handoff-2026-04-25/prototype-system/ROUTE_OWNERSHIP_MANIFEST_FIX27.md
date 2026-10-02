# Route Ownership Manifest Fix27

`fix27`은 `apps/web/src/app`에 실제로 존재하는 `101`개 page route를 prototype의 `01~18`/`19` 모듈에 1:1로 고정한다. **개발팀은 이 표를 읽고 module owner와 PR 범위를 정한다.** 변동 없는 route는 `--`, future scope는 `future`, 개발팀 결정 필요는 `decide` 로 표기한다.

- Prototype: `http://127.0.0.1:8765/Teameet%20Design.html?v=20260425-fix27`
- Source root: `apps/web/src/app/**/page.tsx`
- Source route count: `101`
- Mapped to module: `91` (consumer + admin happy path)
- Future scope (구현 보류 또는 별도 wave): `4`
- Cross-module split (한 route가 여러 module에 영향): `6`

## Mapping Table

| # | Source route | Module | Wave | Notes |
|---|---|---|---|---|
| 1 | `/` | 16 · 공개·마케팅 | 5 | landing redirect or root → home if logged in |
| 2 | `/landing` | 16 · 공개·마케팅 | 5 | non-auth landing |
| 3 | `/about` | 16 · 공개·마케팅 | 5 | static legal/marketing |
| 4 | `/faq` | 16 · 공개·마케팅 | 5 | -- |
| 5 | `/guide` | 16 · 공개·마케팅 | 5 | -- |
| 6 | `/pricing` | 16 · 공개·마케팅 | 5 | -- |
| 7 | `/users/[id]` | 13 · 마이·프로필·평판 | 4 | public profile (non-auth viewable) |
| 8 | `/(auth)/login` | 01 · 인증·온보딩 | 2 | sanitizeRedirect 적용 |
| 9 | `/(auth)/callback/kakao` | 01 · 인증·온보딩 | 2 | OAuth callback states board |
| 10 | `/(auth)/callback/naver` | 01 · 인증·온보딩 | 2 | OAuth callback states board |
| 11 | `/(main)/onboarding` | 01 · 인증·온보딩 | 2 | 3-step + 환영 화면 |
| 12 | `/(main)/home` | 02 · 홈·추천 | 2 | bottom nav home |
| 13 | `/(main)/feed` | 12 · 커뮤니티·채팅·알림 | 4 | 활동 피드. `more`에서 진입 |
| 14 | `/(main)/matches` | 03 · 개인 매치 | 2 | bottom nav matches |
| 15 | `/(main)/matches/[id]` | 03 · 개인 매치 | 2 | sticky CTA + join sheet |
| 16 | `/(main)/matches/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity 보드 |
| 17 | `/(main)/matches/new` | 03 · 개인 매치 | 2 | form step shell |
| 18 | `/(main)/team-matches` | 04 · 팀·팀매칭 | 2 | host/applicant tab |
| 19 | `/(main)/team-matches/[id]` | 04 · 팀·팀매칭 | 2 | -- |
| 20 | `/(main)/team-matches/[id]/arrival` | 04 · 팀·팀매칭 | 2 | check-in 흐름 |
| 21 | `/(main)/team-matches/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity |
| 22 | `/(main)/team-matches/[id]/evaluate` | 04 · 팀·팀매칭 | 2 | 6항목 상호평가 |
| 23 | `/(main)/team-matches/[id]/score` | 04 · 팀·팀매칭 | 2 | 결과 입력 |
| 24 | `/(main)/team-matches/new` | 04 · 팀·팀매칭 | 2 | form step shell |
| 25 | `/(main)/teams` | 04 · 팀·팀매칭 | 2 | bottom nav teams (source canonical) |
| 26 | `/(main)/teams/[id]` | 04 · 팀·팀매칭 | 2 | -- |
| 27 | `/(main)/teams/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity |
| 28 | `/(main)/teams/[id]/matches` | 04 · 팀·팀매칭 | 2 | 팀 전용 하위 페이지 |
| 29 | `/(main)/teams/[id]/members` | 04 · 팀·팀매칭 | 2 | role/permission 표 |
| 30 | `/(main)/teams/[id]/mercenary` | 04 · 팀·팀매칭 + 08 · 용병 | 2/3 | cross-module: 팀 컨텍스트 / 용병 모집글 |
| 31 | `/(main)/teams/new` | 04 · 팀·팀매칭 | 2 | form step shell |
| 32 | `/(main)/lessons` | 05 · 레슨 Academy | 3 | Academy hub |
| 33 | `/(main)/lessons/[id]` | 05 · 레슨 Academy | 3 | -- |
| 34 | `/(main)/lessons/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity |
| 35 | `/(main)/lessons/new` | 05 · 레슨 Academy | 3 | form step shell |
| 36 | `/(main)/marketplace` | 06 · 장터 Marketplace | 3 | bottom nav marketplace |
| 37 | `/(main)/marketplace/[id]` | 06 · 장터 Marketplace | 3 | -- |
| 38 | `/(main)/marketplace/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity |
| 39 | `/(main)/marketplace/new` | 06 · 장터 Marketplace | 3 | form step shell |
| 40 | `/(main)/marketplace/orders/[id]` | 06 · 장터 Marketplace + 14 · 결제 | 3 | cross-module: order state machine |
| 41 | `/(main)/venues` | 07 · 시설 Venues | 3 | -- |
| 42 | `/(main)/venues/[id]` | 07 · 시설 Venues | 3 | -- |
| 43 | `/(main)/venues/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity |
| 44 | `/(main)/mercenary` | 08 · 용병 | 3 | -- |
| 45 | `/(main)/mercenary/[id]` | 08 · 용병 | 3 | -- |
| 46 | `/(main)/mercenary/[id]/edit` | 19 · 공통 플로우 | 3 | edit-flow parity |
| 47 | `/(main)/mercenary/new` | 08 · 용병 | 3 | form step shell |
| 48 | `/(main)/tournaments` | 09 · 대회 Tournaments | 3 | -- |
| 49 | `/(main)/tournaments/[id]` | 09 · 대회 Tournaments | 3 | -- |
| 50 | `/(main)/tournaments/new` | 09 · 대회 Tournaments | 3 | form step shell |
| 51 | `/(main)/chat` | 12 · 커뮤니티·채팅·알림 | 4 | -- |
| 52 | `/(main)/chat/[id]` | 12 · 커뮤니티·채팅·알림 | 4 | chat bubble system |
| 53 | `/(main)/notifications` | 12 · 커뮤니티·채팅·알림 | 4 | grouped notifications |
| 54 | `/(main)/badges` | 13 · 마이·프로필·평판 | 4 | -- |
| 55 | `/(main)/profile` | 13 · 마이·프로필·평판 | 4 | -- |
| 56 | `/(main)/reviews` | 13 · 마이·프로필·평판 | 4 | pending reviews + history |
| 57 | `/(main)/my/disputes` | 14 · 결제·환불·분쟁 | 4 | -- |
| 58 | `/(main)/my/disputes/[id]` | 14 · 결제·환불·분쟁 | 4 | dispute message thread |
| 59 | `/(main)/my/lesson-tickets` | 13 · 마이·프로필·평판 + 05 · 레슨 | 4 | cross-module: 사용자 ticket 인벤토리 |
| 60 | `/(main)/my/lessons` | 13 · 마이·프로필·평판 + 05 · 레슨 | 4 | cross-module: 내 강좌 |
| 61 | `/(main)/my/listings` | 13 · 마이·프로필·평판 + 06 · 장터 | 4 | cross-module: 내 판매글 |
| 62 | `/(main)/my/matches` | 13 · 마이·프로필·평판 | 4 | -- |
| 63 | `/(main)/my/mercenary` | 13 · 마이·프로필·평판 | 4 | 내 용병 모집/신청 |
| 64 | `/(main)/my/reviews-received` | 13 · 마이·프로필·평판 | 4 | 받은 리뷰 |
| 65 | `/(main)/my/team-match-applications` | 13 · 마이·프로필·평판 | 4 | -- |
| 66 | `/(main)/my/team-matches` | 13 · 마이·프로필·평판 | 4 | -- |
| 67 | `/(main)/my/teams` | 13 · 마이·프로필·평판 + 04 · 팀 | 4 | cross-module: 내 팀 |
| 68 | `/(main)/payments` | 14 · 결제·환불·분쟁 | 4 | grouped history shell |
| 69 | `/(main)/payments/[id]` | 14 · 결제·환불·분쟁 | 4 | -- |
| 70 | `/(main)/payments/[id]/refund` | 14 · 결제·환불·분쟁 | 4 | -- |
| 71 | `/(main)/payments/checkout` | 14 · 결제·환불·분쟁 | 4 | sticky CTA + 약관 |
| 72 | `/(main)/settings` | 15 · 설정·약관·상태 | 4 | -- |
| 73 | `/(main)/settings/account` | 15 · 설정·약관·상태 | 4 | -- |
| 74 | `/(main)/settings/notifications` | 15 · 설정·약관·상태 + 12 · 알림 | 4 | cross-module: 알림 선호도 |
| 75 | `/(main)/settings/privacy` | 15 · 설정·약관·상태 | 4 | source canonical = `/settings/privacy` (prototype `/privacy` consolidate 처리) |
| 76 | `/(main)/settings/terms` | 15 · 설정·약관·상태 | 4 | source canonical = `/settings/terms` |
| 77 | `/(main)/user/[id]` | 13 · 마이·프로필·평판 | 4 | logged-in 컨텍스트 사용자 프로필 |
| 78 | `/admin/dashboard` | 18 · 관리자·운영 | 5 | -- |
| 79 | `/admin/disputes` | 18 · 관리자·운영 | 5 | -- |
| 80 | `/admin/disputes/[id]` | 18 · 관리자·운영 | 5 | resolve modal |
| 81 | `/admin/lesson-tickets` | 18 · 관리자·운영 | 5 | hotspot file |
| 82 | `/admin/lessons` | 18 · 관리자·운영 | 5 | -- |
| 83 | `/admin/lessons/[id]` | 18 · 관리자·운영 | 5 | -- |
| 84 | `/admin/matches` | 18 · 관리자·운영 | 5 | -- |
| 85 | `/admin/matches/[id]` | 18 · 관리자·운영 | 5 | -- |
| 86 | `/admin/mercenary` | 18 · 관리자·운영 | 5 | -- |
| 87 | `/admin/ops` | 18 · 관리자·운영 | 5 | KPI summary + push failure table |
| 88 | `/admin/payments` | 18 · 관리자·운영 | 5 | -- |
| 89 | `/admin/payouts` | 18 · 관리자·운영 | 5 | payout batch builder |
| 90 | `/admin/reviews` | 18 · 관리자·운영 | 5 | -- |
| 91 | `/admin/settlements` | 18 · 관리자·운영 | 5 | -- |
| 92 | `/admin/statistics` | 18 · 관리자·운영 | 5 | hotspot file |
| 93 | `/admin/team-matches` | 18 · 관리자·운영 | 5 | -- |
| 94 | `/admin/team-matches/[id]` | 18 · 관리자·운영 | 5 | -- |
| 95 | `/admin/teams` | 18 · 관리자·운영 | 5 | -- |
| 96 | `/admin/teams/[id]` | 18 · 관리자·운영 | 5 | -- |
| 97 | `/admin/users` | 18 · 관리자·운영 | 5 | -- |
| 98 | `/admin/users/[id]` | 18 · 관리자·운영 | 5 | -- |
| 99 | `/admin/venues` | 18 · 관리자·운영 | 5 | -- |
| 100 | `/admin/venues/[id]` | 18 · 관리자·운영 | 5 | -- |
| 101 | `/admin/venues/new` | 18 · 관리자·운영 | 5 | form step shell |

## Cross-Module Routes

다음 6개 route는 owning module 외에 보조 module의 기준도 따라야 한다. PR 작성 시 각 cross module에 reviewer를 cc 한다.

| Route | Primary | Secondary | Why |
|---|---|---|---|
| `/teams/[id]/mercenary` | 04 · 팀 | 08 · 용병 | 팀 컨텍스트에서 용병 모집글 진입 |
| `/marketplace/orders/[id]` | 06 · 장터 | 14 · 결제 | order state machine + 에스크로 |
| `/my/lesson-tickets` | 13 · 마이 | 05 · 레슨 | 사용자 ticket 인벤토리 |
| `/my/lessons` | 13 · 마이 | 05 · 레슨 | 내 강좌 (학생/강사 동시 view) |
| `/my/listings` | 13 · 마이 | 06 · 장터 | 내 판매글 |
| `/my/teams` | 13 · 마이 | 04 · 팀 | 내 팀 (역할별 정렬) |
| `/settings/notifications` | 15 · 설정 | 12 · 알림 | preference 8개 boolean |

## Module Counts

| Module | Routes |
|---|---|
| 01 · 인증·온보딩 | 4 |
| 02 · 홈·추천 | 1 |
| 03 · 개인 매치 | 3 |
| 04 · 팀·팀매칭 | 11 |
| 05 · 레슨 Academy | 3 (+ 2 cross) |
| 06 · 장터 Marketplace | 4 (+ 2 cross) |
| 07 · 시설 Venues | 2 |
| 08 · 용병 | 3 (+ 1 cross) |
| 09 · 대회 Tournaments | 3 |
| 12 · 커뮤니티·채팅·알림 | 4 |
| 13 · 마이·프로필·평판 | 14 |
| 14 · 결제·환불·분쟁 | 6 |
| 15 · 설정·약관·상태 | 5 |
| 16 · 공개·마케팅 | 6 |
| 18 · 관리자·운영 | 24 |
| 19 · 공통 플로우 (edit-flow parity) | 6 |

`10 · 장비 대여`, `11 · 종목·실력·안전`, `17 · 데스크탑 웹` 모듈은 **현재 source에 single dedicated route 없음**. prototype의 readiness 보드는 future scope로 유지하고, source 도입 시 별도 wave로 추가한다.

## Future Scope (defer)

다음 항목은 prototype에는 보드가 있지만 source에 route가 없거나, 별도 task로 분리한다.

| Item | Source 상태 | Action |
|---|---|---|
| `/rentals/*` | 미구현 | future. `10 · 장비 대여` 보드는 직접 매핑 없는 reference로만 유지 |
| `/sports`, `/sports/[type]` | 미구현 | future. `11 · 종목·실력·안전` 도입 시 |
| `/profile/edit` | 미구현 (`/profile`에 인라인) | decide: 별도 route vs sheet |
| `/venues/[id]/schedule` | 미구현 | decide: detail 내 탭 vs 별도 route |
| `/admin/tournaments` | 미구현 | future. `09 · 대회 Tournaments` 운영 도구 |
| `/admin/reports` | 미구현 | future. ops alert + report 분리 시 |
| `/my` (root) | 미구현 (`/my/*` 하위만) | decide: my 허브 추가 vs `more` 메뉴로 흡수 |

## Route Alias Decisions

prototype 또는 reference 문서에 등장한 별칭은 다음과 같이 정리한다. **source가 truth**.

| Alias seen | Canonical (source) | Action |
|---|---|---|
| `/user/[id]` | `/users/[id]` (public) + `/user/[id]` (logged-in) | source가 두 개 모두 보유. prototype은 단일 board에 두 케이스 표기 |
| `/privacy` | `/settings/privacy` | prototype board는 settings 모듈 안에 `15`로 통합 |
| `/terms` | `/settings/terms` | 상동 |
| `/admin/reports`, `/admin/tournaments` | 미존재 | prototype future board 표시. source 추가 전까지 점선 |

## Migration Order Summary

1. **Wave 2 (mobile core)** — `01`, `02`, `03`, `04` 모듈 routes 19개 → 30개 (cross 포함)
2. **Wave 3 (commerce/booking)** — `05`, `06`, `07`, `08`, `09` 모듈 routes 19개
3. **Wave 4 (account/community/payment/settings)** — `12`, `13`, `14`, `15` 모듈 routes 29개
4. **Wave 5 (public/admin)** — `16`, `18` 모듈 routes 30개
5. **Future** — `10`, `11`, `17` + future scope 7건

## Acceptance

- [ ] 101개 source route가 manifest에 모두 등장한다.
- [ ] cross-module route는 primary/secondary가 명시되어 있다.
- [ ] future scope route는 manifest에 reasoning과 함께 등장한다.
- [ ] PR 리뷰어가 module owner를 manifest에서 찾을 수 있다.
- [ ] manifest 변경은 production source change와 같은 PR이 아닌, **이 prototype-system 문서**에서 먼저 일어난다.
