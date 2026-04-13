# Part C: UI/UX Test Scenarios — Lessons, Marketplace, Mercenary, Venues

**Matrix (12 combinations per scenario):**
- Viewports: mobile (390x844), tablet (768x1024), desktop (1440x900)
- Language: Korean (ko), English (en)
- Theme: Light mode, Dark mode

---

## S21 — Lessons Discovery

### S21-01: Page initial load — loading skeleton
```
Step 1: Navigate to /lessons
  - Action: Open /lessons URL
  - Target: Full page
  - Expected: 3 skeleton cards render (rounded-2xl bg-gray-50 dark:bg-gray-800 with skeleton-shimmer); each has aspect-[16/9] top area + 3 shimmer lines below; MobilePageTopZone shows eyebrow "레슨 . 연습", title from i18n lessons.title, subtitle text; "+" button visible top-right (h-11 w-11 rounded-xl bg-blue-500)
  - Screenshot: 01-lessons-loading-skeleton.png
  - Viewport: mobile shows single column; desktop (@3xl) shows 2-column grid
  - Theme: Light bg-gray-50 skeleton / Dark bg-gray-800 skeleton
  - Locale: ko shows "레슨 . 연습" eyebrow; en shows translated equivalent
```

### S21-02: Page loaded — lesson cards displayed
```
Step 2: Wait for data load
  - Action: Wait for useLessons() to resolve
  - Target: Lesson card list
  - Expected: Skeleton replaced with LessonCard components in "flex flex-col gap-3 @3xl:grid @3xl:grid-cols-2 stagger-children"; result count text "N개의 강좌" visible above list; each card wrapped in <Link href="/lessons/{id}">
  - Screenshot: 02-lessons-loaded.png
  - Viewport: mobile = single column stacked; desktop = 2-col grid
```

### S21-03: Search input — focus state
```
Step 3: Click search input
  - Action: Click the search input (#lessons-search)
  - Target: Input with Search icon (left-3.5, size=16)
  - Expected: Input receives focus ring (blue-500 outline); sr-only label "강좌 검색" present; placeholder from i18n lessons.searchPlaceholder; Search icon text-gray-500 visible at left
  - Screenshot: 03-lessons-search-focus.png
```

### S21-04: Search input — typing with debounce
```
Step 4: Type search query
  - Action: Type "풋살" into search input
  - Target: #lessons-search
  - Expected: Text appears in input; 300ms debounce (useDebounce); after debounce, list filters to lessons matching title/coachName/venueName containing "풋살"; result count updates
  - Screenshot: 04-lessons-search-typing.png
```

### S21-05: Search input — clear and restore
```
Step 5: Clear search query
  - Action: Select all text, delete
  - Target: #lessons-search
  - Expected: Input empty; full lesson list restored; result count shows total
  - Screenshot: 05-lessons-search-cleared.png
```

### S21-06: Search input — no results
```
Step 6: Type non-matching query
  - Action: Type "xyznonexistent"
  - Target: #lessons-search
  - Expected: After debounce, list shows EmptyState component with GraduationCap icon, title from i18n empty.noLessons, description from i18n empty.noLessonsDesc, action link "강좌 등록" -> /lessons/new
  - Screenshot: 06-lessons-search-no-results.png
```

### S21-07: Type filter chip — "전체" default active
```
Step 7: Observe default filter state
  - Action: Inspect type filter chips
  - Target: 4 filter buttons in horizontal scrollable row (overflow-x-auto scrollbar-hide)
  - Expected: "전체" chip active (bg-blue-500 text-white); "그룹 레슨", "연습 경기", "자유 연습" inactive (border border-gray-100 bg-gray-50 text-gray-600); all chips min-h-[44px] touch target
  - Screenshot: 07-lessons-filter-default.png
  - Theme: Dark mode inactive = dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300
  - Note: The task spec lists 5 filter chips including "클리닉", but the source code (typeFilterKeys) only defines 4 options (전체/그룹 레슨/연습 경기/자유 연습). 클리닉 is available as a type in the create/edit form but NOT as a discovery filter on the listing page. This is not a test bug — it reflects the actual implementation.
```

### S21-08: Type filter chip — hover inactive chip
```
Step 8: Hover "그룹 레슨" chip
  - Action: Mouse hover over "그룹 레슨" button
  - Target: Second filter chip
  - Expected: Background transitions to hover:bg-gray-100 (dark: dark:hover:bg-gray-700); transition-colors animation
  - Screenshot: 08-lessons-filter-hover.png
  - Viewport: Hover not applicable on mobile touch; verify touch feedback via active:bg-gray-100
```

### S21-09: Type filter chip — click "그룹 레슨"
```
Step 9: Click "그룹 레슨" chip
  - Action: Click the "그룹 레슨" filter button
  - Target: Filter chip with key "group_lesson"
  - Expected: Chip becomes active (bg-blue-500 text-white); "전체" chip becomes inactive; API re-fetches with params.type="group_lesson"; list updates to show only group_lesson type; result count updates
  - Screenshot: 09-lessons-filter-group-lesson.png
```

### S21-10: Type filter chip — click "연습 경기"
```
Step 10: Click "연습 경기" chip
  - Action: Click the "연습 경기" filter button
  - Target: Filter chip with key "practice_match"
  - Expected: "연습 경기" active; "그룹 레슨" deactivated; list filters to practice_match only
  - Screenshot: 10-lessons-filter-practice-match.png
```

### S21-11: Type filter chip — click "자유 연습"
```
Step 11: Click "자유 연습" chip
  - Action: Click the "자유 연습" filter button
  - Target: Filter chip with key "free_practice"
  - Expected: "자유 연습" active; others deactivated; list filters accordingly
  - Screenshot: 11-lessons-filter-free-practice.png
```

### S21-12: Type filter chip — return to "전체"
```
Step 12: Click "전체" chip
  - Action: Click the "전체" filter button
  - Target: Filter chip with key ""
  - Expected: "전체" active; API fetches without type param; all lessons shown
  - Screenshot: 12-lessons-filter-all.png
```

### S21-13: Type filter chips — mobile horizontal scroll
```
Step 13: Scroll filter chips horizontally on mobile
  - Action: Swipe left on filter chip row
  - Target: Container with overflow-x-auto scrollbar-hide
  - Expected: Chips scroll smoothly; scrollbar hidden; all 4 chips accessible via scroll
  - Screenshot: 13-lessons-filter-scroll-mobile.png
  - Viewport: Only relevant on mobile (390px); desktop shows all chips without scroll
```

### S21-14: Type filter chips — keyboard navigation
```
Step 14: Tab through filter chips
  - Action: Press Tab key to navigate between chips
  - Target: All 4 filter buttons
  - Expected: Each button receives visible focus ring (blue-500); Enter/Space activates the chip; focus order: 전체 -> 그룹 레슨 -> 연습 경기 -> 자유 연습
  - Screenshot: 14-lessons-filter-keyboard.png
```

### S21-15: Lesson card — default render
```
Step 15: Inspect a lesson card
  - Action: Observe a LessonCard component
  - Target: Card with data-testid="lesson-card"
  - Expected: Card wrapped in <Link>; Card variant="default" padding="none" interactive; 16:9 aspect image with SafeImage + fallback; gradient overlay from-black/50; top-left: sport dot (colored per sportCardAccent) + sport name (text-2xs); top-right: lesson type badge (text-2xs bg-gray-900/60); bottom-left: price (text-sm font-bold); bottom-right: participant count or "마감"/"N자리 남음"; below image: title (truncate), meta row (date, venue, level), ticket info + coach name; team/venue tags if present
  - Screenshot: 15-lesson-card-default.png
```

### S21-16: Lesson card — hover state
```
Step 16: Hover a lesson card
  - Action: Mouse hover over lesson card
  - Target: LessonCard
  - Expected: Card border-color transitions (interactive prop); image scales to 1.02 (group-hover:scale-[1.02] transition-transform duration-300)
  - Screenshot: 16-lesson-card-hover.png
```

### S21-17: Lesson card — active/pressed state
```
Step 17: Press (mousedown) on lesson card
  - Action: Mousedown on lesson card
  - Target: LessonCard
  - Expected: Card scales to 0.98 (active:scale-[0.98] transition-[border-color,transform] duration-150)
  - Screenshot: 17-lesson-card-active.png
```

### S21-18: Lesson card — almost full indicator
```
Step 18: Observe card with >= 70% filled
  - Action: Find/create lesson with currentParticipants/maxParticipants >= 0.7
  - Target: Bottom-right badge
  - Expected: Shows "N자리 남음" badge with text-amber-100 bg-amber-600/80
  - Screenshot: 18-lesson-card-almost-full.png
```

### S21-19: Lesson card — full/closed indicator
```
Step 19: Observe card with 100% filled
  - Action: Find/create lesson with currentParticipants >= maxParticipants
  - Target: Bottom-right badge
  - Expected: Shows "마감" badge with text-white bg-gray-900/70
  - Screenshot: 19-lesson-card-full.png
```

### S21-20: Lesson card — click navigates to detail
```
Step 20: Click a lesson card
  - Action: Click on any lesson card
  - Target: LessonCard Link
  - Expected: Navigates to /lessons/{id}; URL changes; detail page loads
  - Screenshot: 20-lesson-card-click-navigate.png
```

### S21-21: "+" create button — hover
```
Step 21: Hover create button
  - Action: Mouse hover over "+" button
  - Target: Link to /lessons/new (h-11 w-11 rounded-xl)
  - Expected: Background transitions bg-blue-500 -> hover:bg-blue-600; aria-label from i18n lessons.createLesson
  - Screenshot: 21-lessons-create-hover.png
```

### S21-22: "+" create button — focus
```
Step 22: Focus create button via keyboard
  - Action: Tab to the "+" button
  - Target: Link to /lessons/new
  - Expected: Focus ring visible (blue-500 outline + offset)
  - Screenshot: 22-lessons-create-focus.png
```

### S21-23: "+" create button — click
```
Step 23: Click create button
  - Action: Click the "+" link
  - Target: Link to /lessons/new
  - Expected: Navigates to /lessons/new; create lesson form loads
  - Screenshot: 23-lessons-create-click.png
```

### S21-24: Error state
```
Step 24: Simulate API error
  - Action: Mock useLessons to return error
  - Target: Main content area
  - Expected: ErrorState component renders with retry button; onRetry calls refetch()
  - Screenshot: 24-lessons-error-state.png
```

### S21-25: Error state — retry button
```
Step 25: Click retry button
  - Action: Click retry in ErrorState
  - Target: ErrorState retry button
  - Expected: refetch() called; loading skeleton appears; data reloads
  - Screenshot: 25-lessons-error-retry.png
```

### S21-26: Empty state with action
```
Step 26: Observe empty state (no data, no filter)
  - Action: Mock useLessons returning empty items
  - Target: EmptyState component
  - Expected: GraduationCap icon; title from i18n; description from i18n; action button "강좌 등록" linking to /lessons/new
  - Screenshot: 26-lessons-empty-state.png
```

### S21-27: Desktop 2-column grid layout
```
Step 27: Resize to desktop width
  - Action: Set viewport to 1440x900
  - Target: Lesson card container
  - Expected: Cards render in @3xl:grid @3xl:grid-cols-2 layout; padding changes from px-5 to @3xl:px-0; MobilePageTopZone adapts
  - Screenshot: 27-lessons-desktop-grid.png
```

### S21-28: Bottom spacer for mobile nav
```
Step 28: Scroll to bottom
  - Action: Scroll page to bottom
  - Target: h-24 spacer div
  - Expected: 96px spacer ensures content is not hidden behind floating bottom navigation bar
  - Screenshot: 28-lessons-bottom-spacer.png
```

---

## S22 — Lesson Detail

### S22-01: Loading skeleton
```
Step 1: Navigate to /lessons/{id} (loading)
  - Action: Open lesson detail URL
  - Target: Full page
  - Expected: animate-pulse skeleton: h-48 bg-gray-100 rounded-2xl + h-32 bg-gray-100 rounded-2xl; role="status" aria-label="로딩 중"
  - Screenshot: 01-lesson-detail-loading.png
```

### S22-02: Not found state
```
Step 2: Navigate to /lessons/{invalid-id}
  - Action: Open non-existent lesson
  - Target: Page body
  - Expected: EmptyState with GraduationCap icon; role="alert"; title "강좌를 찾을 수 없어요"; description "삭제되었거나 존재하지 않는 강좌예요"; action "목록으로" -> /lessons
  - Screenshot: 02-lesson-detail-not-found.png
```

### S22-03: MobileGlassHeader back button
```
Step 3: Inspect mobile glass header
  - Action: Observe header on mobile
  - Target: MobileGlassHeader
  - Expected: Glass effect header; ArrowLeft back button (min-h-11 min-w-11 rounded-xl, aria-label="뒤로 가기"); truncated lesson title
  - Screenshot: 03-lesson-detail-header.png
```

