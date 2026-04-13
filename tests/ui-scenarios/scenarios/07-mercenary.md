# 07-mercenary — Mercenary (Substitute Player) Scenarios

> **Target pages**: `/mercenary`, `/mercenary/new`, `/mercenary/[id]`, `/mercenary/[id]/edit`
> **Total scenarios**: 25
> **Viewports**: D1~D3(Desktop) · T1~T3(Tablet) · M1~M3(Mobile) — 9 viewports

---

## A. List Page (`/mercenary`)

---

### SC-07-001: List page initial load (no filter)

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | Mercenary posts exist in DB |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | Page loads with MobilePageTopZone ("용병 모집"), sport filter chips, post list | `SC-07-001-S01` |
| 2 | `scroll(down 200px)` | Additional cards visible, stagger animation plays | `SC-07-001-S02` |
| 3 | Verify count text | "N개의 모집글" text matches visible card count | `SC-07-001-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | MobilePageTopZone renders title "용병 모집" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Sport filter chip bar horizontally scrollable | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V3 | "전체" chip active (blue-500) by default | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | UserPlus FAB button (blue-500) top-right | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | "내 모집/신청" link visible | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Cards 2-column grid on @3xl | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V7 | Cards single-column stack on mobile | — | — | — | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | Bottom nav floating pill bar visible | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V9 | Dark mode: card bg-gray-800, text contrast 4.5:1 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-002: Sport filter — single sport selection

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | Posts exist for multiple sport types |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | All posts shown, "전체" chip active | `SC-07-002-S01` |
| 2 | `click("풋살" chip)` | Only futsal posts visible, chip turns blue-500, count updates | `SC-07-002-S02` |
| 3 | `click("농구" chip)` | Only basketball posts visible, "풋살" chip deactivated | `SC-07-002-S03` |
| 4 | `click("전체" chip)` | All posts restored | `SC-07-002-S04` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Active chip: bg-blue-500 text-white | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Inactive chip: border-gray-100 bg-gray-50 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Count text "N개의 모집글" updates per filter | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | All 12 chips visible (전체 + 11 sports) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Chip min-h 44px touch target | — | — | — | — | — | — | ☐ | ☐ | ☐ |

---

### SC-07-003: Sport filter — all 11 sports cycle

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | Posts exist for all 11 sport types |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | All posts shown | `SC-07-003-S01` |
| 2 | `click("축구" chip)` | Soccer posts only, sport badge on cards shows "축구" | `SC-07-003-S02` |
| 3 | `click("배드민턴" chip)` | Badminton posts only | `SC-07-003-S03` |
| 4 | `click("아이스하키" chip)` | Ice hockey posts only | `SC-07-003-S04` |
| 5 | `click("피겨" chip)` | Figure skating posts only | `SC-07-003-S05` |
| 6 | `click("쇼트트랙" chip)` | Short track posts only | `SC-07-003-S06` |
| 7 | `click("수영" chip)` | Swimming posts only | `SC-07-003-S07` |
| 8 | `click("테니스" chip)` | Tennis posts only | `SC-07-003-S08` |
| 9 | `click("야구" chip)` | Baseball posts only | `SC-07-003-S09` |
| 10 | `click("배구" chip)` | Volleyball posts only | `SC-07-003-S10` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Each sport card badge uses sportCardAccent color | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Filtered results match selected sport type | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Chip bar scroll shows rightmost sports on mobile | — | — | — | — | — | — | ☐ | ☐ | ☐ |

---

### SC-07-004: Empty state — no posts for filtered sport

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | No posts for "피겨" sport type |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | Page loads with posts | `SC-07-004-S01` |
| 2 | `click("피겨" chip)` | EmptyState: "피겨 용병 모집이 없어요" with Search icon | `SC-07-004-S02` |
| 3 | Verify CTA | "용병 모집하기" link points to `/mercenary/new` | `SC-07-004-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | EmptyState component rendered (not inline empty) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Sport-specific empty message includes sport name | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "용병 모집하기" action button navigates correctly | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-005: Empty state — no posts at all

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | Zero mercenary posts in DB |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | "0개의 모집글" text, EmptyState: "아직 등록된 용병 모집이 없어요" | `SC-07-005-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Generic empty message (no sport name) shown | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | CTA "용병 모집하기" href=/mercenary/new | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-006: Loading skeleton state

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | Slow network / initial load |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | 3 skeleton cards with animate-pulse shown | `SC-07-006-S01` |
| 2 | `wait(2000)` | Skeletons replaced by actual cards | `SC-07-006-S02` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | 3 skeleton cards with pulse animation | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Skeleton card has rounded-xl border | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-007: Error state with retry

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | API returns error |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` (API error) | ErrorState: "용병 모집 목록을 불러오지 못했어요" with retry button | `SC-07-007-S01` |
| 2 | `click("다시 시도" button)` | refetch() triggered, data loads | `SC-07-007-S02` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | ErrorState component rendered | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Retry button functional | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-008: MercenaryCard content verification

