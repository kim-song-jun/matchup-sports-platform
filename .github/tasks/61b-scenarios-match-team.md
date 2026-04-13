# Part B: Match Discovery, Match Detail, Match Creation, Teams, Team Members, Team Matches

**Matrix**: 12 combinations per scenario
- Viewports: mobile (390x844), tablet (768x1024), desktop (1440x900)
- Language: Korean (ko), English (en)
- Theme: Light mode, Dark mode

---

## S06 — Home Feed (Authenticated)

**Source**: `apps/web/src/app/(main)/home/home-client.tsx`

### S06-01: Page initial load and header greeting

Step 1: Navigate to /home as authenticated user
  - Action: Navigate to URL /home
  - Target: `header` within `.pt-[var(--safe-area-top)]`
  - Expected Result: Header renders eyebrow "오늘의 매치", greeting "안녕하세요, {nickname}님!", subtitle with upcoming count or "오늘의 매치를 찾아보세요"
  - Screenshot: 01-home-header-greeting.png
  - Viewport notes: Mobile/tablet show safe-area-top padding; desktop (@3xl) removes top padding
  - Theme notes: Light: text-gray-900 heading; Dark: text-white heading, text-gray-400 subtitle
  - Locale notes: ko "안녕하세요, {nickname}님!" / en greeting via next-intl `home.greeting`

Step 2: Verify CTA button for authenticated user
  - Action: Observe CTA button in header
  - Target: `a[href="/matches/new"]` with Plus icon
  - Expected Result: Blue pill button "매치 만들기" with Plus icon, min-h-[44px], bg-blue-500 text-white
  - Screenshot: 02-home-cta-authenticated.png
  - Viewport notes: Same across viewports
  - Theme notes: Light: bg-blue-500; Dark: bg-blue-500 (same)
  - Locale notes: ko "매치 만들기" / en via `home.createMatch`

Step 3: Hover CTA button
  - Action: Hover over "매치 만들기" button
  - Target: `a[href="/matches/new"]`
  - Expected Result: Background transitions to bg-blue-600 via transition-colors
  - Screenshot: 03-home-cta-hover.png
  - Viewport notes: Hover only visible on desktop; mobile uses tap
  - Theme notes: Same bg-blue-600 both themes
  - Locale notes: No difference

Step 4: Click CTA button
  - Action: Click "매치 만들기" button
  - Target: `a[href="/matches/new"]`
  - Expected Result: Navigates to /matches/new (Create Match wizard)
  - Screenshot: 04-home-cta-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S06-02: Upcoming schedule section (authenticated only)

Step 5: Verify upcoming schedule section appears
  - Action: Observe section below header
  - Target: `section` containing rounded-2xl bg-gray-50 panel
  - Expected Result: Shows "다가오는 일정" heading with "전체보기" link, list of upcoming matches (within 3 days) and team matches
  - Screenshot: 05-home-upcoming-section.png
  - Viewport notes: Mobile: px-5; Desktop: px-0
  - Theme notes: Light: bg-gray-50; Dark: bg-gray-800/60
  - Locale notes: ko "다가오는 일정" / en `home.upcomingSchedule`; ko "전체보기" / en `home.viewAll`

Step 6: Click "전체보기" link
  - Action: Click "전체보기" link
  - Target: `a[href="/my/matches"]`
  - Expected Result: Navigates to /my/matches
  - Screenshot: 06-home-upcoming-viewall.png
  - Viewport notes: min-h-[44px] link, same across viewports
  - Theme notes: text-blue-500 both themes
  - Locale notes: ko "전체보기" / en `home.viewAll`

Step 7: Click an upcoming match item
  - Action: Click on a match item in the upcoming list
  - Target: `a[href^="/matches/"]` within upcoming section
  - Expected Result: Navigates to /matches/{id}; hover state shows bg-white (light) or bg-gray-800 (dark); active state shows scale-[0.98]
  - Screenshot: 07-home-upcoming-click.png
  - Viewport notes: Same layout all viewports
  - Theme notes: Light: hover bg-white; Dark: hover bg-gray-800
  - Locale notes: No difference

Step 8: Click an upcoming team match item
  - Action: Click on a team match item in the upcoming list
  - Target: `a[href^="/team-matches/"]` within upcoming section
  - Expected Result: Navigates to /team-matches/{id}
  - Screenshot: 08-home-upcoming-team-match.png
  - Viewport notes: Same
  - Theme notes: Same as Step 7
  - Locale notes: No difference

### S06-03: Banner carousel

Step 9: Verify banner carousel renders
  - Action: Observe banner carousel section
  - Target: `.relative.h-32.overflow-hidden.rounded-2xl` container
  - Expected Result: First banner visible ("팀 매칭 찾기"), dot indicators at bottom-right (3 dots), first dot is wider (w-4) and white, others are w-1.5 and white/40
  - Screenshot: 09-home-banner-initial.png
  - Viewport notes: Same rounded-2xl container across viewports; px-5 mobile, px-0 desktop
  - Theme notes: Banner 1 and 2 are dark backgrounds (text-white); Banner 3 is light (from-gray-50 to-blue-50 light / from-gray-800 to-gray-700 dark)
  - Locale notes: Banner text is hardcoded Korean — no locale difference

Step 10: Wait for auto-advance (5 seconds)
  - Action: Wait 5000ms
  - Target: Banner slide rail
  - Expected Result: Banner slides to second banner ("첫 매치 무료") via translateX transition (duration-500 ease-in-out); dot indicator updates — second dot now w-4
  - Screenshot: 10-home-banner-auto-advance.png
  - Viewport notes: No difference; prefers-reduced-motion stops auto-advance
  - Theme notes: Banner 2 is dark bg (gray-700 to gray-900)
  - Locale notes: No difference

Step 11: Click dot indicator (3rd dot)
  - Action: Click third dot indicator button
  - Target: `button[aria-label="배너 3"]`
  - Expected Result: Banner slides to third banner ("용병 구하기"); third dot becomes w-4; translateX updates
  - Screenshot: 11-home-banner-dot-click.png
  - Viewport notes: No difference
  - Theme notes: Banner 3: Light bg-gradient from-gray-50 to-blue-50 (text-gray-900); Dark from-gray-800 to-gray-700 (text-white via dark: override)
  - Locale notes: No difference

Step 12: Hover banner — pause auto-advance
  - Action: Hover (mouseenter) over banner container
  - Target: `.relative.h-32.overflow-hidden.rounded-2xl`
  - Expected Result: Auto-advance pauses (bannerPaused=true); banner stays on current slide
  - Screenshot: 12-home-banner-hover-pause.png
  - Viewport notes: Hover only on desktop; mobile irrelevant
  - Theme notes: No difference
  - Locale notes: No difference

Step 13: Click banner — navigate
  - Action: Click on a banner link
  - Target: `a[href="/team-matches"]` (banner 1) or `a[href="/matches"]` (banner 2) or `a[href="/mercenary"]` (banner 3)
  - Expected Result: Navigates to the banner's href
  - Screenshot: 13-home-banner-click-navigate.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S06-04: Quick nav chips

Step 14: Verify quick nav chips render
  - Action: Observe "더 찾아보기" section
  - Target: Section with h2 "더 찾아보기" and horizontal chip row
  - Expected Result: 4 chips visible: "레슨", "팀 매칭", "용병", "구장"; each has icon + label; min-h-[44px]; border border-gray-100; horizontally scrollable
  - Screenshot: 14-home-quick-nav-chips.png
  - Viewport notes: Mobile: horizontal scroll with overflow-x-auto scrollbar-hide; Desktop: may all fit in one row
  - Theme notes: Light: bg-white border-gray-100 text-gray-700; Dark: bg-gray-800 border-gray-700 text-gray-300
  - Locale notes: ko "레슨" "팀 매칭" "용병" "구장" / en via `nav.*` translations

Step 15: Hover a quick nav chip
  - Action: Hover over "레슨" chip
  - Target: `a[href="/lessons"]`
  - Expected Result: Background transitions to bg-gray-50 (light) or bg-gray-700 (dark) via transition-colors
  - Screenshot: 15-home-quick-nav-hover.png
  - Viewport notes: Desktop only
  - Theme notes: Light: hover bg-gray-50; Dark: hover bg-gray-700
  - Locale notes: No difference

Step 16: Click a quick nav chip
  - Action: Click "팀 매칭" chip
  - Target: `a[href="/team-matches"]`
  - Expected Result: Navigates to /team-matches
  - Screenshot: 16-home-quick-nav-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S06-05: Sport filter chips

Step 17: Verify sport filter chips
  - Action: Observe sport filter row
  - Target: Button row with "전체", "축구", "풋살", "농구", "배드민턴", "아이스하키", "수영", "테니스"
  - Expected Result: "전체" is active (bg-blue-500 text-white), others inactive (bg-gray-50 text-gray-500); each has aria-pressed, min-h-[44px]
  - Screenshot: 17-home-sport-filters.png
  - Viewport notes: Horizontal scroll with scrollbar-hide on mobile
  - Theme notes: Active: bg-blue-500 both themes; Inactive light: bg-gray-50 text-gray-500; Inactive dark: bg-gray-800 text-gray-500
  - Locale notes: ko "전체" "축구" etc. / en via `sports.*`

Step 18: Click a sport filter chip (e.g., "풋살")
  - Action: Click "풋살" chip
  - Target: Button with sportType "futsal"
  - Expected Result: "풋살" becomes active (bg-blue-500 text-white); "전체" becomes inactive; match list filters to futsal matches only
  - Screenshot: 18-home-sport-filter-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko "풋살" / en "Futsal"

Step 19: Click same sport filter chip again to deselect
  - Action: Click "풋살" chip again
  - Target: Same button
  - Expected Result: "풋살" deselects (back to inactive); activeSport resets to "all"; "전체" re-activates; all matches shown
  - Screenshot: 19-home-sport-filter-deselect.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S06-06: Match section and cards

Step 20: Verify match section with "더 보기" link
  - Action: Observe match section (SectionHeader component)
  - Target: SectionHeader with title and "더 보기" link to /matches
  - Expected Result: Section heading rendered, "더 보기" link with ArrowRight icon visible
  - Screenshot: 20-home-match-section-header.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko heading / en via translations

Step 21: Verify match cards render
  - Action: Observe match cards in horizontal scroll or grid
  - Target: MatchCard components with `[data-testid="match-card"]`
  - Expected Result: Each card shows: sport dot + label, time badge, fee overlay, player count badge, 16:9 image with gradient overlay, title, date/time, location, level range
  - Screenshot: 21-home-match-cards.png
  - Viewport notes: Mobile: horizontal scroll; Desktop: grid layout
  - Theme notes: Card bg-white (light) / bg-gray-800 (dark); image gradient from-black/55; text colors adapt
  - Locale notes: Sport labels translated; dates in locale format

Step 22: Hover a match card
  - Action: Hover over a match card
  - Target: `[data-testid="match-card"]`
  - Expected Result: Card border transitions to border-gray-200 (light) / border-gray-700 (dark); image scales to 1.02 via group-hover:scale-[1.02]; transition duration-300
  - Screenshot: 22-home-match-card-hover.png
  - Viewport notes: Desktop only; mobile shows active:scale-[0.98] on tap
  - Theme notes: Light: hover border-gray-200; Dark: hover border-gray-700
  - Locale notes: No difference

Step 23: Click a match card
  - Action: Click on a match card
  - Target: `a[href^="/matches/"]`
  - Expected Result: Navigates to /matches/{id}; card shows active:scale-[0.98] press animation
  - Screenshot: 23-home-match-card-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S06-07: Loading skeleton state

Step 24: Observe loading skeleton
  - Action: Navigate to /home with slow network
  - Target: Page loading state
  - Expected Result: Match section shows skeleton-shimmer cards with aspect-[16/9] placeholder and text placeholders (h-4 w-3/4 and h-3 w-1/2 bg-gray-100 rounded)
  - Screenshot: 24-home-loading-skeleton.png
  - Viewport notes: Same skeleton pattern across viewports
  - Theme notes: Light: bg-gray-100 skeletons; Dark: bg-gray-700 skeletons
  - Locale notes: No difference

### S06-08: Unauthenticated state

Step 25: Navigate to /home as unauthenticated user
  - Action: Navigate to /home without auth token
  - Target: Header and CTA
  - Expected Result: Header shows "TeamMeet" (no greeting); CTA shows "로그인" button linking to /login; no upcoming schedule section; dark value proposition panel shown instead; no banner carousel
  - Screenshot: 25-home-unauthenticated.png
  - Viewport notes: No difference
  - Theme notes: Value proposition panel: bg-gray-900 (light) / bg-gray-800 (dark)
  - Locale notes: ko "로그인" / en `common.login`

---

## S07 — Match Discovery Page

**Source**: `apps/web/src/app/(main)/matches/matches-client.tsx`

### S07-01: Page initial load

Step 1: Navigate to /matches
  - Action: Navigate to URL /matches
  - Target: MobilePageTopZone with eyebrow "AI 추천"
  - Expected Result: Page top zone shows eyebrow "AI 추천", title (translated `matches.findMatch`), subtitle, and Plus create button. Below: search bar, filter toggle, sport chips, quick filter chips, match results
  - Screenshot: 01-matches-page-load.png
  - Viewport notes: Mobile: pt-[var(--safe-area-top)] with px-5; Desktop: @3xl:px-0
  - Theme notes: Standard light/dark backgrounds
  - Locale notes: ko "매치 찾기" / en via `matches.findMatch`

### S07-02: Search input

Step 2: Focus search input
  - Action: Click on search input
  - Target: `input#match-search-input` (data-testid="match-search-input")
  - Expected Result: Input receives focus with focus ring (blue-500 outline); Search icon (gray-500) visible left side; placeholder text visible
  - Screenshot: 02-matches-search-focus.png
  - Viewport notes: Input has pl-10 pr-11 for icon clearance
  - Theme notes: Light: bg-white; Dark: dark variant of Input component
  - Locale notes: ko placeholder via `matches.searchPlaceholder` / en translation