### S22-04: MobileGlassHeader back button — click
```
Step 4: Click back button
  - Action: Click ArrowLeft button
  - Target: Back button
  - Expected: router.back() called; navigates to previous page
  - Screenshot: 04-lesson-detail-back.png
```

### S22-05: Desktop breadcrumb
```
Step 5: Observe desktop breadcrumb
  - Action: Set viewport to 1440x900
  - Target: hidden @3xl:flex breadcrumb
  - Expected: "강좌" link (hover:text-gray-600) > ChevronRight > lesson title (text-gray-700)
  - Screenshot: 05-lesson-detail-breadcrumb.png
  - Viewport: Only visible on desktop (@3xl); hidden on mobile
```

### S22-06: Hero cover image — display
```
Step 6: Observe hero cover
  - Action: Inspect cover section
  - Target: Rounded-2xl bg-blue-500 h-44 (mobile) / h-56 (desktop) container
  - Expected: SafeImage with object-cover; gradient overlay from-black/35; lesson type badge at bottom-left (text-2xs bg-gray-900/70); if no image, shows SportIcon centered in text-white/60
  - Screenshot: 06-lesson-detail-hero.png
```

### S22-07: Hero cover image — click opens MediaLightbox
```
Step 7: Click hero image
  - Action: Click the hero image button
  - Target: Button with aria-label="{title} 대표 이미지 보기"
  - Expected: MediaLightbox opens (dynamic import, ssr:false); shows full-size image; lightbox controls available
  - Screenshot: 07-lesson-detail-hero-lightbox.png
```

### S22-08: MediaLightbox — navigate between images
```
Step 8: Navigate in lightbox
  - Action: Click next/prev in MediaLightbox
  - Target: MediaLightbox navigation
  - Expected: Swipes between hero and gallery images; index updates; title shows "{title} 사진"
  - Screenshot: 08-lesson-detail-lightbox-nav.png
```

### S22-09: MediaLightbox — close via X
```
Step 9: Close lightbox via X button
  - Action: Click close button
  - Target: MediaLightbox close
  - Expected: Lightbox closes; showMediaLightbox = false
  - Screenshot: 09-lesson-detail-lightbox-close-x.png
```

### S22-10: MediaLightbox — close via ESC key
```
Step 10: Close lightbox via ESC
  - Action: Press Escape key
  - Target: MediaLightbox
  - Expected: Lightbox closes
  - Screenshot: 10-lesson-detail-lightbox-close-esc.png
```

### S22-11: MediaLightbox — keyboard arrow navigation
```
Step 11: Navigate lightbox with arrow keys
  - Action: Press Left/Right arrow keys
  - Target: MediaLightbox
  - Expected: Image index changes; left goes to previous, right goes to next
  - Screenshot: 11-lesson-detail-lightbox-keyboard.png
```

### S22-12: Title + badges section
```
Step 12: Inspect title card
  - Action: Observe title section
  - Target: Rounded-2xl border card
  - Expected: Lesson type chip (rounded-full text-2xs); sport label text; title (text-2xl font-bold); description (whitespace-pre-line) if present
  - Screenshot: 12-lesson-detail-title.png
```

### S22-13: Coach profile section
```
Step 13: Inspect coach section
  - Action: Observe coach card
  - Target: Coach intro card
  - Expected: 64x64 rounded-full avatar placeholder (User icon); coach name (text-lg font-bold); coach bio if present; manner score (Star icon amber-400 + score); registered count
  - Screenshot: 13-lesson-detail-coach.png
```

### S22-14: Info cards grid (date, venue, participants, fee)
```
Step 14: Inspect info cards
  - Action: Observe 4 InfoCard components
  - Target: 2-column grid
  - Expected: 4 cards: Calendar "일시" (formatFullDate + time range), MapPin "장소", Users "인원" (current/max + level range), CreditCard "수강료" (formatCurrency); each card rounded-2xl with icon + label + value + optional sub text
  - Screenshot: 14-lesson-detail-info-cards.png
```

### S22-15: Curriculum section
```
Step 15: Inspect curriculum
  - Action: Observe curriculum card
  - Target: Curriculum section with BookOpen icon
  - Expected: "커리큘럼" heading with section count; 4 sample curriculum items with numbered circles (1-4), title, desc, duration with Clock icon; border-b dividers
  - Screenshot: 15-lesson-detail-curriculum.png
```

### S22-16: TicketPlanSelector — default render
```
Step 16: Observe TicketPlanSelector component
  - Action: Inspect #ticket-plans section
  - Target: TicketPlanSelector component
  - Expected: Heading "수강권 선택" (text-lg font-bold); active plans rendered as full-width buttons (rounded-2xl p-4); each plan shows: radio indicator (h-5 w-5 rounded-full, filled blue-500 with inner white dot when selected, empty border-gray-300 otherwise); icon (Zap for single, Sparkles for multi, Infinity for unlimited); plan label ("1회 체험" / "N회 수강권" / "N일 무제한"); subtitle ("부담 없이 시작" / "회당 N원" / "자유롭게 수강"); price (text-base font-black tabular-nums); originalPrice with line-through + "N% 할인" badge if discounted; selected plan: ring-2 ring-blue-500 bg-blue-50 + blue text; unselected: border-gray-200 bg-gray-50 hover:border-gray-300; "가장 인기" badge (-top-2.5 bg-blue-500 text-white) on multi type; first active plan auto-selected; aria-pressed on each; bottom CTA "수강권 구매" button (ShoppingCart icon, rounded-2xl py-3) with price; disabled if purchaseDisabled (shows purchaseDisabledLabel); refund note "구매 후 7일 내 미사용 시 전액 환불"
  - Screenshot: 16-lesson-detail-ticket-plans.png
```

### S22-16a: TicketPlanSelector — no plans empty state
```
Step 16a: View TicketPlanSelector with no active plans
  - Action: Visit lesson with no active ticketPlans
  - Target: TicketPlanSelector
  - Expected: Dashed border card (border-dashed border-gray-200 bg-gray-50); Ticket icon (h-10 w-10); "현재 판매 중인 수강권이 없어요" heading; explanation text
  - Screenshot: 16a-lesson-detail-ticket-plans-empty.png
```

### S22-17: TicketPlanSelector — select a plan
```
Step 17: Click a different ticket plan
  - Action: Click on second plan button
  - Target: Plan button with aria-pressed
  - Expected: Clicked plan gets ring-2 ring-blue-500 bg-blue-50; radio dot fills; previous plan loses selection; price in CTA updates; onSelect callback fires; sidebar CTA updates to show new plan name + price
  - Screenshot: 17-lesson-detail-ticket-select.png
```

### S22-17a: TicketPlanSelector — purchase CTA click
```
Step 17a: Click "수강권 구매" button
  - Action: Click purchase CTA in TicketPlanSelector
  - Target: Purchase button (bg-blue-500 text-white)
  - Expected: onPurchase(selectedPlan) called; if host: button disabled with text "등록한 강좌는 구매할 수 없어요" (bg-gray-100 cursor-not-allowed); aria-label includes plan name + price for screen readers
  - Screenshot: 17a-lesson-detail-ticket-purchase.png
```

### S22-18: LessonCalendar — default render
```
Step 18: Observe LessonCalendar component
  - Action: Inspect calendar section
  - Target: LessonCalendar component
  - Expected: Heading "수업 일정" (text-lg font-bold); month navigation: prev button (ChevronLeft, aria-label="이전 달", min-h-[44px] min-w-11) and next button (ChevronRight, aria-label="다음 달"); current month display "{year}년 {month}월"; 7-column day-of-week headers (일=red-400, 토=blue-400, others=gray-400); calendar grid with day cells (h-11 rounded-xl); today highlighted (bg-blue-500 text-white font-bold); days with sessions show blue dots (h-1 w-1 bg-blue-500, up to 3 dots); cancelled sessions show gray dots (bg-gray-300); days without sessions disabled (cursor-default); past dates gray-300; legend below: "수업 있는 날" (blue dot) + "취소된 수업" (gray dot); hint "날짜를 선택하면 수업 상세가 표시돼요" when nothing selected
  - Screenshot: 18-lesson-detail-calendar.png
```

### S22-18a: LessonCalendar — empty state
```
Step 18a: View LessonCalendar with no schedules
  - Action: Visit lesson with no upcomingSchedules
  - Target: LessonCalendar
  - Expected: Heading "수업 일정"; dashed border card: "등록된 수업 일정이 아직 없어요. 예시 달력을 대신 보여주지 않고, 실제 일정이 생기면 이 영역에 표시됩니다."
  - Screenshot: 18a-lesson-detail-calendar-empty.png
```

### S22-19: LessonCalendar — navigate month
```
Step 19: Click next month button
  - Action: Click ChevronRight button
  - Target: Next month button
  - Expected: Calendar advances; month display updates; slide-in-left animation (motion-safe); selectedDate resets to null; session dots update for new month
  - Screenshot: 19-lesson-detail-calendar-next.png
```

### S22-19a: LessonCalendar — navigate previous month
```
Step 19a: Click previous month button
  - Action: Click ChevronLeft button
  - Target: Prev month button
  - Expected: Calendar goes back; slide-in-right animation; month display updates
  - Screenshot: 19a-lesson-detail-calendar-prev.png
```

### S22-19b: LessonCalendar — click day with sessions
```
Step 19b: Click a day that has sessions
  - Action: Click a calendar day with blue dot(s)
  - Target: Day button
  - Expected: Day cell gets bg-blue-50; aria-pressed="true"; session detail panel appears below calendar (animate-fade-in); shows date header "{month}월 {day}일 ({dayLabel})" + "{N}개 수업"; session list with: time block (startTime ~ endTime, blue-50 bg), status ("예약 가능" emerald CircleCheck / "마감" amber / "취소된 수업" gray CalendarX), participant count (Users icon, N/max명), note, cancel reason if cancelled; "예약" button (bg-blue-500 min-h-[44px]) for reservable sessions if onReserve is provided
  - Screenshot: 19b-lesson-detail-calendar-day-click.png
```

### S22-19c: LessonCalendar — toggle day selection
```
Step 19c: Click same day again to deselect
  - Action: Click the already-selected day
  - Target: Selected day button
  - Expected: selectedDate resets to null; session detail panel disappears; hint text reappears
  - Screenshot: 19c-lesson-detail-calendar-deselect.png
```

### S22-19d: LessonCalendar — click day without sessions
```
Step 19d: Click a day with no sessions
  - Action: Click empty day
  - Target: Day button (disabled)
  - Expected: Button disabled; no visual change; selectedDate remains null or resets
  - Screenshot: 19d-lesson-detail-calendar-empty-day.png
```

### S22-20: Gallery images section
```
Step 20: Inspect gallery
  - Action: Observe gallery section
  - Target: "강좌 사진" section with 3-column grid
  - Expected: Up to 3 gallery images (galleryImages.slice(1,4)); each is a button with aria-label; aspect-square rounded-xl; click opens MediaLightbox at correct index; note text about fallback preview
  - Screenshot: 20-lesson-detail-gallery.png
```

### S22-21: Gallery image — click opens lightbox
```
Step 21: Click a gallery image
  - Action: Click second gallery image
  - Target: Gallery button
  - Expected: MediaLightbox opens at index corresponding to clicked image
  - Screenshot: 21-lesson-detail-gallery-lightbox.png
```

### S22-22: Recommendation section
```
Step 22: Inspect "이런 분께 추천합니다"
  - Action: Observe recommendation card
  - Target: Recommendation list
  - Expected: 4 items with CheckCircle icon (text-gray-500); sport-specific first item text; text-base text-gray-600
  - Screenshot: 22-lesson-detail-recommendations.png
```

### S22-23: Sidebar CTA — unauthenticated user
```
Step 23: View page as unauthenticated user
  - Action: Clear auth state; visit detail page
  - Target: Sidebar CTA card
  - Expected: Price display (text-2xl font-black); participant progress bar (scaleX transform blue-500); "로그인 후 수강권 선택하기" link to /login (bg-blue-500 rounded-xl)
  - Screenshot: 23-lesson-detail-cta-unauth.png
```

### S22-24: Sidebar CTA — authenticated non-host (can purchase)
```
Step 24: View as authenticated non-host
  - Action: Login as non-host user; visit detail
  - Target: Sidebar CTA
  - Expected: If ticket plans exist and not full: "{plan name} 결제하기 . {price}" button (bg-blue-500); clicking triggers handleTicketCheckout which navigates to /payments/checkout with params
  - Screenshot: 24-lesson-detail-cta-purchase.png
```

### S22-25: Sidebar CTA — purchase button hover
```
Step 25: Hover purchase button
  - Action: Hover the purchase CTA
  - Target: Purchase button
  - Expected: hover:bg-blue-600 transition; active:bg-blue-700 on press
  - Screenshot: 25-lesson-detail-cta-hover.png
```

