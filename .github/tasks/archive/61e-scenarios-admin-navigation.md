# Part E: Admin Dashboard, Navigation, Dark Mode Cross-Cutting UI/UX Test Scenarios

## Testing Matrix

Every scenario below must be validated across **12 combinations**:

| Viewport | Resolution |
|----------|------------|
| Mobile | 390x844 |
| Tablet | 768x1024 |
| Desktop | 1440x900 |

| Language | Theme |
|----------|-------|
| Korean (ko) | Light mode |
| English (en) | Dark mode |

**Convention**: Each check item uses `[M]` mobile, `[T]` tablet, `[D]` desktop, `[L]` light, `[K]` dark when a specific combination is called out. Items without tags apply to all 12.

---

## S49 -- Mobile Bottom Navigation

**Source**: `apps/web/src/components/layout/bottom-nav.tsx`

### S49.1 -- Structure and Visibility

- [ ] S49.1.1: Bottom nav renders with `data-testid="bottom-nav"` at viewport bottom
- [ ] S49.1.2: Contains exactly 5 tabs: Home (`bottom-nav-home`), Matches (`bottom-nav-matches`), Teams (`bottom-nav-teams`), Marketplace (`bottom-nav-marketplace`), Profile (`bottom-nav-profile`)
- [ ] S49.1.3: Each tab renders Lucide icon (Home, Search, Users, ShoppingBag, User) + localized label text below
- [ ] S49.1.4: [M] Nav visible, floated at bottom with `fixed inset-x-0 bottom-0 z-50`
- [ ] S49.1.5: [T] Nav visible (below `@3xl` breakpoint)
- [ ] S49.1.6: [D] Nav hidden via `@3xl:hidden` class (desktop uses sidebar instead)
- [ ] S49.1.7: Pill container uses `glass-mobile-nav` class with frosted glass effect
- [ ] S49.1.8: Maximum width `max-w-lg` with horizontal centering
- [ ] S49.1.9: `px-4 pb-[max(var(--safe-area-bottom),0.5rem)]` for notched device safe area inset

### S49.2 -- Tab States

- [ ] S49.2.1: Default (inactive) tab: icon `text-gray-400 dark:text-gray-500`, label `text-gray-400 dark:text-gray-500`, `strokeWidth={1.5}`
- [ ] S49.2.2: Active tab: icon `text-blue-500 dark:text-blue-400`, label `text-blue-500 dark:text-blue-400`, `strokeWidth={2}`
- [ ] S49.2.3: Home tab active when `pathname.startsWith('/home')`
- [ ] S49.2.4: Matches tab active when `pathname.startsWith('/matches')`
- [ ] S49.2.5: Teams tab active when `pathname.startsWith('/teams') || pathname.startsWith('/team-matches') || pathname.startsWith('/mercenary')` (broad matching)
- [ ] S49.2.6: Marketplace tab active when `pathname.startsWith('/marketplace')`
- [ ] S49.2.7: Profile tab active when `pathname.startsWith('/profile')`
- [ ] S49.2.8: `aria-current="page"` set on active tab only
- [ ] S49.2.9: Focus ring: `focus-visible:ring-2 focus-visible:ring-blue-500` visible on keyboard focus
- [ ] S49.2.10: No explicit hover state (mobile touch target), but `transition-colors` applied

### S49.3 -- Unread Badge

- [ ] S49.3.1: Profile tab shows red badge when `chatUnread + notifUnread > 0`
- [ ] S49.3.2: Badge renders `bg-red-500` circle with white bold text
- [ ] S49.3.3: Count displays as number when `totalUnread <= 99`
- [ ] S49.3.4: Count displays `99+` when `totalUnread > 99`
- [ ] S49.3.5: Badge has `aria-label` reading "읽지 않은 알림 N개" or "읽지 않은 알림 99개 이상"
- [ ] S49.3.6: Badge hidden when `totalUnread === 0`
- [ ] S49.3.7: Badge positioned `absolute -right-1.5 -top-1` relative to icon

### S49.4 -- Navigation Behavior

- [ ] S49.4.1: Tap Home -> navigates to `/home`, Home tab becomes active
- [ ] S49.4.2: Tap Matches -> navigates to `/matches`, Matches tab becomes active
- [ ] S49.4.3: Tap Teams -> navigates to `/teams`, Teams tab becomes active
- [ ] S49.4.4: Tap Marketplace -> navigates to `/marketplace`, Marketplace tab becomes active
- [ ] S49.4.5: Tap Profile -> navigates to `/profile`, Profile tab becomes active
- [ ] S49.4.6: Sequential tab switching: tap each tab 1-5, verify active state transitions correctly
- [ ] S49.4.7: Nav remains fixed at bottom during page content scroll
- [ ] S49.4.8: Keyboard Tab cycles through all 5 tabs in order
- [ ] S49.4.9: Keyboard Enter/Space on focused tab triggers navigation

### S49.5 -- Touch Target

- [ ] S49.5.1: Each tab has `min-h-12 min-w-12` (48px) touch target exceeding 44px minimum
- [ ] S49.5.2: Tabs use `flex-1` to share horizontal space equally

### S49.6 -- Dark Mode

- [ ] S49.6.1: [K] `glass-mobile-nav` adjusts opacity for dark theme (solid: dark 0.72)
- [ ] S49.6.2: [K] Inactive icons use `dark:text-gray-500`
- [ ] S49.6.3: [K] Active icons use `dark:text-blue-400`
- [ ] S49.6.4: [K] Badge `bg-red-500` remains high contrast against dark nav

### S49.7 -- Internationalization

- [ ] S49.7.1: [ko] Labels: 홈, 매치, 팀, 장터, 내 정보 (from `nav` translations)
- [ ] S49.7.2: [en] Labels localized via `next-intl` `t('home')`, `t('matches')`, etc.
- [ ] S49.7.3: `aria-label` on each tab matches label text

---

## S50 -- Desktop Sidebar Navigation

**Source**: `apps/web/src/components/layout/sidebar.tsx`

### S50.1 -- Structure and Visibility

- [ ] S50.1.1: Sidebar renders as `aside` fixed left, `w-[240px]`, `h-dvh`
- [ ] S50.1.2: [D] Sidebar visible with `border-r border-gray-100 dark:border-gray-800`
- [ ] S50.1.3: [M][T] Sidebar hidden (not in viewport, no responsive toggle -- separate from admin sidebar)

### S50.2 -- Logo

- [ ] S50.2.1: "TeamMeet" text logo renders as `h1`, `text-xl font-bold tracking-tight`
- [ ] S50.2.2: Logo is a Link to `/home`
- [ ] S50.2.3: Hover: default link behavior
- [ ] S50.2.4: [L] `text-gray-900`, [K] `dark:text-white`

### S50.3 -- CTA Button

- [ ] S50.3.1: "매치 만들기" button with Plus icon, full-width
- [ ] S50.3.2: Default: `bg-blue-500 text-white font-bold`
- [ ] S50.3.3: Hover: `hover:bg-blue-600`
- [ ] S50.3.4: Active: `active:bg-blue-700`
- [ ] S50.3.5: Click -> navigates to `/matches/new`
- [ ] S50.3.6: [en] Label localized via `t('createMatch')`
- [ ] S50.3.7: `rounded-xl px-4 py-3 text-base`

### S50.4 -- Navigation Sections

The sidebar groups links into labeled sections:

**Section: (unlabeled)**
- [ ] S50.4.1: 홈 (`/home`): Home icon, active when `pathname.startsWith('/home')`, active style `bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold`

**Section: 매칭 (Matching)**
- [ ] S50.4.2: Section label `t('matching')` in `text-2xs font-semibold text-gray-400 uppercase tracking-wider`
- [ ] S50.4.3: 매치 찾기 (`/matches`): Search icon
- [ ] S50.4.4: 팀 매칭 (`/team-matches`): Swords icon

**Section: 탐색 (Explore)**
- [ ] S50.4.5: Section label `t('explore')`
- [ ] S50.4.6: 강좌 (`/lessons`): GraduationCap icon
- [ ] S50.4.7: 장터 (`/marketplace`): ShoppingBag icon
- [ ] S50.4.8: 팀 (`/teams`): Users icon
- [ ] S50.4.9: 용병 (`/mercenary`): UserPlus icon
- [ ] S50.4.10: 시설 (`/venues`): MapPin icon

**Section: 소통 (Communication) -- Auth-only**
- [ ] S50.4.11: Section hidden when not authenticated
- [ ] S50.4.12: 채팅 (`/chat`): MessageCircle icon -- visible only when authenticated
- [ ] S50.4.13: 알림 (`/notifications`): Bell icon -- visible only when authenticated
- [ ] S50.4.14a: **NOTE -- Feature gap**: Unlike BottomNav (S49.3) which shows unread count badges, the desktop Sidebar does NOT render unread count badges next to chat/notifications links. The sidebar code has no `useChatUnreadTotal` or `useUnreadCount` calls. This is a known implementation gap to surface for design review.

**Section: (unlabeled)**
- [ ] S50.4.14: 마이페이지 (`/profile`): User icon

**Section: Admin -- Admin-only**
- [ ] S50.4.15: 관리자 (`/admin/dashboard`): ShieldCheck icon -- visible only when `user.role === 'admin'`
- [ ] S50.4.16: Admin link hidden for non-admin users

### S50.5 -- Link States (each nav link)

- [ ] S50.5.1: Default: `text-gray-500 dark:text-gray-400 font-medium`
- [ ] S50.5.2: Hover: `hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100`
- [ ] S50.5.3: Active: `bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold`
- [ ] S50.5.4: Active icon `strokeWidth={2}`, inactive `strokeWidth={1.5}`
- [ ] S50.5.5: `rounded-xl px-3 py-2 text-sm` consistent sizing
- [ ] S50.5.6: `transition-colors` for smooth state change
- [ ] S50.5.7: Keyboard focus: default focus-visible ring
- [ ] S50.5.8: Click navigates to correct href

### S50.6 -- LocaleSwitcher

- [ ] S50.6.1: Renders in `border-t` section above user area
- [ ] S50.6.2: Click toggles between ko/en
- [ ] S50.6.3: All nav labels update immediately after language change

### S50.7 -- User Section