Step 3: Type in search input
  - Action: Type "풋살" into search input
  - Target: `input#match-search-input`
  - Expected Result: Text appears in input; X clear button appears on right side; after 300ms debounce, URL updates with ?q=풋살; match list filters accordingly
  - Screenshot: 03-matches-search-type.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 4: Click X clear button in search
  - Action: Click X button inside search input
  - Target: `button[aria-label]` with X icon inside search container
  - Expected Result: Search input clears; X button disappears; URL parameter q removed; matches reset to unfiltered
  - Screenshot: 04-matches-search-clear.png
  - Viewport notes: Clear button is h-7 w-7 rounded-full
  - Theme notes: Light: hover bg-gray-200 text-gray-600; Dark: hover bg-gray-700 text-gray-200
  - Locale notes: aria-label via `matches.clearSearch`

Step 5: Keyboard: Tab to search, type, Enter
  - Action: Press Tab to focus search, type text, press Enter
  - Target: `input#match-search-input`
  - Expected Result: Focus ring visible; typing triggers debounced filter; Enter does not submit form (no form wrapping)
  - Screenshot: 05-matches-search-keyboard.png
  - Viewport notes: No difference
  - Theme notes: Focus ring blue-500
  - Locale notes: No difference

### S07-03: Filter toggle button

Step 6: Observe filter toggle button (collapsed)
  - Action: Observe filter toggle button
  - Target: `button[data-testid="match-filter-toggle"]`
  - Expected Result: SlidersHorizontal icon, 46x46px button; when no active filters: border border-gray-100, bg-white, text-gray-500; no badge
  - Screenshot: 06-matches-filter-toggle-default.png
  - Viewport notes: Same size across viewports
  - Theme notes: Light: border-gray-100 bg-white; Dark: border-gray-700 bg-gray-800 text-gray-300
  - Locale notes: aria-label via `matches.openFilters`

Step 7: Click filter toggle to expand
  - Action: Click filter toggle button
  - Target: `button[data-testid="match-filter-toggle"]`
  - Expected Result: Button turns active (bg-blue-500 text-white); expanded filter panel appears below with date input, region input, level buttons (4), sort buttons (3)
  - Screenshot: 07-matches-filter-toggle-expand.png
  - Viewport notes: Filter panel: desktop shows grid-cols-2 for date/region; mobile stacks
  - Theme notes: Active button: bg-blue-500 text-white both themes; Panel: Card variant="subtle"
  - Locale notes: All filter labels translated

Step 8: Observe filter badge count
  - Action: Apply 2 filters (e.g., today + free), then observe toggle button
  - Target: Badge on filter toggle button
  - Expected Result: Small badge (-right-1 -top-1) shows "2" in h-5 min-w-[20px] circle; bg-gray-900 text-white (light) / bg-white text-gray-900 (dark)
  - Screenshot: 08-matches-filter-badge.png
  - Viewport notes: No difference
  - Theme notes: Light: bg-gray-900 text-white badge; Dark: bg-white text-gray-900 badge
  - Locale notes: No difference

Step 9: Click filter toggle to collapse
  - Action: Click filter toggle button again
  - Target: `button[data-testid="match-filter-toggle"]`
  - Expected Result: Expanded filter panel hides; button returns to non-active style; badge still shows if filters active
  - Screenshot: 09-matches-filter-toggle-collapse.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S07-04: Sport filter chips (8 chips)

Step 10: Verify sport filter chips
  - Action: Observe sport filter chip row
  - Target: Chip row below search bar
  - Expected Result: 8 chips: 전체, 축구, 풋살, 농구, 배드민턴, 아이스하키, 수영, 테니스; "전체" is active (aria-pressed=true, bg-blue-500 text-white); each has data-testid="match-sport-{key}"
  - Screenshot: 10-matches-sport-chips.png
  - Viewport notes: Mobile: horizontal scroll with overflow-x-auto scrollbar-hide pb-1
  - Theme notes: Active: bg-blue-500 text-white; Inactive light: bg-gray-50 text-gray-600; Inactive dark: bg-gray-800 text-gray-300
  - Locale notes: ko "전체" "축구" etc. / en via `sports.*`

Step 11: Click "축구" sport chip
  - Action: Click "축구" chip
  - Target: `button[data-testid="match-sport-soccer"]`
  - Expected Result: "축구" becomes active (bg-blue-500); "전체" becomes inactive; aria-pressed updates; URL updates with ?sport=soccer; match list filters to soccer only; active summary chip "축구" appears below
  - Screenshot: 11-matches-sport-soccer.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko "축구" / en "Soccer"

Step 12: Click "축구" again to deselect
  - Action: Click "축구" chip again
  - Target: `button[data-testid="match-sport-soccer"]`
  - Expected Result: "축구" deselects; sport filter resets to empty (all sports); URL param removed; "전체" does NOT become active — no sport selected means all
  - Screenshot: 12-matches-sport-deselect.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S07-05: Quick filter chips (4 chips)

Step 13: Click "오늘" quick filter
  - Action: Click "오늘" chip
  - Target: `button[data-testid="match-quick-today"]`
  - Expected Result: Chip becomes active (bg-blue-500 text-white, aria-pressed=true); URL updates with ?date=YYYY-MM-DD (today); matches filter to today only; expanded filter panel auto-opens (showFilters=true); active summary shows today's date
  - Screenshot: 13-matches-quick-today.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko "오늘" / en `matches.today`

Step 14: Click "무료" quick filter
  - Action: Click "무료" chip
  - Target: `button[data-testid="match-quick-free"]`
  - Expected Result: Chip becomes active; URL updates with ?fee=free; matches show only fee=0 matches; summary chip "무료" appears
  - Screenshot: 14-matches-quick-free.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko "무료" / en `matches.free`

Step 15: Click "초보" quick filter
  - Action: Click "초보" chip
  - Target: `button[data-testid="match-quick-beginner"]`
  - Expected Result: Chip becomes active; URL updates with ?level=beginner; matches filter to beginner level
  - Screenshot: 15-matches-quick-beginner.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko "초보" / en `matches.beginner`

Step 16: Click "자리있음" quick filter
  - Action: Click "자리있음" chip (with Sparkles icon)
  - Target: `button[data-testid="match-quick-available"]`
  - Expected Result: Chip becomes active; URL updates with ?available=true; matches show only non-full matches
  - Screenshot: 16-matches-quick-available.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko "자리있음" / en `matches.availableOnly`

Step 17: Toggle "오늘" off
  - Action: Click "오늘" chip again
  - Target: `button[data-testid="match-quick-today"]`
  - Expected Result: Chip deactivates; date filter removed from URL; matches reset
  - Screenshot: 17-matches-quick-today-off.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S07-06: Expanded filter panel

Step 18: Interact with date filter input
  - Action: Click date input, select a date
  - Target: `input#match-filter-date` (data-testid="match-date-input")
  - Expected Result: Native date picker opens; selecting a date updates URL with ?date=YYYY-MM-DD; matches filter
  - Screenshot: 18-matches-filter-date.png
  - Viewport notes: Native date picker varies by platform
  - Theme notes: Input has dark:bg-gray-900
  - Locale notes: Date format locale-dependent

Step 19: Type in region filter input
  - Action: Type "서울" in region input
  - Target: `input#match-filter-region` (data-testid="match-region-input")
  - Expected Result: URL updates with ?city=서울; matches filter by city; active summary shows "지역: 서울"
  - Screenshot: 19-matches-filter-region.png
  - Viewport notes: On desktop, date and region side by side (grid-cols-2)
  - Theme notes: No difference
  - Locale notes: ko placeholder "예: 서울, 마포" / en via `matches.regionPlaceholder`

Step 20: Click level filter buttons (4 options)
  - Action: Click each level button: "전체", "입문", "중급", "상급"
  - Target: `button[data-testid="match-level-all"]`, `button[data-testid="match-level-beginner"]`, etc.
  - Expected Result: Selected button becomes bg-blue-500 text-white; others have border border-gray-200 bg-white; aria-pressed updates; URL updates with ?level=
  - Screenshot: 20-matches-filter-level.png
  - Viewport notes: Buttons wrap on mobile, fit in row on desktop
  - Theme notes: Inactive dark: border-gray-600 bg-gray-700 text-gray-300
  - Locale notes: ko "전체" "입문" "중급" "상급" / en via translations

Step 21: Click sort filter buttons (3 options)
  - Action: Click each sort button: "마감임박순", "최신순", "마감순"
  - Target: `button[data-testid="match-sort-upcoming"]`, `button[data-testid="match-sort-latest"]`, `button[data-testid="match-sort-deadline"]`
  - Expected Result: Selected button becomes bg-blue-500 text-white; URL updates with ?sort=; match order changes
  - Screenshot: 21-matches-filter-sort.png
  - Viewport notes: No difference
  - Theme notes: Same as level filters
  - Locale notes: ko / en via translations

### S07-07: Active filter summary chips

Step 22: Observe active filter summary chips
  - Action: Apply multiple filters (e.g., sport=soccer, fee=free)
  - Target: Summary chip row below quick filters
  - Expected Result: Blue summary chips appear: "축구", "무료" — each is rounded-full bg-blue-50 px-3 py-1.5 text-2xs text-blue-600
  - Screenshot: 22-matches-filter-summary.png
  - Viewport notes: Wraps (flex-wrap)
  - Theme notes: Light: bg-blue-50 text-blue-600; Dark: bg-blue-900/30 text-blue-300
  - Locale notes: Labels translated per filter type

### S07-08: Clear all filters

Step 23: Click "필터 초기화" button
  - Action: Click "필터 초기화" button
  - Target: `button[data-testid="match-clear-filters"]`
  - Expected Result: All filters reset; URL params cleared; sport chips all inactive; quick filter chips all inactive; search input cleared; summary chips disappear; match list shows all matches
  - Screenshot: 23-matches-clear-filters.png
  - Viewport notes: Button is shrink-0 rounded-full with min-h-[44px]
  - Theme notes: Light: border-gray-100 bg-white text-gray-600; Dark: border-gray-700 bg-gray-800 text-gray-300
  - Locale notes: ko "필터 초기화" / en `matches.clearFilters`

### S07-09: List view vs Map view toggle

Step 24: Observe view mode toggle
  - Action: Observe list/map toggle buttons
  - Target: Toggle group with List and Map icons
  - Expected Result: Two buttons in rounded-full border container; List is active (bg-blue-500 text-white); Map is inactive; each has aria-pressed and aria-label
  - Screenshot: 24-matches-view-toggle.png
  - Viewport notes: Same across viewports
  - Theme notes: Inactive: text-gray-500 (light) / text-gray-300 (dark)
  - Locale notes: aria-labels: "리스트 뷰" / "지도 뷰"

Step 25: Click Map view toggle
  - Action: Click Map view button
  - Target: `button[aria-label="지도 뷰"]`
  - Expected Result: Map button becomes active (bg-blue-500); List becomes inactive; MatchesMapView component loads (dynamic import with skeleton loading); map pins displayed for matches with venues
  - Screenshot: 25-matches-map-view.png
  - Viewport notes: Map height 400px with rounded-xl; skeleton while loading
  - Theme notes: Skeleton: bg-gray-100 (light) / bg-gray-800 (dark)
  - Locale notes: No difference

Step 26: Click a map pin
  - Action: Click a pin on the map
  - Target: Map marker/pin
  - Expected Result: Match info popup appears near the pin
  - Screenshot: 26-matches-map-pin-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 27: Switch back to List view
  - Action: Click List view button
  - Target: `button[aria-label="리스트 뷰"]`
  - Expected Result: Map hides; match card list appears; List button active
  - Screenshot: 27-matches-list-view.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S07-10: Match cards in list

Step 28: Observe match card structure
  - Action: Inspect a match card
  - Target: `[data-testid="match-card"]`
  - Expected Result: Card shows: 16:9 image with gradient overlay; sport dot + label (top-left); time badge (if upcoming); fee (bottom-left); player count badge (bottom-right showing "마감" or "N자리 남음" or "N/M"); title below; date/time + venue name; location + level range; optional recommendation reason badges
  - Screenshot: 28-matches-card-structure.png
  - Viewport notes: Mobile: single column flex gap-3; Desktop: grid-cols-2 gap-4
  - Theme notes: Card: hover:border-gray-200 (light) / hover:border-gray-700 (dark); text colors adapt
  - Locale notes: Sport labels, date formats translated

Step 29: Hover match card
  - Action: Hover over match card
  - Target: `[data-testid="match-card"]`
  - Expected Result: Border color transitions to border-gray-200 (light) / border-gray-700 (dark); image scales to 1.02 (transition-transform duration-300)
  - Screenshot: 29-matches-card-hover.png
  - Viewport notes: Desktop only
  - Theme notes: As described
  - Locale notes: No difference

Step 30: Click match card
  - Action: Click on a match card
  - Target: `a[href="/matches/{id}"]`
  - Expected Result: Active state shows scale-[0.98]; navigates to /matches/{id}
  - Screenshot: 30-matches-card-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S07-11: Create button

Step 31: Click "+" create button
  - Action: Click the Plus create button
  - Target: `a[href="/matches/new"]` (in MobilePageTopZone)
  - Expected Result: Navigates to /matches/new; button is h-11 w-11 rounded-xl bg-blue-500 text-white
  - Screenshot: 31-matches-create-button.png
  - Viewport notes: Same button across viewports
  - Theme notes: Light: bg-blue-500; Dark: bg-blue-600
  - Locale notes: aria-label "매치 만들기"

### S07-12: Data states

Step 32: Loading skeleton state
  - Action: Navigate with slow network
  - Target: Card skeletons
  - Expected Result: 4 skeleton cards with skeleton-shimmer animation; each has aspect-[16/9] and two placeholder lines (h-4 w-3/4, h-3 w-1/2)
  - Screenshot: 32-matches-loading.png
  - Viewport notes: Desktop: grid-cols-2; Mobile: stacked
  - Theme notes: Light: bg-gray-100; Dark: bg-gray-700
  - Locale notes: No difference

Step 33: Error state with retry
  - Action: Simulate network error
  - Target: ErrorState component
  - Expected Result: ErrorState renders with retry button; clicking retry calls refetch()
  - Screenshot: 33-matches-error.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 34: Empty state
  - Action: Apply filter that returns no results
  - Target: EmptyState component with Search icon
  - Expected Result: EmptyState shows with title (via `empty.noSearchResults`), description, and action link "용병 찾기" linking to /mercenary
  - Screenshot: 34-matches-empty.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: ko title/desc / en translations