### S22-26: Sidebar CTA — no ticket plans
```
Step 26: View lesson without active ticket plans
  - Action: Visit lesson where ticketPlans is empty
  - Target: Sidebar CTA
  - Expected: Disabled button "판매 중인 수강권 없음" (bg-gray-100 text-gray-500 cursor-not-allowed)
  - Screenshot: 26-lesson-detail-cta-no-plans.png
```

### S22-27: Sidebar CTA — lesson is full
```
Step 27: View full lesson
  - Action: Visit lesson where currentParticipants >= maxParticipants
  - Target: Sidebar CTA
  - Expected: Disabled button "마감" (bg-gray-100 text-gray-500 cursor-not-allowed)
  - Screenshot: 27-lesson-detail-cta-full.png
```

### S22-28: Sidebar CTA — host view
```
Step 28: View as lesson host
  - Action: Login as host; visit own lesson
  - Target: Sidebar CTA
  - Expected: "강좌 관리하기" link (bg-gray-900 text-white, dark: bg-white text-gray-900) to /lessons/{id}/edit; separate "강좌 수정" link below with Pencil icon
  - Screenshot: 28-lesson-detail-cta-host.png
```

### S22-29: Sidebar CTA — owned ticket view
```
Step 29: View as user with owned ticket
  - Action: Login as user who has active ticket for this lesson
  - Target: Sidebar CTA + TrustSignalBanner
  - Expected: "보유한 수강권 보기" link (bg-blue-50 text-blue-600); TrustSignalBanner below with tone="success" label="보유 중"
  - Screenshot: 29-lesson-detail-cta-owned-ticket.png
```

### S22-30: "캘린더에 추가" button
```
Step 30: Click calendar add button
  - Action: Click "캘린더에 추가" button
  - Target: Google Calendar link button
  - Expected: window.open called with Google Calendar render URL containing title, dates, location, details; new tab opens
  - Screenshot: 30-lesson-detail-calendar-add.png
```

### S22-31: Registrant section
```
Step 31: Inspect registrant section
  - Action: Observe "등록자" card in sidebar
  - Target: Registrant card
  - Expected: Host avatar (first char of nickname, 40x40 rounded-full bg-gray-100); host nickname; "호스트" label
  - Screenshot: 31-lesson-detail-registrant.png
```

### S22-32: Participant progress bar
```
Step 32: Inspect progress bar
  - Action: Observe participant fill bar
  - Target: Progress bar in sidebar CTA
  - Expected: h-2 rounded-full bg-gray-100 outer; inner blue-500 with scaleX(filledPercent/100) + transition-transform duration-300 origin-left
  - Screenshot: 32-lesson-detail-progress-bar.png
```

### S22-33: Desktop sidebar sticky layout
```
Step 33: Scroll on desktop
  - Action: Scroll page on 1440x900 viewport
  - Target: sidebar-sticky container
  - Expected: Right sidebar sticks to viewport while left content scrolls; @3xl:grid @3xl:grid-cols-[1fr_380px] @3xl:gap-8 layout
  - Screenshot: 33-lesson-detail-desktop-sticky.png
```

### S22-34: Trust signals below CTA
```
Step 34: Inspect trust signals
  - Action: Observe bottom of CTA card
  - Target: Trust signal text items
  - Expected: 2 items with CheckCircle icon (size=12): "24시간 내 환불 가능", "코치 직접 피드백"
  - Screenshot: 34-lesson-detail-trust-signals.png
```

---

## S23 — Create/Edit Lesson

### S23-01: Create page — auth guard
```
Step 1: Navigate to /lessons/new as unauthenticated
  - Action: Open /lessons/new without auth
  - Target: Page
  - Expected: useRequireAuth() redirects to /login
  - Screenshot: 01-lesson-create-auth-guard.png
```

### S23-02: Step 0 — sport type selection
```
Step 2: Observe step 0
  - Action: Load /lessons/new as authenticated user
  - Target: Sport type grid
  - Expected: Progress bar shows step 1/4 "종목.유형"; 2x2 grid of sport buttons (풋살/농구/배드민턴/아이스하키); each button has SportIcon (size=28) + label; none selected by default; "다음" button disabled (opacity-40 cursor-not-allowed)
  - Screenshot: 02-lesson-create-step0.png
```

### S23-03: Step 0 — select sport type
```
Step 3: Click "풋살" sport button
  - Action: Click "풋살" button
  - Target: Sport button with type="futsal"
  - Expected: Button becomes active (border-blue-500 bg-blue-500 text-white); aria-pressed="true"; other buttons inactive
  - Screenshot: 03-lesson-create-sport-select.png
```

### S23-04: Step 0 — lesson type selection
```
Step 4: Click "그룹 레슨" type button
  - Action: Click "그룹 레슨" option
  - Target: Lesson type button with value="group_lesson"
  - Expected: Full-width button becomes active (border-blue-500 bg-blue-500); shows label "그룹 레슨" + desc "여러 명이 함께 배우는 레슨"; aria-pressed="true"; "다음" button becomes enabled (canProceed returns true)
  - Screenshot: 04-lesson-create-type-select.png
```

### S23-05: Step 0 — each lesson type option
```
Step 5: Click each lesson type
  - Action: Click each of 4 lesson types in sequence
  - Target: group_lesson, practice_match, free_practice, clinic buttons
  - Expected: Each activates exclusively; desc shown for each ("여러 명이 함께 배우는 레슨" / "실전 감각을 키우는 연습 경기" / "자유롭게 연습하는 시간" / "전문 코치의 집중 클리닉")
  - Screenshot: 05-lesson-create-type-each.png
```

### S23-06: Step 0 — "다음" button click (valid)
```
Step 6: Click "다음" with valid selections
  - Action: With sport + type selected, click "다음"
  - Target: Next button (w-full bg-blue-500 rounded-xl)
  - Expected: Step advances to 1; progress bar updates; animate-fade-in on new step; ArrowRight icon visible in button
  - Screenshot: 06-lesson-create-step0-next.png
```

### S23-07: Step 0 — "다음" button click (invalid)
```
Step 7: Click "다음" without selections
  - Action: Click "다음" with sportType="" and type=""
  - Target: Next button
  - Expected: Button is disabled (opacity-40); if somehow clicked, toast('error', '필수 항목을 입력해주세요')
  - Screenshot: 07-lesson-create-step0-invalid.png
```

### S23-08: Step 1 — title input
```
Step 8: Interact with title input
  - Action: Focus, type, blur #lesson-title
  - Target: FormField "강좌 제목" (required)
  - Expected: Label "강좌 제목" with required indicator; placeholder "예: 초보자를 위한 풋살 기초 레슨"; maxLength=100; input renders with proper htmlFor/id linkage
  - Screenshot: 08-lesson-create-title.png
```

### S23-09: Step 1 — description textarea
```
Step 9: Interact with description
  - Action: Focus, type in #lesson-description
  - Target: FormField "강좌 설명" (optional)
  - Expected: Textarea with rows=4, resize-none, maxLength=1000; placeholder present
  - Screenshot: 09-lesson-create-description.png
```

### S23-10: Step 1 — coach name input (required)
```
Step 10: Interact with coach name
  - Action: Focus, type in #lesson-coach-name
  - Target: FormField "코치명" (required)
  - Expected: Required field; maxLength=50; placeholder "예: 김코치"
  - Screenshot: 10-lesson-create-coach-name.png
```

### S23-11: Step 1 — coach bio textarea
```
Step 11: Interact with coach bio
  - Action: Focus, type in #lesson-coach-bio
  - Target: FormField "코치 소개"
  - Expected: Textarea rows=3, resize-none, maxLength=500; placeholder about credentials
  - Screenshot: 11-lesson-create-coach-bio.png
```

### S23-12: Step 1 — image upload
```
Step 12: Interact with ImageUpload
  - Action: Click upload area or drag files
  - Target: ImageUpload component (max=5, accept=image/jpeg,png,webp,gif, maxSizeMB=10)
  - Expected: Upload area clickable; label "강좌 이미지 (선택)"; hint "첫 번째 이미지가 강좌 대표 이미지로 사용돼요"; pending upload shows message; error shows red message
  - Screenshot: 12-lesson-create-image-upload.png
```

### S23-13: Step 1 — image upload pending blocks next
```
Step 13: Try to proceed with pending upload
  - Action: Start upload, click "다음" before completion
  - Target: Next button + image upload
  - Expected: Button disabled while hasPendingUploads=true; if clicked, toast('error', '이미지 업로드가 끝난 뒤 계속할 수 있어요')
  - Screenshot: 13-lesson-create-upload-pending.png
```

### S23-14: Step 1 — image upload error blocks next
```
Step 14: Try to proceed with upload error
  - Action: Have failed upload, click "다음"
  - Target: Next button + image upload
  - Expected: Button disabled while hasUploadErrors=true; message "실패한 이미지를 다시 시도하거나 제거해주세요" in red
  - Screenshot: 14-lesson-create-upload-error.png
```

### S23-15: Step 2 — venue name input (required)
```
Step 15: Fill venue name
  - Action: Type in #lesson-venue
  - Target: FormField "장소명" (required)
  - Expected: Placeholder "예: 난지천 풋살장"; if venueNameFromQuery is present, pre-filled
  - Screenshot: 15-lesson-create-venue.png
```

### S23-16: Step 2 — date input (required)
```
Step 16: Select date
  - Action: Click/interact with #lesson-date (type="date")
  - Target: Date input
  - Expected: Native date picker opens; selected date stored in form.lessonDate
  - Screenshot: 16-lesson-create-date.png
```

### S23-17: Step 2 — start/end time inputs (required)
```
Step 17: Select times
  - Action: Set start and end time
  - Target: #lesson-start-time, #lesson-end-time (type="time")
  - Expected: 2-column grid; native time pickers; both required for canProceed
  - Screenshot: 17-lesson-create-times.png
```

### S23-18: Step 2 — max participants + fee inputs
```
Step 18: Set participants and fee
  - Action: Change values in number inputs
  - Target: #lesson-max-participants (min=1, max=50), #lesson-fee (min=0, step=1000)
  - Expected: 2-column grid; fee hint shows formatAmount when fee > 0; defaults: 10 participants, 20000 fee
  - Screenshot: 18-lesson-create-participants-fee.png
```

### S23-19: Step 2 — level selects
```
Step 19: Set level range
  - Action: Change level selects
  - Target: #lesson-level-min, #lesson-level-max (Select component)
  - Expected: Options 1-5 with labels (입문/초급/중급/상급/고수); canProceed requires levelMin <= levelMax
  - Screenshot: 19-lesson-create-levels.png
```

### S23-20: Step 3 — confirmation summary
```
Step 20: Review confirmation step
  - Action: Navigate to step 3
  - Target: Summary card
  - Expected: Rounded-2xl card with "강좌 정보 확인" heading; SummaryRow for each field (종목/유형/제목/설명/코치/코치소개/장소/날짜/시간/인원/이미지/수강료/레벨); formatCurrency for fee; image count if present
  - Screenshot: 20-lesson-create-confirm.png
```

### S23-21: Step 3 — submit button
```
Step 21: Click "강좌 등록하기"
  - Action: Click submit button
  - Target: Submit button with Check icon
  - Expected: isSubmitting=true; button text changes to "등록 중..."; api.post('/lessons', ...) called; on success: toast('success', '강좌가 등록되었어요!') + redirect to /lessons; on error: toast with extractErrorMessage
  - Screenshot: 21-lesson-create-submit.png
```

### S23-22: Step 3 — submit loading state
```
Step 22: Observe loading during submit
  - Action: Submit form
  - Target: Submit button
  - Expected: Button shows "등록 중..." text; disabled (opacity-50); API call in progress
  - Screenshot: 22-lesson-create-submit-loading.png
```

### S23-23: Back button — step navigation
```
Step 23: Click back button at step > 0
  - Action: Click ArrowLeft header button at step 2
  - Target: Back button
  - Expected: Step decrements (step 2 -> step 1); at step 0, router.back() is called
  - Screenshot: 23-lesson-create-back-step.png
```

### S23-24: Progress bar visualization
```
Step 24: Observe progress at each step
  - Action: Navigate through steps 0-3
  - Target: Progress bar (4 segments)
  - Expected: Segments fill progressively (bg-blue-500 for i <= step, bg-gray-100 otherwise); step label updates; counter "N / 4"
  - Screenshot: 24-lesson-create-progress.png
```

### S23-25: Hub attribution banner (teamId/venueId)
```
Step 25: Open /lessons/new?teamId=xxx&teamName=MyTeam
  - Action: Navigate with query params
  - Target: Blue info banner
  - Expected: Shows "MyTeam 허브에 귀속된 레슨으로 등록됩니다." in rounded-xl bg-blue-50 text-blue-700 (dark: bg-blue-900/30 text-blue-200)
  - Screenshot: 25-lesson-create-hub-banner.png
```

