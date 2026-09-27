# Task 61: Chrome MCP Interactive Scenario Capture — Full UI/UX Visual Audit

## Context

The project has a Playwright-based batch screenshot system (scripts/qa/) but it captures **static page snapshots** only. It cannot verify:
- Interaction flows (click → response → state change → navigation)
- Modal open/close animations and content
- Form validation feedback (inline errors, disabled states, success toast)
- Filter/sort state changes on the same page
- Auth-conditional UI differences
- Viewport-specific layout shifts during interaction
- Hover/focus/active/disabled button states
- Dark mode rendering
- i18n layout impact

Chrome MCP (`mcp__claude-in-chrome__*`) enables **real browser interaction** — click buttons, fill forms, resize viewports, and capture screenshots at every step.

## Goal

Create an exhaustive, scenario-based visual audit where:
1. Every user journey is a **numbered scenario folder** (e.g., `S01-landing-navigation/`)
2. Each interaction step produces a **sequentially numbered screenshot** with descriptive filename
3. Every scenario runs across the **full 12-combination matrix**
4. The output is a complete visual record of **every clickable element, every state change, every modal, every form field** across the entire platform

## Test Matrix (12 Combinations)

| Dimension | Values |
|-----------|--------|
| Viewport | mobile (390×844), tablet (768×1024), desktop (1440×900) |
| Language | Korean (ko), English (en) |
| Theme | Light mode, Dark mode |

**Total screenshots per step = 12.** One step × 12 combos = 12 screenshots.

### Naming Convention
```
{scenario}-{step:02d}-{name}-{viewport}-{lang}-{theme}.png
```
Example: `S01-03-logo-hover-mobile-ko-light.png`

## Output Structure

```
screenshots/scenarios/
├── S01-landing-navigation/
│   ├── mobile-ko-light/
│   │   ├── 01-initial-load.png
│   │   ├── 02-nav-scrolled.png
│   │   └── ...
│   ├── mobile-ko-dark/
│   ├── mobile-en-light/
│   ├── mobile-en-dark/
│   ├── tablet-ko-light/
│   ├── tablet-ko-dark/
│   ├── tablet-en-light/
│   ├── tablet-en-dark/
│   ├── desktop-ko-light/
│   ├── desktop-ko-dark/
│   ├── desktop-en-light/
│   ├── desktop-en-dark/
│   └── gifs/
│       ├── mobile-ko-light-hamburger-flow.gif
│       └── ...
├── S02-auth-login-register/
│   └── ...
└── ...
```

---

## Scenario Document Index

Detailed step-by-step scenarios are in separate files per part:

| Part | File | Scenarios | Steps | Coverage |
|------|------|-----------|-------|----------|
| **A** | [`61a-scenarios-public-auth.md`](61a-scenarios-public-auth.md) | S01–S05 | ~173 | Landing, Login/Register, Onboarding, Info Pages, OAuth Callbacks |
| **B** | [`61b-scenarios-match-team.md`](61b-scenarios-match-team.md) | S06–S20 | ~220 | Home Feed, Match Discovery/Detail/Create/Edit, Teams, Team Members, Team Matches, Score/Evaluate/Arrival |
| **C** | [`61c-scenarios-lesson-market-mercenary-venue.md`](61c-scenarios-lesson-market-mercenary-venue.md) | S21–S31 | ~268 | Lessons, Marketplace, Mercenary, Venues (each: discovery + detail + create/edit) |
| **D** | [`61d-scenarios-profile-settings-chat-payment.md`](61d-scenarios-profile-settings-chat-payment.md) | S32–S48 | ~250 | Profile, Settings, Chat, Notifications, Payments/Checkout/Refund, Reviews, Badges, Feed, User Profile, All My Pages |
| **E** | [`61e-scenarios-admin-navigation.md`](61e-scenarios-admin-navigation.md) | S49–S67 | ~550 | Bottom Nav, Sidebar, Glass Header, Admin (Dashboard/Users/Matches/Lessons/Tickets/Teams/TeamMatches/Venues/Mercenary/Reviews/Payments/Settlements/Disputes/Statistics), Dark Mode Cross-Cutting, Empty/Error/Loading States, Form Validations, Auth Guards |

**Total: 67 scenarios, ~1,460 unique steps, ~17,500 screenshots (steps × 12 combos)**

---

## Master Scenario List (Summary)