Step 35: Match count indicator
  - Action: Observe count text when matches loaded
  - Target: `p[data-testid="match-count"]`
  - Expected Result: Shows "{N}개의 매치" text; if filters active or pending, shows "(필터 적용)" suffix
  - Screenshot: 35-matches-count.png
  - Viewport notes: No difference
  - Theme notes: text-gray-500 (light) / text-gray-400 (dark)
  - Locale notes: ko "{N}개의 매치" / en via `matches.matchCount`

### S07-13: Keyboard navigation

Step 36: Tab through all interactive elements
  - Action: Press Tab repeatedly from top of page
  - Target: All buttons, links, inputs
  - Expected Result: Focus ring (blue-500 outline) visible on each interactive element in order: create button, clear filters, list/map toggle, search input, filter toggle, sport chips, quick filter chips, match cards
  - Screenshot: 36-matches-keyboard-tab.png
  - Viewport notes: No difference
  - Theme notes: Focus ring visible in both themes
  - Locale notes: No difference

---

## S08 — Match Detail Page

**Source**: `apps/web/src/app/(main)/matches/[id]/page.tsx`

### S08-01: Loading skeleton

Step 1: Navigate to /matches/{id} with slow load
  - Action: Navigate to match detail
  - Target: Loading skeleton
  - Expected Result: Three animate-pulse blocks: h-8 w-32, h-48, h-32 with bg-gray-100 and rounded corners
  - Screenshot: 01-match-detail-loading.png
  - Viewport notes: Mobile: px-5; Desktop: px-0
  - Theme notes: Light: bg-gray-100; Dark: implied dark variant
  - Locale notes: No difference

### S08-02: Not found state

Step 2: Navigate to /matches/nonexistent
  - Action: Navigate with invalid match ID
  - Target: EmptyState component
  - Expected Result: Trophy icon, title "매치를 찾을 수 없어요", description "삭제되었거나 존재하지 않는 매치예요", action button "목록으로" linking to /matches
  - Screenshot: 02-match-detail-notfound.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean text

### S08-03: Mobile header

Step 3: Verify mobile header
  - Action: Observe mobile glass header
  - Target: MobileGlassHeader with back button, title, share button
  - Expected Result: Back arrow button (min-h-11 min-w-11), match title (truncated), Share2 icon button; glass-mobile-icon-button styling
  - Screenshot: 03-match-detail-mobile-header.png
  - Viewport notes: Mobile: visible; Desktop (@3xl): hidden, replaced by breadcrumb
  - Theme notes: Light: text-gray-700 icons; Dark: text-gray-300 icons
  - Locale notes: No difference

Step 4: Click back button
  - Action: Click back arrow button
  - Target: `button[aria-label="뒤로 가기"]`
  - Expected Result: router.back() called; returns to previous page
  - Screenshot: 04-match-detail-back.png
  - Viewport notes: Only on mobile
  - Theme notes: No difference
  - Locale notes: No difference

Step 5: Click share button
  - Action: Click share button
  - Target: `button[aria-label="공유하기"]`
  - Expected Result: On mobile with navigator.share: native share sheet opens. On desktop without navigator.share: clipboard copy, toast "링크가 복사되었어요" appears
  - Screenshot: 05-match-detail-share.png
  - Viewport notes: Mobile: native share; Desktop: clipboard copy + toast
  - Theme notes: Toast styling per toast component
  - Locale notes: Hardcoded Korean toast message

### S08-04: Desktop breadcrumb

Step 6: Verify desktop breadcrumb
  - Action: Observe breadcrumb on desktop
  - Target: Breadcrumb nav with "매치 찾기" > match title
  - Expected Result: "매치 찾기" link to /matches, ChevronRight icon, match title as current page
  - Screenshot: 06-match-detail-breadcrumb.png
  - Viewport notes: Desktop only (hidden below @3xl)
  - Theme notes: text-gray-500 links, text-gray-700 (light) / text-gray-300 (dark) current
  - Locale notes: Hardcoded "매치 찾기"

### S08-05: Hero image and media

Step 7: View hero image
  - Action: Observe hero image area
  - Target: Button wrapping SafeImage with h-[220px] rounded-2xl
  - Expected Result: 220px tall image with object-cover; click triggers media lightbox
  - Screenshot: 07-match-detail-hero.png
  - Viewport notes: Same height across viewports; desktop uses 60vw sizes
  - Theme notes: bg-gray-100 (light) / bg-gray-800 (dark) placeholder
  - Locale notes: No difference

Step 8: Click hero image to open MediaLightbox
  - Action: Click hero image
  - Target: `button[aria-label="{title} 대표 이미지 보기"]`
  - Expected Result: MediaLightbox opens at index 0; fullscreen overlay with image; close button, prev/next arrows, dot indicators
  - Screenshot: 08-match-detail-lightbox-open.png
  - Viewport notes: Lightbox is fullscreen all viewports
  - Theme notes: Dark overlay regardless of theme
  - Locale notes: No difference

Step 9: Navigate MediaLightbox with arrows
  - Action: Click next arrow in lightbox
  - Target: Next navigation button in MediaLightbox
  - Expected Result: Shows next image; dot indicator updates
  - Screenshot: 09-match-detail-lightbox-next.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 10: Navigate MediaLightbox with keyboard
  - Action: Press ArrowRight, ArrowLeft, Escape
  - Target: MediaLightbox keyboard handlers
  - Expected Result: ArrowRight: next image; ArrowLeft: previous image; Escape: close lightbox
  - Screenshot: 10-match-detail-lightbox-keyboard.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 11: Close MediaLightbox via backdrop click
  - Action: Click outside the image (backdrop)
  - Target: Backdrop area
  - Expected Result: Lightbox closes
  - Screenshot: 11-match-detail-lightbox-backdrop-close.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 12: Click thumbnail images
  - Action: Click one of the smaller thumbnails (grid-cols-3 below hero)
  - Target: Thumbnail button with aspect-[4/3]
  - Expected Result: MediaLightbox opens at that specific image index
  - Screenshot: 12-match-detail-thumbnail-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S08-06: Match info sections

Step 13: Verify title card
  - Action: Observe title card
  - Target: Card with sport icon, sport badge, title, host info
  - Expected Result: Sport icon in 12x12 rounded-xl container; sport badge (colored per sportCardAccent); title as h2 text-xl font-bold; host nickname + manner score
  - Screenshot: 13-match-detail-title-card.png
  - Viewport notes: Desktop: p-6 padding; Mobile: p-5
  - Theme notes: Standard card colors
  - Locale notes: Sport label translated

Step 14: Verify info grid (4 cards)
  - Action: Observe 4 InfoCards
  - Target: grid-cols-2 gap-3 info cards
  - Expected Result: 4 cards: "일시" (calendar), "장소" (pin), "인원" (users with capacity), "참가비" (credit card with fee and level range); each has icon + label + value + sub-value
  - Screenshot: 14-match-detail-info-grid.png
  - Viewport notes: 2 columns always (grid-cols-2); desktop: gap-5
  - Theme notes: Cards bg-white (light) / bg-gray-800 (dark), border-gray-100 / border-gray-700
  - Locale notes: Labels hardcoded Korean

Step 15: Verify "인원" card highlight when almost full
  - Action: View match with 70%+ capacity
  - Target: InfoCard with highlight=true
  - Expected Result: Value text is text-amber-500 instead of text-gray-900; sub-value is text-amber-400 showing "마감 임박"
  - Screenshot: 15-match-detail-capacity-highlight.png
  - Viewport notes: No difference
  - Theme notes: amber-500 in both themes
  - Locale notes: Hardcoded "마감 임박"

Step 16: Verify venue card
  - Action: Observe venue card
  - Target: Card with "시설 정보" heading
  - Expected Result: Venue preview image (h-16 w-16 rounded-xl), venue name, address, star rating
  - Screenshot: 16-match-detail-venue.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S08-07: Participant list

Step 17: Verify participant avatars
  - Action: Observe participants section
  - Target: Participant list in sidebar
  - Expected Result: "참가자 (N)" heading; each participant has avatar circle (h-9 w-9 with first char of nickname), nickname, host badge if hostId matches, status badge ("확정" bg-blue-500 or "대기" bg-gray-100), arrival checkmark if arrivedAt exists
  - Screenshot: 17-match-detail-participants.png
  - Viewport notes: Mobile: below main content; Desktop: right sidebar (380px)
  - Theme notes: Avatar bg-gray-100 (light) / bg-gray-700 (dark)
  - Locale notes: Hardcoded "호스트", "확정", "대기"

### S08-08: Action buttons — Spectator (not authenticated)

Step 18: Verify login-required CTA
  - Action: View match as unauthenticated user
  - Target: CTA button area
  - Expected Result: "로그인 후 참가하기" link button to /login; bg-blue-500 text-white
  - Screenshot: 18-match-detail-login-cta.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

### S08-09: Action buttons — Non-participant (authenticated)

Step 19: Verify "참가하기" button (free match)
  - Action: View open match with fee=0 as non-participant
  - Target: `button[data-testid="match-join-button"]`
  - Expected Result: Button shows "참가하기 · 무료"; bg-blue-500 py-4 text-lg font-bold; hover bg-blue-600; active bg-blue-700 + scale-[0.98]
  - Screenshot: 19-match-detail-join-free.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 20: Click "참가하기" on free match
  - Action: Click join button on free match
  - Target: `button[data-testid="match-join-button"]`
  - Expected Result: Loading spinner (h-4 w-4 animate-spin) replaces text; on success toast "참가 완료! 경기에서 만나요"; query invalidated; participant list updates
  - Screenshot: 20-match-detail-join-success.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean toast

Step 21: Verify "참가 후 결제하기" button (paid match)
  - Action: View open match with fee > 0
  - Target: `button[data-testid="match-join-button"]`
  - Expected Result: Button shows "참가 후 결제하기 · {amount}원"
  - Screenshot: 21-match-detail-join-paid.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Amount formatted via formatAmount

Step 22: Click join on paid match — CheckoutModal opens
  - Action: Click join button on paid match
  - Target: `button[data-testid="match-join-button"]`
  - Expected Result: Join mutation runs; on success with pending payment: toast "참가 신청이 생성되었어요. 결제를 완료하면 확정됩니다."; CheckoutModal opens dynamically
  - Screenshot: 22-match-detail-checkout-open.png
  - Viewport notes: Modal is responsive
  - Theme notes: Modal styling per modal component
  - Locale notes: Hardcoded Korean toast

Step 23: Close CheckoutModal via X / backdrop / ESC
  - Action: Click X button, click backdrop, press Escape
  - Target: CheckoutModal close mechanisms
  - Expected Result: Modal closes; participant remains in pending state
  - Screenshot: 23-match-detail-checkout-close.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S08-10: Action buttons — Participant

Step 24: Verify "결제 마무리하기" button (pending payment)
  - Action: View as participant with paymentStatus='pending'
  - Target: Complete payment button
  - Expected Result: "결제 마무리하기 · {amount}" button; bg-blue-500 text-white
  - Screenshot: 24-match-detail-pending-payment.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 25: Verify "참가 취소하기" button
  - Action: Observe leave button as participant
  - Target: `button[data-testid="match-leave-button"]`
  - Expected Result: "참가 취소하기" button with border border-gray-200, text-red-500; if pending payment shows "참가 신청 취소하기"
  - Screenshot: 25-match-detail-leave.png
  - Viewport notes: No difference
  - Theme notes: Dark: border-gray-600 bg-gray-800
  - Locale notes: Hardcoded Korean

Step 26: Click leave button
  - Action: Click "참가 취소하기"
  - Target: `button[data-testid="match-leave-button"]`
  - Expected Result: Loading spinner (h-4 w-4 animate-spin border-red-500); on success toast "매치에서 탈퇴했어요"; participant removed from list
  - Screenshot: 26-match-detail-leave-confirm.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean toast

### S08-11: Arrival check-in (participant in window)

Step 27: Verify arrival button appears
  - Action: View as participant within arrival window (start-30min to end+30min)
  - Target: `button[data-testid="match-arrive-button"]`
  - Expected Result: Green button "도착 인증" with Camera icon; bg-green-500 min-h-[44px]
  - Screenshot: 27-match-detail-arrival-button.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 28: Click arrival button — modal opens
  - Action: Click "도착 인증" button
  - Target: `button[data-testid="match-arrive-button"]`
  - Expected Result: Arrival modal opens with: description text, file input for camera (accept="image/*" capture="environment"), cancel/confirm buttons
  - Screenshot: 28-match-detail-arrival-modal.png
  - Viewport notes: No difference
  - Theme notes: Modal dark mode adapts
  - Locale notes: Hardcoded Korean labels

Step 29: Select photo in arrival modal
  - Action: Click photo upload area, select a file
  - Target: `label[for="arrival-photo"]` and hidden `input#arrival-photo`
  - Expected Result: Photo preview appears (w-full h-48 object-cover rounded-xl); X button to remove photo appears
  - Screenshot: 29-match-detail-arrival-photo.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 30: Remove selected photo
  - Action: Click X button on photo preview
  - Target: `button[aria-label="사진 제거"]`
  - Expected Result: Photo preview removed; upload area re-appears
  - Screenshot: 30-match-detail-arrival-photo-remove.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 31: Confirm arrival
  - Action: Click "인증하기" button with photo selected
  - Target: `button[data-testid="match-arrive-confirm-button"]`
  - Expected Result: Loading: "인증 중..." with spinner; geolocation requested; photo uploaded; on success toast "도착 인증이 완료되었어요!"; modal closes; arrival badge shows in participant list
  - Screenshot: 31-match-detail-arrival-confirm.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 32: Verify arrival completed state
  - Action: View as participant who already arrived
  - Target: Arrival status area
  - Expected Result: Green badge "도착 완료" with CheckCircle2 icon replaces arrival button; bg-green-50 rounded-xl
  - Screenshot: 32-match-detail-arrival-complete.png
  - Viewport notes: No difference
  - Theme notes: Dark: bg-green-950/30 text-green-400
  - Locale notes: Hardcoded Korean

### S08-12: Host controls