### S23-26: Edit page — pre-populated form
```
Step 26: Navigate to /lessons/{id}/edit
  - Action: Open edit page as host
  - Target: Edit form
  - Expected: All fields pre-populated from useLesson data; sport buttons show current selection; form fields filled; "수정 완료" button with Save icon
  - Screenshot: 26-lesson-edit-populated.png
```

### S23-27: Edit page — save button
```
Step 27: Click "수정 완료"
  - Action: Modify field, click save
  - Target: Save button (bg-blue-500, flex-1)
  - Expected: Validation check; api.patch called; success toast "강좌 정보가 저장되었어요"; redirect to /lessons/{id}
  - Screenshot: 27-lesson-edit-save.png
```

### S23-28: Edit page — delete button + modal
```
Step 28: Click "삭제" button
  - Action: Click delete button (border-red-200 text-red-500)
  - Target: Delete button + Modal
  - Expected: Modal opens with AlertTriangle icon (red-50 bg circle); "강좌를 삭제하시겠어요?" title; "삭제하면 되돌릴 수 없어요." description; "돌아가기" and "삭제하기" buttons
  - Screenshot: 28-lesson-edit-delete-modal.png
```

### S23-29: Edit page — delete modal confirm
```
Step 29: Click "삭제하기" in modal
  - Action: Click red confirm button
  - Target: Delete confirm button
  - Expected: isDeleting=true; button shows "삭제 중..."; api.delete called; success toast; redirect to /my/lessons
  - Screenshot: 29-lesson-edit-delete-confirm.png
```

### S23-30: Edit page — delete modal cancel
```
Step 30: Click "돌아가기" in modal
  - Action: Click cancel button
  - Target: Cancel button (bg-gray-100)
  - Expected: Modal closes; no deletion
  - Screenshot: 30-lesson-edit-delete-cancel.png
```

### S23-31: Edit page — not found
```
Step 31: Navigate to /lessons/{invalid}/edit
  - Action: Open edit page for non-existent lesson
  - Target: Page body
  - Expected: EmptyState "강좌를 찾을 수 없어요" with action to /lessons
  - Screenshot: 31-lesson-edit-not-found.png
```

---

## S24 — Marketplace Discovery

### S24-01: Page load with skeletons
```
Step 1: Navigate to /marketplace
  - Action: Open /marketplace URL
  - Target: Full page
  - Expected: MobilePageTopZone with eyebrow "장비 거래", title from i18n, subtitle; 2 skeleton cards (h-[100px] rounded-xl skeleton-shimmer); "+" button linking to /marketplace/new
  - Screenshot: 01-marketplace-loading.png
```

### S24-02: Category filter chips — default
```
Step 2: Observe default filters
  - Action: Inspect category chips
  - Target: 7 category filter buttons
  - Expected: "전체" active (bg-blue-500); others: "풋살화", "하키장비", "농구화", "라켓", "유니폼", "보호장비" inactive; horizontal scrollable; each has aria-pressed attribute; min-h-[44px]
  - Screenshot: 02-marketplace-filters-default.png
```

### S24-03: Category filter — click "풋살화"
```
Step 3: Click "풋살화" filter
  - Action: Click second category chip
  - Target: categoryFutsalShoes chip
  - Expected: Chip active; list filters to items where sportType="futsal"
  - Screenshot: 03-marketplace-filter-futsal.png
```

### S24-04: Category filter — click "하키장비"
```
Step 4: Click "하키장비" filter
  - Action: Click third category chip
  - Target: categoryHockeyGear chip
  - Expected: Chip active; list filters to sportType="ice_hockey"
  - Screenshot: 04-marketplace-filter-hockey.png
```

### S24-05: Category filter — click "농구화"
```
Step 5: Click "농구화"
  - Action: Click chip
  - Target: categoryBasketballShoes
  - Expected: Filters to sportType="basketball"
  - Screenshot: 05-marketplace-filter-basketball.png
```

### S24-06: Category filter — click "라켓"
```
Step 6: Click "라켓"
  - Action: Click chip
  - Target: categoryRacket
  - Expected: Filters to sportType="badminton"
  - Screenshot: 06-marketplace-filter-racket.png
```

### S24-07: Category filter — click "유니폼"
```
Step 7: Click "유니폼"
  - Action: Click chip
  - Target: categoryUniform
  - Expected: Filters to items where title includes "유니폼"
  - Screenshot: 07-marketplace-filter-uniform.png
```

### S24-08: Category filter — click "보호장비"
```
Step 8: Click "보호장비"
  - Action: Click chip
  - Target: categoryProtective
  - Expected: Filters to items where title includes "보호" or "장갑"
  - Screenshot: 08-marketplace-filter-protective.png
```

### S24-09: Search input interactions
```
Step 9: Type in search
  - Action: Focus, type "농구" in #marketplace-search
  - Target: Search input with sr-only label "장터 검색"
  - Expected: 300ms debounce; filters listings by title or sportLabel match; Search icon (size=18) at left
  - Screenshot: 09-marketplace-search.png
```

### S24-10: Search — no results
```
Step 10: Search with no matches
  - Action: Type non-matching query
  - Target: Search input
  - Expected: EmptyState with Package icon; title from i18n empty.noListings
  - Screenshot: 10-marketplace-search-empty.png
```

### S24-11: MarketplaceListingCard — default render
```
Step 11: Inspect listing card
  - Action: Observe MarketplaceListingCard
  - Target: Card with data-testid="marketplace-card"
  - Expected: Horizontal layout (flex gap-3.5); 100x100 rounded-xl thumbnail with SafeImage; title (truncate); sport badge (sportCardAccent); location + condition text; price (text-lg font-bold formatCurrency); listing type badge (판매/대여); likes + views count; team/venue tags if present
  - Screenshot: 11-marketplace-card-default.png
```

### S24-12: MarketplaceListingCard — hover
```
Step 12: Hover listing card
  - Action: Mouse hover
  - Target: Card
  - Expected: Interactive card border transition; active:scale-[0.98] on press
  - Screenshot: 12-marketplace-card-hover.png
```

### S24-13: MarketplaceListingCard — click navigates
```
Step 13: Click card
  - Action: Click listing card
  - Target: Link to /marketplace/{id}
  - Expected: Navigates to detail page
  - Screenshot: 13-marketplace-card-navigate.png
```

### S24-14: "+" create button
```
Step 14: Click create button
  - Action: Click "+" link
  - Target: Link to /marketplace/new
  - Expected: aria-label from i18n marketplace.createListing; navigates to create page
  - Screenshot: 14-marketplace-create.png
```

### S24-15: Error state + retry
```
Step 15: Simulate API error
  - Action: Mock useListings error
  - Target: ErrorState component
  - Expected: ErrorState renders; retry calls refetch()
  - Screenshot: 15-marketplace-error.png
```

### S24-16: Desktop 2-column layout
```
Step 16: Desktop viewport
  - Action: Set 1440x900
  - Target: Listing container
  - Expected: @3xl:grid @3xl:grid-cols-2 @3xl:gap-3 layout
  - Screenshot: 16-marketplace-desktop.png
```

---

## S25 — Marketplace Detail

### S25-01: Loading skeleton
```
Step 1: Navigate to /marketplace/{id} (loading)
  - Action: Open detail URL
  - Target: Page
  - Expected: animate-pulse: h-64 + h-24 rounded-xl bg-gray-100
  - Screenshot: 01-marketplace-detail-loading.png
```

### S25-02: Not found state
```
Step 2: Open non-existent listing
  - Action: Navigate to invalid id
  - Target: Page
  - Expected: EmptyState with ShoppingBag icon; "매물을 찾을 수 없어요"; action "목록으로" -> /marketplace
  - Screenshot: 02-marketplace-detail-not-found.png
```

### S25-03: Hero image display
```
Step 3: Inspect hero image
  - Action: Observe main image
  - Target: h-64 @3xl:h-80 rounded-xl button
  - Expected: SafeImage with fallback; aria-label="{title} 대표 이미지 보기"; click opens MediaLightbox; if no image, SportIcon placeholder
  - Screenshot: 03-marketplace-detail-hero.png
```

### S25-04: Hero image — click opens lightbox
```
Step 4: Click hero image
  - Action: Click hero image button
  - Target: Image button
  - Expected: MediaLightbox opens; title="{title} 상품 사진"
  - Screenshot: 04-marketplace-detail-hero-lightbox.png
```

### S25-05: Gallery thumbnails
```
Step 5: Observe gallery thumbnails
  - Action: Inspect 3-column thumbnail grid
  - Target: Gallery below hero (only shows if galleryImages.length > 1)
  - Expected: Each thumbnail is aspect-[4/3] rounded-xl; selected thumbnail has border-blue-500; others border-gray-100; clicking updates hero + opens lightbox
  - Screenshot: 05-marketplace-detail-gallery.png
```

### S25-06: Gallery thumbnail — click changes hero
```
Step 6: Click second thumbnail
  - Action: Click on thumbnail
  - Target: Gallery button
  - Expected: Hero image changes; thumbnail border updates to blue-500; lightbox opens at correct index
  - Screenshot: 06-marketplace-detail-thumbnail-click.png
```

### S25-07: Title + badges section
```
Step 7: Inspect product info
  - Action: Observe title area
  - Target: Title section
  - Expected: Condition badge (conditionLabel + conditionColor); sport label text; "대여" badge if listingType='rent'; title (text-2xl font-bold); price (text-2xl font-black); view/like/location stats with icons
  - Screenshot: 07-marketplace-detail-title.png
```

### S25-08: Heart (like) button — default
```
Step 8: Observe heart button
  - Action: Inspect heart button in header
  - Target: Heart button with aria-label="좋아요"
  - Expected: Heart icon text-gray-500 fill=none; min-h-11 min-w-11
  - Screenshot: 08-marketplace-detail-heart-default.png
```

### S25-09: Heart button — click to like
```
Step 9: Click heart to like
  - Action: Click heart button
  - Target: Like button
  - Expected: liked=true; Heart icon text-red-500 fill=currentColor; api.post called for like endpoint
  - Screenshot: 09-marketplace-detail-heart-liked.png
```

### S25-10: Heart button — click to unlike
```
Step 10: Click heart again to unlike
  - Action: Click heart button again
  - Target: Like button
  - Expected: liked=false; Heart returns to gray unfilled state
  - Screenshot: 10-marketplace-detail-heart-unliked.png
```

### S25-11: Share button
```
Step 11: Click share button
  - Action: Click Share2 button in header
  - Target: Share button with aria-label="공유하기"
  - Expected: If navigator.share exists, native share dialog; else clipboard.writeText + toast('success', '링크가 복사되었어요')
  - Screenshot: 11-marketplace-detail-share.png
```

### S25-12: Description section
```
Step 12: Inspect description
  - Action: Observe description card
  - Target: "상품 설명" card
  - Expected: Rounded-2xl card; heading "상품 설명"; whitespace-pre-line text
  - Screenshot: 12-marketplace-detail-description.png
```

### S25-13: Rental info (rent type only)
```
Step 13: View rental listing
  - Action: Open listing with listingType='rent'
  - Target: Rental info card
  - Expected: Blue-tinted card (border-blue-100 bg-blue-50); heading "대여 정보"; daily rental price + deposit with formatAmount
  - Screenshot: 13-marketplace-detail-rental-info.png
```

### S25-14: Seller section
```
Step 14: Inspect seller card
  - Action: Observe seller section
  - Target: Seller card in sidebar
  - Expected: Avatar (first char, 44x44 rounded-full bg-gray-100); nickname; Star rating (amber-500 fill); "신고하기" button at bottom-right
  - Screenshot: 14-marketplace-detail-seller.png
```

### S25-15: "신고하기" button
```
Step 15: Click "신고하기"
  - Action: Click report button
  - Target: "신고하기" text button (text-xs text-gray-500)
  - Expected: hover:text-red-500 transition; on click: toast('info', '신고가 접수되었어요. 운영팀이 검토할게요')
  - Screenshot: 15-marketplace-detail-report.png
```

### S25-16: CTA — unauthenticated
```
Step 16: View as unauthenticated
  - Action: Clear auth; visit detail
  - Target: CTA card
  - Expected: "로그인 후 구매하기" link to /login (bg-blue-500 text-white)
  - Screenshot: 16-marketplace-detail-cta-unauth.png
```

### S25-17: CTA — authenticated non-owner (sell type)
```
Step 17: View as authenticated non-owner
  - Action: Login as different user
  - Target: CTA card
  - Expected: "구매하기" button (bg-blue-500); "채팅하기" button with MessageCircle icon (border gray-200); clicking purchase navigates to /payments/checkout; clicking chat shows toast + navigates to /chat
  - Screenshot: 17-marketplace-detail-cta-purchase.png
```

### S25-18: CTA — authenticated non-owner (rent type)
```
Step 18: View rental as non-owner
  - Action: Visit rental listing as non-owner
  - Target: CTA card
  - Expected: "대여 신청하기" button text instead of "구매하기"
  - Screenshot: 18-marketplace-detail-cta-rent.png
```