- [ ] S50.7.1: **Authenticated**: Shows avatar circle (first char of nickname) + nickname text + logout button
- [ ] S50.7.2: Avatar: `h-8 w-8 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-600 dark:text-gray-300`
- [ ] S50.7.3: Nickname: `text-sm font-medium text-gray-900 dark:text-gray-100 truncate`
- [ ] S50.7.4: Logout button: LogOut icon, `min-h-[44px] min-w-11` touch target, `aria-label` set to `tc('logout')`
- [ ] S50.7.5: Logout hover: `hover:bg-gray-50 dark:hover:bg-gray-800`
- [ ] S50.7.6: Logout click: calls `logout()` + navigates to `/login`
- [ ] S50.7.7: **Not authenticated**: Shows "로그인" button with `border border-gray-200 dark:border-gray-700`
- [ ] S50.7.8: Login button click -> navigates to `/login`
- [ ] S50.7.9: Login button hover: `hover:bg-gray-50 dark:hover:bg-gray-800`

### S50.8 -- Keyboard Navigation

- [ ] S50.8.1: Tab key cycles through: Logo -> CTA -> all nav links -> LocaleSwitcher -> User section
- [ ] S50.8.2: Enter activates focused link
- [ ] S50.8.3: Focus ring visible on all interactive elements

---

## S51 -- Mobile Glass Header

**Source**: `apps/web/src/components/layout/mobile-glass-header.tsx`

### S51.1 -- Structure and Visibility

- [ ] S51.1.1: Renders `header` with `data-testid="mobile-glass-header"`
- [ ] S51.1.2: [M][T] Visible (below `@3xl` breakpoint via `@3xl:hidden`)
- [ ] S51.1.3: [D] Hidden on desktop
- [ ] S51.1.4: Uses `glass-mobile-header` class for backdrop blur effect
- [ ] S51.1.5: Default `sticky top-0 z-20` positioning

### S51.2 -- Title Variant (showBack + title)

- [ ] S51.2.1: When `title` prop provided: renders structured layout with flex row
- [ ] S51.2.2: Title text: `text-[17px] font-semibold tracking-[-0.02em] text-gray-900 dark:text-white truncate`
- [ ] S51.2.3: Optional subtitle: `text-xs text-gray-500 dark:text-gray-400 truncate`
- [ ] S51.2.4: Back button (when `showBack=true`): ArrowLeft icon, `min-h-[44px] min-w-11` touch target
- [ ] S51.2.5: Back button default: `border border-gray-200/80 bg-white/78 text-gray-700 shadow-sm`
- [ ] S51.2.6: Back button dark: `dark:border-white/10 dark:bg-gray-800/82 dark:text-gray-200`
- [ ] S51.2.7: Back button hover: `hover:bg-white dark:hover:bg-gray-800`
- [ ] S51.2.8: Back button click: calls `onBack` prop or `router.back()` by default
- [ ] S51.2.9: Back button `aria-label="뒤로 가기"`
- [ ] S51.2.10: Actions slot (right side): renders custom action elements when `actions` prop provided

### S51.3 -- Children Variant (no title)

- [ ] S51.3.1: When no `title` prop: renders children directly inside header
- [ ] S51.3.2: `z-10` instead of `z-20` for children variant
- [ ] S51.3.3: `flex items-center px-5 py-3`

### S51.4 -- Compact Mode

- [ ] S51.4.1: `compact=true`: padding `py-3` instead of `py-3.5`
- [ ] S51.4.2: `compact=false` (default): padding `py-3.5`

### S51.5 -- Sticky Behavior

- [ ] S51.5.1: `sticky=true` (default): header sticks to top on scroll
- [ ] S51.5.2: `sticky=false`: header positioned `relative`, scrolls with content
- [ ] S51.5.3: Glass blur effect visible when content scrolls behind header

### S51.6 -- Dark Mode

- [ ] S51.6.1: [K] `glass-mobile-header` gradient adjusts (0.88-0.72 opacity)
- [ ] S51.6.2: [K] Title text switches to `dark:text-white`
- [ ] S51.6.3: [K] Subtitle switches to `dark:text-gray-400`
- [ ] S51.6.4: [K] Back button switches to dark variant colors

---

## S49b -- AdminToolbar Shared Component

**Source**: `apps/web/src/components/admin/admin-toolbar.tsx` -- Used by all admin list pages.

### S49b.1 -- Search Input

- [ ] S49b.1.1: Search input renders with Search icon (left-positioned, `absolute left-3`)
- [ ] S49b.1.2: `sr-only` label with `placeholder` text as fallback label text
- [ ] S49b.1.3: Input id defaults to `"admin-toolbar-search"` or custom `search.id`
- [ ] S49b.1.4: `pl-9` padding for icon clearance
- [ ] S49b.1.5: Typing calls `search.onChange(value)` on each keystroke (no built-in debounce -- consumer handles)
- [ ] S49b.1.6: Search icon: `text-gray-500 dark:text-gray-400`, size 14
- [ ] S49b.1.7: Search absent when `search` prop not provided

### S49b.2 -- Download Button

- [ ] S49b.2.1: "내보내기" button with Download icon (size 12)
- [ ] S49b.2.2: `bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700`
- [ ] S49b.2.3: Hover: `hover:bg-gray-50 dark:hover:bg-gray-700`
- [ ] S49b.2.4: Click calls `onDownload()` callback
- [ ] S49b.2.5: Button absent when `onDownload` prop not provided
- [ ] S49b.2.6: `shrink-0` prevents button from shrinking

### S49b.3 -- Filter Chips

- [ ] S49b.3.1: Filter chips render as horizontal scrollable row (`overflow-x-auto scrollbar-hide`)
- [ ] S49b.3.2: Active chip: `bg-gray-900 text-white dark:bg-white dark:text-gray-900`
- [ ] S49b.3.3: Inactive chip: `bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400`
- [ ] S49b.3.4: Inactive hover: `hover:bg-gray-100 dark:hover:bg-gray-700`
- [ ] S49b.3.5: Click calls `onFilterChange(key)`
- [ ] S49b.3.6: Each chip: `shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors`
- [ ] S49b.3.7: Filters section absent when `filters` prop empty or not provided

### S49b.4 -- Count Display

- [ ] S49b.4.1: Count renders as `text-xs text-gray-500 dark:text-gray-400`
- [ ] S49b.4.2: Format: `{count}{countLabel}` (default countLabel = "건")
- [ ] S49b.4.3: Positioned right-aligned (`ml-2 shrink-0`) relative to filter chips
- [ ] S49b.4.4: Count absent when `count` prop is `undefined`

### S49b.5 -- CSV Download Utility

- [ ] S49b.5.1: `downloadCSV` creates BOM-prefixed UTF-8 CSV file
- [ ] S49b.5.2: Filename format: `{name}_{YYYY-MM-DD}.csv`
- [ ] S49b.5.3: Handles commas, quotes, newlines in values (escaped with double quotes)
- [ ] S49b.5.4: Returns early (no download) when data array is empty
- [ ] S49b.5.5: Uses `URL.createObjectURL` + ephemeral `<a>` click + `revokeObjectURL`

---

## S52 -- Admin Dashboard

**Source**: `apps/web/src/app/admin/dashboard/page.tsx`

### S52.1 -- Auth Guard

- [ ] S52.1.1: Non-authenticated user -> redirect to `/login`
- [ ] S52.1.2: Authenticated non-admin user -> redirect to `/home`, shows "관리자 권한이 필요합니다" with ShieldCheck icon
- [ ] S52.1.3: Auth loading state: "권한 정보를 확인하는 중입니다" centered text
- [ ] S52.1.4: Auth wall has `data-testid="admin-auth-wall"`
- [ ] S52.1.5: Auth wall link: "홈으로 이동" when authenticated, "로그인" when not

### S52.2 -- Greeting and Header

- [ ] S52.2.1: "안녕하세요, 관리자님" h1, `text-2xl font-bold text-gray-900 dark:text-white`
- [ ] S52.2.2: Subtitle: "실제 운영 데이터로 오늘 상태를 확인하세요"

### S52.3 -- Metric Cards (4 cards)

- [ ] S52.3.1: 2x2 grid layout (`grid grid-cols-2 gap-3`)
- [ ] S52.3.2: Card 1 "총 사용자": Users icon, value from `stats.totalUsers`, sub "오늘 +N" if `todayNewUsers > 0`
- [ ] S52.3.3: Card 2 "총 매치": Trophy icon, value from `stats.totalMatches`, sub "오늘 +N" if `todayMatches > 0`
- [ ] S52.3.4: Card 3 "강좌": GraduationCap icon, value from `stats.totalLessons`
- [ ] S52.3.5: Card 4 "팀": Shield icon, value from `stats.totalTeams`
- [ ] S52.3.6: Each card icon in `h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-900/30` container
- [ ] S52.3.7: Value: `text-3xl font-bold text-gray-900 dark:text-white`
- [ ] S52.3.8: Sub text: `text-xs text-blue-500 font-medium`
- [ ] S52.3.9: Loading skeleton: `h-8 w-16 bg-gray-50 dark:bg-gray-700 rounded skeleton-shimmer`

### S52.4 -- Action Items ("처리 필요" section)

- [ ] S52.4.1: Section header "처리 필요" via SectionHeader
- [ ] S52.4.2: "미처리 분쟁" -> count of pending/investigating disputes -> click navigates to `/admin/disputes`
- [ ] S52.4.3: "정산 대기" -> `settlementsSummary.pendingCount` -> click navigates to `/admin/settlements`
- [ ] S52.4.4: "오늘 노쇼 신고" -> count of today's no_show disputes -> click navigates to `/admin/disputes`
- [ ] S52.4.5: Each item: Card with `interactive` prop, `flex items-center justify-between`
- [ ] S52.4.6: Count: `text-sm font-bold text-gray-900 dark:text-white` with "N건" suffix
- [ ] S52.4.7: Loading skeleton: `h-5 w-12` shimmer

### S52.5 -- Management Menu Grid

- [ ] S52.5.1: 8 link cards in `grid grid-cols-2 @3xl:grid-cols-4 gap-3`
- [ ] S52.5.2: Cards: 매치 관리, 사용자 관리, 결제 관리, 시설 관리, 강좌 관리, 팀 관리, 정산 관리, 통계
- [ ] S52.5.3: Each card: label `text-sm font-semibold`, description `text-xs text-gray-400`
- [ ] S52.5.4: Card hover: `interactive` prop on Card component
- [ ] S52.5.5: Click navigates to corresponding `/admin/*` route