### Phase A: Public Pages (S01–S05)
| # | Scenario | Key Interactions |
|---|----------|-----------------|
| S01 | Landing Page | 56 steps: nav hover/scroll/click, hamburger open/close, hero CTA, scroll-reveal, 11 sport chips, footer links, full keyboard nav |
| S02 | Login / Register | 46 steps: tab switch, email/password validation, submit states, social login buttons, dev login, redirect preservation |
| S03 | Onboarding | 24 steps: 9 sport chips select/deselect, multi-select, step transition, skip/close |
| S04 | Info Pages | 36 steps: About (5), FAQ accordion (16), Guide (6), Pricing plans (9) |
| S05 | OAuth Callbacks | 11 steps: Kakao/Naver loading/error/success states, CSRF check |

### Phase B: Main App — Discovery & CRUD (S06–S20)
| # | Scenario | Key Interactions |
|---|----------|-----------------|
| S06 | Home Feed | 25 steps: carousel, quick nav, sport filters, section cards, upcoming schedule |
| S07 | Match Discovery | 36 steps: search, 8 sport chips, 4 quick filters, expanded panel (date/region/level/sort), list↔map view |
| S08 | Match Detail | 46 steps: lightbox, join/checkout modal, share, host controls (close/reopen/cancel modals), arrival modal |
| S09 | Create Match | 28 steps: 4-step wizard, 11 sport buttons, all form fields, image upload, back nav with data preservation |
| S10 | Edit Match | 3 steps: pre-populated form, save, cancel |
| S11 | Teams List | 6 steps: cards, create, empty/loading |
| S12 | Team Detail | 24 steps: 4 section tabs, gallery lightbox, join/leave, trust score, sidebar |
| S13 | Team Members | 22 steps: role menu (promote/demote/kick/transfer modals), leave modal |
| S14 | Create/Edit Team | 9 steps: all fields, validation, delete |
| S15 | Team Match Discovery | 11 steps: sport/date/level filters, host vs other sections |
| S16 | Team Match Detail | 21 steps: apply modal (team select/message/checkbox), host accept/reject |
| S17 | Score Input | 8 steps: quarter scores, validation, submit |
| S18 | Evaluation | 10 steps: 6 × 5-star ratings, comment, submit |
| S19 | Arrival Check-in | 8 steps: team select, geolocation submit |
| S20 | Create/Edit Team Match | 16 steps: 5-step wizard, conditions, cost |

### Phase C: Lessons, Market, Mercenary, Venues (S21–S31)
| # | Scenario | Key Interactions |
|---|----------|-----------------|
| S21 | Lessons Discovery | 28 steps: 4 type chips, search debounce, cards |
| S22 | Lesson Detail | 34 steps: lightbox, calendar, ticket plans, coach link, sidebar CTA variants |
| S23 | Create/Edit Lesson | 31 steps: 4-step wizard, all fields, image upload |
| S24 | Marketplace Discovery | 16 steps: 7 category chips, search, listing cards |
| S25 | Marketplace Detail | 28 steps: gallery, heart toggle, chat, report modal (4 reasons), delete modal |
| S26 | Create/Edit Marketplace | 25 steps: 11 sport chips, sell/rent toggle, conditions, images |
| S27 | Mercenary Discovery | 13 steps: 12 sport filters, cards |
| S28 | Mercenary Detail | 23 steps: apply/withdraw, owner accept/reject, delete modal |
| S29 | Create/Edit Mercenary | 19 steps: team select, position/count buttons |
| S30 | Venues Discovery | 15 steps: sport + city filters, venue cards |
| S31 | Venue Detail | 36 steps: hub tabs, map, reviews (4-5 rating categories), operating hours, sidebar |