### S25-19: CTA — "채팅하기" button hover
```
Step 19: Hover chat button
  - Action: Hover "채팅하기"
  - Target: Chat button
  - Expected: hover:bg-gray-50 (dark: hover:bg-gray-800) transition
  - Screenshot: 19-marketplace-detail-chat-hover.png
```

### S25-20: CTA — owner view (edit + delete)
```
Step 20: View as listing owner
  - Action: Login as seller; visit own listing
  - Target: Owner action buttons
  - Expected: "수정" link (Pencil icon, border-gray-200) and "삭제" button (Trash2 icon, border-red-200 text-red-500) appear below CTA buttons
  - Screenshot: 20-marketplace-detail-owner-actions.png
```

### S25-21: Owner — "수정" navigates to edit
```
Step 21: Click "수정"
  - Action: Click edit link
  - Target: Edit link
  - Expected: Navigates to /marketplace/{id}/edit
  - Screenshot: 21-marketplace-detail-edit-navigate.png
```

### S25-22: Owner — "삭제" opens delete modal
```
Step 22: Click "삭제"
  - Action: Click delete button
  - Target: Delete button
  - Expected: Modal opens; AlertTriangle icon in red-50 circle; "매물을 삭제하시겠어요?" title; "삭제된 매물은 복구할 수 없습니다." desc
  - Screenshot: 22-marketplace-detail-delete-modal.png
```

### S25-23: Delete modal — confirm
```
Step 23: Click "삭제하기" in modal
  - Action: Click confirm button (bg-red-500)
  - Target: Delete confirm
  - Expected: deleteListing.mutate called; success toast "매물이 삭제되었어요"; redirect to /marketplace; error toast on failure
  - Screenshot: 23-marketplace-detail-delete-confirm.png
```

### S25-24: Delete modal — cancel
```
Step 24: Click "돌아가기" in modal
  - Action: Click cancel button (bg-gray-100)
  - Target: Cancel button
  - Expected: Modal closes; no deletion
  - Screenshot: 24-marketplace-detail-delete-cancel.png
```

### S25-25: Delete modal — close via backdrop/ESC
```
Step 25: Close delete modal via ESC or backdrop
  - Action: Press ESC or click backdrop
  - Target: Modal
  - Expected: Modal closes (onClose called)
  - Screenshot: 25-marketplace-detail-delete-modal-close.png
```

### S25-26: Safety notice section
```
Step 26: Inspect safety notice
  - Action: Observe safety card
  - Target: Safety notice card
  - Expected: ShieldCheck icon (text-blue-500); "안전거래 안내" heading; notice about chat-based trading
  - Screenshot: 26-marketplace-detail-safety.png
```

### S25-27: Desktop sidebar sticky layout
```
Step 27: Desktop scroll test
  - Action: Scroll on 1440x900
  - Target: sidebar-sticky
  - Expected: Right sidebar sticks while left scrolls; @3xl:grid @3xl:grid-cols-[1fr_380px]
  - Screenshot: 27-marketplace-detail-desktop-sticky.png
```

### S25-28: Desktop breadcrumb
```
Step 28: Desktop breadcrumb
  - Action: Observe breadcrumb at 1440px
  - Target: hidden @3xl:flex breadcrumb
  - Expected: "장터" > ChevronRight > listing title (truncate)
  - Screenshot: 28-marketplace-detail-breadcrumb.png
```

---

## S26 — Create/Edit Marketplace Listing

### S26-01: Create page — unauthenticated view
```
Step 1: Open /marketplace/new as unauthenticated
  - Action: Navigate without auth
  - Target: Page
  - Expected: ShoppingBag icon; "매물을 등록해보세요" heading; "로그인하면 장비를 등록하고 거래할 수 있어요"; "로그인하고 시작하기" link to /login
  - Screenshot: 01-marketplace-create-unauth.png
```

### S26-02: Create page — authenticated view
```
Step 2: Open /marketplace/new as authenticated
  - Action: Login; navigate
  - Target: Form
  - Expected: MobileGlassHeader "매물 등록" with back; ImageUpload area; form fields; desktop breadcrumb
  - Screenshot: 02-marketplace-create-form.png
```

### S26-03: Image upload — preview when empty
```
Step 3: Observe empty image state
  - Action: Inspect image section with no uploads
  - Target: Image upload area
  - Expected: ImageUpload component; below it: 3 preview placeholder images (h-20 w-[80px] rounded-xl opacity-60) with Plus overlay; "첫 번째 사진이 대표 이미지로 등록됩니다."
  - Screenshot: 03-marketplace-create-image-empty.png
```

### S26-04: Image upload — add images
```
Step 4: Upload images
  - Action: Click or drag images to ImageUpload
  - Target: ImageUpload (max=10, maxSizeMB=10)
  - Expected: Images upload; preview shows; placeholder images disappear; pending/error messages appear as needed
  - Screenshot: 04-marketplace-create-image-upload.png
```

### S26-05: Title input
```
Step 5: Fill title
  - Action: Type in #mkt-title
  - Target: FormField "제목" (required)
  - Expected: maxLength=100; placeholder "상품 제목을 입력해주세요"
  - Screenshot: 05-marketplace-create-title.png
```

### S26-06: Sport type chips — all 11 sports
```
Step 6: Select sport type
  - Action: Click each of 11 sport type chips
  - Target: Sport chip buttons
  - Expected: 11 chips (soccer/futsal/basketball/badminton/ice_hockey/swimming/tennis/baseball/volleyball/figure_skating/short_track); selected = bg-blue-500 text-white; unselected = bg-gray-50 text-gray-600; min-h-[44px]; flex-wrap
  - Screenshot: 06-marketplace-create-sport-types.png
```

### S26-07: Category chips
```
Step 7: Select category
  - Action: Click each of 8 category chips
  - Target: Category buttons
  - Expected: 8 categories (축구화/풋살화, 농구화, 라켓, 유니폼, 보호장비, 하키장비, 스케이트, 기타); selected = bg-blue-500; unselected = bg-white border border-gray-200
  - Screenshot: 07-marketplace-create-categories.png
```

### S26-08: Condition options — all 5
```
Step 8: Select condition
  - Action: Click each condition button
  - Target: 5 condition buttons
  - Expected: Full-width stacked buttons; each has label + desc; selected = border-blue-500 bg-blue-500 text-white; new/like_new/good/fair/poor
  - Screenshot: 08-marketplace-create-condition.png
```

### S26-09: Listing type toggle (판매/대여)
```
Step 9: Toggle listing type
  - Action: Click "판매" then "대여"
  - Target: 2-column grid toggle buttons
  - Expected: "판매" active by default; clicking "대여" activates it + reveals rental fields; selected = bg-blue-500; unselected = border-gray-200 text-gray-500
  - Screenshot: 09-marketplace-create-listing-type.png
```

### S26-10: Rental fields (shown for rent type)
```
Step 10: Fill rental details
  - Action: With listingType='rent', fill rental fields
  - Target: #mkt-rental-price, #mkt-deposit
  - Expected: 2-column grid; "일일 대여비" and "보증금" inputs with "원" suffix; only visible when listingType='rent'
  - Screenshot: 10-marketplace-create-rental-fields.png
```

### S26-11: Price input
```
Step 11: Fill price
  - Action: Type in #mkt-price
  - Target: Price input (type=number, min=0, step=1000)
  - Expected: "원" suffix at right; inputMode="numeric"
  - Screenshot: 11-marketplace-create-price.png
```

### S26-12: Description textarea
```
Step 12: Fill description
  - Action: Type in #mkt-description
  - Target: Textarea (maxLength=1000, rows=5, min-h-[140px], resize-none)
  - Expected: Placeholder about 구매시기, 브랜드/모델명 etc.
  - Screenshot: 12-marketplace-create-description.png
```

### S26-13: Submit validation — missing title
```
Step 13: Submit without title
  - Action: Click submit with empty title
  - Target: Submit button
  - Expected: toast('error', '제목을 입력해주세요')
  - Screenshot: 13-marketplace-create-validation-title.png
```

### S26-14: Submit validation — missing sport
```
Step 14: Submit without sport type
  - Action: Submit with sportType=''
  - Target: Submit button
  - Expected: toast('error', '종목을 선택해주세요')
  - Screenshot: 14-marketplace-create-validation-sport.png
```

### S26-15: Submit validation — missing condition
```
Step 15: Submit without condition
  - Action: Submit with condition=''
  - Target: Submit button
  - Expected: toast('error', '상품 상태를 선택해주세요')
  - Screenshot: 15-marketplace-create-validation-condition.png
```

### S26-16: Submit validation — price <= 0
```
Step 16: Submit with price 0
  - Action: Submit with price=0
  - Target: Submit button
  - Expected: toast('error', '가격을 입력해주세요')
  - Screenshot: 16-marketplace-create-validation-price.png
```

### S26-17: Submit success
```
Step 17: Submit valid form
  - Action: Fill all required fields; click submit
  - Target: Button component (fullWidth, size="lg")
  - Expected: isSubmitting=true; text "등록 중..."; api.post called; success toast "매물이 등록되었어요!"; redirect to /marketplace
  - Screenshot: 17-marketplace-create-success.png
```

### S26-18: Submit error
```
Step 18: Submit with API error
  - Action: Mock API failure
  - Target: Submit
  - Expected: Error toast with extractErrorMessage fallback
  - Screenshot: 18-marketplace-create-error.png
```

### S26-19: Hub attribution banner
```
Step 19: Open with teamId or venueId query param
  - Action: Navigate with ?teamId=xxx&teamName=MyTeam
  - Target: Blue info banner
  - Expected: "MyTeam 허브에 귀속된 굿즈로 등록됩니다." banner
  - Screenshot: 19-marketplace-create-hub-banner.png
```

### S26-20: Edit page — pre-populated
```
Step 20: Navigate to /marketplace/{id}/edit
  - Action: Open edit page for owned listing
  - Target: Edit form
  - Expected: Fields pre-populated from useListing: images (via toExistingUploadAsset), title (#edit-listing-title), description (#edit-listing-description), sport type chips (11 options), category chips (8 options), condition chips (5 options), price (#edit-listing-price), status selector (판매중/예약중/판매완료 — unique to edit, not on create page). Note: the edit page does NOT have listingType toggle (판매/대여) or rental fields (rentalPricePerDay/rentalDeposit) — these can only be set during creation. "저장", "삭제", and "취소" buttons at bottom.
  - Screenshot: 20-marketplace-edit-populated.png
```

### S26-21: Edit page — status change
```
Step 21: Change listing status
  - Action: Click status buttons (판매중/예약중/판매완료)
  - Target: Status option buttons
  - Expected: Selected status = bg-blue-500 text-white; others inactive
  - Screenshot: 21-marketplace-edit-status.png
```

### S26-22: Edit page — save
```
Step 22: Click "저장"
  - Action: Modify + save
  - Target: Save button
  - Expected: Validation; api.patch called; toast "매물 정보가 저장되었어요"; redirect to /marketplace/{id}
  - Screenshot: 22-marketplace-edit-save.png
```

### S26-23: Edit page — delete modal
```
Step 23: Click "삭제" on edit page
  - Action: Click delete button
  - Target: Modal
  - Expected: Modal with AlertTriangle; confirm/cancel buttons; confirm calls api.delete; success redirects to /my/listings
  - Screenshot: 23-marketplace-edit-delete.png
```

### S26-24: Edit page — cancel/back
```
Step 24: Click "취소" on edit page
  - Action: Click cancel button (bg-gray-100)
  - Target: Cancel button
  - Expected: router.back() called
  - Screenshot: 24-marketplace-edit-cancel.png
```

### S26-25: Edit page — not found
```
Step 25: Open edit for non-existent listing
  - Action: Navigate to /marketplace/{invalid}/edit
  - Target: Page
  - Expected: EmptyState with SearchX icon; "매물을 찾을 수 없어요"; action to /marketplace
  - Screenshot: 25-marketplace-edit-not-found.png
```

---

## S27 — Mercenary Discovery

### S27-01: Page load
```
Step 1: Navigate to /mercenary
  - Action: Open URL
  - Target: Full page
  - Expected: MobilePageTopZone eyebrow "팀 빈자리 채우기", title "용병 모집", subtitle; "내 모집/신청" link with ChevronRight; UserPlus "+" button to /mercenary/new; animate-fade-in
  - Screenshot: 01-mercenary-page-load.png
```

### S27-02: "내 모집/신청" link
```
Step 2: Inspect "내 모집/신청" link
  - Action: Observe link in MobilePageTopZone children
  - Target: Link to /my/mercenary
  - Expected: "내 모집/신청" text (text-sm font-medium text-blue-600); ChevronRight icon; hover state; click navigates to /my/mercenary
  - Screenshot: 02-mercenary-my-link.png
```