Step 33: Verify host view
  - Action: View match as host (user.id === match.hostId)
  - Target: Host control area
  - Expected Result: "내가 만든 매치" disabled button; below: "매치 수정" link, "모집 마감" button, "매치 완료" button, "매치 취소" button
  - Screenshot: 33-match-detail-host-view.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 34: Click "매치 수정" link
  - Action: Click "매치 수정" link
  - Target: `a[data-testid="match-host-edit-button"]`
  - Expected Result: Navigates to /matches/{id}/edit
  - Screenshot: 34-match-detail-host-edit.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 35: Click "모집 마감" — close modal
  - Action: Click "모집 마감" button
  - Target: `button[data-testid="match-host-close-button"]`
  - Expected Result: Modal opens with AlertTriangle icon, "모집을 마감하시겠습니까?" text, "마감 후에도 재모집을 시작할 수 있어요." sub-text, "취소" and "마감하기" buttons
  - Screenshot: 35-match-detail-close-modal.png
  - Viewport notes: Modal component responsive
  - Theme notes: Modal bg adapts
  - Locale notes: Hardcoded Korean

Step 36: Confirm close modal
  - Action: Click "마감하기" button in modal
  - Target: `button[data-testid="match-close-confirm-button"]`
  - Expected Result: Loading spinner in button; on success toast "모집을 마감했어요"; modal closes; status changes to "마감"
  - Screenshot: 36-match-detail-close-confirm.png
  - Viewport notes: No difference
  - Theme notes: Confirm button: bg-gray-900 (light) / bg-white text-gray-900 (dark)
  - Locale notes: Hardcoded Korean

Step 37: Cancel close modal
  - Action: Click "취소" in close modal
  - Target: Cancel button in modal
  - Expected Result: Modal closes; no status change
  - Screenshot: 37-match-detail-close-cancel.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 38: Verify "재모집 시작" button (when status=full but not at capacity)
  - Action: View as host when match.status='full' and currentPlayers < maxPlayers
  - Target: `button[data-testid="match-host-reopen-button"]`
  - Expected Result: "재모집 시작" button appears; clicking it calls handleHostStatusChange('recruiting'); toast "재모집을 시작했어요"
  - Screenshot: 38-match-detail-reopen.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 39: Click "매치 취소" — cancel modal
  - Action: Click "매치 취소" button
  - Target: `button[data-testid="match-host-cancel-button"]`
  - Expected Result: Cancel modal opens with red AlertTriangle icon, "매치를 취소하시겠습니까?" text, "이 작업은 되돌릴 수 없어요." warning, cancel reason textarea (optional), "돌아가기" and "취소하기" buttons
  - Screenshot: 39-match-detail-cancel-modal.png
  - Viewport notes: No difference
  - Theme notes: Cancel confirm button: bg-red-500
  - Locale notes: Hardcoded Korean

Step 40: Type cancel reason and confirm
  - Action: Focus textarea, type reason, click "취소하기"
  - Target: `textarea#cancel-reason`, confirm button `button[data-testid="match-cancel-confirm-button"]`
  - Expected Result: Textarea receives input; confirm button shows loading; on success toast "매치를 취소했어요"; modal closes; status updates to "취소됨"
  - Screenshot: 40-match-detail-cancel-confirm.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 41: Close cancel modal via ESC
  - Action: Press Escape while cancel modal is open
  - Target: Modal ESC handler
  - Expected Result: Modal closes; cancel reason resets
  - Screenshot: 41-match-detail-cancel-esc.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S08-13: Status badges for each state

Step 42: Verify status badge — "모집중"
  - Action: View match with status='recruiting'
  - Target: `span[data-testid="match-status-badge"]`
  - Expected Result: Badge shows "모집중"; bg-gray-100 text-gray-500 (light) / bg-gray-700 text-gray-300 (dark)
  - Screenshot: 42-match-detail-status-recruiting.png
  - Viewport notes: No difference
  - Theme notes: As described
  - Locale notes: Hardcoded Korean

Step 43: Verify status badge — "마감"
  - Action: View match with status='full'
  - Target: `span[data-testid="match-status-badge"]`
  - Expected Result: Badge shows "마감"; bg-gray-100 text-gray-600 (light) / bg-gray-700 text-gray-200 (dark)
  - Screenshot: 43-match-detail-status-full.png
  - Viewport notes: No difference
  - Theme notes: As described
  - Locale notes: Hardcoded Korean

Step 44: Verify status badge — "완료"
  - Action: View match with status='completed'
  - Target: `span[data-testid="match-status-badge"]`
  - Expected Result: Badge shows "완료"; bg-blue-50 text-blue-600 (light) / bg-blue-900/30 text-blue-300 (dark)
  - Screenshot: 44-match-detail-status-completed.png
  - Viewport notes: No difference
  - Theme notes: As described
  - Locale notes: Hardcoded Korean

Step 45: Verify status badge — "취소됨"
  - Action: View match with status='cancelled'
  - Target: `span[data-testid="match-status-badge"]`
  - Expected Result: Badge shows "취소됨"; bg-red-50 text-red-500 (light) / bg-red-950/30 text-red-300 (dark)
  - Screenshot: 45-match-detail-status-cancelled.png
  - Viewport notes: No difference
  - Theme notes: As described
  - Locale notes: Hardcoded Korean

### S08-14: Calendar add button

Step 46: Click "캘린더에 추가"
  - Action: Click calendar add button
  - Target: Button with Calendar icon and "캘린더에 추가" text
  - Expected Result: Opens Google Calendar link in new tab with pre-filled event details (title, dates, location, description)
  - Screenshot: 46-match-detail-calendar-add.png
  - Viewport notes: No difference
  - Theme notes: Border-gray-200 (light) / border-gray-600 (dark)
  - Locale notes: Hardcoded Korean

---

## S09 — Create Match (4-Step Wizard)

**Source**: `apps/web/src/app/(main)/matches/new/page.tsx`

### S09-01: Auth guard

Step 1: Navigate to /matches/new as unauthenticated
  - Action: Navigate to /matches/new without auth
  - Target: useRequireAuth() hook
  - Expected Result: Redirects to /login?redirect=/matches/new
  - Screenshot: 01-match-create-auth-redirect.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S09-02: Step indicator

Step 2: Verify step indicator at step 0
  - Action: Observe step indicator bar
  - Target: Progress bars and step label
  - Expected Result: 4 segments; first segment bg-blue-500, rest bg-gray-100; label "Step 1. 종목"
  - Screenshot: 02-match-create-step-indicator.png
  - Viewport notes: px-5 mobile, px-0 desktop
  - Theme notes: Dark: inactive segments bg-gray-700
  - Locale notes: Hardcoded Korean step names ["종목", "정보", "장소·일시", "확인"]

### S09-03: Step 0 — Sport selection

Step 3: Verify 11 sport buttons
  - Action: Observe sport selection grid
  - Target: 11 buttons with data-testid="match-sport-{type}"
  - Expected Result: 11 sport buttons: soccer, futsal, basketball, badminton, ice_hockey, swimming, tennis, baseball, volleyball, figure_skating, short_track; each min-h-[44px] rounded-full; none selected initially
  - Screenshot: 03-match-create-sport-buttons.png
  - Viewport notes: flex-wrap gap-2; wraps to multiple rows on mobile
  - Theme notes: Unselected: bg-gray-50 text-gray-600 (light) / bg-gray-800 text-gray-500 (dark); hover: bg-gray-100 / bg-gray-700
  - Locale notes: Labels from sportLabel map, Korean

Step 4: Hover sport button
  - Action: Hover over "풋살" button
  - Target: `button[data-testid="match-sport-futsal"]`
  - Expected Result: Background transitions to bg-gray-100 (light) / bg-gray-700 (dark)
  - Screenshot: 04-match-create-sport-hover.png
  - Viewport notes: Desktop only
  - Theme notes: As described
  - Locale notes: No difference

Step 5: Click sport button — auto-advance
  - Action: Click "풋살" button
  - Target: `button[data-testid="match-sport-futsal"]`
  - Expected Result: Button becomes bg-blue-500 text-white; step auto-advances to step 1; progress bar updates (2 segments filled)
  - Screenshot: 05-match-create-sport-select.png
  - Viewport notes: No difference
  - Theme notes: Active: bg-blue-500 text-white dark:bg-blue-500 dark:text-white
  - Locale notes: No difference

Step 6: Keyboard navigation through sports
  - Action: Tab to sport buttons, use Enter/Space to select
  - Target: Sport buttons
  - Expected Result: Focus ring on each button; Enter/Space selects and auto-advances
  - Screenshot: 06-match-create-sport-keyboard.png
  - Viewport notes: No difference
  - Theme notes: Focus ring visible
  - Locale notes: No difference

### S09-04: Step 1 — Match info

Step 7: Verify title input
  - Action: Observe title input field
  - Target: `input#match-title` within FormField with label "매치 제목" (required)
  - Expected Result: Input with placeholder "예: 주말 풋살 한판!"; maxLength=100; empty initially
  - Screenshot: 07-match-create-title-input.png
  - Viewport notes: max-w-lg container
  - Theme notes: Input component adapts to dark mode
  - Locale notes: Hardcoded Korean labels

Step 8: Focus, type, blur title input
  - Action: Click input, type "주말 축구", click elsewhere
  - Target: `input#match-title`
  - Expected Result: Focus: ring appears; type: text rendered; blur: ring removed; value persisted in form state
  - Screenshot: 08-match-create-title-type.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 9: Try advancing with empty title
  - Action: Leave title empty, click "다음" button
  - Target: `button[data-testid="match-create-next-info"]`
  - Expected Result: Toast error "매치 제목을 입력해주세요"; does NOT advance to step 2
  - Screenshot: 09-match-create-title-validation.png
  - Viewport notes: No difference
  - Theme notes: Toast component styling
  - Locale notes: Hardcoded Korean toast

Step 10: Verify description textarea
  - Action: Focus description textarea
  - Target: `textarea#match-description`
  - Expected Result: FormField label "설명"; placeholder "매치에 대한 설명을 적어주세요"; maxLength=1000; min-h-[96px] resize-none
  - Screenshot: 10-match-create-description.png
  - Viewport notes: No difference
  - Theme notes: Textarea adapts
  - Locale notes: Hardcoded Korean

Step 11: Verify ImageUpload component
  - Action: Observe image upload area
  - Target: ImageUpload component with label "이미지 (선택)"
  - Expected Result: Upload area with max=1 images; accept jpeg/png/webp/gif; maxSizeMB=10; sample sport images shown below when no custom image uploaded
  - Screenshot: 11-match-create-image-upload.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 12: Upload an image
  - Action: Click upload zone, select an image file
  - Target: ImageUpload file input
  - Expected Result: Image preview appears; sample images disappear; "이미지 업로드가 끝난 뒤 다음 단계로 진행할 수 있어요." message during upload; "다음" button disabled while uploading
  - Screenshot: 12-match-create-image-uploaded.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean status messages

Step 13: Verify max players input
  - Action: Interact with max players input
  - Target: `input#match-maxPlayers`
  - Expected Result: type="number" inputMode="numeric"; min=2 max=30; default value 10; FormField label "최대 인원"
  - Screenshot: 13-match-create-max-players.png
  - Viewport notes: In grid-cols-2 with fee input
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean label

Step 14: Verify fee input
  - Action: Interact with fee input
  - Target: `input#match-fee`
  - Expected Result: type="number" inputMode="numeric"; min=0 step=1000; default 15000; FormField label "참가비 (원)"
  - Screenshot: 14-match-create-fee.png
  - Viewport notes: In grid-cols-2 with max players
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 15: Verify level selects
  - Action: Click level min and max selects
  - Target: `select#match-levelMin` and `select#match-levelMax`
  - Expected Result: Each has 5 options from levelLabel[1] to levelLabel[5]; min defaults to 1, max to 5
  - Screenshot: 15-match-create-levels.png
  - Viewport notes: In grid-cols-2
  - Theme notes: Select adapts
  - Locale notes: Level labels from constants

Step 16: Set levelMin > levelMax — auto correction
  - Action: Set levelMin to 4, levelMax to 2, click "다음"
  - Target: Level selects + next button
  - Expected Result: Toast info "최소/최대 레벨이 자동으로 교정되었어요"; levels swap (min becomes 2, max becomes 4); does NOT advance (click again to proceed)
  - Screenshot: 16-match-create-level-correction.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean toast

Step 17: Verify gender pill buttons
  - Action: Click each gender button
  - Target: 3 buttons: "무관", "남성", "여성"
  - Expected Result: Default "무관" active (bg-blue-500 text-white); clicking "남성" activates it and deactivates "무관"; each min-h-[44px] rounded-full
  - Screenshot: 17-match-create-gender.png
  - Viewport notes: flex gap-2
  - Theme notes: Active: bg-blue-500; Inactive: bg-gray-50 text-gray-600 (light) / bg-gray-800 text-gray-500 (dark)
  - Locale notes: Hardcoded Korean

Step 18: Verify rules textarea
  - Action: Focus rules textarea
  - Target: `textarea#match-rules`
  - Expected Result: FormField label "추가 규칙 (선택)"; maxLength=500; placeholder "참가자에게 알릴 규칙이나 공지사항"; min-h-[88px] resize-none
  - Screenshot: 18-match-create-rules.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 19: Click "다음" to advance to step 2
  - Action: Fill title, click "다음"
  - Target: `button[data-testid="match-create-next-info"]`
  - Expected Result: Button is fullWidth size="lg"; advances to step 2; progress bar shows 3 segments filled; form data preserved
  - Screenshot: 19-match-create-step1-next.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S09-05: Step 2 — Venue + Schedule

Step 20: Verify venue radio buttons
  - Action: Observe venue list
  - Target: Venue buttons (w-full text-left rounded-xl p-3)
  - Expected Result: Venues loaded for selected sport; each venue shows name and address; clicking selects (bg-blue-500 text-white); data-testid="match-venue-{id}"
  - Screenshot: 20-match-create-venue-list.png
  - Viewport notes: No difference
  - Theme notes: Selected: bg-blue-500; Unselected: bg-gray-50 (light) / bg-gray-800 (dark)
  - Locale notes: Venue names from API