### Phase D: Profile, Settings, Communication (S32–S48)
| # | Scenario | Key Interactions |
|---|----------|-----------------|
| S32 | Profile Page | 40+ steps: edit modal (5 fields + all close paths), calendar view, 18 menu items, logout |
| S33 | Settings | ThemePicker (3 modes), 5 sections, logout |
| S34 | Settings/Account | 3 fields, save, delete modal (confirmation gate) |
| S35 | Settings/Notifications | 4 server toggles + DND + browser push |
| S36 | Terms + Privacy | Static scroll pages |
| S37 | Chat List | Desktop 2-column, mobile full-page, unread badges |
| S38 | Chat Room | Send message (Enter/click), emoji, file attach, report/leave modals |
| S39 | Notifications | Mark-all-read, 5 notification types, click-to-navigate |
| S40 | Payment History | 4 type tabs, date range, payment items |
| S41 | Payment Detail | 7 sections, refund action |
| S42 | Refund Request | 4 reasons, confirmation modal |
| S43 | Checkout | 4 payment methods, terms gate, submit |
| S44 | Reviews | Star rating interaction, submit/skip |
| S45 | Badges | 2 filter tabs, earned/unearned visual states |
| S46 | Activity Feed | 4 time groups, 6 activity types |
| S47 | Public User Profile | Stats, sport profiles, chat CTA |
| S48 | My Pages (9 sub) | matches (2 tabs), teams, team-matches, applications, lessons, tickets, listings, mercenary, reviews-received |

### Phase E: Navigation, Admin, Cross-Cutting (S49–S67)
| # | Scenario | Key Interactions |
|---|----------|-----------------|
| S49 | Mobile Bottom Nav | 5 tabs, all states, unread badge, safe area |
| S50 | Desktop Sidebar | Logo, CTA, 12+ nav links, LocaleSwitcher, user section |
| S51 | Mobile Glass Header | Back button, title, action slot variants |
| S52 | Admin Dashboard | Metric cards, action items, management grid |
| S53 | Admin Sidebar | Mobile hamburger/overlay/close, 14 nav links |
| S54 | Admin Users | Search, pagination, role change, ban/unban |
| S55 | Admin Matches | Status dropdown, cancel, participants |
| S56 | Admin Lessons & Tickets | Approve/reject, ~76 ticket checks |
| S57 | Admin Teams & Team Matches | Mobile card / desktop table, force-complete |
| S58 | Admin Venues | Create form, edit, activate/deactivate |
| S59 | Admin Mercenary/Reviews/Payments | Approve, delete, refund, force-complete |
| S60 | Admin Settlements & Disputes | Process, resolve/reject, evidence viewer |
| S61 | Admin Statistics | Charts, date range, export |
| S62 | Dark Mode (32 pages) | Full dark mode audit with contrast/glass/shadow checks |
| S63 | Empty States | 14 pages with EmptyState component |
| S64 | Error States | 7 not-found + network error retry |
| S65 | Loading States | 14 pages with skeleton shimmer |
| S66 | Form Validations | 8 forms with all error triggers |
| S67 | Auth Guards | 10 protected routes with redirect verification |

---

## Per-Step Interaction Depth

Every scenario step captures these states (where applicable):

### Button States (6)
default → hover → focus (ring) → active (pressed) → disabled → loading (spinner)

### Input States (7)
empty → focused → typing → filled → blurred → error (validation) → valid

### Modal States (5)
trigger → open (animation) → content → close (X / backdrop / ESC) → focus trap verification

### Dropdown States (4)
closed → open → hover options → select → closed

### Toggle States (3)
off → click → on → click → off (with loading indicator during API call)

### Link States (4)
default → hover → focus → clicked (navigation)

### Card States (3)
default → hover (shadow/scale) → click (navigation)

---

## GIF Recordings

Multi-step flows require additional GIF capture:

| Scenario | Flow | Duration |
|----------|------|----------|
| S02 | Login → Register → Login tab switch | ~5s |
| S03 | Sport select → Step 2 → Start | ~5s |
| S09 | Create Match 4-step wizard | ~15s |
| S13 | Transfer ownership modal flow | ~8s |
| S16 | Team match apply modal flow | ~8s |
| S20 | Create Team Match 5-step wizard | ~15s |
| S25 | Report modal flow | ~6s |
| S32 | Edit Profile modal flow | ~8s |
| S34 | Account delete confirmation flow | ~8s |
| S43 | Checkout payment method → terms → submit | ~8s |
| S53 | Admin hamburger → sidebar → close | ~5s |

---

## Architecture: Capture → Review Board → Fix → Re-capture Loop

### Design Principle

**시나리오 1개 = 완전 합격까지 반복하는 루프**. 스크린샷 찍기 → 3명의 리뷰어가 병렬 분석 → 이슈 합산 → 빌더가 수정 → 재캡처 → 재분석 → 전원 OK → 다음 시나리오.

### Physical Setup: 1 Desktop + 1 CLI (Orchestrator + 3 Review Agents)