### S27-03: Sport filter chips — all 12 options (전체 + 11 sports)
```
Step 3: Inspect sport filters
  - Action: Observe filter chip row
  - Target: 12 filter buttons
  - Expected: "전체" active by default (bg-blue-500); 11 sport chips from sportLabel entries; horizontal scroll; min-h-[44px]; active state includes active:bg-gray-100
  - Screenshot: 03-mercenary-sport-filters.png
```

### S27-04: Sport filter — click each sport
```
Step 4: Click each sport filter
  - Action: Click through all 11 sport filters
  - Target: Each sport chip
  - Expected: Each becomes active (bg-blue-500 text-white); list filters to matching sportType; count text updates "N개의 모집글"
  - Screenshot: 04-mercenary-filter-each-sport.png
```

### S27-05: Sport filter — return to "전체"
```
Step 5: Click "전체"
  - Action: Click 전체 filter
  - Target: First chip (key='')
  - Expected: All posts shown; chip active
  - Screenshot: 05-mercenary-filter-all.png
```

### S27-06: Loading skeletons
```
Step 6: Observe loading state
  - Action: Loading state
  - Target: Skeleton cards
  - Expected: 3 skeleton cards with animate-pulse; each has 3 shimmer lines (h-3 bg-gray-200 rounded)
  - Screenshot: 06-mercenary-loading.png
```

### S27-07: Error state
```
Step 7: API error
  - Action: Mock error
  - Target: ErrorState
  - Expected: ErrorState "용병 모집 목록을 불러오지 못했어요" with retry
  - Screenshot: 07-mercenary-error.png
```

### S27-08: Empty state (with active filter)
```
Step 8: No posts for selected sport
  - Action: Select sport with no posts
  - Target: EmptyState
  - Expected: Search icon; "{sportLabel} 용병 모집이 없어요"; "직접 용병을 모집해보세요"; action "용병 모집하기" -> /mercenary/new
  - Screenshot: 08-mercenary-empty-filtered.png
```

### S27-09: Empty state (no filter)
```
Step 9: No posts at all
  - Action: Mock empty data with "전체" filter
  - Target: EmptyState
  - Expected: "아직 등록된 용병 모집이 없어요"; action to /mercenary/new
  - Screenshot: 09-mercenary-empty-all.png
```

### S27-10: MercenaryCard — default render
```
Step 10: Inspect MercenaryCard
  - Action: Observe a card
  - Target: Card component
  - Expected: Sport badge (sportCardAccent.badge); status badge (모집중=emerald/정원 마감=blue/모집 종료=gray/취소됨=red); position label; team name (text-sm font-semibold); manner score (Star amber-500); date + venue (MapPin); level + fee (green if free); notes (truncate); recruitment count "모집 N명 / 신청 N명" with Users icon
  - Screenshot: 10-mercenary-card-default.png
```

### S27-11: MercenaryCard — hover + active
```
Step 11: Hover + press card
  - Action: Hover then press
  - Target: Card
  - Expected: Interactive border transition; active:scale-[0.98] transition 150ms
  - Screenshot: 11-mercenary-card-hover.png
```

### S27-12: MercenaryCard — click navigates
```
Step 12: Click card
  - Action: Click card
  - Target: Link to /mercenary/{id}
  - Expected: Navigates to detail page
  - Screenshot: 12-mercenary-card-navigate.png
```

### S27-13: Result count text
```
Step 13: Observe count
  - Action: After data loads
  - Target: "N개의 모집글" text
  - Expected: Shows filtered count (text-sm text-gray-500)
  - Screenshot: 13-mercenary-count.png
```

---

## S28 — Mercenary Detail

### S28-01: Loading skeleton
```
Step 1: Navigate to /mercenary/{id} (loading)
  - Action: Open URL
  - Target: Page
  - Expected: animate-pulse skeleton; 3 blocks (h-6 w-1/3, h-8 w-2/3, h-40 rounded-xl)
  - Screenshot: 01-mercenary-detail-loading.png
```

### S28-02: Error state
```
Step 2: API error
  - Action: Mock error
  - Target: ErrorState
  - Expected: "용병 모집글을 불러오지 못했어요" with retry
  - Screenshot: 02-mercenary-detail-error.png
```

### S28-03: Not found state
```
Step 3: Non-existent post
  - Action: Open invalid id
  - Target: EmptyState
  - Expected: UserCheck icon; "모집글을 찾을 수 없어요"; action to /mercenary
  - Screenshot: 03-mercenary-detail-not-found.png
```

### S28-04: Header + breadcrumb
```
Step 4: Inspect header
  - Action: Observe header area
  - Target: MobileGlassHeader + breadcrumb
  - Expected: Back button (min-h-[44px]); centered "용병 모집" title; right spacer (min-w-11 aria-hidden); desktop breadcrumb with team name
  - Screenshot: 04-mercenary-detail-header.png
```

### S28-05: Post info display
```
Step 5: Inspect post details
  - Action: Observe post content
  - Target: Main content area
  - Expected: Sport badge (sportCardAccent); position label; "무료" if fee=0; status text (모집중 = text-blue-500); team name (text-2xl font-bold); date (formatFullDate); venue with MapPin; info table (모집 인원/신청 현황/필요 포지션/요구 레벨/참가 비용); notes section; author card
  - Screenshot: 05-mercenary-detail-info.png
```

### S28-06: Info table rows
```
Step 6: Inspect info table
  - Action: Observe rounded-xl white card with dividers
  - Target: 5 info rows
  - Expected: divide-y; each row flex justify-between; label text-gray-500, value font-semibold; fee shows green if 0; Users icon on count row
  - Screenshot: 06-mercenary-detail-info-table.png
```

### S28-07: Author section
```
Step 7: Inspect author card
  - Action: Observe author section
  - Target: Author card
  - Expected: "작성자" heading; 44x44 rounded-full avatar (first char); nickname; all in rounded-xl card
  - Screenshot: 07-mercenary-detail-author.png
```

### S28-08: Bottom CTA — eligible non-owner (can apply)
```
Step 8: View as eligible non-owner
  - Action: Login as non-owner; visit open post
  - Target: Fixed bottom CTA bar
  - Expected: "신청하기" button (bg-blue-500 text-white min-h-[44px] rounded-xl); fixed bottom-0 with safe-area-inset-bottom padding (pb-[calc(1rem+env(safe-area-inset-bottom))]); white/dark bg bar with border-t
  - Screenshot: 08-mercenary-detail-cta-apply.png
  - Viewport: On mobile, verify safe-area-inset-bottom applies correctly for notched devices; bar uses z-20
```

### S28-09: Apply button — click
```
Step 9: Click "신청하기"
  - Action: Click apply button
  - Target: Apply button
  - Expected: applyMutation triggered; during loading: "신청 중..." text; success: toast('success', '용병 신청이 완료되었어요'); error: toast with extractErrorMessage
  - Screenshot: 09-mercenary-detail-apply.png
```

### S28-10: Apply button — loading state
```
Step 10: Observe loading during apply
  - Action: Apply in progress
  - Target: Apply button
  - Expected: Text "신청 중..."; disabled:opacity-60
  - Screenshot: 10-mercenary-detail-apply-loading.png
```

### S28-11: Bottom CTA — after applying (pending status)
```
Step 11: View after successful application
  - Action: Re-render after apply success
  - Target: Bottom CTA
  - Expected: "신청 취소" button appears (border-red-200 text-red-500); "내 신청 상태" section shows with "대기 중" badge (amber)
  - Screenshot: 11-mercenary-detail-pending.png
```

### S28-12: "신청 취소" button — click
```
Step 12: Click "신청 취소"
  - Action: Click withdraw button
  - Target: Withdraw button
  - Expected: withdrawMutation triggered; "취소 중..." loading; success toast "신청을 취소했어요"
  - Screenshot: 12-mercenary-detail-withdraw.png
```

### S28-13: Bottom CTA — blocked reasons
```
Step 13: View with various block reasons
  - Action: Test each applyBlockReason
  - Target: Disabled CTA button
  - Expected: AUTH_REQUIRED: "로그인 후 신청" (click -> /login); TEAM_MANAGER_CANNOT_APPLY / TEAM_MEMBER_CANNOT_APPLY: "소속팀 모집글"; ALREADY_APPLIED: "신청 완료"; POST_NOT_OPEN (filled): "모집 완료"; POST_NOT_OPEN (other): "모집 마감"; default: "신청할 수 없어요"
  - Screenshot: 13-mercenary-detail-blocked.png
```

### S28-14: Bottom CTA — unauthenticated
```
Step 14: View as unauthenticated
  - Action: Clear auth
  - Target: CTA button
  - Expected: Shows "로그인 후 신청" or default apply text; clicking redirects to /login?redirect=/mercenary/{id}
  - Screenshot: 14-mercenary-detail-cta-unauth.png
```

### S28-15: My application status section
```
Step 15: Observe "내 신청 상태" (non-manager applicant)
  - Action: View as applicant
  - Target: Application status section
  - Expected: "내 신청 상태" heading; status badge (pending=amber, accepted=emerald, rejected=red, withdrawn=gray); explanation text
  - Screenshot: 15-mercenary-detail-my-status.png
```

### S28-16: Owner/manager view — edit + delete buttons
```
Step 16: View as author/manager
  - Action: Login as post author
  - Target: Bottom CTA
  - Expected: 2 buttons: "수정" link (Pencil icon, border-gray-200 -> /mercenary/{id}/edit) and "삭제" button (Trash2 icon, border-red-200 text-red-500)
  - Screenshot: 16-mercenary-detail-owner-cta.png
```

### S28-17: Owner — application list (empty)
```
Step 17: View applications when empty
  - Action: View as owner with no applications
  - Target: "지원 목록" section
  - Expected: EmptyState "아직 지원자가 없어요" (UserPlus icon, size="sm")
  - Screenshot: 17-mercenary-detail-apps-empty.png
```

### S28-18: Owner — application list with entries
```
Step 18: View applications
  - Action: View as owner with pending applications
  - Target: Application cards
  - Expected: Each application: nickname, status badge (statusBadgeClass), message if present; pending applications show "승인" (bg-blue-500) and "거절" (border-red-200 text-red-500) buttons
  - Screenshot: 18-mercenary-detail-apps-list.png
```

### S28-19: Owner — accept application
```
Step 19: Click "승인" on an application
  - Action: Click accept button
  - Target: Accept button (min-h-[44px])
  - Expected: processingApplicationId set; disabled:opacity-50 during processing; success toast "신청을 승인했어요"; badge updates to emerald "승인됨"
  - Screenshot: 19-mercenary-detail-accept.png
```

### S28-20: Owner — reject application
```
Step 20: Click "거절" on an application
  - Action: Click reject button
  - Target: Reject button
  - Expected: Processing state; success toast "신청을 거절했어요"; badge updates to red "거절됨"
  - Screenshot: 20-mercenary-detail-reject.png
```

### S28-21: Delete modal
```
Step 21: Click "삭제" in owner CTA
  - Action: Click delete button
  - Target: Modal
  - Expected: Modal with AlertTriangle; "모집글을 삭제하시겠어요?"; "삭제된 모집글은 복구할 수 없습니다."; "돌아가기" + "삭제하기"
  - Screenshot: 21-mercenary-detail-delete-modal.png
```

### S28-22: Delete modal — confirm
```
Step 22: Click "삭제하기"
  - Action: Confirm delete
  - Target: Confirm button (bg-red-500)
  - Expected: deleteMutation.isPending shows "삭제 중..."; success toast; redirect to /mercenary
  - Screenshot: 22-mercenary-detail-delete-confirm.png
```

### S28-23: Delete modal — cancel + ESC
```
Step 23: Cancel or ESC delete modal
  - Action: Click "돌아가기" or press ESC
  - Target: Modal
  - Expected: Modal closes; no deletion
  - Screenshot: 23-mercenary-detail-delete-cancel.png
```

---

## S29 — Create/Edit Mercenary Post

### S29-01: Create page — auth guard
```
Step 1: Open /mercenary/new unauthenticated
  - Action: Navigate without auth
  - Target: Page
  - Expected: useRequireAuth redirects to /login
  - Screenshot: 01-mercenary-create-auth-guard.png
```

### S29-02: Create page — no teams
```
Step 2: Open /mercenary/new with no teams
  - Action: Login as user with no teams
  - Target: EmptyState
  - Expected: Users icon; "팀을 먼저 만들어주세요"; "용병 모집은 소속된 팀이 있어야 가능합니다"; action "팀 만들기" -> /teams/new
  - Screenshot: 02-mercenary-create-no-teams.png
```

### S29-03: Create page — team select
```
Step 3: Select team
  - Action: Change #merc-team select
  - Target: Team select dropdown
  - Expected: Options populated from useMyTeams; loading shows "불러오는 중..."; selecting team shows team info card with sport badge (sportCardAccent tint/badge); "종목은 팀 정보 기준으로 자동 고정됩니다."
  - Screenshot: 03-mercenary-create-team-select.png
```