### S52.6 -- Error State

- [ ] S52.6.1: Any query error -> ErrorState with "관리자 대시보드를 불러오지 못했어요"
- [ ] S52.6.2: Retry button triggers refetch of all 3 queries (stats, disputes, settlements)

### S52.7 -- Dark Mode

- [ ] S52.7.1: [K] Page background `bg-gray-50 dark:bg-gray-900`
- [ ] S52.7.2: [K] Card backgrounds `dark:bg-gray-800`
- [ ] S52.7.3: [K] Icon containers `dark:bg-blue-900/30`
- [ ] S52.7.4: [K] Text colors properly inverted

---

## S53 -- Admin Sidebar/Navigation

**Source**: `apps/web/src/app/admin/layout.tsx`

### S53.1 -- Mobile Hamburger

- [ ] S53.1.1: [M][T] Hamburger button visible: `fixed top-4 left-4 z-50 lg:hidden`
- [ ] S53.1.2: Button: `w-10 h-10 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm`
- [ ] S53.1.3: Menu icon: `text-gray-700 dark:text-gray-300`
- [ ] S53.1.4: `aria-label="메뉴 열기"`
- [ ] S53.1.5: Click -> sidebar slides in (`translate-x-0`), overlay appears
- [ ] S53.1.6: [D] Hamburger hidden (`lg:hidden`)

### S53.2 -- Mobile Overlay

- [ ] S53.2.1: Overlay: `fixed inset-0 z-40 bg-black/40 lg:hidden`
- [ ] S53.2.2: Overlay appears only when `sidebarOpen === true`
- [ ] S53.2.3: Click overlay -> sidebar closes (`setSidebarOpen(false)`)

### S53.3 -- Sidebar Panel

- [ ] S53.3.1: `w-[240px] h-dvh` fixed left sidebar
- [ ] S53.3.2: [M][T] Default: `-translate-x-full` (off-screen), slides to `translate-x-0` when open
- [ ] S53.3.3: [D] Always visible: `lg:translate-x-0`
- [ ] S53.3.4: `transition-transform duration-200 ease-in-out` animation
- [ ] S53.3.5: `bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700`

### S53.4 -- Sidebar Header

- [ ] S53.4.1: ShieldCheck icon (blue-500) + "TeamMeet Admin" `text-lg font-bold`
- [ ] S53.4.2: [M][T] Close button (X icon): `lg:hidden`, `aria-label="메뉴 닫기"`
- [ ] S53.4.3: Close button: `w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700`
- [ ] S53.4.4: Close button click -> sidebar closes

### S53.5 -- Navigation Links (14 items)

| # | Href | Icon | Label |
|---|------|------|-------|
| 1 | `/admin/dashboard` | LayoutDashboard | 대시보드 |
| 2 | `/admin/matches` | Trophy | 매치 관리 |
| 3 | `/admin/users` | Users | 사용자 관리 |
| 4 | `/admin/lessons` | GraduationCap | 강좌 관리 |
| 5 | `/admin/lesson-tickets` | Ticket | 수강권 |
| 6 | `/admin/teams` | Zap | 팀 관리 |
| 7 | `/admin/team-matches` | Swords | 팀 매칭 |
| 8 | `/admin/mercenary` | UserPlus | 용병 |
| 9 | `/admin/reviews` | Star | 평가 |
| 10 | `/admin/venues` | Building2 | 시설 관리 |
| 11 | `/admin/payments` | CreditCard | 결제 관리 |
| 12 | `/admin/settlements` | Wallet | 정산 관리 |
| 13 | `/admin/disputes` | AlertTriangle | 신고/분쟁 |
| 14 | `/admin/statistics` | BarChart3 | 통계 |

- [ ] S53.5.1: All 14 links render in order
- [ ] S53.5.2: Active link: `bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold`, icon `strokeWidth={2}`
- [ ] S53.5.3: Inactive link: `text-gray-500 dark:text-gray-400`, icon `strokeWidth={1.5}`
- [ ] S53.5.4: Hover (inactive): `hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white`
- [ ] S53.5.5: Active detection: `pathname.startsWith(href)` -- child routes also highlight parent
- [ ] S53.5.6: Click each link -> navigates to correct page
- [ ] S53.5.7: `rounded-xl px-3 py-2.5 text-sm font-medium transition-colors`

### S53.6 -- Footer Link

- [ ] S53.6.1: "서비스로 돌아가기" with ArrowLeft icon in `border-t` section
- [ ] S53.6.2: `text-sm text-gray-500 dark:text-gray-400`
- [ ] S53.6.3: Hover: `hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white`
- [ ] S53.6.4: Click -> navigates to `/home`

### S53.7 -- Route Change Behavior

- [ ] S53.7.1: [M] Sidebar auto-closes on route change (via `useEffect` on `pathname`)

### S53.8 -- Keyboard Navigation

- [ ] S53.8.1: Tab key cycles through all 14 nav links + footer link
- [ ] S53.8.2: Enter activates focused link
- [ ] S53.8.3: [M] ESC key has no explicit handler (backdrop click is the close mechanism)

### S53.9 -- Main Content Area

- [ ] S53.9.1: Main content: `flex-1 lg:pl-[240px]` to offset sidebar on desktop
- [ ] S53.9.2: Content padding: `px-4 pt-16 pb-6 lg:px-8 lg:py-6` (pt-16 for mobile hamburger)

---

## S54 -- Admin Users Management

**Source**: `apps/web/src/app/admin/users/page.tsx`, `apps/web/src/app/admin/users/[id]/page.tsx`

### S54.1 -- Users List Page

- [ ] S54.1.1: Header: "사용자 관리" h1 + "등록된 사용자를 관리하세요" subtitle
- [ ] S54.1.2: AdminToolbar: search input with placeholder "닉네임으로 검색"
- [ ] S54.1.3: Count display: "N명"
- [ ] S54.1.4: CSV download button: click downloads user data
- [ ] S54.1.5: Search input: focus ring, type text, debounce search, results filter
- [ ] S54.1.6: Each user row: avatar (first char), nickname, manner score (Star icon, amber), match count, location, sport types, date
- [ ] S54.1.7: User row hover: `hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors`
- [ ] S54.1.8: User row click -> navigates to `/admin/users/{id}`
- [ ] S54.1.9: ChevronRight icon on each row
- [ ] S54.1.10: Loading: 5 skeleton rows with avatar + text placeholders, `animate-pulse`
- [ ] S54.1.11: Empty state: EmptyState with Users icon, "아직 등록된 사용자가 없어요"

### S54.2 -- User Detail Page

- [ ] S54.2.1: Breadcrumb: "사용자 관리" > nickname
- [ ] S54.2.2: [D] Two-column layout: `grid-cols-1 @3xl:grid-cols-[1fr_320px]`
- [ ] S54.2.3: Avatar: `h-16 w-16 rounded-full bg-blue-50 dark:bg-blue-900/30 text-xl font-bold text-blue-500`
- [ ] S54.2.4: Status badge: "활성" (green) or "정지" (red) based on `adminStatus`
- [ ] S54.2.5: Stats row: manner score, match count, warning count, location
- [ ] S54.2.6: Suspension reason banner (if suspended): `rounded-xl bg-red-50 text-red-600`

### S54.3 -- Sport Profiles Section

- [ ] S54.3.1: Each sport profile: SportIcon + label + level badge + stats (W/L, ELO)
- [ ] S54.3.2: Level badge: `bg-blue-50 dark:bg-blue-900/30 text-xs font-semibold text-blue-500`
- [ ] S54.3.3: Empty: EmptyState "등록된 종목이 없어요"

### S54.4 -- Moderation Actions

- [ ] S54.4.1: "경고 기록" button: amber border/bg, AlertTriangle icon, click opens modal with `actionType='warn'`
- [ ] S54.4.2: "계정 정지" button (when active): red border/bg, Ban icon, click opens modal with `actionType='suspend'`
- [ ] S54.4.3: "계정 활성화" button (when suspended): green border/bg, Shield icon, click opens modal with `actionType='reactivate'`
- [ ] S54.4.4: Each action button hover: intensified bg color

### S54.5 -- Moderation Modal

- [ ] S54.5.1: Modal opens with correct title based on action type
- [ ] S54.5.2: Description text varies by action type
- [ ] S54.5.3: Textarea: `id="admin-user-action-note"`, `sr-only` label, placeholder "운영 메모를 입력하세요"
- [ ] S54.5.4: "계정 정지 사유는 필수입니다." red text when `actionType='suspend'`
- [ ] S54.5.5: Submit disabled when suspend + empty note
- [ ] S54.5.6: Cancel button: `flex-1 rounded-xl border` -- click closes modal, resets state
- [ ] S54.5.7: Save button: `bg-gray-900 text-white` -- click calls API
- [ ] S54.5.8: Loading state: RefreshCw spin icon during submission
- [ ] S54.5.9: Success: toast message, modal closes, data refetches
- [ ] S54.5.10: Error: toast error message
- [ ] S54.5.11: Modal cannot be closed during submission (`isSubmitting` guard)

### S54.6 -- Audit Log Section

- [ ] S54.6.1: "감사 로그" section with entries showing action, timestamp, actor, note
- [ ] S54.6.2: Empty: EmptyState "아직 기록된 운영 액션이 없어요"

### S54.7 -- Loading/Error/Not Found

- [ ] S54.7.1: Loading: animate-pulse skeleton blocks
- [ ] S54.7.2: Error: ErrorState "사용자 상세를 불러오지 못했어요" + retry
- [ ] S54.7.3: Not found: EmptyState "사용자를 찾을 수 없어요" + "목록으로" action

---

## S55 -- Admin Matches Management

**Source**: `apps/web/src/app/admin/matches/page.tsx`, `apps/web/src/app/admin/matches/[id]/page.tsx`

### S55.1 -- Matches List Page