```
┌────────────────────────────────────────────────────────────────────┐
│  Claude Desktop (브라우저 제어)                                      │
│  Chrome MCP로 시나리오 순차 실행                                     │
│  매 인터랙션마다 스크린샷 저장                                       │
│  시나리오 1개 캡처 완료 → CAPTURE_DONE.flag 파일 생성                │
└──────────────────────┬─────────────────────────────────────────────┘
                       │  파일시스템 공유
                       ▼
┌────────────────────────────────────────────────────────────────────┐
│  Claude Code CLI (오케스트레이터)                                    │
│  ═══════════════════════════════                                    │
│  /loop으로 CAPTURE_DONE.flag 감시                                   │
│                                                                     │
│  flag 감지 → 3개 review agent 동시 spawn (background)               │
│                                                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │
│  │  Design Reviewer  │ │   QA Reviewer    │ │  A11y Reviewer   │   │
│  │  (design-main)    │ │   (qa-uiux)      │ │  (ui-manager)    │   │
│  │                    │ │                  │ │                  │   │
│  │ DESIGN.md 토큰    │ │ 인터랙션 품질     │ │ WCAG 2.1 AA     │   │
│  │ 컬러/타이포/간격   │ │ 흐름/일관성/피드백 │ │ 대비/터치/aria   │   │
│  │ glass/shadow/card │ │ empty/error 상태  │ │ focus ring/키보드│   │
│  │                    │ │                  │ │                  │   │
│  │ → REVIEW-         │ │ → REVIEW-        │ │ → REVIEW-        │   │
│  │   DESIGN.md       │ │   QA.md          │ │   A11Y.md        │   │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘   │
│           │                     │                     │             │
│           └─────────────────────┼─────────────────────┘             │
│                                 ▼                                   │
│                        ┌───────────────┐                           │
│                        │   VERDICT.md   │                          │
│                        │  3팀 합산 판정  │                          │
│                        │                │                           │
│                        │ PASS → 다음    │                          │
│                        │ FAIL → Fix     │                          │
│                        └───────┬───────┘                           │
│                                │                                    │
│                    ┌───────────┼───────────┐                       │
│                    ▼           │           ▼                        │
│              [FAIL 경로]       │     [PASS 경로]                    │
│         Builder agents         │   Desktop에 "다음                  │
│         병렬 코드 수정          │   시나리오" 신호                    │
│              ↓                 │                                    │
│         tsc --noEmit           │                                    │
│              ↓                 │                                    │
│         Desktop에 "재캡처"     │                                    │
│         신호 전달               │                                    │
└────────────────────────────────────────────────────────────────────┘
```

### 시나리오별 반복 루프

```
FOR each scenario S{NN}:

  ROUND 1:
    ① Desktop: 전체 스텝 캡처 (12 매트릭스) → CAPTURE_DONE.flag
    ② CLI: 3 review agents 병렬 spawn
       - Design Reviewer → REVIEW-DESIGN.md
       - QA Reviewer → REVIEW-QA.md
       - A11y Reviewer → REVIEW-A11Y.md
    ③ CLI: 3개 리포트 합산 → VERDICT.md 생성
    ④ 판정:
       - Critical == 0 → ✅ PASS → 다음 시나리오
       - Critical > 0  → ❌ FAIL → ROUND 2

  ROUND 2 (FAIL 시):
    ⑤ CLI: Builder agents가 VERDICT.md의 Fix Queue 기반 코드 수정
    ⑥ CLI: tsc --noEmit 검증
    ⑦ Desktop: 수정된 스텝만 재캡처 → RECAPTURE_DONE.flag
    ⑧ CLI: 3 review agents 재분석 (변경된 스크린샷만)
    ⑨ CLI: VERDICT.md 업데이트
    ⑩ 판정: Critical == 0 → PASS / Critical > 0 → ROUND 3

  ROUND 3 (최대):
    동일 과정. ROUND 3 후에도 Critical > 0이면 사용자에게 에스컬레이션.
END
```

---

### 3개 Review Agent 역할 분담

#### Agent A: Design Reviewer (`design-main` 페르소나)

**관점**: DESIGN.md 준수, 토큰 시스템, 시각적 일관성