Step 21: Type custom venue
  - Action: Type in custom venue input
  - Target: `input#match-customVenue`
  - Expected Result: Typing clears venueId; custom venue text saved; label "또는 직접 입력"; placeholder "예: 한강공원 축구장, 동네 체육관 등"
  - Screenshot: 21-match-create-custom-venue.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 22: Verify date/time inputs
  - Action: Interact with date, start time, end time
  - Target: `input#match-date` (type="date"), `input#match-startTime` (type="time"), `input#match-endTime` (type="time")
  - Expected Result: Native date/time pickers; grid-cols-1 mobile, grid-cols-3 desktop (@3xl)
  - Screenshot: 22-match-create-datetime.png
  - Viewport notes: Mobile: stacked (grid-cols-1); Desktop: side by side (grid-cols-3)
  - Theme notes: Input adapts
  - Locale notes: Date format locale-dependent

Step 23: Submit without venue — validation
  - Action: Click "다음" without selecting venue
  - Target: `button[data-testid="match-create-next-schedule"]`
  - Expected Result: Toast error "현재는 등록된 시설만 선택할 수 있어요"
  - Screenshot: 23-match-create-venue-validation.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 24: Submit with past date — validation
  - Action: Select past date, click "다음"
  - Target: Date input + next button
  - Expected Result: Toast error "과거 날짜는 선택할 수 없어요"
  - Screenshot: 24-match-create-date-validation.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 25: Go back to step 1 — data preserved
  - Action: Click MobileGlassHeader back button
  - Target: MobileGlassHeader onBack handler
  - Expected Result: Returns to step 1; all previously entered data (title, description, etc.) is preserved
  - Screenshot: 25-match-create-back-preserved.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S09-06: Step 3 — Confirm

Step 26: Verify summary card
  - Action: Advance to step 3 (confirm)
  - Target: Card variant="subtle" with ConfirmRow items
  - Expected Result: All form data displayed in label-value rows: 종목, 장소, 제목, 날짜, 시간, 인원, 참가비, 레벨, 성별, 규칙 (if set), 이미지 (if uploaded)
  - Screenshot: 26-match-create-confirm-summary.png
  - Viewport notes: No difference
  - Theme notes: Card variant="subtle" adapts
  - Locale notes: Labels hardcoded Korean; values formatted

Step 27: Click "매치 만들기" submit
  - Action: Click submit button
  - Target: `button[data-testid="match-create-submit"]`
  - Expected Result: Button shows Check icon + "매치 만들기" text; during submit shows "생성 중..."; aria-busy=true; disabled while submitting; on success toast "매치가 만들어졌어요!"; redirects to /matches?created=true
  - Screenshot: 27-match-create-submit.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 28: Submit error handling
  - Action: Simulate API error during submit
  - Target: Submit button
  - Expected Result: Toast error "생성에 실패했어요. 잠시 후 다시 시도해주세요"; button re-enables; stays on confirm step
  - Screenshot: 28-match-create-submit-error.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

---

## S10 — Edit Match

**Source**: `apps/web/src/app/(main)/matches/[id]/edit/page.tsx`

Step 1: Navigate to /matches/{id}/edit
  - Action: Navigate to edit page
  - Target: Edit match form
  - Expected Result: Form pre-populated with existing match data; same fields as create wizard step 1+2 but in single page; "저장" button
  - Screenshot: 01-match-edit-loaded.png
  - Viewport notes: Same layout as create wizard
  - Theme notes: Standard form adapts
  - Locale notes: Hardcoded Korean

Step 2: Modify a field and save
  - Action: Change title text, click save
  - Target: Title input + save button
  - Expected Result: Loading state on save button; on success toast and redirect; on error toast
  - Screenshot: 02-match-edit-save.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 3: Navigate back without saving
  - Action: Click back button without saving
  - Target: Back navigation
  - Expected Result: Returns to match detail; changes discarded (no confirmation dialog)
  - Screenshot: 03-match-edit-back.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

---

## S11 — Teams List

**Source**: `apps/web/src/app/(main)/teams/teams-client.tsx`, `apps/web/src/app/(main)/teams/team-list.tsx`

Step 1: Navigate to /teams
  - Action: Navigate to teams page
  - Target: TeamsPage with MobilePageTopZone
  - Expected Result: Page top zone: eyebrow "팀 허브", title (via `teams.title`), subtitle, Plus create button (h-11 w-11 bg-blue-500); TeamList component renders below
  - Screenshot: 01-teams-page-load.png
  - Viewport notes: Mobile: px-5; Desktop: px-0
  - Theme notes: Standard
  - Locale notes: ko title/subtitle / en via `teams.*`

Step 2: Click "+" create button
  - Action: Click Plus button
  - Target: `a[href="/teams/new"]`
  - Expected Result: Navigates to /teams/new; aria-label via `teams.createTeam`
  - Screenshot: 02-teams-create-button.png
  - Viewport notes: No difference
  - Theme notes: bg-blue-500 (light) / bg-blue-600 (dark)
  - Locale notes: aria-label translated

Step 3: Hover a team card
  - Action: Hover over a team card
  - Target: Team card link
  - Expected Result: Card shows hover effect (border/shadow transition)
  - Screenshot: 03-teams-card-hover.png
  - Viewport notes: Desktop only
  - Theme notes: Adapts
  - Locale notes: No difference

Step 4: Click a team card
  - Action: Click a team card
  - Target: `a[href="/teams/{id}"]`
  - Expected Result: Navigates to /teams/{id}
  - Screenshot: 04-teams-card-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 5: Verify empty state (no teams)
  - Action: View with no teams data
  - Target: EmptyState component
  - Expected Result: EmptyState with appropriate icon, title, description
  - Screenshot: 05-teams-empty.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Translated

Step 6: Verify loading skeleton
  - Action: View during loading
  - Target: Skeleton cards
  - Expected Result: Animated skeleton cards
  - Screenshot: 06-teams-loading.png
  - Viewport notes: No difference
  - Theme notes: bg-gray-100 (light) / bg-gray-700 (dark)
  - Locale notes: No difference

---

## S12 — Team Detail

**Source**: `apps/web/src/app/(main)/teams/[id]/page.tsx`

### S12-01: Loading and not-found states

Step 1: Loading skeleton
  - Action: Navigate to /teams/{id} with slow load
  - Target: animate-pulse blocks
  - Expected Result: Three skeleton blocks: h-8 w-32, h-48, h-32 rounded-xl
  - Screenshot: 01-team-detail-loading.png
  - Viewport notes: Mobile: px-5; Desktop: px-0
  - Theme notes: bg-gray-100 skeletons
  - Locale notes: No difference

Step 2: Not found state
  - Action: Navigate to /teams/nonexistent
  - Target: EmptyState with Users icon
  - Expected Result: "팀을 찾을 수 없어요" title, "삭제되었거나 존재하지 않는 팀이에요" description, "목록으로" action to /teams
  - Screenshot: 02-team-detail-notfound.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

### S12-02: Header and hero

Step 3: Verify mobile header
  - Action: Observe mobile header
  - Target: MobileGlassHeader with back, title, share buttons
  - Expected Result: Back arrow (min-h-11 min-w-11), team name truncated, Share2 icon
  - Screenshot: 03-team-detail-header.png
  - Viewport notes: Mobile: visible; Desktop: hidden, breadcrumb instead
  - Theme notes: Standard
  - Locale notes: No difference

Step 4: Verify desktop breadcrumb
  - Action: Observe breadcrumb on desktop
  - Target: "팀·클럽" > team name
  - Expected Result: "팀·클럽" link to /teams, ChevronRight, team name
  - Screenshot: 04-team-detail-breadcrumb.png
  - Viewport notes: Desktop only
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 5: Click cover image — open lightbox
  - Action: Click cover image area
  - Target: `button[aria-label="{name} 커버 이미지 보기"]`
  - Expected Result: MediaLightbox opens with cover + gallery images
  - Screenshot: 05-team-detail-cover-lightbox.png
  - Viewport notes: Cover h-32 mobile, h-44 desktop
  - Theme notes: No difference
  - Locale notes: No difference

Step 6: Verify team info (name, badges, stats)
  - Action: Observe team info section
  - Target: Card below cover
  - Expected Result: Team name h2 text-2xl font-bold; "모집중" badge (if recruiting); sport icon + label; skill grade or level; member count; pro player count (if any); uniform color (if any); BadgeDisplay; description
  - Screenshot: 06-team-detail-info.png
  - Viewport notes: No difference
  - Theme notes: Standard text color adaptation
  - Locale notes: Sport labels translated; badges hardcoded Korean

Step 7: Click share button
  - Action: Click share button
  - Target: `button[aria-label="공유하기"]`
  - Expected Result: Native share or clipboard copy + toast "링크를 복사했어요."
  - Screenshot: 07-team-detail-share.png
  - Viewport notes: Mobile: native share; Desktop: clipboard
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean toast

### S12-03: Hub section tabs

Step 8: Verify 4 section tabs
  - Action: Observe tab row
  - Target: HubSectionTab buttons: "소개", "굿즈 N", "수강권 N", "대회 N"
  - Expected Result: "소개" active (bg-blue-500 text-white); others inactive; each min-h-[44px] rounded-full; horizontally scrollable
  - Screenshot: 08-team-detail-tabs.png
  - Viewport notes: overflow-x-auto scrollbar-hide
  - Theme notes: Active: bg-blue-500; Inactive: bg-gray-100 (light) / bg-gray-800 (dark)
  - Locale notes: Hardcoded Korean

Step 9: Click "굿즈" tab
  - Action: Click "굿즈" tab
  - Target: HubSectionTab "굿즈 N"
  - Expected Result: Tab becomes active; content changes to goods listing (or EmptyState "등록된 굿즈가 없어요")
  - Screenshot: 09-team-detail-tab-goods.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 10: Click "수강권" tab
  - Action: Click "수강권" tab
  - Target: HubSectionTab "수강권 N"
  - Expected Result: Tab activates; passes listing or EmptyState "등록된 수강권이 없어요"
  - Screenshot: 10-team-detail-tab-passes.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 11: Click "대회" tab
  - Action: Click "대회" tab
  - Target: HubSectionTab "대회 N"
  - Expected Result: Tab activates; events listing or EmptyState "예정 대회가 없어요"
  - Screenshot: 11-team-detail-tab-events.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

### S12-04: Overview tab content

Step 12: Verify "팀 여정" sub-page links
  - Action: Observe 팀 여정 section
  - Target: 3 links: "경기 기록", "용병 모집", "멤버"
  - Expected Result: 3 rounded-xl bg-gray-50 links to /teams/{id}/matches, /teams/{id}/mercenary, /teams/{id}/members
  - Screenshot: 12-team-detail-journey-links.png
  - Viewport notes: grid-cols-1 mobile, grid-cols-3 desktop
  - Theme notes: bg-gray-50 (light) / bg-gray-800 (dark)
  - Locale notes: Hardcoded Korean

Step 13: Verify trust score section
  - Action: Observe "신뢰도" card
  - Target: 4 TrustItem cards: 정보 일치도, 매너 점수, 지각률, 노쇼율; plus 전적 section
  - Expected Result: Grid-cols-2 layout; color-coded values (green for good, red for bad, amber for manner); 전적 section shows N전 N승 N무 N패 with win rate
  - Screenshot: 13-team-detail-trust.png
  - Viewport notes: No difference
  - Theme notes: TrustItem bg-gray-50 (light) / bg-gray-700 (dark)
  - Locale notes: Hardcoded Korean

Step 14: Verify recent matches section
  - Action: Observe "최근 경기" card
  - Target: Mock recent match results with win/draw/loss badges
  - Expected Result: 4 match results; each with result badge (승 bg-blue-500, 무 bg-gray-100, 패 bg-gray-200), opponent name, date, score; "전체보기" link to /team-matches?teamId=
  - Screenshot: 14-team-detail-recent-matches.png
  - Viewport notes: No difference
  - Theme notes: Adapts
  - Locale notes: Hardcoded Korean

Step 15: Click "전체보기" link
  - Action: Click "전체보기" in recent matches
  - Target: `a[href="/team-matches?teamId={id}"]`
  - Expected Result: Navigates to team matches page filtered by team
  - Screenshot: 15-team-detail-recent-viewall.png
  - Viewport notes: No difference
  - Theme notes: text-blue-500
  - Locale notes: Hardcoded Korean

Step 16: Verify gallery section
  - Action: Observe gallery
  - Target: grid-cols-3 gallery images
  - Expected Result: Gallery images in 3-column grid; each has aspect-square; clicking opens MediaLightbox at correct index
  - Screenshot: 16-team-detail-gallery.png
  - Viewport notes: No difference
  - Theme notes: bg-gray-50 (light) / bg-gray-700 (dark)
  - Locale notes: No difference

Step 17: Click a gallery image
  - Action: Click a gallery photo
  - Target: Gallery button
  - Expected Result: MediaLightbox opens at the clicked image index
  - Screenshot: 17-team-detail-gallery-lightbox.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S12-05: Sidebar — CTA buttons

Step 18: Verify "팀 가입 신청" button (non-member, recruiting)
  - Action: View as non-member when team.isRecruiting=true
  - Target: "팀 가입 신청" button
  - Expected Result: "팀원 모집중" emerald badge; "아래 버튼으로 가입 신청해보세요" text; blue "팀 가입 신청" button; below "연락하기" button with MessageCircle icon
  - Screenshot: 18-team-detail-join-cta.png
  - Viewport notes: Mobile: below main content; Desktop: sidebar-sticky
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 19: Click "팀 가입 신청"
  - Action: Click join button
  - Target: "팀 가입 신청" button
  - Expected Result: API POST /teams/{id}/apply; on success toast "팀 가입 신청이 접수되었어요."; on error toast "팀 가입 신청에 실패했어요."
  - Screenshot: 19-team-detail-join-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 20: Verify "모집 마감" state (non-member, not recruiting)
  - Action: View when isRecruiting=false
  - Target: CTA section
  - Expected Result: "모집 마감" gray badge; "현재 팀원을 모집하고 있지 않아요" text; disabled "모집 마감" button (variant="subtle")
  - Screenshot: 20-team-detail-closed-recruitment.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 21: Verify "로그인 후 가입 신청" (unauthenticated)
  - Action: View as unauthenticated user
  - Target: Login link button
  - Expected Result: "로그인 후 가입 신청" button linking to /login?redirect=/teams/{id}
  - Screenshot: 21-team-detail-login-to-join.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 22: Verify "팀 나가기" button (member, not owner)
  - Action: View as member (not owner)
  - Target: "팀 나가기" Button variant="dangerSoft"
  - Expected Result: Red-tinted button; clicking triggers leaveTeamMutation; on success toast and redirect to /my/teams
  - Screenshot: 22-team-detail-leave.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 23: Verify "팀 페이지 수정" link (owner/manager)
  - Action: View as owner or manager
  - Target: "팀 페이지 수정" link
  - Expected Result: Button linking to /teams/{id}/edit
  - Screenshot: 23-team-detail-edit-link.png
  - Viewport notes: Desktop: sidebar; Mobile: below content
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 24: Click "연락하기" button
  - Action: Click "연락하기" button
  - Target: Button with MessageCircle icon
  - Expected Result: If not authenticated: redirect to login. If no contactInfo: toast "연락처가 등록되어 있지 않아요." If contactInfo is URL: opens in new tab. Otherwise: toast shows contact info.
  - Screenshot: 24-team-detail-contact.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