- [ ] S55.1.1: Header: "매치 관리" h1 + "전체 매치를 관리하세요"
- [ ] S55.1.2: AdminToolbar: search "매치명 또는 호스트 검색", status filter tabs
- [ ] S55.1.3: Filter tabs: 전체, 모집중, 마감, 진행중, 완료, 취소
- [ ] S55.1.4: Active filter tab highlighted, click switches filter
- [ ] S55.1.5: Count: "N건의 매치"
- [ ] S55.1.6: CSV download
- [ ] S55.1.7: Each match row: sport label, status badge (color-coded), title, date+time (Calendar icon), players (Users icon), host name
- [ ] S55.1.8: Status badge colors: recruiting=blue, full/completed=gray, in_progress=blue, cancelled=red
- [ ] S55.1.9: Row hover: `hover:bg-gray-50 dark:hover:bg-gray-800/50`
- [ ] S55.1.10: Row click -> `/admin/matches/{id}`
- [ ] S55.1.11: Loading: 5 skeleton rows
- [ ] S55.1.12: Empty: EmptyState "아직 등록된 매치가 없어요"

### S55.2 -- Match Detail Page

- [ ] S55.2.1: Breadcrumb: "매치 관리" > "매치 상세"
- [ ] S55.2.2: [D] Two-column: `grid-cols-1 @3xl:grid-cols-[1fr_360px]`
- [ ] S55.2.3: Match info card: sport icon (SportIconMap), title, sport label, status badge
- [ ] S55.2.4: 4-cell grid: 일시 (Calendar), 장소 (MapPin), 인원 (Users + progress bar), 참가비 (CreditCard)
- [ ] S55.2.5: Progress bar: red when >= 70% filled, blue otherwise
- [ ] S55.2.6: Host card: avatar, nickname, manner score, match count
- [ ] S55.2.7: Participants list: each with avatar, name, date, payment status badge

### S55.3 -- Status Change (Admin Control)

- [ ] S55.3.1: Select dropdown with `id="admin-match-status"`, label "상태 변경"
- [ ] S55.3.2: Options: 모집중, 마감, 진행중, 완료, 취소
- [ ] S55.3.3: Change triggers `statusMutation.mutate(newStatus)`
- [ ] S55.3.4: Disabled during mutation (`statusChanging`)
- [ ] S55.3.5: Success: green "상태가 변경되었어요" with CheckCircle
- [ ] S55.3.6: Error: red "상태 변경에 실패했어요" with AlertCircle
- [ ] S55.3.7: Invalidates `['admin', 'matches']` and `['matches', matchId]` query keys

### S55.4 -- Match Summary (right column)

- [ ] S55.4.1: 매치 ID (truncated mono font), 생성일, 총 수입
- [ ] S55.4.2: `sticky top-6` positioning

### S55.5 -- Loading/Not Found

- [ ] S55.5.1: Loading: animate-pulse skeleton blocks
- [ ] S55.5.2: Not found: EmptyState "매치를 찾을 수 없어요" + "목록으로" action

---

## S56 -- Admin Lessons and Tickets

**Source**: `apps/web/src/app/admin/lessons/page.tsx`, `apps/web/src/app/admin/lessons/[id]/page.tsx`, `apps/web/src/app/admin/lesson-tickets/page.tsx`

### S56.1 -- Lessons List Page

- [ ] S56.1.1: Header: "강좌 관리" + "강좌 등록" CTA button (blue, GraduationCap icon)
- [ ] S56.1.2: CTA click -> navigates to `/lessons`
- [ ] S56.1.3: AdminToolbar: search "강좌명 또는 코치명 검색", filter tabs: 전체/진행중/완료/취소
- [ ] S56.1.4: Table layout with 8 columns: 강좌명, 유형, 일시, 인원, 수강료, 상태, 등록자, 관리
- [ ] S56.1.5: Table header: `bg-gray-50 dark:bg-gray-800`, uppercase text
- [ ] S56.1.6: Row hover: `hover:bg-gray-50 dark:hover:bg-gray-800/50`
- [ ] S56.1.7: Row click (or Enter key): navigates to `/admin/lessons/{id}` via `role="link" tabIndex={0}`
- [ ] S56.1.8: "수정" button per row: click shows toast "강좌 수정 페이지 준비 중입니다", `stopPropagation` prevents row navigation
- [ ] S56.1.9: Status badges: open=green, closed=gray, completed=blue, cancelled=red
- [ ] S56.1.10: `overflow-x-auto` for horizontal scroll on narrow viewports
- [ ] S56.1.11: Loading: 3 skeleton rows
- [ ] S56.1.12: Empty: EmptyState "아직 등록된 강좌가 없어요"

### S56.2 -- Lesson Detail Page

- [ ] S56.2.1: Breadcrumb: "강좌 관리" > "강좌 상세"
- [ ] S56.2.2: [D] Two-column: `grid-cols-1 @3xl:grid-cols-[1fr_360px]`
- [ ] S56.2.3: Sport icon, type badge, sport label, title, status badge
- [ ] S56.2.4: 4-cell grid: 일시, 장소, 인원 (progress bar), 수강료
- [ ] S56.2.5: Coach info card (if coachName exists)
- [ ] S56.2.6: Participants list with avatars
- [ ] S56.2.7: "발급 수강권" section: table with 5 columns (구매자, 유형, 상태, 사용현황, 구매일)
- [ ] S56.2.8: Ticket type badges: single=sky, multi=blue, unlimited=purple
- [ ] S56.2.9: Ticket status badges: active=emerald, expired=gray, exhausted=amber, refunded=rose
- [ ] S56.2.10: Usage progress bar for non-unlimited tickets

### S56.3 -- Lesson Status Change

- [ ] S56.3.1: Select dropdown with `id="admin-lesson-status"`
- [ ] S56.3.2: Options: 진행중, 마감, 완료, 취소
- [ ] S56.3.3: Same mutation pattern as matches (success/error feedback)

### S56.4 -- Lesson Tickets Page (standalone)

**Source**: `apps/web/src/app/admin/lesson-tickets/page.tsx` -- Uses mock data (MOCK_TICKETS, 10 entries).

**Header**
- [ ] S56.4.1: "수강권 관리" h1 + "발급된 수강권을 관리하세요" subtitle

**Summary Cards (4)**
- [ ] S56.4.2: "전체 수강권" card: Ticket icon (blue), count with "건" suffix
- [ ] S56.4.3: "활성" card: TrendingUp icon (emerald), active count
- [ ] S56.4.4: "만료 소진" card: XCircle icon (amber), expired+exhausted count
- [ ] S56.4.5: "총 결제액" card: CreditCard icon (blue), `formatAmount(totalRevenue)`
- [ ] S56.4.6: Grid: `grid-cols-2 lg:grid-cols-4`

**Search and Filter**
- [ ] S56.4.7: Search input (`id="lesson-tickets-search"`): sr-only label "수강권 검색", placeholder "구매자 또는 강좌명 검색"
- [ ] S56.4.8: Filter tabs in pill container (`bg-gray-100 dark:bg-gray-800 rounded-xl`): 전체/활성/만료 소진/환불 취소
- [ ] S56.4.9: Active tab: `bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm`
- [ ] S56.4.10: Inactive tab: `text-gray-500 dark:text-gray-400`
- [ ] S56.4.11: Search or filter change resets page to 1
- [ ] S56.4.12: Count label: "N건의 수강권" below toolbar

**Checkbox Selection**
- [ ] S56.4.13: Header checkbox: toggles all rows on current page, 3-state (none/some/all)
- [ ] S56.4.14: All selected: `bg-blue-500 border-blue-500` with checkmark SVG
- [ ] S56.4.15: Some selected: `bg-blue-100 dark:bg-blue-900/40 border-blue-400` with dash indicator
- [ ] S56.4.16: None selected: `border-gray-300 dark:border-gray-600`
- [ ] S56.4.17: `aria-label` toggles between "이 페이지 전체 선택" / "이 페이지 전체 선택 해제"
- [ ] S56.4.18: Row checkbox: `aria-label` includes buyer name (e.g., "김민준 선택")
- [ ] S56.4.19: Checked row highlight: `bg-blue-50/50 dark:bg-blue-900/10`
- [ ] S56.4.20: Focus ring on checkbox: `focus:ring-2 focus:ring-blue-500/30 focus:ring-offset-1`

**Bulk Actions Toolbar**
- [ ] S56.4.21: BulkToolbar appears when `selected.size > 0`
- [ ] S56.4.22: "선택된 N건" label
- [ ] S56.4.23: "일괄 만료 처리" button: rose border/text, click clears selection + success toast
- [ ] S56.4.24: "일괄 상태 변경" button: gray border, click opens BulkStatusModal
- [ ] S56.4.25: Clear selection button (X icon): `aria-label="선택 해제"`, click clears selection
- [ ] S56.4.26: All bulk buttons `min-h-[44px]` touch target

**Table (10 columns)**
- [ ] S56.4.27: Columns: checkbox, 구매자, 강좌명, 유형, 상태, 사용현황, 결제금액, 구매일, 만료일, 관리
- [ ] S56.4.28: Buyer: avatar circle + name
- [ ] S56.4.29: Lesson title: truncated `max-w-[180px]` + sport type subtitle
- [ ] S56.4.30: Type badges: single=sky, multi=blue, unlimited=purple
- [ ] S56.4.31: Status badges: active=emerald, expired/cancelled=gray, exhausted=amber, refunded=rose
- [ ] S56.4.32: Usage: "N / M회" with progress bar for non-unlimited, "N회 사용" for unlimited
- [ ] S56.4.33: Amount: `formatAmount`, `font-semibold`
- [ ] S56.4.34: Dates: `formatDateCompact`, null expires shows em dash
- [ ] S56.4.35: Row hover: `hover:bg-gray-50 dark:hover:bg-gray-800/50`

**Row Action Menu (Dropdown)**
- [ ] S56.4.36: "관리" button with ChevronDown: `aria-label="수강권 관리"`, `aria-expanded`, `aria-haspopup="menu"`
- [ ] S56.4.37: ChevronDown rotates 180deg when open
- [ ] S56.4.38: Dropdown `role="menu"` with shadow, border, rounded-xl
- [ ] S56.4.39: Menu item "만료일 연장" (CalendarDays icon): `role="menuitem"`, click opens extend modal
- [ ] S56.4.40: Menu item "상태 변경" (RefreshCw icon): click opens status modal
- [ ] S56.4.41: Menu item "횟수 조정" (MoreHorizontal icon): only visible for `ticketType === 'multi'`
- [ ] S56.4.42: Divider + "상세 보기" link (ExternalLink icon): navigates to `/admin/lessons/{lessonId}`
- [ ] S56.4.43: Outside click closes dropdown
- [ ] S56.4.44: ESC key closes dropdown + focuses trigger button