### S29-04: Create page — team info card
```
Step 4: Observe team info after selection
  - Action: Select a team
  - Target: Team info card
  - Expected: Shield icon; team name; sport badge; hint about auto-set sport; rounded-2xl with sportCardAccent tint
  - Screenshot: 04-mercenary-create-team-info.png
```

### S29-05: Create page — date input
```
Step 5: Select match date
  - Action: Use #merc-match-date (type="date")
  - Target: Date input (required)
  - Expected: Native date picker; required for canSubmit
  - Screenshot: 05-mercenary-create-date.png
```

### S29-06: Create page — venue input
```
Step 6: Fill venue
  - Action: Type in #merc-venue
  - Target: Venue input (required, maxLength=200)
  - Expected: Placeholder "예: 난지천 풋살장 A"; required for canSubmit
  - Screenshot: 06-mercenary-create-venue.png
```

### S29-07: Create page — position selection
```
Step 7: Select position
  - Action: Click each of 5 position buttons
  - Target: Position buttons (GK/DF/MF/FW/ALL)
  - Expected: Selected = border-blue-500 bg-blue-500 text-white; flex-wrap; min-h-[44px]; labels: "골키퍼 (GK)", "수비수 (DF)", "미드필더 (MF)", "공격수 (FW)", "포지션 무관"; required for canSubmit
  - Screenshot: 07-mercenary-create-position.png
```

### S29-08: Create page — count selection
```
Step 8: Select recruitment count
  - Action: Click each of 5 count buttons (1-5)
  - Target: Count buttons
  - Expected: flex-1 layout; selected = bg-blue-500 text-white; labels: "1명" through "5명"; default=1
  - Screenshot: 08-mercenary-create-count.png
```

### S29-09: Create page — level selection
```
Step 9: Select required level
  - Action: Click each of 5 level buttons
  - Target: Level buttons
  - Expected: Labels from levelLabel (입문/초급/중급/상급/고수); selected = bg-blue-500 text-white; default=중급(3); flex-wrap
  - Screenshot: 09-mercenary-create-level.png
```

### S29-10: Create page — fee input
```
Step 10: Fill fee
  - Action: Type in #merc-fee
  - Target: Fee input (type=number, min=0)
  - Expected: Placeholder "0 = 무료"; below shows formatCurrency(Number(fee) || 0)
  - Screenshot: 10-mercenary-create-fee.png
```

### S29-11: Create page — notes textarea
```
Step 11: Fill notes
  - Action: Type in #merc-notes
  - Target: Textarea (maxLength=500, rows=4, resize-none)
  - Expected: Placeholder "유니폼 색상, 준비물, 기타 안내 등"; optional field
  - Screenshot: 11-mercenary-create-notes.png
```

### S29-12: Create page — submit disabled
```
Step 12: Observe submit with missing required fields
  - Action: Leave team/date/venue/position empty
  - Target: Submit button
  - Expected: Disabled (opacity-40 cursor-not-allowed); canSubmit=false
  - Screenshot: 12-mercenary-create-submit-disabled.png
```

### S29-13: Create page — submit enabled + click
```
Step 13: Submit valid form
  - Action: Fill all required fields; click submit
  - Target: Submit button (w-full bg-blue-500)
  - Expected: createMutation called; loading shows spinner + "등록 중..."; success toast "용병 모집글이 등록되었어요"; redirect to /mercenary/{createdPost.id}
  - Screenshot: 13-mercenary-create-submit.png
```

### S29-14: Create page — pre-filled teamId from query
```
Step 14: Open with ?teamId=xxx
  - Action: Navigate with teamId query param
  - Target: Team select
  - Expected: Team auto-selected if found in myTeams; info card shown
  - Screenshot: 14-mercenary-create-prefill-team.png
```

### S29-15: Edit page — pre-populated
```
Step 15: Open /mercenary/{id}/edit
  - Action: Navigate as author
  - Target: Edit form
  - Expected: Team info card (read-only); all fields pre-populated from useMercenaryPost; position buttons show current; level shows current; fee filled; notes filled
  - Screenshot: 15-mercenary-edit-populated.png
```

### S29-16: Edit page — team name read-only
```
Step 16: Observe team name field
  - Action: Inspect team name display
  - Target: Read-only team name div
  - Expected: cursor-not-allowed opacity-60; non-editable
  - Screenshot: 16-mercenary-edit-team-readonly.png
```

### S29-17: Edit page — save
```
Step 17: Click "수정 완료"
  - Action: Modify + save
  - Target: Save button (Save icon + "수정 완료")
  - Expected: updateMutation called; success toast; redirect to /mercenary/{id}
  - Screenshot: 17-mercenary-edit-save.png
```

### S29-18: Edit page — delete modal
```
Step 18: Click "삭제"
  - Action: Click delete button (Trash2)
  - Target: Modal
  - Expected: "모집글을 삭제하시겠어요?" modal; confirm deletes + redirects to /my/mercenary
  - Screenshot: 18-mercenary-edit-delete.png
```

### S29-19: Edit page — no permission
```
Step 19: Open edit as non-author/non-manager
  - Action: Login as unrelated user; navigate to edit
  - Target: Page
  - Expected: EmptyState with AlertTriangle; "수정 권한이 없어요"; action to /mercenary/{id}
  - Screenshot: 19-mercenary-edit-no-permission.png
```

---

## S30 — Venues Discovery

### S30-01: Page load
```
Step 1: Navigate to /venues
  - Action: Open URL
  - Target: Full page
  - Expected: MobilePageTopZone eyebrow "시설 탐색", title "시설 찾기", subtitle about finding facilities; "+" button (toast on click about registration request to support email)
  - Screenshot: 01-venues-page-load.png
```

### S30-02: "+" button (facility registration request)
```
Step 2: Click "+" button
  - Action: Click venue registration button
  - Target: Button with aria-label="시설 등록 요청"
  - Expected: toast('info', '시설 등록 요청이 접수되면 검토 후 추가됩니다. teammeet@support.com으로 시설 정보를 보내주세요.')
  - Screenshot: 02-venues-register-toast.png
```

### S30-03: Search input
```
Step 3: Use search input
  - Action: Type "마포" in #venues-search
  - Target: Search input with sr-only label "시설 검색"
  - Expected: Placeholder "시설명, 지역 검색"; 300ms debounce; filters venues by name or address
  - Screenshot: 03-venues-search.png
```

### S30-04: Sport filter chips (7 options)
```
Step 4: Observe sport filters
  - Action: Inspect filter chips
  - Target: 7 sport buttons (전체/풋살/농구/배드민턴/아이스하키/수영/테니스)
  - Expected: "전체" active by default; min-h-[44px]; clicking filters by sportTypes array
  - Screenshot: 04-venues-sport-filters.png
```

### S30-05: Sport filter — click each
```
Step 5: Click each sport filter
  - Action: Click through all 7 sport filters
  - Target: Each chip
  - Expected: Active = bg-blue-500 text-white; filters venues with matching sportType in sportTypes array
  - Screenshot: 05-venues-filter-each.png
```

### S30-06: City filter chips (6 options)
```
Step 6: Observe city filters
  - Action: Inspect second filter row
  - Target: 6 city buttons (전체/서울/경기/인천/부산/대구)
  - Expected: "전체" active by default (bg-gray-700 text-white, dark: bg-gray-200 text-gray-900); inactive = text-gray-500; min-h-[44px]; second row is independent of sport filter
  - Screenshot: 06-venues-city-filters.png
```

### S30-07: City filter — click each
```
Step 7: Click each city
  - Action: Click through city filters
  - Target: Each city chip
  - Expected: Active styling; filters by venue.city; "전체" resets city filter (activeCity='')
  - Screenshot: 07-venues-city-each.png
```

### S30-08: Combined sport + city filter
```
Step 8: Apply both filters
  - Action: Select sport=futsal + city=서울
  - Target: Both filter rows
  - Expected: Both active; list shows venues matching both sportType AND city
  - Screenshot: 08-venues-combined-filter.png
```

### S30-09: Loading skeletons
```
Step 9: Observe loading
  - Action: Loading state
  - Target: 3 skeleton cards (h-[92px] rounded-xl skeleton-shimmer)
  - Expected: Mobile single column; desktop 2-column grid
  - Screenshot: 09-venues-loading.png
```

### S30-10: Error state
```
Step 10: API error
  - Action: Mock error
  - Target: ErrorState
  - Expected: ErrorState with retry
  - Screenshot: 10-venues-error.png
```

### S30-11: Empty search results
```
Step 11: No matching venues
  - Action: Apply filters/search with no matches
  - Target: EmptyState
  - Expected: MapPin icon; "검색 결과가 없어요"; "다른 조건으로 검색해보세요"; size="sm"
  - Screenshot: 11-venues-empty.png
```

### S30-12: VenueCard — default render
```
Step 12: Inspect VenueCard
  - Action: Observe a venue card
  - Target: VenueCard component
  - Expected: Horizontal layout (flex); w-28 thumbnail (SafeImage, object-cover); venue name (text-base font-semibold); rating (Star amber-400 + score); sport labels joined by " . "; address (truncate); price/hour + review count; interactive card with active:scale-[0.98]
  - Screenshot: 12-venue-card-default.png
```

### S30-13: VenueCard — hover + active
```
Step 13: Hover + press
  - Action: Hover then mousedown
  - Target: Card
  - Expected: Border transition; scale to 0.98 on active
  - Screenshot: 13-venue-card-hover.png
```

### S30-14: VenueCard — click navigates
```
Step 14: Click venue card
  - Action: Click
  - Target: Link to /venues/{id}
  - Expected: Navigates to venue detail
  - Screenshot: 14-venue-card-navigate.png
```

### S30-15: Fallback venues (when API returns empty)
```
Step 15: Observe fallback data
  - Action: When API returns empty items
  - Target: Venue list
  - Expected: 6 fallback venues render (마포 풋살파크, 강남 스포츠센터, 잠실 아이스링크, etc.); still filterable by sport/city/search
  - Screenshot: 15-venues-fallback.png
```

---

## S31 — Venue Detail

### S31-01: Loading state
```
Step 1: Navigate to /venues/{id} (loading)
  - Action: Open URL
  - Target: Page
  - Expected: animate-pulse; h-8 w-40 + h-48 rounded-xl bg-gray-100
  - Screenshot: 01-venue-detail-loading.png
```

### S31-02: Not found / error states
```
Step 2: Open non-existent venue
  - Action: Navigate to invalid id
  - Target: Page
  - Expected: If isError: ErrorState "시설 정보를 불러오지 못했어요." with retry; if not found: EmptyState with MapPin "시설을 찾을 수 없어요" action to /venues
  - Screenshot: 02-venue-detail-not-found.png
```

### S31-03: Hero image + click opens lightbox
```
Step 3: Interact with hero image
  - Action: Click hero image
  - Target: Card with image button (h-[220px])
  - Expected: SafeImage with fallback; click opens MediaLightbox; lightbox title="{venue.name} 이미지"
  - Screenshot: 03-venue-detail-hero.png
```

### S31-04: Venue header info
```
Step 4: Inspect venue header
  - Action: Observe Card content below image
  - Target: Name + rating + sport + location
  - Expected: Name (text-2xl font-bold); Star rating with count if reviewCount > 0; sport label + city/district; description if present
  - Screenshot: 04-venue-detail-header.png
```

### S31-05: Hub section tabs
```
Step 5: Observe hub section tabs
  - Action: Inspect 4 tab buttons
  - Target: HubSectionTab components
  - Expected: "소개" active (bg-blue-500 text-white); "굿즈 N", "수강권 N", "대회 N" inactive (bg-gray-100 text-gray-600); min-h-[44px]; overflow-x-auto
  - Screenshot: 05-venue-detail-hub-tabs.png
```

### S31-06: Hub tab — click "굿즈"
```
Step 6: Click "굿즈" tab
  - Action: Click goods tab
  - Target: HubSectionTab
  - Expected: Tab becomes active; overview section hidden; GoodsSection shown; if empty: EmptyState "등록된 굿즈가 없어요" with action to /marketplace; if items: linked cards with thumbnails
  - Screenshot: 06-venue-detail-goods-tab.png
```

### S31-07: Hub tab — click "수강권"
```
Step 7: Click "수강권" tab
  - Action: Click passes tab
  - Target: HubSectionTab
  - Expected: PassesSection shown; if empty: EmptyState "등록된 수강권이 없어요" with action to /lessons; if items: lesson cards with thumbnails
  - Screenshot: 07-venue-detail-passes-tab.png
```

### S31-08: Hub tab — click "대회"
```
Step 8: Click "대회" tab
  - Action: Click events tab
  - Target: HubSectionTab
  - Expected: EventsSection shown; if empty: EmptyState "예정 대회가 없어요" with action to /tournaments; if items: event cards
  - Screenshot: 08-venue-detail-events-tab.png
```

### S31-09: Overview — map section
```
Step 9: Inspect map
  - Action: Observe MapPlaceholder in overview
  - Target: MapPlaceholder component
  - Expected: Static map display with venue coordinates; address shown; height=220
  - Screenshot: 09-venue-detail-map.png
```