---

## S13 — Team Members Management

**Source**: `apps/web/src/app/(main)/teams/[id]/members/page.tsx`

### S13-01: Page load and member list

Step 1: Navigate to /teams/{id}/members
  - Action: Navigate to team members page (requires auth)
  - Target: Page with MobileGlassHeader
  - Expected Result: Header title "멤버 관리" (if owner/manager) or "멤버 목록" (if member); member count shown; member rows rendered with avatar, nickname, role badge, manner score
  - Screenshot: 01-team-members-load.png
  - Viewport notes: Mobile: px-5; Desktop: has desktop heading with "팀 멤버 N명"
  - Theme notes: Member rows bg-white (light) / bg-gray-800 (dark)
  - Locale notes: Hardcoded Korean

Step 2: Verify role badges
  - Action: Observe role badges on each member
  - Target: `span[data-testid="team-member-role-{userId}"]`
  - Expected Result: owner: "팀장" bg-amber-50 text-amber-600; manager: "운영자" bg-blue-50 text-blue-600; member: "멤버" bg-gray-100 text-gray-600; "(나)" label for self
  - Screenshot: 02-team-members-role-badges.png
  - Viewport notes: No difference
  - Theme notes: Dark variants for each role badge
  - Locale notes: Hardcoded Korean role labels

Step 3: Verify owner has Crown icon
  - Action: Observe owner's avatar area
  - Target: Crown icon in member row
  - Expected Result: Crown icon (amber-500) in avatar slot for owner; User icon for other members
  - Screenshot: 03-team-members-owner-icon.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S13-02: Member menu (owner view)

Step 4: Click "..." menu button on a member
  - Action: Click MoreVertical button on a non-owner member
  - Target: `button[data-testid="team-member-menu-{userId}"]`
  - Expected Result: Dropdown menu opens (role="menu") with: "운영자로 변경" or "멤버로 변경" (based on current role), "소유권 이전", "강퇴"; menu is positioned absolute right-0; min-w-[160px]
  - Screenshot: 04-team-members-menu-open.png
  - Viewport notes: Menu may extend beyond viewport on mobile (handled by absolute positioning)
  - Theme notes: Menu bg-white (light) / bg-gray-800 (dark), border, shadow-lg
  - Locale notes: Hardcoded Korean menu items

Step 5: Click "운영자로 변경" (promote member to manager)
  - Action: Click "운영자로 변경" in dropdown
  - Target: `button[data-testid="team-member-set-manager-{userId}"]`
  - Expected Result: Role update mutation fires; on success toast "역할이 변경되었어요"; menu closes; role badge updates to "운영자"
  - Screenshot: 05-team-members-promote.png
  - Viewport notes: No difference
  - Theme notes: Shield icon blue-500
  - Locale notes: Hardcoded Korean

Step 6: Click "멤버로 변경" (demote manager to member)
  - Action: Click "멤버로 변경" on a manager
  - Target: `button[data-testid="team-member-set-member-{userId}"]`
  - Expected Result: Role changes back to member; toast "역할이 변경되었어요"
  - Screenshot: 06-team-members-demote.png
  - Viewport notes: No difference
  - Theme notes: User icon gray-500
  - Locale notes: Hardcoded Korean

Step 7: Click "강퇴" — kick confirmation modal
  - Action: Click "강퇴" in dropdown
  - Target: `button[data-testid="team-member-kick-{userId}"]`
  - Expected Result: Menu closes; kick modal opens with AlertTriangle icon, "{name}님을 강퇴하시겠어요?" text, "강퇴 후에는 멤버 목록에서 즉시 제거됩니다." sub-text, "돌아가기" and "강퇴하기" buttons
  - Screenshot: 07-team-members-kick-modal.png
  - Viewport notes: Modal responsive
  - Theme notes: AlertTriangle in red-50 circle (light) / red-900/20 (dark)
  - Locale notes: Hardcoded Korean

Step 8: Hover "돌아가기" button in kick modal
  - Action: Hover cancel button
  - Target: "돌아가기" button
  - Expected Result: bg transitions to bg-gray-200 (light) / bg-gray-600 (dark)
  - Screenshot: 08-team-members-kick-cancel-hover.png
  - Viewport notes: Desktop only
  - Theme notes: As described
  - Locale notes: No difference

Step 9: Click "강퇴하기" confirm
  - Action: Click "강퇴하기" button
  - Target: Confirm button (bg-red-500)
  - Expected Result: Loading: "처리 중..." with disabled state; on success toast "멤버가 추방되었어요"; modal closes; member removed from list
  - Screenshot: 09-team-members-kick-confirm.png
  - Viewport notes: No difference
  - Theme notes: bg-red-500 hover bg-red-600
  - Locale notes: Hardcoded Korean

Step 10: Close kick modal via backdrop
  - Action: Click outside modal (backdrop)
  - Target: Modal backdrop
  - Expected Result: Modal closes; no action taken
  - Screenshot: 10-team-members-kick-backdrop.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 11: Close kick modal via ESC
  - Action: Press Escape
  - Target: Modal ESC handler
  - Expected Result: Modal closes
  - Screenshot: 11-team-members-kick-esc.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S13-03: Transfer ownership

Step 12: Click "소유권 이전" in menu
  - Action: Click "소유권 이전" dropdown item
  - Target: `button[data-testid="team-member-transfer-{userId}"]`
  - Expected Result: Menu closes; TransferOwnershipModal opens with target user's nickname; modal has 2 radio options for demoteTo ('manager' / 'member'), "이전 확인" button, cancel/close
  - Screenshot: 12-team-members-transfer-modal.png
  - Viewport notes: Modal responsive
  - Theme notes: Crown icon amber; modal adapts
  - Locale notes: Hardcoded Korean

Step 13: Select demotion option in transfer modal
  - Action: Click each radio option
  - Target: Radio buttons for 'manager' and 'member'
  - Expected Result: Radio updates visual state; selected option highlighted
  - Screenshot: 13-team-members-transfer-radio.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 14: Click "이전 확인" in transfer modal
  - Action: Click confirm transfer button
  - Target: "이전 확인" button
  - Expected Result: API call to transfer ownership; on success: toast notification; page updates; user is no longer owner
  - Screenshot: 14-team-members-transfer-confirm.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 15: Close transfer modal via X
  - Action: Click X button on transfer modal
  - Target: Modal close button
  - Expected Result: Modal closes; no transfer
  - Screenshot: 15-team-members-transfer-close.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S13-04: Self — leave team

Step 16: Verify "탈퇴" button for non-owner self
  - Action: Observe own row as non-owner member
  - Target: `button[data-testid="team-member-leave-self"]`
  - Expected Result: Red button with LogOut icon + "탈퇴" text; bg-red-50 text-red-500; min-h-[44px]; aria-label, aria-haspopup="dialog"
  - Screenshot: 16-team-members-leave-self.png
  - Viewport notes: No difference
  - Theme notes: Light: bg-red-50; Dark: bg-red-900/20 text-red-400
  - Locale notes: Hardcoded Korean

Step 17: Click "탈퇴" — leave modal
  - Action: Click "탈퇴" button
  - Target: `button[data-testid="team-member-leave-self"]`
  - Expected Result: Leave modal opens with LogOut icon, "정말 팀을 탈퇴하시겠어요?" text, "탈퇴 후에는 다시 가입 신청이 필요합니다." sub-text, "돌아가기" and "탈퇴하기" buttons
  - Screenshot: 17-team-members-leave-modal.png
  - Viewport notes: No difference
  - Theme notes: LogOut icon in red-50 circle
  - Locale notes: Hardcoded Korean

Step 18: Confirm leave
  - Action: Click "탈퇴하기" button
  - Target: Confirm button (bg-red-500)
  - Expected Result: Loading: "처리 중..."; on success toast "팀에서 탈퇴했어요"; redirect to /my/teams
  - Screenshot: 18-team-members-leave-confirm.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

### S13-05: Data states

Step 19: Error state
  - Action: Simulate API error
  - Target: ErrorState component
  - Expected Result: ErrorState renders with retry button
  - Screenshot: 19-team-members-error.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 20: Loading state
  - Action: Observe during load
  - Target: Skeleton blocks
  - Expected Result: 3 skeleton rows h-[72px] animate-pulse rounded-xl bg-gray-50 (light) / bg-gray-700 (dark)
  - Screenshot: 20-team-members-loading.png
  - Viewport notes: No difference
  - Theme notes: As described
  - Locale notes: No difference

Step 21: Empty state (no members)
  - Action: View with empty members list
  - Target: EmptyState with User icon
  - Expected Result: "멤버가 없어요" title, "팀원을 초대해보세요" description, size="sm"
  - Screenshot: 21-team-members-empty.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 22: Click outside open menu — close
  - Action: Click anywhere outside an open member menu
  - Target: Document mousedown handler
  - Expected Result: Menu closes (menuOpen set to null via handleClickOutside)
  - Screenshot: 22-team-members-menu-outside-close.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

---

## S14 — Create/Edit Team

**Source**: `apps/web/src/app/(main)/teams/new/page.tsx`, `apps/web/src/app/(main)/teams/[id]/edit/page.tsx`

### S14-01: Create team form

Step 1: Navigate to /teams/new
  - Action: Navigate to create team page (requires auth)
  - Target: Form with MobileGlassHeader "팀 등록"
  - Expected Result: Form with fields: name, sportType (11 options), description, city (17 options), district, contactInfo, level (1-5), isRecruiting toggle, SNS links (instagram, youtube, kakaotalk), shortsUrl
  - Screenshot: 01-team-create-form.png
  - Viewport notes: Desktop: breadcrumb "팀·클럽 > 새 팀 등록"
  - Theme notes: Standard form adapts
  - Locale notes: Hardcoded Korean labels

Step 2: Submit without required fields
  - Action: Click submit without name
  - Target: Submit button
  - Expected Result: Toast error "팀명을 입력해주세요"
  - Screenshot: 02-team-create-validation-name.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 3: Submit without sport type
  - Action: Fill name but not sport, submit
  - Target: Submit button
  - Expected Result: Toast error "종목을 선택해주세요"
  - Screenshot: 03-team-create-validation-sport.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 4: Submit without city
  - Action: Fill name + sport but not city, submit
  - Target: Submit button
  - Expected Result: Toast error "활동 지역을 선택해주세요"
  - Screenshot: 04-team-create-validation-city.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 5: Fill all fields and submit successfully
  - Action: Fill all required + optional fields, click submit
  - Target: Submit button
  - Expected Result: Loading state (isSubmitting=true); on success toast "팀이 등록되었어요!"; redirect to /teams
  - Screenshot: 05-team-create-success.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 6: Submit with API error
  - Action: Trigger API error
  - Target: Submit button
  - Expected Result: Toast error via extractErrorMessage; form stays visible; button re-enables
  - Screenshot: 06-team-create-error.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

### S14-02: Edit team form

Step 7: Navigate to /teams/{id}/edit
  - Action: Navigate to edit page
  - Target: Form pre-populated with team data
  - Expected Result: All fields pre-filled from API; includes "삭제" section (if owner); "저장" and "삭제" buttons
  - Screenshot: 07-team-edit-loaded.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 8: Modify fields and save
  - Action: Change name, click save
  - Target: Save button
  - Expected Result: Update mutation fires; on success toast; on error toast
  - Screenshot: 08-team-edit-save.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 9: Click "팀 삭제" (owner only)
  - Action: Click delete button
  - Target: Delete button (Trash2 icon)
  - Expected Result: Delete confirmation modal opens; confirm deletes team; redirect to /teams
  - Screenshot: 09-team-edit-delete.png
  - Viewport notes: No difference
  - Theme notes: Red button/modal
  - Locale notes: Hardcoded Korean

---

## S15 — Team Match Discovery

**Source**: `apps/web/src/app/(main)/team-matches/page.tsx`

Step 1: Navigate to /team-matches
  - Action: Navigate to team matches page
  - Target: MobilePageTopZone with "팀 매칭" title
  - Expected Result: eyebrow "밸런스 매칭", title "팀 매칭", subtitle text, Plus create button
  - Screenshot: 01-team-matches-load.png
  - Viewport notes: Mobile: pt-[var(--safe-area-top)]; Desktop: standard
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 2: Verify sport filter chips (3)
  - Action: Observe sport chips
  - Target: 3 chips: "전체", "축구", "풋살"
  - Expected Result: "전체" active (bg-blue-500, aria-pressed=true); others inactive; each min-h-[44px] rounded-full
  - Screenshot: 02-team-matches-sport-filters.png
  - Viewport notes: Horizontal scroll
  - Theme notes: Standard active/inactive colors
  - Locale notes: Hardcoded Korean