**Ticket Manage Modal (Extend/Status/Adjust)**
- [ ] S56.4.45: Modal overlay: `bg-black/40 backdrop-blur-sm`, click overlay closes
- [ ] S56.4.46: `role="dialog" aria-modal="true" aria-label` set to modal title
- [ ] S56.4.47: Header: mode title + buyer name + lesson title + close button (`aria-label="닫기"`, `min-w-11 min-h-[44px]`)
- [ ] S56.4.48: "현재 값" card showing current state
- [ ] S56.4.49: ESC closes modal, body scroll locked, first element auto-focused

**Extend Mode**
- [ ] S56.4.50: Quick select buttons: +7일, +30일, +90일 (each `min-h-[44px]`)
- [ ] S56.4.51: Date input (`id="new-expiry"`): type="date"
- [ ] S56.4.52: Preview card: "변경 후 만료일: YYYY.MM.DD" in blue-50 bg

**Status Mode**
- [ ] S56.4.53: Radio group: 5 statuses (active/expired/exhausted/refunded/cancelled)
- [ ] S56.4.54: Selected radio: blue border/bg, blue dot indicator
- [ ] S56.4.55: Unselected: gray border, hover border change
- [ ] S56.4.56: Status badge rendered next to each radio label
- [ ] S56.4.57: Optional "변경 사유" textarea (`id="status-reason"`)

**Adjust Mode (multi tickets only)**
- [ ] S56.4.58: "전체 횟수" number input (`id="adj-total"`, min=1, max=999)
- [ ] S56.4.59: "사용 횟수" number input (`id="adj-used"`, min=0, max=adjTotal)
- [ ] S56.4.60: Preview: "변경 후: N / M회 사용" + progress bar

**Modal Footer**
- [ ] S56.4.61: 취소 button: gray border, click closes modal
- [ ] S56.4.62: 저장 button: `bg-blue-500 hover:bg-blue-600 active:bg-blue-700`
- [ ] S56.4.63: Save triggers success toast with mode-specific message

**Bulk Status Modal**
- [ ] S56.4.64: Triggered by "일괄 상태 변경" bulk action
- [ ] S56.4.65: "일괄 상태 변경" title + "선택된 N건에 적용됩니다" subtitle
- [ ] S56.4.66: 5-option radio list (same pattern as single status modal)
- [ ] S56.4.67: 취소 + 적용 buttons
- [ ] S56.4.68: Apply: clears selection + success toast with count and status label
- [ ] S56.4.69: ESC/overlay click closes, body scroll locked

**Pagination**
- [ ] S56.4.70: PAGE_SIZE = 8 items per page
- [ ] S56.4.71: Visible when `totalPages > 1`
- [ ] S56.4.72: "N-M / Total건" range label
- [ ] S56.4.73: Prev button: ChevronLeft, disabled on page 1 (`disabled:opacity-40`), `aria-label="이전 페이지"`
- [ ] S56.4.74: Page number buttons: active `border-blue-500 bg-blue-500 text-white`, inactive bordered
- [ ] S56.4.75: Next button: ChevronRight, disabled on last page, `aria-label="다음 페이지"`

**Empty State**
- [ ] S56.4.76: EmptyState: Ticket icon, "수강권이 없어요", "검색 조건과 일치하는 수강권이 없습니다"

---

## S57 -- Admin Teams and Team Matches

**Source**: `apps/web/src/app/admin/teams/page.tsx`, `apps/web/src/app/admin/teams/[id]/page.tsx`, `apps/web/src/app/admin/team-matches/page.tsx`, `apps/web/src/app/admin/team-matches/[id]/page.tsx`

### S57.1 -- Teams List Page

- [ ] S57.1.1: Header: "팀 관리" + "팀 등록" CTA (Plus icon, blue)
- [ ] S57.1.2: CTA click -> `/teams/new`
- [ ] S57.1.3: AdminToolbar: search "팀명 검색", filter: 전체/모집중/모집마감
- [ ] S57.1.4: [M] Card layout (`lg:hidden`): avatar, name, recruiting badge, sport, members, level, location, owner, edit button
- [ ] S57.1.5: [D] Table layout (`hidden lg:block`): 8 columns (팀명, 종목, 인원, 레벨, 지역, 모집, 운영자, 관리)
- [ ] S57.1.6: Recruiting badge: blue when recruiting, gray when closed
- [ ] S57.1.7: "수정" link per team: `aria-label="${name} 수정"`, Pencil icon, navigates to `/teams/{id}/edit`
- [ ] S57.1.8: Loading: [M] 3 card skeletons, [D] 2 row skeletons
- [ ] S57.1.9: Empty: EmptyState "아직 등록된 팀이 없어요"

### S57.2 -- Team Detail Page

- [ ] S57.2.1: Breadcrumb: "팀 관리" > team name
- [ ] S57.2.2: [D] Two-column: `grid-cols-1 @3xl:grid-cols-[1fr_320px]`
- [ ] S57.2.3: Team info: sport badge, recruiting status badge, name h1, description
- [ ] S57.2.4: Stat cards (4): 팀 레벨, 멤버 수, 활동 지역, 생성일
- [ ] S57.2.5: Members section: each member with avatar, name, join date, manner score, role badge (owner=blue, manager=gray, member=gray)
- [ ] S57.2.6: Recent team matches section: title, date, time, venue, fee, status badge
- [ ] S57.2.7: Owner section (right column): avatar, name, email
- [ ] S57.2.8: Loading: skeleton blocks
- [ ] S57.2.9: Error: ErrorState + retry
- [ ] S57.2.10: Not found: EmptyState + "목록으로" action

### S57.3 -- Team Matches List Page

- [ ] S57.3.1: Breadcrumb: "관리자" > "팀 매칭"
- [ ] S57.3.2: Header: "팀 매칭 관리"
- [ ] S57.3.3: AdminToolbar: search "제목 또는 팀명으로 검색", filter: 전체/모집중/매칭완료/경기종료/취소
- [ ] S57.3.4: Table with 8 columns: ID, 제목, 호스트팀, 종목, 날짜, 상태, 신청수, (상세 link)
- [ ] S57.3.5: Status badges: recruiting=blue, approved/matched=green, completed=gray, cancelled=red
- [ ] S57.3.6: "상세" link per row -> `/admin/team-matches/{id}`
- [ ] S57.3.7: Loading: 4 skeleton blocks
- [ ] S57.3.8: Error: ErrorState + retry
- [ ] S57.3.9: Empty: EmptyState "검색 조건에 맞는 팀 매칭이 없어요"

### S57.4 -- Team Match Detail Page

- [ ] S57.4.1: Breadcrumb: "팀 매칭 관리" > match title
- [ ] S57.4.2: [D] Two-column layout
- [ ] S57.4.3: Sport badge, status badge, title h1, description
- [ ] S57.4.4: "공개 상세" link -> `/team-matches/{id}` with ArrowUpRight icon
- [ ] S57.4.5: Schedule card: date (formatDateDot), time range
- [ ] S57.4.6: Venue card: name, address
- [ ] S57.4.7: Operation check points: 호스트 팀, 신청 수, 상대 팀 참가비, 총 비용
- [ ] S57.4.8: Right column: admin context notes, operation checklist
- [ ] S57.4.9: Loading/error/not found states

---

## S58 -- Admin Venues

**Source**: `apps/web/src/app/admin/venues/page.tsx`, `apps/web/src/app/admin/venues/new/page.tsx`, `apps/web/src/app/admin/venues/[id]/page.tsx`

### S58.1 -- Venues List Page

- [ ] S58.1.1: Header: "시설 관리" + "시설 추가" CTA (Plus icon, blue)
- [ ] S58.1.2: CTA click -> `/admin/venues/new`
- [ ] S58.1.3: AdminToolbar: search "시설명으로 검색", count "N개의 시설"
- [ ] S58.1.4: Table with 7 columns: 시설명, 유형, 종목, 주소, 평점, 시간당, 관리
- [ ] S58.1.5: Venue name with Building2 icon avatar
- [ ] S58.1.6: Sport types as small `rounded bg-gray-100` tags
- [ ] S58.1.7: Rating: Star icon (amber, filled) + score + review count
- [ ] S58.1.8: Row: `role="link" tabIndex={0}`, click/Enter navigates to `/admin/venues/{id}`
- [ ] S58.1.9: "수정" link per row (Pencil icon), `stopPropagation`
- [ ] S58.1.10: Loading: 4 skeleton rows
- [ ] S58.1.11: Empty: EmptyState "등록된 시설이 없어요" + "시설 추가" action

### S58.2 -- Venue New Page (Form)

- [ ] S58.2.1: Breadcrumb: "시설 관리" > "시설 등록"
- [ ] S58.2.2: Max width: `max-w-2xl`

**Section: 기본 정보**
- [ ] S58.2.3: 시설명 input (`id="admin-venue-new-name"`): focus, type, blur
- [ ] S58.2.4: 시설 유형 select (`id="admin-venue-new-type"`): 실내/실외/빙상장/체육관
- [ ] S58.2.5: 가능 종목 toggle buttons: 풋살/농구/배드민턴/아이스하키/피겨/쇼트트랙
- [ ] S58.2.6: Toggle selected: `bg-gray-900 dark:bg-gray-600 text-white`, unselected: `bg-gray-100 dark:bg-gray-700`
- [ ] S58.2.7: Each toggle `min-h-[44px]` touch target
- [ ] S58.2.8: 설명 textarea (`id="admin-venue-new-description"`)

**Section: 위치 정보**
- [ ] S58.2.9: 주소 input, 시/도 input, 구/군 input (2-col grid), 전화번호 input
- [ ] S58.2.10: All inputs have FormField labels with `htmlFor` matching input `id`

**Section: 시설 & 요금**
- [ ] S58.2.11: 부대시설 input + "+" button: type facility name, Enter or click adds tag
- [ ] S58.2.12: Facility tags: blue-50 bg, X button to remove
- [ ] S58.2.13: 시간당 요금 number input

**Section: 운영 시간**
- [ ] S58.2.14: 평일 open/close time inputs with sr-only labels
- [ ] S58.2.15: 주말 open/close time inputs with sr-only labels