### S31-10: Overview — basic info card
```
Step 10: Inspect basic info
  - Action: Observe "기본 정보" card
  - Target: Info card
  - Expected: 4 sections with icons: MapPin (address), Clock (operating hours), DollarSign (price/hour), Phone (phone number); operating hours rendered as day-by-day rows (dayLabels mapping); closed days show "휴무"
  - Screenshot: 10-venue-detail-basic-info.png
```

### S31-11: Overview — operating hours table
```
Step 11: Inspect operating hours
  - Action: Observe hours section
  - Target: Operating hours rows
  - Expected: Each row: bg-gray-50 rounded-lg px-3 py-2; day label (월/화/.../주말); time range or "휴무"; if no data: "운영 시간 정보 없음"
  - Screenshot: 11-venue-detail-operating-hours.png
```

### S31-12: Overview — phone link
```
Step 12: Inspect phone link
  - Action: Observe phone section
  - Target: tel: link
  - Expected: If venuePhone: <a href="tel:{phone}"> styled text-blue-500; else "전화번호 없음"
  - Screenshot: 12-venue-detail-phone.png
```

### S31-13: Overview — facilities tags
```
Step 13: Inspect facilities
  - Action: Observe "시설 정보" card
  - Target: Facility tags
  - Expected: Flex-wrap gap-2 tags; each tag: Check icon + facility name; styled bg-gray-100 border border-gray-200; if empty: EmptyState "등록된 시설 정보가 없어요"
  - Screenshot: 13-venue-detail-facilities.png
```

### S31-14: Overview — schedule section
```
Step 14: Inspect schedule
  - Action: Observe "향후 7일 예약" card
  - Target: Schedule list
  - Expected: Up to 5 ScheduleCard items; each links to /matches/{id}; shows title, date, time; hover bg-gray-100; if empty: EmptyState "예약이 없어요" with CalendarDays icon
  - Screenshot: 14-venue-detail-schedule.png
```

### S31-15: Overview — reviews section (with reviews)
```
Step 15: Inspect reviews
  - Action: Observe review list
  - Target: "리뷰 (N)" card
  - Expected: Overall rating (Star amber-400 + score); review cards with avatar, nickname, 5-star display (filled vs unfilled), date, comment; up to 5 reviews shown
  - Screenshot: 15-venue-detail-reviews.png
```

### S31-16: Overview — reviews section (empty)
```
Step 16: View venue with no reviews
  - Action: Visit venue with empty reviews
  - Target: Review section
  - Expected: EmptyState "아직 리뷰가 없어요" + "이 시설을 이용한 후 리뷰를 남겨보세요"
  - Screenshot: 16-venue-detail-reviews-empty.png
```

### S31-17: Review "리뷰 쓰기" button
```
Step 17: Click "리뷰 쓰기"
  - Action: Click button with PenLine icon
  - Target: Write review button (border border-gray-200)
  - Expected: showReviewForm=true; ReviewForm component renders inline; button disappears
  - Screenshot: 17-venue-detail-review-write-btn.png
```

### S31-18: ReviewForm — overall rating stars
```
Step 18: Interact with overall rating
  - Action: Hover + click stars 1-5
  - Target: 5 star buttons (size=36) centered
  - Expected: Hovering fills stars up to hovered position (text-amber-400 fill=currentColor); clicking sets overallRating; score displayed (text-2xl font-bold text-amber-500); each star min-h-11 min-w-11; focus-visible:outline-2 outline-blue-500
  - Screenshot: 18-venue-detail-review-overall-stars.png
```

### S31-19: ReviewForm — hover star 3 then click
```
Step 19: Hover star 3 then click
  - Action: Hover 3rd star, then click
  - Target: Star 3
  - Expected: Stars 1-3 filled on hover; after click: overallRating=3; display shows "3.0"
  - Screenshot: 19-venue-detail-review-star3.png
```

### S31-20: ReviewForm — detail ratings (facility/access/cost)
```
Step 20: Set detail ratings
  - Action: Click stars for each detail category
  - Target: StarRating components (시설 상태/접근성/가격 대비)
  - Expected: Each has label + 5 star buttons (size=24) + numeric display; hover fills; click sets value; separator lines (h-px bg-gray-100)
  - Screenshot: 20-venue-detail-review-detail-ratings.png
```

### S31-21: ReviewForm — ice quality rating (ice rink only)
```
Step 21: View ice rink venue review form
  - Action: Open review for ice_rink type venue
  - Target: Extra "빙질" StarRating
  - Expected: Additional StarRating for iceQualityRating appears; required for isValid; not shown for non-ice venues
  - Screenshot: 21-venue-detail-review-ice-quality.png
```

### S31-22: ReviewForm — comment textarea
```
Step 22: Fill comment
  - Action: Type in review comment
  - Target: Textarea with id "venue-review-comment-{venueId}"
  - Expected: Label "후기 작성" with htmlFor linkage; placeholder "이용 후기를 자유롭게 작성해주세요"; rows=4 resize-none
  - Screenshot: 22-venue-detail-review-comment.png
```

### S31-23: ReviewForm — image upload
```
Step 23: Upload review photos
  - Action: Use ImageUpload in review form
  - Target: ImageUpload (max=5, maxSizeMB=10)
  - Expected: Label "시설 사진 (선택)"; pending/error messages; upload state affects canSubmit
  - Screenshot: 23-venue-detail-review-photos.png
```

### S31-24: ReviewForm — submit disabled (no rating)
```
Step 24: Try submit without ratings
  - Action: Click "리뷰 등록" without all required ratings
  - Target: Submit button
  - Expected: Disabled (opacity-40 cursor-not-allowed); canSubmit=false because overallRating=0 or missing detail ratings
  - Screenshot: 24-venue-detail-review-submit-disabled.png
```

### S31-25: ReviewForm — submit enabled + click
```
Step 25: Submit valid review
  - Action: Fill all required ratings; click "리뷰 등록"
  - Target: Submit button (bg-blue-500, Send icon)
  - Expected: isSubmitting=true; button shows "제출 중..."; createReviewMutation called; success toast "리뷰가 등록되었어요."; form closes (showReviewForm=false)
  - Screenshot: 25-venue-detail-review-submit.png
```

### S31-26: ReviewForm — submit error
```
Step 26: Submit with API failure
  - Action: Mock API error
  - Target: Submit
  - Expected: Error toast "리뷰 등록에 실패했어요. 다시 시도해주세요."; form stays open
  - Screenshot: 26-venue-detail-review-submit-error.png
```

### S31-27: ReviewForm — cancel button
```
Step 27: Click "취소" in review form
  - Action: Click cancel button (border border-gray-200)
  - Target: Cancel button
  - Expected: onCancel called; showReviewForm=false; "리뷰 쓰기" button reappears
  - Screenshot: 27-venue-detail-review-cancel.png
```

### S31-28: Share button
```
Step 28: Click share in header
  - Action: Click Share2 button
  - Target: aria-label="공유하기" button
  - Expected: navigator.share or clipboard copy + toast "시설 링크를 복사했어요."
  - Screenshot: 28-venue-detail-share.png
```

### S31-29: Sidebar — upcoming matches
```
Step 29: Inspect "이 구장 예정 경기" section
  - Action: Observe sidebar card
  - Target: Upcoming matches card with Trophy icon
  - Expected: 3 mock matches listed; each links to /team-matches/{id}; shows title, status (모집중/매칭완료), date, teams; "이 구장에서 경기 만들기" button (bg-blue-500) to /team-matches/new; "전화 문의" tel link if venuePhone exists
  - Screenshot: 29-venue-detail-sidebar-matches.png
```

### S31-30: Sidebar — upcoming match card hover
```
Step 30: Hover a match card
  - Action: Hover match link
  - Target: Match link (rounded-xl bg-gray-50)
  - Expected: hover:bg-gray-100 (dark: hover:bg-gray-700) transition
  - Screenshot: 30-venue-detail-match-hover.png
```

### S31-31: Sidebar — "이 구장에서 경기 만들기" button
```
Step 31: Click create match button
  - Action: Click blue button
  - Target: Link to /team-matches/new
  - Expected: Navigates to team match creation
  - Screenshot: 31-venue-detail-create-match.png
```

### S31-32: Sidebar — phone inquiry button
```
Step 32: Observe phone button
  - Action: Inspect "전화 문의" button
  - Target: tel: link button (Phone icon)
  - Expected: Only renders if venuePhone exists; <a href="tel:{phone}">; hover:bg-gray-50
  - Screenshot: 32-venue-detail-phone-button.png
```

### S31-33: Sidebar — hub management links (canEdit)
```
Step 33: View as venue manager
  - Action: Login as user with canEditProfile capability
  - Target: Hub management card
  - Expected: "시설 페이지 수정" link to /venues/{id}/edit; "허브 등록" section with 3 links (굿즈 등록, 수강권 등록, 대회 등록) with venueId/venueName query params
  - Screenshot: 33-venue-detail-hub-management.png
```

### S31-34: Sidebar — hub section shortcuts
```
Step 34: Click hub section shortcuts
  - Action: Click "굿즈"/"수강권"/"대회" buttons in sidebar
  - Target: Sidebar hub section card
  - Expected: Clicking each sets activeSection to goods/passes/events; main content updates to show corresponding section
  - Screenshot: 34-venue-detail-hub-shortcuts.png
```

### S31-35: Desktop sidebar sticky
```
Step 35: Scroll on desktop
  - Action: Scroll at 1440x900
  - Target: sidebar-sticky
  - Expected: Right column sticks; left scrolls; @3xl:grid @3xl:grid-cols-[1fr_380px]
  - Screenshot: 35-venue-detail-desktop-sticky.png
```

### S31-36: MediaLightbox from hero
```
Step 36: Open and navigate lightbox
  - Action: Click hero, navigate, close
  - Target: MediaLightbox
  - Expected: Opens at index 0; shows all venue images; keyboard navigation (arrows); close via X or ESC
  - Screenshot: 36-venue-detail-lightbox.png
```

---

## Cross-cutting Verifications (all S21-S31)

### Keyboard Navigation
- Every interactive element (buttons, links, inputs) reachable via Tab
- Enter/Space activates focused element
- ESC closes modals and lightboxes
- Arrow keys work in lightboxes and select elements
- Focus ring visible on all focused elements (blue-500 outline)

### Touch Targets
- All interactive elements minimum 44x44px (min-h-[44px] or min-h-11)
- Filter chips, CTA buttons, modal buttons, star ratings all meet minimum

### Dark Mode
- All bg-white sections have dark:bg-gray-800 variants
- All text-gray-900 have dark:text-white or dark:text-gray-100
- Border colors transition (dark:border-gray-700)
- Active states have dark variants (bg-blue-500 consistent across themes)
- Skeleton shimmer adapts (dark:bg-gray-800 / dark:bg-gray-700)
- Glass headers adapt

### Accessibility
- All images have alt text
- Decorative icons have aria-hidden="true"
- Interactive icon buttons have aria-label
- Star ratings have aria-label per star ("{N}점")
- Status badges convey meaning via text (not color alone)
- Modals have proper focus trap and role="dialog"
- Loading states have role="status"
- Error states have role="alert" where applicable
- Form inputs have associated labels (htmlFor + id)
- sr-only labels for search inputs

### Responsive Layout
- Mobile (390px): single column, px-5 padding, bottom h-24 spacer for nav
- Tablet (768px): transitional layout
- Desktop (1440px): @3xl breakpoint activates 2-column grids, sidebar-sticky, breadcrumbs, pt-0

### Animations
- animate-fade-in on page load
- stagger-children on card lists
- transition-colors on buttons/chips
- transition-transform on card press (active:scale-[0.98])
- group-hover:scale-[1.02] on card images
- skeleton-shimmer on loading states
- prefers-reduced-motion respected

### i18n
- All user-facing text from next-intl translations (lessons.*, marketplace.*, empty.*)
- **Pages with hardcoded Korean (no useTranslations)** — English locale tests will show raw Korean on these pages:
  - `/mercenary` — title "용병 모집", subtitle, "내 모집/신청", filter labels, count text, empty state messages
  - `/mercenary/[id]` — all labels (모집 인원, 신청 현황, etc.), CTA text, status labels, toast messages
  - `/mercenary/new` and `/mercenary/[id]/edit` — all form labels, validation messages, toast messages
  - `/venues` — title "시설 찾기", subtitle, filter labels, sport/city labels, toast messages
  - `/venues/[id]` — section headings, facility tags, review form, all sidebar text, operating hours labels
  - `/lessons/new` and `/lessons/[id]/edit` — form labels ("종목 선택", "강좌 유형", step names), validation toasts
  - `/lessons/[id]` — curriculum section, recommendation text, coach section, trust signals, calendar add button
  - `/marketplace/new` and `/marketplace/[id]/edit` — form labels, condition descriptions, validation toasts