Step 3: Click "축구" filter
  - Action: Click "축구" chip
  - Target: Sport filter button "축구"
  - Expected Result: "축구" activates; API refetches with sportType=soccer; match list filters
  - Screenshot: 03-team-matches-sport-soccer.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 4: Verify date filter input
  - Action: Click date input
  - Target: `input#team-match-date-filter`
  - Expected Result: sr-only label "경기 날짜 필터"; native date picker; selecting date filters matches
  - Screenshot: 04-team-matches-date-filter.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 5: Verify level filter chips (4)
  - Action: Observe level filter chips
  - Target: 4 chips: "전체", "입문~초급", "중급~상급", "고수"
  - Expected Result: "전체" active; each has aria-pressed; border border-gray-200 for inactive
  - Screenshot: 05-team-matches-level-filters.png
  - Viewport notes: Wraps on mobile (flex-wrap)
  - Theme notes: Standard active/inactive
  - Locale notes: Hardcoded Korean

Step 6: Verify "내 팀 호스트 모집글" section (authenticated)
  - Action: View as user with owner/manager teams
  - Target: "내 팀 호스트 모집글" heading and cards
  - Expected Result: Separate section for user's hosted team matches; if empty shows EmptyState "내 팀의 모집글이 없어요"
  - Screenshot: 06-team-matches-my-section.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 7: Verify "다른 팀 매칭" section
  - Action: Observe other team matches
  - Target: "다른 팀 매칭" heading (only when user has host teams) and cards
  - Expected Result: TeamMatchCard components; desktop grid-cols-2; mobile stacked; stagger-children animation
  - Screenshot: 07-team-matches-other-section.png
  - Viewport notes: Desktop: grid-cols-2; Mobile: stacked
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 8: Click TeamMatchCard
  - Action: Click a team match card
  - Target: TeamMatchCard link
  - Expected Result: Navigates to /team-matches/{id}
  - Screenshot: 08-team-matches-card-click.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 9: Click "+" create button
  - Action: Click Plus button
  - Target: `a[href="/team-matches/new"]`
  - Expected Result: Navigates to /team-matches/new; h-11 w-11 bg-blue-500; aria-label "모집글 작성"
  - Screenshot: 09-team-matches-create.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean aria-label

Step 10: Loading/Error/Empty states
  - Action: Verify all data states
  - Target: Loading skeletons, ErrorState, EmptyState
  - Expected Result: Loading: 3 skeleton blocks h-[160px] skeleton-shimmer. Error: ErrorState with retry. Empty: EmptyState "모집글이 없어요" with action "모집글 작성"
  - Screenshot: 10-team-matches-states.png
  - Viewport notes: No difference
  - Theme notes: Skeletons bg-gray-100 (light) / bg-gray-800 (dark)
  - Locale notes: Hardcoded Korean

Step 11: Match count text
  - Action: Observe count when results loaded
  - Target: `p` with "{N}개의 모집글"
  - Expected Result: Text-sm text-gray-500 showing count
  - Screenshot: 11-team-matches-count.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

---

## S16 — Team Match Detail

**Source**: `apps/web/src/app/(main)/team-matches/[id]/page.tsx`

### S16-01: Loading and not found

Step 1: Loading skeleton
  - Action: Navigate with slow load
  - Target: Skeleton blocks
  - Expected Result: h-6 w-32 skeleton, h-[200px] and h-[300px] rounded-2xl blocks
  - Screenshot: 01-team-match-detail-loading.png
  - Viewport notes: No difference
  - Theme notes: bg-gray-50 (light) / bg-gray-700 (dark)
  - Locale notes: No difference

Step 2: Not found state
  - Action: Navigate to /team-matches/nonexistent
  - Target: EmptyState with AlertCircle
  - Expected Result: "모집글을 찾을 수 없어요" title, action "목록으로" to /team-matches
  - Screenshot: 02-team-match-detail-notfound.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

### S16-02: Header and status

Step 3: Verify header
  - Action: Observe page header
  - Target: Header with back button, title, status badge
  - Expected Result: Back button (mobile only @3xl:hidden), match title h1, status badge (colored per getTeamMatchStatusMeta)
  - Screenshot: 03-team-match-detail-header.png
  - Viewport notes: Mobile: back button visible; Desktop: breadcrumb
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 4: Verify desktop breadcrumb
  - Action: Observe on desktop
  - Target: "팀 매칭" > "상세" breadcrumb
  - Expected Result: Link to /team-matches, ChevronRight, "상세"
  - Screenshot: 04-team-match-detail-breadcrumb.png
  - Viewport notes: Desktop only
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

### S16-03: Match info cards

Step 5: Verify 경기 정보 card
  - Action: Observe match info card
  - Target: Card with "경기 정보" heading
  - Expected Result: 5 rows: 날짜 (Calendar), 시간 (Clock), 쿼터 수 (Trophy), 구장 (MapPin with address), 비용 (DollarSign with total and opponent fee)
  - Screenshot: 05-team-match-detail-info.png
  - Viewport notes: Desktop: left column in grid-cols-[1fr_380px]; Mobile: full width
  - Theme notes: Card bg-white (light) / bg-gray-800 (dark)
  - Locale notes: Hardcoded Korean labels

Step 6: Verify 경기 조건 card
  - Action: Observe match conditions card
  - Target: Card with "경기 조건" heading
  - Expected Result: Skill grade badge, free invitation badge (if applicable), grid of condition items: 실력등급, 선출선수, 경기방식, 매치 유형, 경기 스타일, 종목, 유니폼 색상, 용병 허용, 심판 유무; notes section if present
  - Screenshot: 06-team-match-detail-conditions.png
  - Viewport notes: grid-cols-2 gap-3 (mobile) / gap-5 (desktop)
  - Theme notes: Condition tiles bg-gray-50 (light) / bg-gray-700 (dark)
  - Locale notes: Hardcoded Korean

Step 7: Verify referee schedule table
  - Action: Observe referee schedule (when hasReferee=false and schedule exists)
  - Target: Table with "심판 배정표" heading
  - Expected Result: Table with columns 쿼터/담당팀; Shield icon blue-500; scrollable horizontally
  - Screenshot: 07-team-match-detail-referee.png
  - Viewport notes: overflow-x-auto scrollbar-hide
  - Theme notes: Standard table colors
  - Locale notes: Hardcoded Korean

Step 8: Verify host team card
  - Action: Observe host team card
  - Target: Card with "호스트 팀" heading
  - Expected Result: Team logo (h-12 w-12), team name, manner score (star), match count, link to /teams/{id}; hover effect
  - Screenshot: 08-team-match-detail-host-team.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

### S16-04: CTA buttons

Step 9: Verify "경기 신청하기" button (spectator, recruiting)
  - Action: View as non-host when status=recruiting
  - Target: "경기 신청하기" button
  - Expected Result: Blue button bg-blue-500 py-3.5 font-bold; aria-haspopup="dialog"; if not authenticated redirects to login
  - Screenshot: 09-team-match-detail-apply-button.png
  - Viewport notes: In sidebar (desktop) or below content (mobile)
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 10: Click "경기 신청하기" — apply modal
  - Action: Click apply button
  - Target: "경기 신청하기" button
  - Expected Result: Apply modal opens with: checkbox "상호 확인 동의" with description; team selector (if multiple eligible teams) or single team display; message textarea (optional); "취소" and "신청하기" buttons
  - Screenshot: 10-team-match-detail-apply-modal.png
  - Viewport notes: Modal responsive
  - Theme notes: Standard modal
  - Locale notes: Hardcoded Korean

Step 11: Toggle confirmation checkbox
  - Action: Click confirmation checkbox
  - Target: Checkbox input in label
  - Expected Result: Checkbox toggles; when unchecked: "신청하기" button disabled (opacity-40 cursor-not-allowed); when checked: button enabled
  - Screenshot: 11-team-match-detail-apply-checkbox.png
  - Viewport notes: No difference
  - Theme notes: Checkbox text-blue-500 focus:ring-blue-500
  - Locale notes: Hardcoded Korean

Step 12: Select team in apply modal (multiple teams)
  - Action: Open team select, choose a team
  - Target: `select#team-select`
  - Expected Result: Dropdown shows eligible teams (owner/manager, not host, not already applied); selecting updates selectedTeamId
  - Screenshot: 12-team-match-detail-apply-team-select.png
  - Viewport notes: No difference
  - Theme notes: Select adapts
  - Locale notes: No difference

Step 13: Type apply message
  - Action: Type in message textarea
  - Target: `textarea#apply-message`
  - Expected Result: Placeholder "호스트에게 전달할 메시지를 작성하세요"; resize-none; 3 rows
  - Screenshot: 13-team-match-detail-apply-message.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 14: Submit application
  - Action: Check checkbox, click "신청하기"
  - Target: Submit button in modal
  - Expected Result: Loading: spinner + "처리 중..."; on success: modal closes; on error: error handling
  - Screenshot: 14-team-match-detail-apply-submit.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 15: Close apply modal via ESC/backdrop/cancel
  - Action: Press ESC, click backdrop, or click "취소"
  - Target: Modal close mechanisms
  - Expected Result: Modal closes; no application submitted
  - Screenshot: 15-team-match-detail-apply-close.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 16: Verify no eligible teams warning
  - Action: Open apply modal with no eligible teams
  - Target: Warning box in modal
  - Expected Result: Amber warning "신청 가능한 팀이 없어요. 매니저 이상 권한이 있는 팀으로만 신청할 수 있어요."; submit disabled
  - Screenshot: 16-team-match-detail-no-teams.png
  - Viewport notes: No difference
  - Theme notes: bg-amber-50 (light) / bg-amber-900/20 (dark)
  - Locale notes: Hardcoded Korean

### S16-05: Host controls

Step 17: Verify host CTA area
  - Action: View as host (owner/manager of host team)
  - Target: Host control buttons
  - Expected Result: "모집글 수정" link (Pencil icon) to /team-matches/{id}/edit; "내가 작성한 모집글이에요" text; when applicableTeams confirmed: "도착 인증", "경기 결과 입력", "경기 평가하기" links appear conditionally
  - Screenshot: 17-team-match-detail-host-controls.png
  - Viewport notes: Desktop: sidebar; Mobile: below content
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 18: Verify ApplicationsSection (host view)
  - Action: View applications section
  - Target: ApplicationsSection component
  - Expected Result: List of team applications with approve/reject buttons (managed by separate component)
  - Screenshot: 18-team-match-detail-applications.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

### S16-06: Navigation links

Step 19: Click "도착 인증" link
  - Action: Click arrival check-in link
  - Target: `a[href="/team-matches/{id}/arrival"]`
  - Expected Result: Navigates to arrival page; MapPinCheck icon; blue button
  - Screenshot: 19-team-match-detail-arrival-link.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 20: Click "경기 결과 입력" link
  - Action: Click score input link
  - Target: `a[href="/team-matches/{id}/score"]`
  - Expected Result: Navigates to score page; Trophy icon; gray-900 button
  - Screenshot: 20-team-match-detail-score-link.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean "경기 결과 입력" or "저장된 경기 결과 보기" if completed

Step 21: Click "경기 평가하기" link
  - Action: Click evaluation link
  - Target: `a[href="/team-matches/{id}/evaluate"]`
  - Expected Result: Navigates to evaluation page; ClipboardCheck icon; blue button
  - Screenshot: 21-team-match-detail-evaluate-link.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

---

## S17 — Team Match Score Input

**Source**: `apps/web/src/app/(main)/team-matches/[id]/score/page.tsx`

Step 1: Navigate to /team-matches/{id}/score
  - Action: Navigate to score page
  - Target: Score input page
  - Expected Result: Header with back button + "스코어 입력" title; scoreboard (dark bg-gray-900) with home/away team logos, names, total scores; quarter-by-quarter input cards
  - Screenshot: 01-score-page-load.png
  - Viewport notes: max-w-2xl centered on desktop
  - Theme notes: Scoreboard always dark (bg-gray-900); quarter cards adapt
  - Locale notes: Hardcoded Korean

Step 2: Verify scoreboard display
  - Action: Observe scoreboard
  - Target: Dark panel with team logos + scores
  - Expected Result: Home team (h-14 w-14 logo, name, "호스트" label) vs Away team (name, "상대 팀" label); large 4xl total scores centered; status text ("호스트 팀 우세" / "현재 동점" / "상대 팀 우세")
  - Screenshot: 02-score-scoreboard.png
  - Viewport notes: No difference
  - Theme notes: Always dark panel
  - Locale notes: Hardcoded Korean

Step 3: Focus and type score in quarter input
  - Action: Click home Q1 input, type "2"
  - Target: `input#home-Q1` (type="text" inputMode="numeric")
  - Expected Result: Input accepts only digits (non-numeric stripped); text-center text-xl font-bold; total updates dynamically
  - Screenshot: 03-score-quarter-input.png
  - Viewport notes: flex items-center gap-3 for home:away pair
  - Theme notes: Input adapts
  - Locale notes: No difference

Step 4: Verify cumulative score table
  - Action: Observe table below inputs
  - Target: Table with "쿼터별 누적 점수" heading
  - Expected Result: Table with team names as rows; quarter columns + 합계 column; home/away totals in text-blue-500 font-bold
  - Screenshot: 04-score-cumulative-table.png
  - Viewport notes: overflow-x-auto scrollbar-hide
  - Theme notes: Standard table
  - Locale notes: Hardcoded Korean

Step 5: Submit with incomplete scores
  - Action: Fill some but not all quarter scores, observe submit
  - Target: Submit button
  - Expected Result: "경기 결과 저장" button disabled (opacity-40 cursor-not-allowed); hint text "모든 쿼터 점수를 입력해야 저장할 수 있어요."
  - Screenshot: 05-score-incomplete.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 6: Submit complete scores
  - Action: Fill all quarter scores, click "경기 결과 저장"
  - Target: Submit button (min-h-[48px] bg-blue-500)
  - Expected Result: Loading: "저장 중..."; on success toast "경기 결과가 저장되었어요"
  - Screenshot: 06-score-submit.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 7: Verify completed state
  - Action: View score page for completed match
  - Target: Green completion card
  - Expected Result: CheckCircle2 icon; "저장된 경기 결과입니다" title; score inputs disabled; links to "경기 평가하기" and "매치 상세로 돌아가기"
  - Screenshot: 07-score-completed.png
  - Viewport notes: No difference
  - Theme notes: Green border/bg adapts to dark
  - Locale notes: Hardcoded Korean