**Submit**
- [ ] S58.2.16: 취소 link -> `/admin/venues`
- [ ] S58.2.17: 시설 등록 button: disabled when `!form.name` or `mutation.isPending`
- [ ] S58.2.18: Disabled: `bg-gray-300 cursor-not-allowed`
- [ ] S58.2.19: Enabled: `bg-blue-500 hover:bg-blue-600 active:scale-[0.98]`
- [ ] S58.2.20: Loading: Loader2 spin icon + "등록 중..."
- [ ] S58.2.21: Success: toast + redirect to `/admin/venues`
- [ ] S58.2.22: Error: toast + inline error message

### S58.3 -- Venue Edit Page

- [ ] S58.3.1: Breadcrumb: "시설 관리" > "시설 수정"
- [ ] S58.3.2: Building2 icon + "시설 수정" h1 + venue ID
- [ ] S58.3.3: Delete button (red): Trash2 icon, `border-red-200 bg-red-50 text-red-600`
- [ ] S58.3.4: Delete click: calls API, success toast + redirect, error toast
- [ ] S58.3.5: Form pre-populated from `useAdminVenue` data
- [ ] S58.3.6: Same form fields as new page (name, type, sports, address, facilities, price, hours)
- [ ] S58.3.7: Save button: Save icon, `bg-gray-900 text-white`, loading Loader2
- [ ] S58.3.8: "저장됨" green text shown after successful save
- [ ] S58.3.9: `setSaved(false)` on any field change (dirty tracking)
- [ ] S58.3.10: Loading/error/not found states

---

## S59 -- Admin Mercenary, Reviews, Payments

**Source**: `apps/web/src/app/admin/mercenary/page.tsx`, `apps/web/src/app/admin/reviews/page.tsx`, `apps/web/src/app/admin/payments/page.tsx`

### S59.1 -- Mercenary Page

- [ ] S59.1.1: Breadcrumb: "관리자" > "용병"
- [ ] S59.1.2: Header: "용병 관리"
- [ ] S59.1.3: AdminToolbar: search "팀명, 포지션, ID 검색", filter: 전체/모집중/충원완료/마감/취소
- [ ] S59.1.4: Table with 8 columns: ID, 팀명, 종목, 포지션, 날짜, 신청수, 상태, 액션
- [ ] S59.1.5: Team name with avatar circle (first char, `bg-gray-900 dark:bg-gray-600`)
- [ ] S59.1.6: Status badges: open=blue, filled=green, closed=gray, cancelled=red
- [ ] S59.1.7: "삭제" button per row: Trash2 icon, `text-red-500 hover:bg-red-50`
- [ ] S59.1.8: Delete click: calls `deletePost.mutateAsync(id)`, success/error toast
- [ ] S59.1.9: Delete disabled during `deletePost.isPending` (`disabled:opacity-50`)
- [ ] S59.1.10: Loading: 5 skeleton rows
- [ ] S59.1.11: Error: ErrorState + retry
- [ ] S59.1.12: Empty: EmptyState "조건에 맞는 모집글이 없어요"

### S59.2 -- Reviews Page

- [ ] S59.2.1: Breadcrumb: "관리자" > "평가"
- [ ] S59.2.2: Header: "평가 관리"
- [ ] S59.2.3: Summary cards (4): 총 평가수, 전체 평균, 평균 매너점수, 평균 스킬점수
- [ ] S59.2.4: Each card: `rounded-2xl bg-white dark:bg-gray-800`, icon in colored container, `text-2xl font-bold` value
- [ ] S59.2.5: Card hover: `hover:shadow-[0_2px_16px_rgba(0,0,0,0.04)]`
- [ ] S59.2.6: AdminToolbar: search "매치명 또는 평가자/대상 검색"
- [ ] S59.2.7: Table with 6 columns: 매치, 평가자, 대상, 매너점수, 스킬점수, 날짜
- [ ] S59.2.8: Star ratings: filled amber stars for score, gray for remaining (5-star scale)
- [ ] S59.2.9: Row hover: `hover:bg-gray-50 dark:hover:bg-gray-800/50`
- [ ] S59.2.10: Loading: 5 skeleton rows
- [ ] S59.2.11: Error: ErrorState + retry
- [ ] S59.2.12: Empty: EmptyState "표시할 평가가 없어요"

### S59.3 -- Payments Page

- [ ] S59.3.1: Header: "결제 관리" + "저장된 실제 결제/환불 내역만 표시합니다"
- [ ] S59.3.2: AdminToolbar: search "사용자, 주문번호 또는 매치명 검색", status filter: 전체/결제완료/대기/환불/부분 환불/실패
- [ ] S59.3.3: Table with 6 columns: 사용자, 금액, 상태, 결제수단, 일시, 주문번호
- [ ] S59.3.4: User column: avatar (blue-50 bg), name, item name, venue name
- [ ] S59.3.5: Amount: `text-base font-semibold` formatted by `formatAmount`
- [ ] S59.3.6: Status badges: completed=green, pending=gray, refunded=red, partial_refunded=amber, failed=gray
- [ ] S59.3.7: Payment method labels: 카드/토스페이/네이버페이/카카오페이/계좌이체
- [ ] S59.3.8: Order ID: `font-mono text-gray-400`
- [ ] S59.3.9: Loading: 5 skeleton bars
- [ ] S59.3.10: Error: ErrorState "결제 목록을 불러오지 못했어요" + retry
- [ ] S59.3.11: Empty (no data): "아직 결제 내역이 없어요"
- [ ] S59.3.12: Empty (filtered): "검색 조건에 맞는 결제가 없어요"

---

## S60 -- Admin Settlements and Disputes

**Source**: `apps/web/src/app/admin/settlements/page.tsx`, `apps/web/src/app/admin/disputes/page.tsx`, `apps/web/src/app/admin/disputes/[id]/page.tsx`

### S60.1 -- Settlements Page

- [ ] S60.1.1: Header: "정산 관리" + subtitle
- [ ] S60.1.2: Summary cards (4): 총 거래액, 수수료 수입, 정산 대기금, 환불 총액
- [ ] S60.1.3: Card grid: `grid-cols-2 @3xl:grid-cols-4`
- [ ] S60.1.4: Each card: icon in colored container (TrendingUp/ArrowUpRight=blue, Clock=gray, ArrowDownRight=red)
- [ ] S60.1.5: AdminToolbar: search "거래 ID 또는 당사자 검색", filter: 전체/정산 대기/정산 완료/환불/실패
- [ ] S60.1.6: Table with 7-8 columns (checkbox when pending tab): 거래 ID, 유형, 내용, 지급대상, 정산액, 상태, 최근 액션

### S60.2 -- Settlement Bulk Actions

- [ ] S60.2.1: Checkbox column visible only when `activeTab === 'pending'`
- [ ] S60.2.2: Header checkbox: toggles all rows (select all / deselect all)
- [ ] S60.2.3: Row checkbox: toggles individual row, `bg-blue-500 border-blue-500` when checked
- [ ] S60.2.4: Selection bar: appears when `selectedRows.length > 0`, shows "N건 선택됨"
- [ ] S60.2.5: "정산 승인" button in selection bar: Wallet icon, `bg-blue-500 text-white`
- [ ] S60.2.6: Click "정산 승인": calls `processSettlement.mutateAsync` for each selected row
- [ ] S60.2.7: Success toast: "N건의 정산이 처리되었어요" or "N건 처리, M건 실패"
- [ ] S60.2.8: Error toast: "일부 정산은 처리되지 않았어요"
- [ ] S60.2.9: Failed rows remain selected after bulk operation
- [ ] S60.2.10: Button disabled during `processSettlement.isPending`

### S60.3 -- Settlement Table Details

- [ ] S60.3.1: Type badges: match_fee=blue, others=gray
- [ ] S60.3.2: Status badges: pending=gray, processed=green, refunded=red, failed=amber
- [ ] S60.3.3: Net amount: `text-right text-base font-semibold text-blue-500`
- [ ] S60.3.4: Last action: action + date from history array
- [ ] S60.3.5: Loading: 4 skeleton bars
- [ ] S60.3.6: Error: ErrorState + retry
- [ ] S60.3.7: Empty: EmptyState "해당 상태의 정산 내역이 없어요"

### S60.4 -- Disputes List Page

- [ ] S60.4.1: Header: "신고/분쟁 관리" with pending/investigating count badges
- [ ] S60.4.2: Pending badge: gray-100 bg, Clock icon
- [ ] S60.4.3: Investigating badge: blue-50 bg, AlertCircle icon
- [ ] S60.4.4: AdminToolbar: search "팀명 또는 ID로 검색", filter: 전체/대기중/조사중/해결됨/기각됨
- [ ] S60.4.5: Table with 8 columns: ID, 신고팀, 피신고팀, 매치일, 유형, 상태, 신고일, (상세 link)
- [ ] S60.4.6: Type badges: no_show=red, late=amber, level_mismatch=gray, misconduct=red
- [ ] S60.4.7: Status badges: pending=gray, investigating=blue, resolved=green, dismissed=gray
- [ ] S60.4.8: "상세" link per row -> `/admin/disputes/{id}`
- [ ] S60.4.9: Loading: 4 skeleton blocks
- [ ] S60.4.10: Error: ErrorState + retry
- [ ] S60.4.11: Empty: EmptyState "검색 조건에 맞는 신고가 없어요"

### S60.5 -- Dispute Detail Page

- [ ] S60.5.1: Breadcrumb: "신고/분쟁" > dispute ID
- [ ] S60.5.2: [D] Two-column: `grid-cols-1 @3xl:grid-cols-[1fr_320px]`
- [ ] S60.5.3: Type badge + status badge + dispute ID as title + 접수일
- [ ] S60.5.4: Reporter team card (blue border): name, captain, trust score
- [ ] S60.5.5: Reported team card (red border): name, captain, trust score
- [ ] S60.5.6: Match info: date/time (Calendar), venue (MapPin)
- [ ] S60.5.7: Description text in gray-50 bg section
- [ ] S60.5.8: Resolution banner (green-50, if resolved)
- [ ] S60.5.9: Evidence section: list of evidence items with type and description

### S60.6 -- Dispute Actions

