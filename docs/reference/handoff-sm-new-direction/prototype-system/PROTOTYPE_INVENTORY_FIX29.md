# Prototype Inventory Fix29

`fix29`는 prototype의 19 functional 모듈 × 3 viewport × kind/state/asset matrix를 한 표로 정리한다. **POC = M01·M02만 새 ID schema 풀 grid 생성**, 나머지 M03~M19는 기존 보드 ID 매핑 + obligation gap 식별만 한다.

- ID schema: `PROTOTYPE_ID_SCHEMA_FIX29.md`
- POC 신규 보드: `lib/screens-grid-m01.jsx`, `lib/screens-grid-m02.jsx`
- POC 추가 섹션: `00o · 모듈 인벤토리 IA`

## Module → Section 매핑

| ID | Module | Prototype section id | 기존 보드 수 |
|---|---|---|---|
| M01 | 인증·온보딩 | `auth-onboarding` | 12 (mb 10, tb 1, dt 1) |
| M02 | 홈·추천 | `home-discovery` | 13 (mb 11, tb 1, dt 1) |
| M03 | 개인 매치 | `matches-core` | 16 (mb 14, tb 1, dt 1) |
| M04 | 팀·팀매칭 | `teams-team-matches` | 24 (mb 21, tb 2, dt 1) |
| M05 | 레슨 Academy | `lessons` | 19 (mb 14, tb 2, dt 3) |
| M06 | 장터 Marketplace | `marketplace` | 16 (mb 13, tb 1, dt 2) |
| M07 | 시설 Venues | `venues` | 16 (mb 12, tb 1, dt 3) |
| M08 | 용병 Mercenary | `mercenary` | 11 (mb 9, tb 1, dt 1) |
| M09 | 대회 Tournaments | `tournaments` | 12 (mb 9, tb 1, dt 2) |
| M10 | 장비 대여 | `equipment-rental` | 11 (mb 9, tb 1, dt 1) |
| M11 | 종목·실력·안전 | `sports-level-safety` | 21 (mb 19, tb 1, dt 1) |
| M12 | 커뮤니티·채팅·알림 | `community` | 13 (mb 11, tb 1, dt 1) |
| M13 | 마이·프로필·평판 | `my-profile-trust` | 15 (mb 13, tb 1, dt 1) |
| M14 | 결제·환불·분쟁 | `payments-support` | 15 (mb 12, tb 1, dt 2) |
| M15 | 설정·약관·상태 | `settings-states` | 14 (mb 12, tb 1, dt 1) |
| M16 | 공개·마케팅 | `public-marketing` | 13 (mb 11, tb 1, dt 1) |
| M17 | 데스크탑 웹 | `desktop-web` | 12 (mb 0, tb 1, dt 11) |
| M18 | 관리자·운영 | `admin-ops` | 21 (mb 0, tb 1, dt 20) |
| M19 | 공통 플로우·인터랙션 | `common-flows-motion` | 7 (mb 4, tb 1, dt 2) |

## Obligation Matrix per Module (POC + audit)

Revision note:

- `handoff-sm-new-direction` adds a comparison-only section `matches-core-cardnews-compact` directly under the original `03 개인 매치` section. It does not replace the original `matches-core` inventory row. The new decision board is `m-list-cardnews-compact` with canonical alias `m03-mb-flow-cardnews-compact`; copied comparison boards use `*-revised-ref` ids and `data-reference-canonical-id` to avoid duplicate canonical aliases.
- The next comparison section `matches-core-card-compact-switcher` supersedes the simultaneous-exposure direction for review purposes. It keeps card and compact as selectable modes in one first screen, excludes map/timeline/swipe boards, and adds `m-list-card-compact-switcher` with canonical alias `m03-mb-flow-card-compact-switcher`.

`✅` = 보드 존재 / `⚠️` = obligation gap (신규 추가 필요) / `—` = 의도된 비대상

| Module | mb-main | tb-main | dt-main | mb-states (5+) | tb-states | dt-states | mb-components | tb-components | dt-components | mb-assets | tb-assets | dt-assets | mb-motion |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| M01 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M02 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M03 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M04 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M05 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M06 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M07 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M08 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M09 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M10 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M11 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M12 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M13 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M14 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M15 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M16 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| M17 | — | ✅ | ✅ | — | ⚠️ | ✅ | — | ⚠️ | ⚠️ | — | ⚠️ | ⚠️ | ✅ |
| M18 | — | ✅ | ✅ | — | ⚠️ | ✅ | — | ⚠️ | ⚠️ | — | ⚠️ | ⚠️ | ✅ |
| M19 | ✅ | ✅ | ✅ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ✅ |