| # | 체크 항목 | Critical 조건 |
|---|----------|--------------|
| 1 | 컬러 토큰 | 하드코딩 hex/rgb 사용 |
| 2 | 타이포 스케일 | text-2xs~text-6xl 외 px 직접 사용 |
| 3 | 간격 일관성 | 시각적으로 눈에 띄는 불균형 |
| 4 | 종목 컬러 | sportCardAccent 토큰 불일치 |
| 5 | 카드 variant | 4종(banner/horizontal/thumbnail/metric) 외 |
| 6 | glass 사용 위치 | content 영역에 glass 적용 |
| 7 | shadow 절제 | hairline-depth 초과 |
| 8 | 정보 계층 | 시간→장소→인원→가격 순서 위반 |
| 9 | 브랜드 일관성 | TeamMeet 아닌 Teameet 표기 |
| 10 | 다크모드 토큰 | dark: variant 누락 |

**출력**: `REVIEW-DESIGN.md`

#### Agent B: QA Reviewer (`qa-uiux` 페르소나)

**관점**: 사용자 경험, 인터랙션 품질, 상태 처리

| # | 체크 항목 | Critical 조건 |
|---|----------|--------------|
| 1 | 인터랙션 피드백 | 클릭 후 시각적 변화 없음 |
| 2 | 로딩 상태 | skeleton/spinner 없이 빈 화면 |
| 3 | 에러 상태 | ErrorState 컴포넌트 미사용 |
| 4 | 빈 상태 | EmptyState 컴포넌트 미사용 |
| 5 | 모달 동작 | 닫기 경로(X/backdrop/ESC) 누락 |
| 6 | 폼 검증 | 에러 메시지 미표시 |
| 7 | 뷰포트 레이아웃 | 모바일에서 overflow/가로스크롤 |
| 8 | 네비게이션 일관성 | 뒤로가기 누락, 경로 불일치 |
| 9 | i18n 레이아웃 | 텍스트 잘림/오버플로 |
| 10 | 반응성 | 데스크탑↔모바일 레이아웃 전환 깨짐 |

**출력**: `REVIEW-QA.md`

#### Agent C: Accessibility Reviewer (`ui-manager` 페르소나)

**관점**: WCAG 2.1 AA 준수, 접근성

| # | 체크 항목 | Critical 조건 |
|---|----------|--------------|
| 1 | 색 대비 | 텍스트/배경 4.5:1 미만 |
| 2 | 터치 타겟 | 인터랙티브 요소 44x44px 미만 |
| 3 | focus ring | 키보드 포커스 시 표시 안 됨 |
| 4 | aria-label | 아이콘 버튼에 라벨 없음 |
| 5 | aria-hidden | 장식 요소에 미적용 |
| 6 | 컬러만으로 정보 전달 | 아이콘/텍스트 병행 없음 |
| 7 | label-input 연결 | htmlFor + id 미연결 |
| 8 | modal 접근성 | role="dialog" + aria-modal 누락 |
| 9 | prefers-reduced-motion | 애니메이션 미대응 |
| 10 | heading 구조 | h1→h2→h3 계층 위반 |

**출력**: `REVIEW-A11Y.md`

---

### REVIEW 파일 공통 포맷

각 리뷰어가 동일 포맷으로 작성:

```markdown
# S{NN} — {Scenario Name} — {Reviewer} Review

> Reviewer: {Design/QA/A11y}
> Round: {1/2/3}
> Analyzed: {timestamp}

## Verdict: {PASS ✅ / FAIL 🔴}
- Critical: {N} | Warning: {N} | Good: {N}

---

### Step {NN}: {Description}

#### {viewport}-{lang}-{theme} {emoji} {severity}
- **{ID}**: {description}
- File: `{path}`
- Rule: {source}
- Fix: {specific suggestion}

---

## Issue List

| ID | Sev | Step | Matrix | Check | Description | Fix |
|----|-----|------|--------|-------|-------------|-----|
| D-C001 | Critical | 01 | desktop-en-light | 컬러토큰 | ... | ... |
| Q-W003 | Warning | 05 | mobile-ko-dark | 빈상태 | ... | ... |
| A-C002 | Critical | 01 | mobile-ko-dark | 색대비 | ... | ... |
```

ID 접두사: `D-` (Design), `Q-` (QA), `A-` (A11y)

---

### VERDICT.md (오케스트레이터가 3개 리뷰 합산)