- [ ] S60.6.1: "조사 시작" button: blue border/bg, AlertTriangle icon
- [ ] S60.6.2: "해결 처리" button: green border/bg, CheckCircle icon
- [ ] S60.6.3: "기각 처리" button: gray border/bg, Ban icon
- [ ] S60.6.4: Each click opens Modal with "운영 판단 기록" title
- [ ] S60.6.5: Modal textarea for admin note (`id="admin-dispute-note"`)
- [ ] S60.6.6: Cancel + Save buttons (same pattern as user moderation modal)
- [ ] S60.6.7: Save: loading spinner (RefreshCw), disabled during pending
- [ ] S60.6.8: Success: toast + modal close + refetch
- [ ] S60.6.9: Error: toast error
- [ ] S60.6.10: Admin notes section shows `dispute.adminNotes`
- [ ] S60.6.11: Audit log section shows history entries
- [ ] S60.6.12: "운영 원칙" info box with Shield icon

### S60.7 -- Dispute Loading/Not Found

- [ ] S60.7.1: Loading: skeleton blocks
- [ ] S60.7.2: Error: ErrorState + retry
- [ ] S60.7.3: Not found: EmptyState "분쟁을 찾을 수 없어요" + "목록으로" action

---

## S61 -- Admin Statistics

**Source**: `apps/web/src/app/admin/statistics/page.tsx`

### S61.1 -- Page Structure

- [ ] S61.1.1: Breadcrumb: "대시보드" > "통계"
- [ ] S61.1.2: Header: "통계" + "mock 없이 실제 집계만 보여줍니다"
- [ ] S61.1.3: Period label badge: Calendar icon + `overview.periodLabel`

### S61.2 -- Metric Cards (4)

- [ ] S61.2.1: 전체 사용자: Users icon, blue-50 bg, sub "이번 달 +N"
- [ ] S61.2.2: 활성 사용자: TrendingUp icon, green-50 bg, sub "성장률 N%"
- [ ] S61.2.3: 총 매출: DollarSign icon, amber-50 bg, sub "활성 팀 N"
- [ ] S61.2.4: 등록 팀: Trophy icon, gray-100 bg, sub "활성 상품 N"
- [ ] S61.2.5: Grid: `grid-cols-2 @3xl:grid-cols-4`
- [ ] S61.2.6: Value: `text-3xl font-bold text-gray-900 dark:text-white`

### S61.3 -- Bar Charts

- [ ] S61.3.1: "월별 매치 수" chart: BarChart3 icon, vertical bars
- [ ] S61.3.2: Bar height proportional to max count, `bg-blue-500`, `rounded-t-lg`
- [ ] S61.3.3: Count label above each bar, month label below
- [ ] S61.3.4: `transition-[height] duration-300` animation
- [ ] S61.3.5: "월별 매출" chart: DollarSign icon, same bar pattern
- [ ] S61.3.6: Revenue formatted with `formatCurrencyCompact` (억/만 units)
- [ ] S61.3.7: [M] Charts stack vertically, [D] 2-column grid

### S61.4 -- Distribution and Rankings

- [ ] S61.4.1: "종목별 매치 분포" section: horizontal progress bars per sport
- [ ] S61.4.2: Each sport: label + count + progress bar (`bg-blue-500`, width proportional to max)
- [ ] S61.4.3: Empty: EmptyState "집계할 매치가 없어요"
- [ ] S61.4.4: "상위 시설" section: table with 시설, 매치, 매출, 평점 columns
- [ ] S61.4.5: Empty: EmptyState "집계할 시설이 없어요"

### S61.5 -- Loading/Error

- [ ] S61.5.1: Loading: full page animate-pulse skeleton (cards + chart + distribution)
- [ ] S61.5.2: Error: ErrorState "통계 데이터를 불러오지 못했어요" + retry for both queries

---

## S62 -- Dark Mode Cross-Cutting

### S62.1 -- Theme Toggle

- [ ] S62.1.1: Toggle to dark mode via `/settings` ThemePicker
- [ ] S62.1.2: Toggle applies immediately (no page reload)
- [ ] S62.1.3: Toggle back to light mode -> instant switch

### S62.2 -- Page-by-Page Dark Mode Verification

For each page below, verify all 11 checks:
1. `bg-white` -> `dark:bg-gray-800` or `dark:bg-gray-900`
2. `text-gray-900` -> `dark:text-white` or `dark:text-gray-100`
3. 4.5:1 contrast ratio maintained
4. Glass effects adjust opacity
5. Borders/dividers visible (`dark:border-gray-700` or `dark:border-gray-800`)
6. Hover states visible and distinguishable
7. Focus rings visible
8. Card shadows adapted
9. Modals use dark background
10. Toasts use dark variant
11. Empty/error states render correctly in dark

| # | Page | Route |
|---|------|-------|
| 01 | Landing | `/landing` |
| 02 | Login | `/login` |
| 03 | Home | `/home` |
| 04 | Matches List | `/matches` |
| 05 | Match Detail | `/matches/{id}` |
| 06 | Match Create | `/matches/new` |
| 07 | Teams List | `/teams` |
| 08 | Team Detail | `/teams/{id}` |
| 09 | Team Matches | `/team-matches` |
| 10 | Team Match Detail | `/team-matches/{id}` |
| 11 | Lessons | `/lessons` |
| 12 | Lesson Detail | `/lessons/{id}` |
| 13 | Marketplace | `/marketplace` |
| 14 | Listing Detail | `/marketplace/{id}` |
| 15 | Mercenary | `/mercenary` |
| 16 | Mercenary Detail | `/mercenary/{id}` |
| 17 | Venues | `/venues` |
| 18 | Venue Detail | `/venues/{id}` |
| 19 | Chat List | `/chat` |
| 20 | Chat Room | `/chat/{id}` |
| 21 | Notifications | `/notifications` |
| 22 | Profile | `/profile` |
| 23 | Settings | `/settings` |
| 24 | Account Settings | `/settings/account` |
| 25 | Payments | `/payments` |
| 26 | Checkout | `/payments/checkout` |
| 27 | Reviews | `/reviews` |
| 28 | Badges | `/badges` |
| 29 | Feed | `/feed` |
| 30 | Admin Dashboard | `/admin/dashboard` |
| 31 | Admin Users | `/admin/users` |
| 32 | Admin Matches | `/admin/matches` |

- [ ] S62.2.1-32: Each page passes all 11 dark mode checks

### S62.3 -- Component Dark Mode Verification

- [ ] S62.3.1: Modal in dark mode: dark bg, text inversion, border colors
- [ ] S62.3.2: Toast in dark mode: appropriate variant colors
- [ ] S62.3.3: Skeleton shimmer in dark mode: `dark:bg-gray-700` base
- [ ] S62.3.4: EmptyState in dark mode: icon and text colors inverted
- [ ] S62.3.5: ErrorState in dark mode: retry button visible
- [ ] S62.3.6: Admin sidebar in dark mode: `dark:bg-gray-800`, `dark:border-gray-700`
- [ ] S62.3.7: Bottom nav in dark mode: `glass-mobile-nav` dark adjustments
- [ ] S62.3.8: Mobile glass header in dark mode: gradient adjustments

---

## S63 -- Edge Cases: Empty States

### S63.1 -- User-Facing Pages

- [ ] S63.1.1: `/matches` with impossible filter -> EmptyState with Search/Trophy icon
- [ ] S63.1.2: `/teams` no teams -> EmptyState with Users icon
- [ ] S63.1.3: `/lessons` no results -> EmptyState with GraduationCap icon
- [ ] S63.1.4: `/marketplace` no listings -> EmptyState with ShoppingBag icon
- [ ] S63.1.5: `/mercenary` no posts -> EmptyState with UserPlus icon
- [ ] S63.1.6: `/chat` no rooms -> EmptyState
- [ ] S63.1.7: `/notifications` no notifications -> EmptyState
- [ ] S63.1.8: `/badges` no badges -> EmptyState
- [ ] S63.1.9: `/feed` no activity -> EmptyState
- [ ] S63.1.10: `/reviews` no pending -> EmptyState
- [ ] S63.1.11: `/my/matches` no matches per tab -> EmptyState
- [ ] S63.1.12: `/my/teams` no teams -> EmptyState
- [ ] S63.1.13: `/my/listings` no listings -> EmptyState

### S63.2 -- Admin Pages

- [ ] S63.2.1: `/admin/users` no users -> "아직 등록된 사용자가 없어요"
- [ ] S63.2.2: `/admin/matches` no matches -> "아직 등록된 매치가 없어요"
- [ ] S63.2.3: `/admin/lessons` no lessons -> "아직 등록된 강좌가 없어요"
- [ ] S63.2.4: `/admin/teams` no teams -> "아직 등록된 팀이 없어요"
- [ ] S63.2.5: `/admin/venues` no venues -> "등록된 시설이 없어요" + "시설 추가" action
- [ ] S63.2.6: `/admin/payments` no payments -> "아직 결제 내역이 없어요"
- [ ] S63.2.7: `/admin/settlements` empty filter -> "해당 상태의 정산 내역이 없어요"
- [ ] S63.2.8: `/admin/disputes` empty filter -> "검색 조건에 맞는 신고가 없어요"
- [ ] S63.2.9: `/admin/mercenary` empty -> "조건에 맞는 모집글이 없어요"
- [ ] S63.2.10: `/admin/reviews` no reviews -> "표시할 평가가 없어요"
- [ ] S63.2.11: `/admin/team-matches` empty -> "검색 조건에 맞는 팀 매칭이 없어요"
- [ ] S63.2.12: `/admin/statistics` sport distribution empty -> "집계할 매치가 없어요"
- [ ] S63.2.13: `/admin/statistics` top venues empty -> "집계할 시설이 없어요"

### S63.3 -- EmptyState Component Requirements

- [ ] S63.3.1: Each EmptyState has icon, title, description
- [ ] S63.3.2: Optional CTA button (action prop with label + href)
- [ ] S63.3.3: Dark mode renders correctly
- [ ] S63.3.4: `size="sm"` variant used in admin pages within containers

---

## S64 -- Edge Cases: Error States

### S64.1 -- Not Found Pages