| Item | Value |
|------|-------|
| **URL** | `/mercenary` |
| **Auth** | all |
| **Precondition** | Open post: futsal, GK, level 3, fee 10000, 2 applicants |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary)` | Card shows: sport badge (풋살), status badge (모집중), position (골키퍼), team name, date, venue, level, fee, applicant count | `SC-07-008-S01` |
| 2 | Verify card badges | Sport badge uses sportCardAccent, status "모집중" bg-emerald-50 | `SC-07-008-S02` |
| 3 | Verify fee display | Fee "10,000원" in gray-800, free posts show green "무료" | `SC-07-008-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Sport badge color matches sportCardAccent | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Status badge: open=emerald, filled=blue, closed=gray | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Team manner score star icon + value | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "모집 N명 / 신청 N명" at card bottom | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Card active:scale-[0.98] press feedback | — | — | — | — | — | — | ☐ | ☐ | ☐ |
| V6 | Card links to `/mercenary/{id}` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## B. Create Page (`/mercenary/new`)

---

### SC-07-009: Create page — no teams (guard)

| Item | Value |
|------|-------|
| **URL** | `/mercenary/new` |
| **Auth** | logged-in, no team membership |
| **Precondition** | User has no teams |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/new)` | EmptyState: "팀을 먼저 만들어주세요", CTA "팀 만들기" -> /teams/new | `SC-07-009-S01` |
| 2 | `click("뒤로 가기" button)` | router.back() triggered | `SC-07-009-S02` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | EmptyState with Users icon | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "팀 만들기" CTA links to /teams/new | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Back button min-h 44px | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-010: Create page — unauthenticated redirect

| Item | Value |
|------|-------|
| **URL** | `/mercenary/new` |
| **Auth** | not logged in |
| **Precondition** | useRequireAuth redirects |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/new)` | Redirect to /login?redirect=/mercenary/new | `SC-07-010-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Redirect occurs before form render | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Redirect URL includes return path | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-011: Create page — full form happy path

| Item | Value |
|------|-------|
| **URL** | `/mercenary/new` |
| **Auth** | logged-in, has team(s) |
| **Precondition** | User has at least one team |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/new)` | Form loads: team select, date, venue, position, count, level, fee, notes | `SC-07-011-S01` |
| 2 | `select(팀 선택, "FC 테스트")` | Team info card appears with sportCardAccent tint, sport badge auto-set | `SC-07-011-S02` |
| 3 | `type(경기 날짜 input, "2026-05-01")` | Date field populated | `SC-07-011-S03` |
| 4 | `type(장소 input, "난지천 풋살장 A")` | Venue field populated | `SC-07-011-S04` |
| 5 | `click("골키퍼 (GK)" button)` | GK position selected (blue-500) | `SC-07-011-S05` |
| 6 | `click("3명" button)` | Count set to 3 (blue-500) | `SC-07-011-S06` |
| 7 | `click("상급" button)` | Level set to 4 (blue-500) | `SC-07-011-S07` |
| 8 | `type(참가비 input, "15000")` | Fee shows "15,000원" below | `SC-07-011-S08` |
| 9 | `type(요청사항 textarea, "흰색 유니폼 지참")` | Notes field populated | `SC-07-011-S09` |
| 10 | `click("상세로 등록하기" button)` | Spinner appears, toast "용병 모집글이 등록되었어요", redirect to /mercenary/{id} | `SC-07-011-S10` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Team select dropdown lists user's teams | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Team info card shows sportCardAccent tint | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "종목은 팀 정보 기준으로 자동 고정됩니다" text shown | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Position buttons: selected=blue-500, unselected=border-gray-200 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Count buttons: 1~5, equal width (flex-1) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Level buttons: 입문/초급/중급/상급/고수 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | Fee "0" shows formatCurrency "무료" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | Submit button disabled until required fields filled | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V9 | Submit button shows spinner during mutation | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V10 | Success toast appears | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V11 | Desktop breadcrumb "용병 모집 > 새 모집글" visible | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V12 | All input min-h 44px touch targets | — | — | — | — | — | — | ☐ | ☐ | ☐ |