```markdown
# S{NN} — {Scenario Name} — Combined Verdict

> Round: {1/2/3}
> Generated: {timestamp}

## Final Verdict: {PASS ✅ / FAIL 🔴}

### Score by Reviewer
| Reviewer | Critical | Warning | Good | Verdict |
|----------|----------|---------|------|---------|
| Design   | 1        | 3       | 668  | FAIL    |
| QA       | 0        | 5       | 667  | PASS    |
| A11y     | 2        | 1       | 669  | FAIL    |
| **Total**| **3**    | **9**   | —    | **FAIL**|

### Combined Fix Queue (Critical first, then Warning)
1. 🔴 A-C001 — 색 대비 3.2:1 (mobile-ko-dark/01) → `text-gray-200` 사용
2. 🔴 A-C002 — 터치 타겟 32px (mobile-ko-light/15) → `min-h-[44px]` 추가
3. 🔴 D-C001 — Hero overflow (desktop-en-light/01) → `max-w-[600px]`
4. ⚠️ Q-W003 — 빈 상태 인라인 (mobile-ko-light/29) → EmptyState 컴포넌트 사용
5. ⚠️ D-W001 — Nav 대비 3.8:1 (mobile-ko-dark/01) → `text-gray-100`
...

### Files to Fix (for builders)
| File | Issues | IDs |
|------|--------|-----|
| `apps/web/src/app/landing/page.tsx` | 2 | D-C001, A-C002 |
| `apps/web/src/components/landing/landing-nav.tsx` | 1 | D-W001 |
| `apps/web/src/components/ui/button.tsx` | 1 | A-C002 |

### Affected Steps to Re-capture (for Desktop)
- Step 01: initial-load (all 12 matrix)
- Step 15: footer-cta-click (mobile-ko-light only)
```

---

### 통신 프로토콜: Desktop ↔ CLI 파일 기반 시그널링

Desktop과 CLI는 **파일시스템의 시그널 파일**로 소통합니다:

```
screenshots/scenarios/S{NN}-{name}/
├── CAPTURE_DONE.flag          ← Desktop이 생성 (캡처 완료)
├── REVIEW_DONE.flag           ← CLI가 생성 (3팀 분석 완료)
├── VERDICT.md                 ← CLI가 생성 (합산 판정)
├── FIX_DONE.flag              ← CLI가 생성 (코드 수정 완료)
├── RECAPTURE_REQUEST.md       ← CLI가 생성 (재캡처 필요 스텝 목록)
├── RECAPTURE_DONE.flag        ← Desktop이 생성 (재캡처 완료)
├── SCENARIO_PASS.flag         ← CLI가 생성 (시나리오 최종 통과)
├── steps.json                 ← Desktop이 생성 (스텝 메타데이터)
├── REVIEW-DESIGN.md           ← Design 리뷰어 출력
├── REVIEW-QA.md               ← QA 리뷰어 출력
├── REVIEW-A11Y.md             ← A11y 리뷰어 출력
├── mobile-ko-light/
│   ├── 01-initial-load.png
│   └── ...
└── ...
```

#### Signal File Flow:

```
Desktop                                CLI (Orchestrator)
───────                                ──────────────────
캡처 시작 (S01)
  ↓
모든 스텝 × 12 매트릭스 완료
  ↓
CAPTURE_DONE.flag 생성 ─────────→ flag 감지
                                   ↓
                                 3 review agents spawn (병렬)
                                   ↓
                                 3개 REVIEW-*.md 완료
                                   ↓
                                 VERDICT.md 생성
                                 REVIEW_DONE.flag 생성
                                   ↓
                                 [PASS?]
                                   ├── YES → SCENARIO_PASS.flag 생성
                                   │         Desktop에 "다음 시나리오" 알림
                                   │
                                   └── NO → Builder agents 수정
                                            ↓
                                          FIX_DONE.flag 생성
                                          RECAPTURE_REQUEST.md 생성
                                            ↓
RECAPTURE_REQUEST.md 감지 ←───── (Desktop이 polling)
  ↓
해당 스텝만 재캡처
  ↓
RECAPTURE_DONE.flag 생성 ────→ flag 감지
                                 ↓
                               3 review agents 재분석
                                 ↓
                               VERDICT.md 업데이트
                                 ↓
                               [PASS?] → ... (최대 3 rounds)
```

---

## Execution Protocol

### 사전 준비