- [ ] S64.1.1: `/admin/matches/{invalid-id}` -> EmptyState "매치를 찾을 수 없어요" + "목록으로" action
- [ ] S64.1.2: `/admin/users/{invalid-id}` -> EmptyState "사용자를 찾을 수 없어요" + "목록으로" action
- [ ] S64.1.3: `/admin/lessons/{invalid-id}` -> EmptyState "강좌를 찾을 수 없어요" + "목록으로" action
- [ ] S64.1.4: `/admin/teams/{invalid-id}` -> EmptyState "팀을 찾을 수 없어요" + "목록으로" action
- [ ] S64.1.5: `/admin/venues/{invalid-id}` -> EmptyState "시설을 찾을 수 없어요" + "목록으로" action
- [ ] S64.1.6: `/admin/disputes/{invalid-id}` -> EmptyState "분쟁을 찾을 수 없어요" + "목록으로" action
- [ ] S64.1.7: `/admin/team-matches/{invalid-id}` -> EmptyState "팀 매칭을 찾을 수 없어요" + "목록으로" action

### S64.2 -- API Error States

- [ ] S64.2.1: `/admin/dashboard` query error -> ErrorState "관리자 대시보드를 불러오지 못했어요" + retry
- [ ] S64.2.2: `/admin/users/{id}` query error -> ErrorState "사용자 상세를 불러오지 못했어요" + retry
- [ ] S64.2.3: `/admin/teams/{id}` query error -> ErrorState "팀 상세를 불러오지 못했어요" + retry
- [ ] S64.2.4: `/admin/disputes/{id}` query error -> ErrorState "분쟁 상세를 불러오지 못했어요" + retry
- [ ] S64.2.5: `/admin/venues/{id}` query error -> ErrorState "시설 상세를 불러오지 못했어요" + retry
- [ ] S64.2.6: `/admin/payments` query error -> ErrorState "결제 목록을 불러오지 못했어요" + retry
- [ ] S64.2.7: `/admin/settlements` query error -> ErrorState "정산 목록을 불러오지 못했어요" + retry
- [ ] S64.2.8: `/admin/disputes` query error -> ErrorState "분쟁 목록을 불러오지 못했어요" + retry
- [ ] S64.2.9: `/admin/mercenary` query error -> ErrorState "용병 모집글을 불러오지 못했어요" + retry
- [ ] S64.2.10: `/admin/reviews` query error -> ErrorState "평가 목록을 불러오지 못했어요" + retry
- [ ] S64.2.11: `/admin/team-matches` query error -> ErrorState "팀 매칭 목록을 불러오지 못했어요" + retry
- [ ] S64.2.12: `/admin/statistics` query error -> ErrorState "통계 데이터를 불러오지 못했어요" + retry

### S64.3 -- Mutation Error States

- [ ] S64.3.1: Match status change failure -> toast "상태 변경에 실패했어요. 다시 시도해주세요"
- [ ] S64.3.2: Lesson status change failure -> toast "상태 변경에 실패했어요"
- [ ] S64.3.3: User moderation failure -> toast from `extractErrorMessage`
- [ ] S64.3.4: Dispute update failure -> toast from `extractErrorMessage`
- [ ] S64.3.5: Venue save failure -> toast "저장하지 못했어요"
- [ ] S64.3.6: Venue create failure -> toast "실패했어요. 다시 시도해주세요" + inline error
- [ ] S64.3.7: Venue delete failure -> toast from `extractErrorMessage`
- [ ] S64.3.8: Mercenary delete failure -> toast from `extractErrorMessage`
- [ ] S64.3.9: Settlement process failure -> toast "일부 정산은 처리되지 않았어요"

---

## S65 -- Edge Cases: Loading States

### S65.1 -- Admin Page Skeletons

- [ ] S65.1.1: `/admin/dashboard` loading: MetricCard skeletons (`h-8 w-16 skeleton-shimmer`) + ActionItem skeletons
- [ ] S65.1.2: `/admin/users` loading: 5 user card skeletons with avatar + text placeholders
- [ ] S65.1.3: `/admin/matches` loading: 5 row skeletons
- [ ] S65.1.4: `/admin/lessons` loading: 3 table row skeletons
- [ ] S65.1.5: `/admin/teams` loading: [M] 3 card skeletons, [D] 2 table row skeletons
- [ ] S65.1.6: `/admin/venues` loading: 4 table row skeletons
- [ ] S65.1.7: `/admin/payments` loading: 5 bar skeletons in bordered container
- [ ] S65.1.8: `/admin/settlements` loading: 4 rounded-2xl bar skeletons
- [ ] S65.1.9: `/admin/disputes` loading: 4 rounded-2xl bar skeletons
- [ ] S65.1.10: `/admin/mercenary` loading: 5 bar skeletons in bordered container
- [ ] S65.1.11: `/admin/reviews` loading: 5 bar skeletons in bordered container
- [ ] S65.1.12: `/admin/team-matches` loading: 4 rounded-2xl bar skeletons
- [ ] S65.1.13: `/admin/statistics` loading: full page skeleton (h-8 header + 4 metric cards + h-60 chart)

### S65.2 -- Detail Page Skeletons

- [ ] S65.2.1: `/admin/users/{id}` loading: h-8 title + h-48 profile + h-32 sidebar
- [ ] S65.2.2: `/admin/matches/{id}` loading: h-8 title + h-48 info + h-64 participants
- [ ] S65.2.3: `/admin/lessons/{id}` loading: h-8 title + h-48 + h-32
- [ ] S65.2.4: `/admin/teams/{id}` loading: h-8 title + h-40 + h-64
- [ ] S65.2.5: `/admin/disputes/{id}` loading: h-8 title + h-40
- [ ] S65.2.6: `/admin/team-matches/{id}` loading: h-8 title + h-40
- [ ] S65.2.7: `/admin/venues/{id}` loading: h-8 title + h-64

### S65.3 -- Skeleton Styling

- [ ] S65.3.1: All skeletons use `animate-pulse` or `skeleton-shimmer`
- [ ] S65.3.2: [L] Skeleton bg: `bg-gray-100` or `bg-gray-50`
- [ ] S65.3.3: [K] Skeleton bg: `dark:bg-gray-700` or `dark:bg-gray-800`

---

## S66 -- Edge Cases: Form Validations

### S66.1 -- Venue New Form

- [ ] S66.1.1: Submit button disabled when `form.name` is empty
- [ ] S66.1.2: Fill name -> button becomes enabled (bg-blue-500)
- [ ] S66.1.3: Clear name -> button returns to disabled (bg-gray-300)
- [ ] S66.1.4: Facility input: Enter adds tag, duplicate ignored
- [ ] S66.1.5: Facility tag X button: click removes tag
- [ ] S66.1.6: Sport toggle: click adds/removes from `sportTypes` array

### S66.2 -- User Moderation Modal

- [ ] S66.2.1: Suspend action: note is required, save disabled when empty
- [ ] S66.2.2: Warn action: note optional, save always enabled
- [ ] S66.2.3: Reactivate action: note optional, save always enabled

### S66.3 -- Dispute Action Modal

- [ ] S66.3.1: All 3 actions (investigating/resolved/dismissed): note optional
- [ ] S66.3.2: Save always enabled (no required field validation)

### S66.4 -- Admin Match Status

- [ ] S66.4.1: Select disabled during status mutation
- [ ] S66.4.2: Success/error feedback appears below select

### S66.5 -- Admin Lesson Status

- [ ] S66.5.1: Same behavior as match status change

---

## S67 -- Edge Cases: Auth Guards

### S67.1 -- Admin Layout Auth Guard

- [ ] S67.1.1: Not authenticated -> `router.replace('/login')`
- [ ] S67.1.2: Authenticated but not admin -> `router.replace('/home')`
- [ ] S67.1.3: Auth loading (authenticated but user data incomplete) -> "권한 정보를 확인하는 중입니다"
- [ ] S67.1.4: Not authenticated + not admin -> auth wall with ShieldCheck icon + "관리자 권한이 필요합니다"
- [ ] S67.1.5: Auth wall link text: "홈으로 이동" (when authenticated) or "로그인" (when not)
- [ ] S67.1.6: Auth wall link: hover `text-blue-600`, `transition-colors`
- [ ] S67.1.7: `data-testid="admin-auth-wall"` on auth wall container

### S67.2 -- User-Facing Auth Guards

- [ ] S67.2.1: `/profile` logged out -> redirect to `/login?redirect=/profile`
- [ ] S67.2.2: `/my/matches` logged out -> redirect
- [ ] S67.2.3: `/settings/account` logged out -> redirect
- [ ] S67.2.4: `/chat` logged out -> redirect or empty state
- [ ] S67.2.5: `/reviews` logged out -> redirect
- [ ] S67.2.6: `/matches/new` logged out -> redirect
- [ ] S67.2.7: `/teams/new` logged out -> redirect
- [ ] S67.2.8: `/lessons/new` logged out -> redirect
- [ ] S67.2.9: `/marketplace/new` logged out -> redirect
- [ ] S67.2.10: `/mercenary/new` logged out -> redirect
- [ ] S67.2.11: Redirect parameter preserved in URL query string

### S67.3 -- Sidebar Conditional Rendering

- [ ] S67.3.1: "소통" section (chat/notifications) hidden when not authenticated
- [ ] S67.3.2: "관리자" link hidden when `user.role !== 'admin'`
- [ ] S67.3.3: Both sections appear after login with admin role

---

## Cross-Cutting Rules Summary

1. **Every interactive element**: default, hover, focus-visible, active, disabled, loading states verified
2. **Every form input**: focus ring, type, blur, validation error display, error clear on fix
3. **Every modal**: ESC close (where implemented), backdrop click close, focus trap, aria-modal
4. **Every toggle**: on/off visual states, loading during mutation
5. **All animations**: `animate-fade-in` on page mount, `animate-pulse` on skeletons, `transition-colors` on interactions, `transition-transform` on sidebar slide
6. **All aria attributes**: `aria-label` on icon buttons, `aria-current="page"` on active nav, `aria-hidden="true"` on decorative icons, `role="link"` on clickable rows
7. **Keyboard navigation**: Tab order through all interactive elements, Enter/Space activation, focus-visible rings
8. **Mobile touch**: 44x44px minimum touch targets (`min-h-[44px]`), safe area insets
9. **Viewport differences**: mobile card vs desktop table layouts, hidden elements at breakpoints, grid column changes
10. **Theme differences**: all `dark:` variant classes verified, 4.5:1 contrast maintained
11. **Locale differences**: all user-facing text via `next-intl`, labels switch between ko/en