---

### SC-07-012: Create page — teamId from query param

| Item | Value |
|------|-------|
| **URL** | `/mercenary/new?teamId={teamId}` |
| **Auth** | logged-in, team member |
| **Precondition** | Valid teamId in query string |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/new?teamId=abc123)` | Team auto-selected in dropdown, team info card visible | `SC-07-012-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Team pre-selected from query param | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Invalid teamId ignored (falls back to empty) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-013: Create page — submit validation (missing required fields)

| Item | Value |
|------|-------|
| **URL** | `/mercenary/new` |
| **Auth** | logged-in, has team(s) |
| **Precondition** | None |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/new)` | Submit button disabled (opacity-40) | `SC-07-013-S01` |
| 2 | `select(팀 선택, "FC 테스트")` | Submit still disabled (date, venue, position missing) | `SC-07-013-S02` |
| 3 | `type(경기 날짜, "2026-05-01")` | Submit still disabled | `SC-07-013-S03` |
| 4 | `type(장소, "강남 풋살파크")` | Submit still disabled (position missing) | `SC-07-013-S04` |
| 5 | `click("포지션 무관" button)` | Submit enabled (all required: team, date, venue, position) | `SC-07-013-S05` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Submit disabled when any required field empty | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Submit enabled when all required fields filled | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Disabled button cursor-not-allowed | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-014: Create page — API error on submit

| Item | Value |
|------|-------|
| **URL** | `/mercenary/new` |
| **Auth** | logged-in, has team(s) |
| **Precondition** | API returns error on POST /mercenary |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | Fill all required fields | Submit button enabled | `SC-07-014-S01` |
| 2 | `click("상세로 등록하기" button)` | Error toast: "등록에 실패했어요. 잠시 후 다시 시도해주세요" | `SC-07-014-S02` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Error toast shown (not alert()) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Form data preserved after error | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Submit button re-enabled after error | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## C. Detail Page (`/mercenary/[id]`)

---

### SC-07-015: Detail page — visitor view (can apply)

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | logged-in, not author, not team member |
| **Precondition** | Post status=open, user has not applied |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | Detail page: sport badge, position, status "모집중", team name, date, venue, info table (count/applicants/position/level/fee), notes, author section | `SC-07-015-S01` |
| 2 | Verify bottom CTA | "신청하기" button (blue-500), fixed bottom bar | `SC-07-015-S02` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | MobileGlassHeader with back button + "용병 모집" title | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Sport badge uses sportCardAccent | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Info table: 5 rows (count, applicants, position, level, fee) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Fee 0 -> green "무료" text | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Author avatar (first char of nickname) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Fixed bottom bar with CTA button | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | Desktop breadcrumb visible | ☐ | ☐ | ☐ | — | — | — | — | — | — |
| V8 | Dark mode: bg-gray-900, cards bg-gray-800 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-016: Detail page — apply for mercenary

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | logged-in, eligible applicant |
| **Precondition** | Post open, user can apply |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | "신청하기" button visible at bottom | `SC-07-016-S01` |
| 2 | `click("신청하기" button)` | Button shows "신청 중...", then toast "용병 신청이 완료되었어요" | `SC-07-016-S02` |
| 3 | Verify post-apply state | "내 신청 상태" section visible with "대기 중" badge (amber), bottom CTA changes to "신청 취소" | `SC-07-016-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Success toast shown | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "내 신청 상태" section appears with pending badge | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Bottom CTA switches to "신청 취소" (red border) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-017: Detail page — withdraw application

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | logged-in, has pending application |
| **Precondition** | User already applied, status=pending |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | Bottom CTA shows "신청 취소" (red border) | `SC-07-017-S01` |
| 2 | `click("신청 취소" button)` | "취소 중..." loading, then toast "신청을 취소했어요" | `SC-07-017-S02` |
| 3 | Verify post-withdraw | "내 신청 상태" section removed, bottom CTA reverts to "신청하기" | `SC-07-017-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Withdraw loading state shown | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Success toast after withdraw | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | CTA reverts to "신청하기" after withdraw | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-018: Detail page — unauthenticated visitor apply redirect

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | not logged in |
| **Precondition** | Post open |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | "로그인 후 신청" or "신청하기" button at bottom | `SC-07-018-S01` |
| 2 | `click(bottom CTA)` | Redirect to `/login?redirect=/mercenary/{id}` | `SC-07-018-S02` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Login redirect includes return path | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No console errors on unauthenticated view | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-019: Detail page — author view (manage applications)

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | post author or team manager |
| **Precondition** | Post has 2 applications (1 pending, 1 accepted) |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | "지원 목록" section visible with application cards | `SC-07-019-S01` |
| 2 | Verify pending application card | Nickname, "대기 중" amber badge, "승인"/"거절" buttons | `SC-07-019-S02` |
| 3 | Verify accepted application card | Nickname, "승인됨" emerald badge, no action buttons | `SC-07-019-S03` |
| 4 | Verify bottom bar | "수정" + "삭제" buttons (not apply button) | `SC-07-019-S04` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | "지원 목록" section rendered for author | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Pending: amber badge + 승인/거절 buttons | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Accepted: emerald badge, no action buttons | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Rejected: red badge, no action buttons | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Bottom bar: "수정" (border) + "삭제" (red border) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | "수정" links to /mercenary/{id}/edit | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-020: Detail page — accept application

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | post author |
| **Precondition** | Pending application exists |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | Pending application with "승인"/"거절" buttons | `SC-07-020-S01` |
| 2 | `click("승인" button)` | Button disabled during processing, toast "신청을 승인했어요" | `SC-07-020-S02` |
| 3 | Verify post-accept | Application badge changes to "승인됨" (emerald), buttons removed | `SC-07-020-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Buttons disabled while processing | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Success toast after accept | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Badge updates to emerald "승인됨" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "승인"/"거절" buttons removed post-accept | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-021: Detail page — reject application

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | post author |
| **Precondition** | Pending application exists |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | Pending application visible | `SC-07-021-S01` |
| 2 | `click("거절" button)` | Button disabled during processing, toast "신청을 거절했어요" | `SC-07-021-S02` |
| 3 | Verify post-reject | Badge changes to "거절됨" (red), buttons removed | `SC-07-021-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Buttons disabled while processing | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Success toast after reject | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Badge updates to red "거절됨" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-022: Detail page — delete post (confirmation modal)

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | post author |
| **Precondition** | None |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | Bottom bar shows "수정"/"삭제" | `SC-07-022-S01` |
| 2 | `click("삭제" button)` | Modal opens: AlertTriangle icon, "모집글을 삭제하시겠어요?", "삭제된 모집글은 복구할 수 없습니다." | `SC-07-022-S02` |
| 3 | `click("돌아가기" button)` | Modal closes, no action | `SC-07-022-S03` |
| 4 | `click("삭제" button)` | Modal opens again | `SC-07-022-S04` |
| 5 | `click("삭제하기" button)` | "삭제 중..." loading, toast "모집글이 삭제되었어요", redirect to /mercenary | `SC-07-022-S05` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Modal: role="dialog", aria-modal="true" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | AlertTriangle icon in red circle | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "돌아가기" button cancels (no delete) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "삭제하기" button red bg-red-500 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Redirect to /mercenary after delete | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | ESC closes modal | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-023: Detail page — blocked apply states

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | various |
| **Precondition** | Various block reasons |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | Visit as team member of post's team | CTA shows "소속팀 모집글" (disabled, gray bg) | `SC-07-023-S01` |
| 2 | Visit post with status=filled | CTA shows "모집 완료" (disabled, gray bg) | `SC-07-023-S02` |
| 3 | Visit post with status=closed | CTA shows "모집 마감" (disabled, gray bg) | `SC-07-023-S03` |
| 4 | Visit as user who already applied (accepted) | "내 신청 상태" shows "승인됨" badge, CTA shows "승인됨" | `SC-07-023-S04` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Blocked CTA: bg-gray-100 text-gray-500 cursor-not-allowed | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Block reason text matches applyBlockReason | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "내 신청 상태" section shows correct status badge | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-024: Detail page — 404 / not found

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{invalid-id}` |
| **Auth** | all |
| **Precondition** | Post does not exist |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/nonexistent)` | EmptyState: "모집글을 찾을 수 없어요", "삭제되었거나 존재하지 않는 모집글이에요", CTA "목록으로" | `SC-07-024-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | EmptyState with UserCheck icon | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "목록으로" CTA href=/mercenary | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