```
Step 0: 환경 준비
  - Dev server: pnpm dev (localhost:3003 + localhost:8100)
  - DB 시드: pnpm db:seed
  - Chrome MCP 확장 활성화
  - mkdir -p screenshots/scenarios
```

### 시작 순서

```
Step 1: CLI에서 오케스트레이터 시작 (먼저!)
  Claude Code에서:
  /loop screenshots/scenarios/ 폴더에서 CAPTURE_DONE.flag를 감시해줘.
  감지하면 해당 시나리오 폴더의 스크린샷을 design/qa/a11y 3팀에서
  병렬 분석하고, VERDICT.md에 합산 판정을 작성해줘.
  FAIL이면 builder agent로 수정 후 RECAPTURE_REQUEST.md를 만들어줘.
  PASS면 SCENARIO_PASS.flag를 만들어줘.

Step 2: Desktop에서 캡처 시작 (즉시!)
  Claude Desktop에 prompts/desktop-capture-agent.md 붙여넣기
  S01부터 순차 실행 시작

Step 3: 루프 동작
  Desktop: S01 캡처 완료 → CAPTURE_DONE.flag
  CLI: 감지 → 3팀 분석 → VERDICT → PASS/FAIL
  [FAIL] CLI: 수정 → RECAPTURE_REQUEST.md
  Desktop: 재캡처 → RECAPTURE_DONE.flag
  CLI: 재분석 → VERDICT 업데이트
  [PASS] CLI: SCENARIO_PASS.flag → Desktop이 S02 시작
```

### Auth Setup:
- Public (S01-S05): No auth needed
- User (S06-S48): Dev-login as 축구왕민수
- Admin (S52-S61): Dev-login as admin persona
- Mixed (S62-S67): Both auth and unauth states

### Auth Setup:
- Public (S01-S05): No auth needed
- User (S06-S48): Dev-login as 축구왕민수
- Admin (S52-S61): Dev-login as admin persona
- Mixed (S62-S67): Both auth and unauth states

---

## Folder Structure Per Scenario

```
screenshots/scenarios/
├── S01-landing/
│   ├── steps.json                    ← 스텝 메타데이터 (Agent 1 생성)
│   ├── REPORT.md                     ← UI/UX 분석 리포트 (Agent 2 실시간 append)
│   ├── mobile-ko-light/
│   │   ├── 01-initial-load.png
│   │   ├── 02-nav-scrolled.png
│   │   ├── 03-logo-hover.png
│   │   └── ...
│   ├── mobile-ko-dark/
│   │   ├── 01-initial-load.png
│   │   └── ...
│   ├── mobile-en-light/
│   ├── mobile-en-dark/
│   ├── tablet-ko-light/
│   ├── tablet-ko-dark/
│   ├── tablet-en-light/
│   ├── tablet-en-dark/
│   ├── desktop-ko-light/
│   ├── desktop-ko-dark/
│   ├── desktop-en-light/
│   ├── desktop-en-dark/
│   └── gifs/
│       ├── mobile-ko-light-hamburger-flow.gif
│       └── desktop-ko-dark-nav-scroll.gif
├── S02-auth-login-register/
│   ├── steps.json
│   ├── REPORT.md
│   ├── mobile-ko-light/
│   └── ...
└── ...
```

**핵심**: 시나리오 폴더 하나에 스크린샷(12 매트릭스) + 메타데이터 + 분석 리포트가 모두 포함.

---

## Scenario Execution Order

순차 실행이므로 의존성과 효율을 고려한 실행 순서:

| 순서 | 시나리오 | Auth | 테마 전환 필요 |
|------|---------|------|--------------|
| 1 | S01–S05 | 없음 | 매트릭스대로 |
| 2 | S06–S20 | 축구왕민수 dev-login | 매트릭스대로 |
| 3 | S21–S31 | 유지 | 매트릭스대로 |
| 4 | S32–S48 | 유지 | 매트릭스대로 |
| 5 | S49–S51 | 유지 | 매트릭스대로 |
| 6 | S52–S61 | admin dev-login | 매트릭스대로 |
| 7 | S62–S67 | 혼합 (로그아웃/재로그인) | 다크모드 집중 |

---

## Acceptance Criteria