Step 8: Verify blocked state (no opponent)
  - Action: View score page with only one team
  - Target: Amber warning card
  - Expected Result: Warning message "상대 팀이 확정된 뒤에만 결과를 기록할 수 있어요"; no score inputs shown
  - Screenshot: 08-score-blocked.png
  - Viewport notes: No difference
  - Theme notes: amber border/bg adapts
  - Locale notes: Hardcoded Korean

---

## S18 — Team Match Evaluation

**Source**: `apps/web/src/app/(main)/team-matches/[id]/evaluate/page.tsx`

Step 1: Navigate to /team-matches/{id}/evaluate
  - Action: Navigate to evaluation page
  - Target: Evaluation page
  - Expected Result: Header with back + "경기 평가" title; match title card; team selector (if multiple); 6 star rating widgets; comment textarea; submit button
  - Screenshot: 01-evaluate-page-load.png
  - Viewport notes: max-w-2xl centered on desktop
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 2: Verify match info card
  - Action: Observe top card
  - Target: Card with "POST MATCH" eyebrow
  - Expected Result: Blue eyebrow text; match title; participating teams listed as "vs"
  - Screenshot: 02-evaluate-match-info.png
  - Viewport notes: No difference
  - Theme notes: Standard card
  - Locale notes: Hardcoded Korean

Step 3: Verify team selector (multiple teams)
  - Action: View with multiple participating teams
  - Target: `select#evaluation-team-select`
  - Expected Result: Select dropdown with user's participating teams; changing selection resets ratings and comment
  - Screenshot: 03-evaluate-team-select.png
  - Viewport notes: No difference
  - Theme notes: Select adapts
  - Locale notes: No difference

Step 4: Interact with star rating (6 items)
  - Action: Click each star (1-5) for each of 6 evaluation items
  - Target: StarRating buttons with aria-label="{N}점"
  - Expected Result: 6 evaluation items: 수준 일치, 정보 일치, 매너, 시간 약속, 비용 정산, 경기 협조; each has description; each has 5 star buttons (min-h-11 min-w-11); filled stars amber-400, unfilled gray-200 (light) / gray-700 (dark); active:scale-110 animation; rating number updates
  - Screenshot: 04-evaluate-star-rating.png
  - Viewport notes: Stars fit in row across all viewports
  - Theme notes: Filled: text-amber-400; Unfilled: text-gray-200 (light) / text-gray-700 (dark)
  - Locale notes: aria-labels "{N}점"; item labels hardcoded Korean

Step 5: Verify all-rated state — average display
  - Action: Rate all 6 items
  - Target: Average rating panel
  - Expected Result: Dark panel (bg-gray-900) with "종합 평점" label; large Star icon amber-400; average score in 3xl font-bold white
  - Screenshot: 05-evaluate-average.png
  - Viewport notes: No difference
  - Theme notes: Always dark panel
  - Locale notes: Hardcoded Korean

Step 6: Type comment
  - Action: Type in comment textarea
  - Target: `textarea#team-match-eval-comment`
  - Expected Result: Placeholder "상대 팀과 경기하며 느낀 점을 남겨주세요"; 3 rows; resize-none
  - Screenshot: 06-evaluate-comment.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 7: Submit evaluation
  - Action: Click "평가 제출하기" button
  - Target: Submit button with Send icon (min-h-[48px] bg-blue-500)
  - Expected Result: Disabled until all 6 items rated; loading: "제출 중..."; on success toast "경기 평가가 저장되었어요"
  - Screenshot: 07-evaluate-submit.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 8: Verify already-submitted state
  - Action: View evaluation page after submission
  - Target: Green success card
  - Expected Result: CheckCircle2; "이미 평가를 제출했습니다"; opponent team name; saved average score display; saved comment; no edit possible (submit hidden)
  - Screenshot: 08-evaluate-already-submitted.png
  - Viewport notes: No difference
  - Theme notes: Green adapts to dark
  - Locale notes: Hardcoded Korean

Step 9: Verify blocked state (not completed)
  - Action: View for non-completed match
  - Target: Amber warning card
  - Expected Result: "경기 완료 후에만 평가할 수 있어요" with description; no rating form
  - Screenshot: 09-evaluate-blocked.png
  - Viewport notes: No difference
  - Theme notes: Amber adapts
  - Locale notes: Hardcoded Korean

Step 10: Submit hint when not all rated
  - Action: Rate only some items, observe submit area
  - Target: Hint text below disabled button
  - Expected Result: "모든 항목을 평가해야 제출할 수 있어요." text visible
  - Screenshot: 10-evaluate-incomplete-hint.png
  - Viewport notes: No difference
  - Theme notes: text-gray-500 (light) / text-gray-400 (dark)
  - Locale notes: Hardcoded Korean

---

## S19 — Team Match Arrival Check-in

**Source**: `apps/web/src/app/(main)/team-matches/[id]/arrival/page.tsx`

Step 1: Navigate to /team-matches/{id}/arrival
  - Action: Navigate to arrival page
  - Target: Arrival check-in page
  - Expected Result: Header with back + "도착 인증"; match info card (TEAM MATCH eyebrow, title, status badge, date/time/venue, participating teams); countdown timer; team selector (if multiple); arrival status; team-by-team arrival status list
  - Screenshot: 01-arrival-page-load.png
  - Viewport notes: max-w-2xl centered on desktop
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 2: Verify countdown timer
  - Action: Observe countdown
  - Target: Dark panel (bg-gray-900) with countdown
  - Expected Result: "경기 시작까지" label; countdown in 3xl font-bold white; updates every second; shows "경기 시작 시간입니다" when time passed
  - Screenshot: 02-arrival-countdown.png
  - Viewport notes: No difference
  - Theme notes: Always dark panel
  - Locale notes: Hardcoded Korean

Step 3: Verify team selector (multiple participating teams)
  - Action: View with multiple teams
  - Target: `select#arrival-team-select`
  - Expected Result: Select showing user's participating teams; changing selection updates arrival status view
  - Screenshot: 03-arrival-team-select.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: No difference

Step 4: Click "도착 기록하기" button
  - Action: Click check-in button
  - Target: Check-in button (min-h-[48px] bg-blue-500)
  - Expected Result: Loading: Loader2 spinner; API call with teamId; on success toast "{teamName} 도착 인증이 기록되었어요"
  - Screenshot: 04-arrival-checkin.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 5: Verify arrival completed state
  - Action: View after check-in
  - Target: Green success card
  - Expected Result: CheckCircle2; "{teamName} 도착 기록 완료"; recorded time; links to "경기 결과 입력으로 이동" (if manager+) and "매치 상세로 돌아가기"
  - Screenshot: 05-arrival-completed.png
  - Viewport notes: No difference
  - Theme notes: Green adapts to dark
  - Locale notes: Hardcoded Korean

Step 6: Verify team arrival status list
  - Action: Observe "팀별 도착 현황"
  - Target: Per-team status cards
  - Expected Result: Each team: name (with "내 팀" tag if mine), "호스트 팀" or "상대 팀" label, arrival status ("도착 완료" green or "대기 중" gray), arrival time
  - Screenshot: 06-arrival-team-status.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 7: Verify info notice
  - Action: Observe bottom info card
  - Target: Blue info card with Info icon
  - Expected Result: "현재 지원 범위" heading; description about current limitations (no GPS radius, no photo upload, etc.)
  - Screenshot: 07-arrival-info-notice.png
  - Viewport notes: No difference
  - Theme notes: bg-blue-50/70 (light) / bg-blue-950/20 (dark)
  - Locale notes: Hardcoded Korean

Step 8: Verify blocked state
  - Action: View when arrival not open
  - Target: Amber warning card with ShieldAlert icon
  - Expected Result: Warning title and description explaining why arrival check-in is blocked; no check-in form
  - Screenshot: 08-arrival-blocked.png
  - Viewport notes: No difference
  - Theme notes: Amber adapts
  - Locale notes: Hardcoded Korean

---

## S20 — Create/Edit Team Match

**Source**: `apps/web/src/app/(main)/team-matches/new/page.tsx`

### S20-01: Pre-conditions

Step 1: Navigate with no teams
  - Action: Navigate to /team-matches/new with no teams
  - Target: No-team screen
  - Expected Result: Users icon (h-16 w-16); "팀을 먼저 만들어주세요" heading; "팀 만들기" link to /teams/new
  - Screenshot: 01-team-match-create-no-teams.png
  - Viewport notes: Centered layout
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 2: Navigate with no eligible teams (only member role)
  - Action: Navigate when user is only "member" in all teams
  - Target: EmptyState
  - Expected Result: "권한이 없어요" title; "모집글을 작성하려면 팀의 owner 또는 manager여야 해요" description; action "새 팀 만들기"
  - Screenshot: 02-team-match-create-no-permission.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 3: Verify host team selector (multiple eligible)
  - Action: View when user has multiple eligible teams
  - Target: `select#host-team-select`
  - Expected Result: Select showing eligible teams with role indicator "(오너)" or "(매니저)"; FormField label "호스트 팀 선택"
  - Screenshot: 03-team-match-create-team-select.png
  - Viewport notes: max-w-[700px] container
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

### S20-02: 5-step wizard

Step 4: Verify progress indicator
  - Action: Observe progress at step 0
  - Target: Progress bars and step label
  - Expected Result: 5 segments; first filled bg-blue-500; label "종목"; counter "1 / 5"
  - Screenshot: 04-team-match-create-progress.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean step names ["종목", "구장/일시", "경기조건", "비용/규정", "확인"]

Step 5: Step 0 — Sport selection + title
  - Action: Select sport and enter title
  - Target: Sport grid (grid-cols-2) and title input
  - Expected Result: 11 sport buttons in grid; selected has ring-2 ring-blue-500; title input with placeholder "예: 일요일 오전 친선경기 모집합니다"
  - Screenshot: 05-team-match-create-step0.png
  - Viewport notes: No difference
  - Theme notes: Selected: ring-blue-500 bg-blue-50 (light) / bg-blue-950/20 (dark)
  - Locale notes: Hardcoded Korean

Step 6: "다음" button disabled without sport+title
  - Action: Observe next button without selecting sport or entering title
  - Target: "다음" button
  - Expected Result: Button disabled (opacity-40 cursor-not-allowed); canProceed() returns false when sportType or title empty
  - Screenshot: 06-team-match-create-step0-disabled.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 7: Step 1 — Venue/Schedule
  - Action: Advance to step 1
  - Target: Date, time, quarter, venue inputs
  - Expected Result: Date input, start/end time inputs (grid-cols-2), total minutes input, quarter selector (5 options: 2,4,6,8,10 as buttons), venue name input, venue address input
  - Screenshot: 07-team-match-create-step1.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean labels

Step 8: Click quarter options
  - Action: Click each quarter button (2, 4, 6, 8, 10)
  - Target: Quarter buttons
  - Expected Result: Selected shows ring-2 ring-blue-500; default is 4; each is flex-1 rounded-xl
  - Screenshot: 08-team-match-create-quarters.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: No difference

Step 9: Step 2 — Match conditions
  - Action: Advance to step 2
  - Target: Skill grade, pro players, format, match type, match style, uniform, toggles
  - Expected Result: Skill grade chips (S-D grade scale, horizontally scrollable); pro player count input (0-10); game format buttons (11:11, 8:8, 6:6, 5:5); match type radio buttons (with descriptions); match style buttons (3 options); uniform color input; 3 toggle fields (무료초청, 용병 허용, 심판 배정)
  - Screenshot: 09-team-match-create-step2.png
  - Viewport notes: Skill grade: overflow-x-auto; others wrap
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 10: Interact with toggle fields
  - Action: Click each toggle (무료초청, 용병 허용, 심판 배정)
  - Target: ToggleField components
  - Expected Result: Toggle switch slides (translate-x-5 when on); bg-blue-500 when on, bg-gray-200 when off; clicking row or toggle button both work; 무료초청 toggle also sets opponentFee to '0'
  - Screenshot: 10-team-match-create-toggles.png
  - Viewport notes: No difference
  - Theme notes: Toggle knob: bg-white (light) / bg-gray-800 (dark)
  - Locale notes: Hardcoded Korean

Step 11: Step 3 — Cost/Rules
  - Action: Advance to step 3
  - Target: Fee inputs and notes textarea
  - Expected Result: Total fee input with currency preview; opponent fee input with hint; notes textarea (4 rows, resize-none, placeholder "유니폼 색상, 주차 안내, 기타 규정 등")
  - Screenshot: 11-team-match-create-step3.png
  - Viewport notes: No difference
  - Theme notes: Standard
  - Locale notes: Hardcoded Korean

Step 12: Step 4 — Confirm
  - Action: Advance to step 4
  - Target: Summary card with SummaryRow items
  - Expected Result: All form data in label-value rows: 제목, 종목, 날짜, 시간, 쿼터, 구장, 주소, 총 비용, 상대팀 부담, 실력등급, 선출선수, 경기방식, 매치 유형, 경기 스타일, 유니폼 색상, 용병, 심판, 추가 안내
  - Screenshot: 12-team-match-create-step4.png
  - Viewport notes: No difference
  - Theme notes: Standard card
  - Locale notes: Hardcoded Korean

Step 13: Click "모집글 등록" submit
  - Action: Click submit button
  - Target: Submit button with Check icon
  - Expected Result: Loading: "등록 중..."; disabled while pending; on success: redirect to /team-matches; on error: toast "모집글 등록에 실패했어요. 잠시 후 다시 시도해주세요"
  - Screenshot: 13-team-match-create-submit.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean

Step 14: Navigate back through steps — data preserved
  - Action: Use back button (MobileGlassHeader onBack) to go through steps
  - Target: Step state
  - Expected Result: Each back click decrements step; form data persists across steps; going forward shows previously entered data
  - Screenshot: 14-team-match-create-back-steps.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 15: Loading state (teams loading)
  - Action: View while myTeams loading
  - Target: Full-page spinner
  - Expected Result: Centered spinner (h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin)
  - Screenshot: 15-team-match-create-loading.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: No difference

Step 16: Error state (teams error)
  - Action: Simulate teams API error
  - Target: ErrorState component
  - Expected Result: "팀 정보를 불러올 수 없어요" message with retry button
  - Screenshot: 16-team-match-create-error.png
  - Viewport notes: No difference
  - Theme notes: No difference
  - Locale notes: Hardcoded Korean