## D. Edit Page (`/mercenary/[id]/edit`)

---

### SC-07-025: Edit page — happy path

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}/edit` |
| **Auth** | post author or team manager |
| **Precondition** | Post exists, user has edit permission |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id}/edit)` | Form pre-filled: team info card (readonly), date, venue, position, count, level, fee, notes | `SC-07-025-S01` |
| 2 | Verify team info readonly | Team name field disabled (cursor-not-allowed, opacity-60), sport badge from sportCardAccent | `SC-07-025-S02` |
| 3 | `clear(장소 input)` then `type(장소, "잠실 종합운동장")` | Venue updated | `SC-07-025-S03` |
| 4 | `click("FW" position button)` | Position changed to FW (blue-500) | `SC-07-025-S04` |
| 5 | `click("고수" level button)` | Level changed to 5 (blue-500) | `SC-07-025-S05` |
| 6 | `click("수정 완료" button)` | "저장 중..." loading, toast "용병 모집글이 수정되었어요", redirect to /mercenary/{id} | `SC-07-025-S06` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Form pre-filled with existing post data | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Team name readonly (disabled appearance) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Team info card sportCardAccent tint | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Position toggle: selected=blue-500, others=border-gray-200 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Level toggle: selected=blue-500, 입문~고수 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Count + Fee in 2-column grid | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | Fee formatCurrency preview below input | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | Submit disabled when required fields empty | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V9 | Save button loading state "저장 중..." | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V10 | Success toast + redirect to detail | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V11 | "삭제" button (red border) beside save | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-026: Edit page — delete from edit page

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}/edit` |
| **Auth** | post author |
| **Precondition** | Post exists |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id}/edit)` | "삭제" button visible | `SC-07-026-S01` |
| 2 | `click("삭제" button)` | Delete confirmation modal opens | `SC-07-026-S02` |
| 3 | `click("삭제하기" button)` | Toast "용병 모집글이 삭제되었어요", redirect to /my/mercenary | `SC-07-026-S03` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Delete modal: AlertTriangle icon | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "삭제하면 되돌릴 수 없어요" warning text | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Redirect to /my/mercenary (not /mercenary) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-027: Edit page — no permission guard

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}/edit` |
| **Auth** | logged-in, not author, not team manager |
| **Precondition** | Post exists |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id}/edit)` | EmptyState: "수정 권한이 없어요", CTA "상세로 돌아가기" -> /mercenary/{id} | `SC-07-027-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | EmptyState with AlertTriangle icon | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "상세로 돌아가기" CTA links to detail page | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-028: Edit page — post not found

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{invalid-id}/edit` |
| **Auth** | logged-in |
| **Precondition** | Post does not exist |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/nonexistent/edit)` | EmptyState: "모집글을 찾을 수 없어요", CTA "목록으로" -> /mercenary | `SC-07-028-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | EmptyState rendered | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "목록으로" CTA href=/mercenary | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-07-029: Detail page — empty application list (author view)

| Item | Value |
|------|-------|
| **URL** | `/mercenary/{id}` |
| **Auth** | post author |
| **Precondition** | Post has zero applications |

#### Steps

| # | Action | Expected Result | Capture |
|---|--------|-----------------|---------|
| 1 | `navigate(/mercenary/{id})` | "지원 목록" section shows EmptyState (sm): "아직 지원자가 없어요" | `SC-07-029-S01` |

#### Verification Checklist

| # | Check Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-----------|----|----|----|----|----|----|----|----|-----|
| V1 | Small EmptyState with UserPlus icon | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "지원 목록" heading visible | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