요약:

- `mb-main` / `tb-main` / `dt-main` / `mb-states` / `mb-motion`은 거의 모든 모듈이 채움 (기존 readiness wave 결과).
- `tb-states` / `dt-states` / `*-components` / `*-assets`는 19 모듈 × 3 viewport × 4 kind = **228개 obligation gap**.
- 그러나 **POC는 M01·M02 두 모듈만 진행**. M01 + M02 = 약 30개 신규 보드.

## POC 1차 신규 보드 (M01 + M02)

### M01 인증·온보딩 (`screens-grid-m01.jsx`)

| 새 ID | kind | 의무 | 신규/alias |
|---|---|---|---|
| `m01-mb-main` | login + onboarding step 1~3 + welcome | 의무 | alias of `login` + `ob-*` |
| `m01-tb-main` | tablet 변형 | 의무 | 신규 |
| `m01-dt-main` | desktop 변형 (admin login + 일반 login) | 의무 | alias of 기존 desktop login |
| `m01-mb-state-loading` | OAuth callback loading | 의무 | alias |
| `m01-mb-state-error` | 인증 실패 | 의무 | alias |
| `m01-mb-state-permission` | 카메라/알림 권한 거부 | 의무 | alias |
| `m01-mb-components` | Button/Input/SocialBtn/Stepper variant | 의무 | 신규 |
| `m01-tb-components` | tablet variant | 의무 | 신규 |
| `m01-dt-components` | desktop variant | 의무 | 신규 |
| `m01-mb-assets` | 사용 토큰/색/타이포/아이콘 | 의무 | 신규 |
| `m01-tb-assets` | tablet 변형 | 의무 | 신규 |
| `m01-dt-assets` | desktop 변형 | 의무 | 신규 |
| `m01-mb-motion` | tap/sheet/skeleton motion | 의무 | alias |

→ **신규 9개 + alias 4개**.

### M02 홈·추천 (`screens-grid-m02.jsx`)

| 새 ID | kind | 의무 | 신규/alias |
|---|---|---|---|
| `m02-mb-main` | 홈 메인 | 의무 | alias of `home` |
| `m02-tb-main` | tablet 메인 | 의무 | alias of `home-tablet` |
| `m02-dt-main` | desktop 메인 | 의무 | alias of `home-desktop` |
| `m02-mb-state-loading` | 홈 skeleton | 의무 | alias |
| `m02-mb-state-empty` | 추천 0건 | 의무 | alias |
| `m02-mb-state-error` | 추천 fetch 실패 | 의무 | alias |
| `m02-mb-state-permission` | 위치 권한 거부 | 의무 | alias |
| `m02-mb-state-pending` | 추천 stale | 의무 | 신규 |
| `m02-mb-components` | Card/HapticChip/StackedAvatars/WeatherStrip variant | 의무 | 신규 |
| `m02-tb-components` | tablet variant | 의무 | 신규 |
| `m02-dt-components` | desktop variant | 의무 | 신규 |
| `m02-mb-assets` | 사용 토큰/색/타이포/아이콘/sportCardAccent | 의무 | 신규 |
| `m02-tb-assets` | tablet | 의무 | 신규 |
| `m02-dt-assets` | desktop | 의무 | 신규 |
| `m02-mb-motion` | scroll motion / hint | 의무 | alias |

→ **신규 8개 + alias 7개**.

**1차 POC 신규 보드 합**: M01 9 + M02 8 = **17 신규 보드**.

## 후속 Wave 계획

| Wave | 모듈 | 신규 보드 (실제) | 상태 |
|---|---|---|---|
| **POC** (fix29) | M01 + M02 | 28 | ✅ 완료 |
| Wave A (fix30) | M03·M04·M05 | 46 | ✅ 완료 |
| Wave B (fix30) | M06·M07·M08·M09 | 57 | ✅ 완료 |
| Wave C (fix30) | M10·M11·M12·M13 | 55 | ✅ 완료 |
| Wave D (fix30) | M14·M15·M16 | 43 | ✅ 완료 |
| Wave E (fix30) | M17·M18·M19 | 41 | ✅ 완료 |

**전체 합산: 270 m-grid 보드** (POC 28 + wave A~E 242). 실제 fix30 = 601 artboards. 모든 19 모듈에 풀 grid 완비.

## 후속 Wave 진입 조건

POC (M01·M02) 완료 후 다음 검증 통과 시 wave A 진입:

1. ID schema 검증 통과 (audit script `idSchemaViolations` = 0)
2. design 팀 검토 (M01·M02 grid 시각 검증)
3. 사용자 OK