- [ ] All 67 scenarios executed across 12 matrix combinations = 804 scenario runs
- [ ] **매 인터랙션마다 스크린샷 1장** — 빠짐없이 저장
- [ ] 모든 시나리오 폴더에 `steps.json` + `REPORT.md` 존재
- [ ] Every interactive element captured in all applicable states (hover/focus/active/disabled/loading)
- [ ] All 13+ modals captured: open + content + all close paths (X, backdrop, ESC)
- [ ] All filter/tab/sort state changes captured before + after
- [ ] All form fields: empty → filled → validation error → valid states
- [ ] All empty/error/loading states for every major page
- [ ] Dark mode verification for 32 pages with contrast/glass/shadow checks
- [ ] i18n layout verification (ko vs en) for text overflow/truncation
- [ ] GIF recordings for 11 multi-step flows
- [ ] **REPORT.md에 모든 스크린샷 분석 결과 포함** (Critical/Warning/Good)
- [ ] **Critical 이슈 0으로 수렴** (Fix Cycle 최대 3회)
- [ ] Total screenshots: ~17,500

## Tech Debt Resolved
- Replaces ad-hoc Playwright batch captures with structured interaction-based audit
- Creates exhaustive visual regression baseline covering all matrix combinations
- Documents every interactive element's state machine
- Establishes repeatable capture→analyze→fix→re-verify pipeline

## Security Notes
- Dev-login only in non-production environments
- No real credentials in screenshots
- Admin scenarios use dev admin persona only

## Risks & Dependencies
- Chrome MCP extension must be running and connected
- Dev server at localhost:3003 + API at localhost:8100
- DB seeded with test personas + sample data
- Some scenarios require specific data states (host match, pending application, etc.)
- i18n may show Korean-only for pages not yet translated — document as-is
- **Browser agent cannot be parallelized** — Chrome MCP 단일 인스턴스 제약. 분석/수정만 병렬 가능

## Ambiguity Log
- (none yet)

---

## Session B Implementation Status (2026-04-13)

### Overview
Session B (Base64 Screenshot Extraction) has been successfully implemented and tested. The pipeline extracts base64-encoded screenshots from Session A's JSONL conversation file and saves them as JPEG files to the project directory.

### Actual Results
- **Manifest entries**: 721 lines total (1 header + 720 SAVED records)
- **Actual files saved**: 521 JPEG files across directories
- **Identified files**: 51 files mapped to 14 of 15 area directories (missing: 11-payments)
- **Unknown/unmapped**: 470 files (awaiting SC-XX pattern completion)
- **JSONL lines processed**: 2,787 total lines

### Directory Output
```
tests/ui-scenarios/screenshots/
├── 01-landing/        → SC-01-*.jpg
├── 02-auth/           → SC-02-*.jpg
├── 03-home/           → SC-03-*.jpg
├── ... (15 areas)
├── 15-global-ui/      → SC-15-*.jpg
├── unknown/           → Unmapped SC-XX files
└── manifest.log       → 721 lines: 1 header + 720 SAVED records (tracking log)
```

### Implementation Details
- **Extraction script**: `/tmp/e2e-queue/extract-screenshots.py` (Python 3, base64/json/re)
- **Polling interval**: 5 seconds
- **Progress tracking**: `/tmp/e2e-queue/last-jsonl-line.txt` (JSONL line number, survives restart)
- **Session A JSONL path**: Auto-detected via `~/.claude/projects/*/def8f2e6-c170-4929-88aa-bc08b91632ff.jsonl`
- **SC-XX mapping**: 15 area directories (01-landing through 15-global-ui)

### Deployment Notes
- Session B must start **before** Session A to prevent file loss
- Uses Claude Code CLI (Haiku model) for resource efficiency
- Monitor tool (30s polling) + ScheduleWakeup (270s heartbeat) for continuous operation
- manifest.log line count is the signal for Session C to detect new files

### Known Limitations
- SC-XX pattern matching incomplete (470 unmapped files) — awaiting Session A file naming clarity
- Extraction dependent on Session A JSONL file format stability
- base64 decoding relies on consistent `data:image` prefix in tool_result content

### Next Steps
1. Session A completes capture for all scenarios (S01–S67)
2. Session C analyzes saved images (design/qa/ui-manager 3-team parallel)
3. Verify all 17,500 expected screenshots (67 scenarios × 12 viewport/lang/theme combos × 3-5 steps avg)
4. Document actual file naming pattern → refine SC-XX mapping if needed
5. Archive to task completion
