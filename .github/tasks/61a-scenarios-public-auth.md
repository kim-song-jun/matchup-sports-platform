# Part A: Public Pages & Authentication -- UI/UX Test Scenarios

## Test Matrix

Every step in every scenario MUST be executed across all 12 combinations:

| Dimension | Values |
|-----------|--------|
| Viewport | mobile (390x844), tablet (768x1024), desktop (1440x900) |
| Language | Korean (ko), English (en) |
| Theme | Light, Dark |

**Total screenshots per step = 12.** Naming convention: `{scenario}-{step:2d}-{name}-{viewport}-{lang}-{theme}.png`

> **i18n note**: The current public pages do NOT use next-intl -- all UI text is hardcoded Korean. The `en` locale column will verify that the layout does not break when the browser `Accept-Language` header is `en`, but text will remain Korean. Locale-specific notes reflect this.

---

## S01 -- Landing Page (`/landing`)

### S01-01: Initial page load
- Action: navigate to `/landing`
- Target: `document.body`
- Expected Result: Full page renders -- LandingNav (fixed top), Hero section (badge, heading, subtitle, CTA buttons), Stats bar, Pain Points, Features, How It Works, Sports, Testimonials, Final CTA, LandingFooter. All ScrollReveal elements begin hidden (opacity 0, translate 24px up) and animate in as viewport scrolls or on initial load for above-fold content.
- Screenshot: `01-initial-load.png`
- Viewport-specific notes: Mobile -- nav shows hamburger button, "시작하기" button visible, "로그인" text link hidden (`hidden sm:block`). Tablet -- both "로그인" and "시작하기" visible, hamburger hidden (`md:hidden`). Desktop -- full nav links visible, hamburger hidden. Hero heading: mobile `text-4xl`, tablet `text-5xl`, desktop `text-6xl`.
- Theme-specific notes: Light -- `bg-white`, `text-gray-900`. Dark -- `bg-gray-900`, `text-white`. Nav background transparent until scroll.
- Locale-specific notes: All text remains Korean regardless of browser locale.

### S01-02: Nav scroll behavior (background transition)
- Action: scroll down 30px
- Target: `nav[aria-label="메인 네비게이션"]`
- Expected Result: Nav gains background (`bg-white/92 backdrop-blur-md shadow-...` in light, `bg-gray-900/88` in dark), bottom border appears. Transition duration 300ms.
- Screenshot: `02-nav-scrolled.png`
- Viewport-specific notes: Same across all viewports.
- Theme-specific notes: Light -- white/92 background + shadow. Dark -- gray-900/88 + no visible shadow (dark border).
- Locale-specific notes: None.

### S01-03: Logo hover
- Action: hover over TeamMeet logo in nav
- Target: `nav a[href="/"]` (first link in nav)
- Expected Result: Logo opacity reduces (`hover:opacity-80`), transition-opacity.
- Screenshot: `03-logo-hover.png`
- Viewport-specific notes: Same across all viewports.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-04: Logo focus ring
- Action: Tab to logo (first focusable element in nav)
- Target: `nav a[href="/"]`
- Expected Result: No explicit focus-visible class on logo link. Browser default focus ring may appear.
- Screenshot: `04-logo-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-05: Desktop nav link "이용 가이드" -- hover
- Action: hover over "이용 가이드" link
- Target: `nav a[href="/guide"]`
- Expected Result: Text changes from `text-gray-500` to `text-gray-900` (light) / `text-white` (dark), background `bg-gray-50` (light) / `bg-gray-800` (dark). Transition-colors.
- Screenshot: `05-nav-guide-hover.png`
- Viewport-specific notes: Only visible on tablet/desktop (`hidden md:flex`). Mobile -- skip this step.
- Theme-specific notes: Different hover bg and text colors per theme.
- Locale-specific notes: None.

### S01-06: Desktop nav link "이용 가이드" -- focus
- Action: Tab to "이용 가이드" link
- Target: `nav a[href="/guide"]`
- Expected Result: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400` -- blue outline ring, 2px offset.
- Screenshot: `06-nav-guide-focus.png`
- Viewport-specific notes: Tablet/desktop only.
- Theme-specific notes: Blue-400 outline in both themes.
- Locale-specific notes: None.

### S01-07: Desktop nav link "이용 가이드" -- click
- Action: click "이용 가이드" link
- Target: `nav a[href="/guide"]`
- Expected Result: Navigation to `/guide`. Verify URL change.
- Screenshot: `07-nav-guide-clicked.png`
- Viewport-specific notes: Tablet/desktop only.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-08: Desktop nav link "요금" -- hover
- Action: hover over "요금" link (navigate back to `/landing` first)
- Target: `nav a[href="/pricing"]`
- Expected Result: Same hover style as S01-05.
- Screenshot: `08-nav-pricing-hover.png`
- Viewport-specific notes: Tablet/desktop only.
- Theme-specific notes: Same as S01-05.
- Locale-specific notes: None.

### S01-09: Desktop nav link "요금" -- click
- Action: click "요금" link
- Target: `nav a[href="/pricing"]`
- Expected Result: Navigation to `/pricing`.
- Screenshot: `09-nav-pricing-clicked.png`
- Viewport-specific notes: Tablet/desktop only.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-10: Desktop nav link "FAQ" -- hover + click
- Action: hover, then click "FAQ" link (navigate back to `/landing` first)
- Target: `nav a[href="/faq"]`
- Expected Result: Hover style, then navigation to `/faq`.
- Screenshot: `10-nav-faq-hover.png`
- Viewport-specific notes: Tablet/desktop only.
- Theme-specific notes: Same pattern.
- Locale-specific notes: None.

### S01-11: Desktop nav link "소개" -- hover + click
- Action: hover, then click "소개" link (navigate back to `/landing` first)
- Target: `nav a[href="/about"]`
- Expected Result: Hover style, then navigation to `/about`.
- Screenshot: `11-nav-about-hover.png`
- Viewport-specific notes: Tablet/desktop only.
- Theme-specific notes: Same pattern.
- Locale-specific notes: None.

### S01-12: Desktop nav "로그인" text link -- hover
- Action: hover over "로그인" text link (navigate back to `/landing` first)
- Target: `nav a[href="/login"]:not(.bg-blue-500)` (the text-only login link)
- Expected Result: Text changes `text-gray-500` to `text-gray-900`, transition-colors. `hidden sm:block` -- visible on tablet/desktop.
- Screenshot: `12-nav-login-text-hover.png`
- Viewport-specific notes: Hidden on mobile (`hidden sm:block`).
- Theme-specific notes: Standard text color change.
- Locale-specific notes: None.

### S01-13: Desktop nav "시작하기" button -- hover
- Action: hover over "시작하기" button in nav
- Target: `nav a.bg-blue-500[href="/login"]`
- Expected Result: Background changes `bg-blue-500` to `bg-blue-600`. Shadow `shadow-sm shadow-blue-500/20`.
- Screenshot: `13-nav-start-hover.png`
- Viewport-specific notes: Visible on all viewports.
- Theme-specific notes: Same blue button in both themes.
- Locale-specific notes: None.

### S01-14: Desktop nav "시작하기" button -- focus
- Action: Tab to "시작하기" button
- Target: `nav a.bg-blue-500[href="/login"]`
- Expected Result: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400`.
- Screenshot: `14-nav-start-focus.png`
- Viewport-specific notes: All viewports.
- Theme-specific notes: Blue outline.
- Locale-specific notes: None.

### S01-15: Desktop nav "시작하기" button -- active
- Action: mousedown on "시작하기" button
- Target: `nav a.bg-blue-500[href="/login"]`
- Expected Result: `active:scale-[0.97]` -- slight scale down.
- Screenshot: `15-nav-start-active.png`
- Viewport-specific notes: All viewports.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-16: Mobile hamburger button -- default state
- Action: observe hamburger button
- Target: `nav button[aria-label="메뉴 열기"]`
- Expected Result: Menu icon (3 horizontal lines), `h-11 w-11`, `text-gray-600` (light) / `text-gray-300` (dark). `aria-label="메뉴 열기"`.
- Screenshot: `16-hamburger-default.png`
- Viewport-specific notes: Mobile only (`md:hidden`). Hidden on tablet/desktop.
- Theme-specific notes: Icon color differs.
- Locale-specific notes: None.

### S01-17: Mobile hamburger button -- hover
- Action: hover over hamburger button
- Target: `nav button[aria-label="메뉴 열기"]`
- Expected Result: Background `bg-gray-100` (light) / `bg-gray-800` (dark).
- Screenshot: `17-hamburger-hover.png`
- Viewport-specific notes: Mobile only.
- Theme-specific notes: Different hover bg.
- Locale-specific notes: None.

### S01-18: Mobile hamburger button -- click (open menu)
- Action: click hamburger button
- Target: `nav button[aria-label="메뉴 열기"]`
- Expected Result: Mobile dropdown appears with `animate-fade-in`. Menu items: "이용 가이드", "요금", "FAQ", "소개", "로그인" (only on <640px, `sm:hidden`). Icon changes from Menu to X. `aria-label` changes to "메뉴 닫기". Nav background becomes solid (`bg-white` light / `bg-gray-900` dark).
- Screenshot: `18-hamburger-open.png`
- Viewport-specific notes: Mobile only. "로그인" menu item hidden on sm+ (`sm:hidden`).
- Theme-specific notes: Dropdown bg `bg-white` / `bg-gray-900`. Border `border-gray-100` / `border-gray-800`.
- Locale-specific notes: None.

### S01-19: Mobile menu -- "이용 가이드" hover
- Action: hover over "이용 가이드" in mobile menu
- Target: Mobile dropdown `a[href="/guide"]`
- Expected Result: Background `bg-gray-50` (light) / `bg-gray-800` (dark). Text `text-gray-700` / `text-gray-300`.
- Screenshot: `19-mobile-menu-guide-hover.png`
- Viewport-specific notes: Mobile only.
- Theme-specific notes: Different hover bg.
- Locale-specific notes: None.

### S01-20: Mobile menu -- "이용 가이드" click
- Action: click "이용 가이드" in mobile menu
- Target: Mobile dropdown `a[href="/guide"]`
- Expected Result: Navigation to `/guide`. Mobile menu closes on route change (useEffect on pathname).
- Screenshot: `20-mobile-menu-guide-click.png`
- Viewport-specific notes: Mobile only.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-21: Mobile menu -- each remaining item hover
- Action: hover over "요금", "FAQ", "소개", "로그인" in mobile menu (navigate back to `/landing`, reopen menu)
- Target: Mobile dropdown links
- Expected Result: Same hover pattern as S01-19 for each item.
- Screenshot: `21-mobile-menu-items-hover.png`
- Viewport-specific notes: Mobile only. "로그인" only visible on < 640px width.
- Theme-specific notes: Same hover pattern.
- Locale-specific notes: None.

### S01-22: Mobile menu -- close by X button
- Action: click X button (which replaces hamburger when menu is open)
- Target: `nav button[aria-label="메뉴 닫기"]`
- Expected Result: Mobile dropdown disappears. Icon reverts to Menu. `aria-label` reverts to "메뉴 열기".
- Screenshot: `22-mobile-menu-close-x.png`
- Viewport-specific notes: Mobile only.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-23: Hero badge ScrollReveal animation
- Action: observe badge on initial load (above fold)
- Target: `.inline-flex.bg-blue-50` badge ("11개 종목 ...")
- Expected Result: Fades in from 24px below (opacity 0 to 1, translateY 24px to 0) with 0ms delay. Duration 0.6s, cubic-bezier(0.25, 1, 0.5, 1). If `prefers-reduced-motion: reduce`, appears immediately.
- Screenshot: `23-hero-badge-reveal.png`
- Viewport-specific notes: Same animation across all viewports.
- Theme-specific notes: Badge bg `bg-blue-50` (light) / `bg-blue-900/30` (dark), text `text-blue-600` / `text-blue-400`.
- Locale-specific notes: None.

### S01-24: Hero heading ScrollReveal
- Action: observe heading on initial load
- Target: `h1` element in hero
- Expected Result: Same fade-in-up animation with 100ms delay.
- Screenshot: `24-hero-heading-reveal.png`
- Viewport-specific notes: Font size varies -- mobile `text-4xl`, sm `text-5xl`, lg `text-6xl`.
- Theme-specific notes: `text-gray-900` / `text-white`. Blue span `text-blue-500` in both.
- Locale-specific notes: None.

### S01-25: Hero CTA "무료로 시작하기" -- default state
- Action: observe primary CTA button
- Target: `a[href="/login"].bg-blue-500` in hero section
- Expected Result: Blue button (`bg-blue-500`), white text, `rounded-2xl`, `px-8 py-4`, `text-lg`, ArrowRight icon. Font bold.
- Screenshot: `25-hero-cta-default.png`
- Viewport-specific notes: Mobile -- full width (`flex-col`), stacked with secondary button. Sm+ -- inline (`flex-row`).
- Theme-specific notes: Same blue button in both themes.
- Locale-specific notes: None.

### S01-26: Hero CTA "무료로 시작하기" -- hover
- Action: hover over primary CTA
- Target: `a[href="/login"].bg-blue-500` in hero
- Expected Result: Background changes to `bg-blue-600`. Transition 200ms.
- Screenshot: `26-hero-cta-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-27: Hero CTA "무료로 시작하기" -- focus
- Action: Tab to primary CTA
- Target: `a[href="/login"].bg-blue-500` in hero
- Expected Result: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400`.
- Screenshot: `27-hero-cta-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: Blue-400 outline.
- Locale-specific notes: None.

### S01-28: Hero CTA "무료로 시작하기" -- active
- Action: mousedown on primary CTA
- Target: `a[href="/login"].bg-blue-500` in hero
- Expected Result: `active:scale-[0.97]`, transition 200ms.
- Screenshot: `28-hero-cta-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-29: HeroScrollButton "더 알아보기" -- default
- Action: observe "더 알아보기" button
- Target: `button` containing "더 알아보기" text
- Expected Result: Gray text (`text-gray-500` light / `text-gray-400` dark), ChevronDown icon, `rounded-xl`, `px-6 py-3.5`.
- Screenshot: `29-scroll-btn-default.png`
- Viewport-specific notes: Mobile -- stacked below primary CTA. Sm+ -- inline.
- Theme-specific notes: Text color differs.
- Locale-specific notes: None.

### S01-30: HeroScrollButton "더 알아보기" -- hover
- Action: hover over "더 알아보기"
- Target: `button` containing "더 알아보기"
- Expected Result: Text `text-gray-900` (light) / `text-white` (dark). Background `bg-gray-50` / `bg-gray-800`.
- Screenshot: `30-scroll-btn-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover colors.
- Locale-specific notes: None.

### S01-31: HeroScrollButton "더 알아보기" -- focus
- Action: Tab to "더 알아보기"
- Target: `button` containing "더 알아보기"
- Expected Result: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400`.
- Screenshot: `31-scroll-btn-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: Blue outline.
- Locale-specific notes: None.

### S01-32: HeroScrollButton "더 알아보기" -- click (smooth scroll)
- Action: click "더 알아보기"
- Target: `button` containing "더 알아보기"
- Expected Result: Page smooth-scrolls to `#features-section`. `scrollIntoView({ behavior: 'smooth' })`.
- Screenshot: `32-scroll-btn-click.png`
- Viewport-specific notes: Scroll distance varies by viewport height.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-33: Stats section -- ScrollReveal
- Action: scroll to stats section (should trigger on initial load if above fold)
- Target: Stats grid with 4 items (2,400+, 520+, 4.8, 98%)
- Expected Result: Container fades in. Grid layout: mobile `grid-cols-2`, sm+ `grid-cols-4`. Dividers between items.
- Screenshot: `33-stats-reveal.png`
- Viewport-specific notes: Mobile -- 2x2 grid. Sm+ -- 1x4 row.
- Theme-specific notes: Light -- `bg-white`, `border-gray-100`, shadow. Dark -- `bg-gray-800`, `border-gray-700`, no shadow.
- Locale-specific notes: None.

### S01-34: Pain Points section -- ScrollReveal
- Action: scroll to "이런 경험, 있지 않나요?" section
- Target: Section with 3 pain point cards
- Expected Result: Heading + 3 cards fade in. Cards have icons (Frown, SearchX, UserX), colored icon backgrounds.
- Screenshot: `34-pain-points-reveal.png`
- Viewport-specific notes: Mobile -- stacked (1 column). Sm+ -- 3 columns (`sm:grid-cols-3`).
- Theme-specific notes: Cards `bg-white` / `bg-gray-800`, borders `border-gray-100` / `border-gray-700`.
- Locale-specific notes: None.

### S01-35: Features section -- AI Matching hero card
- Action: scroll to `#features-section`
- Target: Dark hero card ("AI 매칭")
- Expected Result: Large dark card with matching visualization (progress bars, profile). Tags: "실력 분석", "위치 매칭", "매너 필터", "ELO 반영".
- Screenshot: `35-features-ai-card.png`
- Viewport-specific notes: Mobile -- stacked (text above, visualization below). Desktop -- side by side (`lg:flex lg:items-center lg:gap-10`).
- Theme-specific notes: Card always dark (`bg-gray-900` light / `bg-gray-800` dark).
- Locale-specific notes: None.

### S01-36: Features section -- sub-feature cards hover (Team Matching)
- Action: hover over "팀 매칭" card
- Target: First card in 3-column sub-features grid
- Expected Result: Background changes `bg-white` to `bg-gray-50` (light) / `bg-gray-800` to `bg-gray-700` (dark). Icon scales up (`group-hover:scale-110`). Transition 300ms.
- Screenshot: `36-feature-team-hover.png`
- Viewport-specific notes: Mobile -- stacked. Sm+ -- 3 columns.
- Theme-specific notes: Different hover backgrounds.
- Locale-specific notes: None.

### S01-37: Features section -- sub-feature cards hover (Trust System)
- Action: hover over "신뢰 시스템" card
- Target: Second card in sub-features grid
- Expected Result: Same hover pattern. Green icon (`bg-emerald-500`) scales up.
- Screenshot: `37-feature-trust-hover.png`
- Viewport-specific notes: Same as S01-36.
- Theme-specific notes: Same pattern.
- Locale-specific notes: None.

### S01-38: Features section -- sub-feature cards hover (All-in-One)
- Action: hover over "올인원" card
- Target: Third card in sub-features grid
- Expected Result: Same hover pattern. Amber icon (`bg-amber-500`) scales up.
- Screenshot: `38-feature-allinone-hover.png`
- Viewport-specific notes: Same.
- Theme-specific notes: Same.
- Locale-specific notes: None.

### S01-39: How It Works section -- mobile layout
- Action: scroll to "3단계로 시작하세요" on mobile
- Target: Steps section (vertical timeline on mobile)
- Expected Result: Vertical timeline with blue numbered circles (1, 2, 3), connecting gradient lines, step titles and descriptions. `lg:hidden` -- visible on mobile/tablet.
- Screenshot: `39-steps-mobile.png`
- Viewport-specific notes: Mobile/tablet -- vertical timeline. Desktop -- hidden, horizontal layout shown instead.
- Theme-specific notes: Blue circles same. Lines `from-blue-200` / `from-blue-700`.
- Locale-specific notes: None.

### S01-40: How It Works section -- desktop layout
- Action: scroll to "3단계로 시작하세요" on desktop
- Target: Steps section (horizontal layout on desktop)
- Expected Result: 3-column grid with horizontal connecting line. Each step has numbered circle with white ring (`ring-2 ring-white`), title, description. ScrollReveal with staggered delays (0, 200ms, 400ms).
- Screenshot: `40-steps-desktop.png`
- Viewport-specific notes: Desktop only (`hidden lg:grid lg:grid-cols-3`).
- Theme-specific notes: Ring color `ring-white` / `ring-gray-900` to match background.
- Locale-specific notes: None.

### S01-41: Sports section -- mobile horizontal scroll
- Action: scroll to "11개 종목, 하나의 플랫폼" on mobile
- Target: Horizontal scrollable sport chip row (`lg:hidden`)
- Expected Result: 11 sport chips in a horizontal scroll container. Each chip: 88px wide, sport icon, name, `rounded-2xl`, `active:scale-[0.95]` on tap.
- Screenshot: `41-sports-mobile-scroll.png`
- Viewport-specific notes: Mobile/tablet -- horizontal scroll (`overflow-x-auto`). Desktop -- hidden.
- Theme-specific notes: Chips `bg-white` / `bg-gray-800`, borders `border-gray-100` / `border-gray-700`.
- Locale-specific notes: None.

### S01-42: Sports section -- mobile chip tap
- Action: tap on "축구" chip on mobile
- Target: First sport chip
- Expected Result: `active:scale-[0.95]` scale-down effect. No navigation (chips are not links, `cursor-default` on desktop).
- Screenshot: `42-sports-chip-tap.png`
- Viewport-specific notes: Mobile only.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-43: Sports section -- desktop grid with hover (each of 11 chips)
- Action: hover over each sport chip on desktop
- Target: Desktop sport chips (`hidden lg:block` container)
- Expected Result: Each chip 108px wide. Hover: `bg-gray-50` (light) / `bg-gray-700` (dark), border changes to `border-blue-200` / `border-blue-800`. Transition 300ms. 11 chips: 축구, 풋살, 농구, 배드민턴, 테니스, 야구, 배구, 수영, 아이스하키, 피겨, 쇼트트랙.
- Screenshot: `43-sports-desktop-hover-{sportName}.png` (11 screenshots)
- Viewport-specific notes: Desktop only.
- Theme-specific notes: Different hover bg/border colors.
- Locale-specific notes: None.

### S01-44: Sports section -- "내 종목으로 매칭 시작하기" link hover
- Action: hover over link below sport chips
- Target: `a[href="/login"]` with ArrowRight icon in sports section
- Expected Result: Text color `text-blue-500` to `text-blue-600`. Transition-colors.
- Screenshot: `44-sports-link-hover.png`
- Viewport-specific notes: Same across all viewports.
- Theme-specific notes: Same blue shades.
- Locale-specific notes: None.

### S01-45: Testimonials section -- ScrollReveal staggered
- Action: scroll to "이미 많은 선수들이 경험하고 있어요"
- Target: 3 testimonial cards
- Expected Result: Cards fade in with staggered delays (0ms, 120ms, 240ms). Each card: star rating (role="img" with aria-label), quote text, author info with sport icon. Cards have hover effect.
- Screenshot: `45-testimonials-reveal.png`
- Viewport-specific notes: Mobile -- stacked. Md+ -- 3 columns (`md:grid-cols-3`).
- Theme-specific notes: Cards `bg-white` / `bg-gray-800`. Stars amber-400 filled vs gray-200/gray-600 unfilled.
- Locale-specific notes: None.

### S01-46: Testimonial card -- hover
- Action: hover over first testimonial card (김민수)
- Target: First testimonial card
- Expected Result: Background `bg-gray-50` (light) / `bg-gray-700` (dark). Transition 300ms.
- Screenshot: `46-testimonial-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover bg.
- Locale-specific notes: None.

### S01-47: Testimonial card -- star rating accessibility
- Action: inspect star rating
- Target: `div[role="img"][aria-label]` in testimonial card
- Expected Result: `role="img"` with descriptive `aria-label` (e.g., "5점 만점"). Individual stars have `aria-hidden="true"`.
- Screenshot: `47-testimonial-stars-a11y.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-48: Final CTA section
- Action: scroll to bottom CTA ("운동이 더 즐거워지는 경험")
- Target: Dark section at bottom with CTA button
- Expected Result: Dark background (`bg-gray-900` light / `bg-black` dark) with radial gradient overlay. Text content + "무료로 시작하기" button.
- Screenshot: `48-final-cta.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different base bg color.
- Locale-specific notes: None.

### S01-49: Final CTA button -- hover
- Action: hover over "무료로 시작하기" in final CTA
- Target: `a[href="/login"].bg-blue-500` in final CTA section
- Expected Result: Background `bg-blue-500` to `bg-blue-400` (lighter on hover, different from hero CTA which goes darker).
- Screenshot: `49-final-cta-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-50: Final CTA button -- focus + active
- Action: Tab to button, then mousedown
- Target: Final CTA button
- Expected Result: Focus: `outline-2 outline-offset-2 outline-blue-400`. Active: `scale-[0.97]`.
- Screenshot: `50-final-cta-focus-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S01-51: Footer -- layout
- Action: scroll to footer
- Target: `footer` element
- Expected Result: 3-column grid (brand, service links, company links) + bottom bar. Brand section has logo, description, "무료로 시작하기" link.
- Screenshot: `51-footer-layout.png`
- Viewport-specific notes: Mobile -- `grid-cols-2` (brand spans full, links 2-col). Sm+ -- `grid-cols-[2fr_1fr_1fr]`. Bottom bar stacks on mobile, inline on sm+.
- Theme-specific notes: `bg-gray-50` / `bg-gray-900`, border `border-gray-100` / `border-gray-800`.
- Locale-specific notes: None.

### S01-52: Footer -- service links hover (each of 3)
- Action: hover over "이용 가이드", "요금 안내", "자주 묻는 질문"
- Target: Footer service link list items
- Expected Result: Text `text-gray-600` to `text-gray-900` (light) / `text-gray-400` to `text-white` (dark). Transition-colors.
- Screenshot: `52-footer-service-links-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover text colors.
- Locale-specific notes: None.

### S01-53: Footer -- company links hover (each of 3)
- Action: hover over "서비스 소개", "이용약관", "개인정보처리방침"
- Target: Footer company link list items
- Expected Result: Same hover text transition as service links. Note: "이용약관" and "개인정보처리방침" link to `#` (placeholder).
- Screenshot: `53-footer-company-links-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same pattern.
- Locale-specific notes: None.

### S01-54: Footer -- "무료로 시작하기" link hover
- Action: hover over "무료로 시작하기" in footer brand section
- Target: `a[href="/login"]` in footer brand column
- Expected Result: Text `text-blue-500` to `text-blue-600`. Arrow icon included.
- Screenshot: `54-footer-start-link-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same blue shades.
- Locale-specific notes: None.

### S01-55: Full keyboard tab navigation
- Action: Press Tab repeatedly from top of page through all focusable elements
- Target: All interactive elements on page
- Expected Result: Tab order follows DOM order: Logo > nav links (guide, pricing, faq, about) > 로그인 link > 시작하기 button > hamburger (mobile) > Hero CTA > 더 알아보기 button > 내 종목으로 매칭 시작하기 link > Final CTA button > Footer links. Each element shows visible focus indicator.
- Screenshot: `55-tab-navigation-sequence.png` (capture at key points)
- Viewport-specific notes: Mobile has hamburger in tab order; desktop has inline nav links.
- Theme-specific notes: Focus rings should be visible in both themes.
- Locale-specific notes: None.

### S01-56: prefers-reduced-motion behavior
- Action: Enable `prefers-reduced-motion: reduce` in browser, reload page
- Target: All ScrollReveal elements
- Expected Result: All content appears immediately (no animation). ScrollReveal component checks `window.matchMedia('(prefers-reduced-motion: reduce)')` and sets visible=true immediately.
- Screenshot: `56-reduced-motion.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

---

## S02 -- Login/Register Page (`/login`)

### S02-01: Initial page load (login mode)
- Action: navigate to `/login`
- Target: `[data-testid="login-page"]`
- Expected Result: Page renders with: back link ("홈으로"), brand header ("TeamMeet", "같이 운동할 사람, 찾고 계셨죠?"), tab bar (로그인 active, 회원가입 inactive), email form (이메일, 비밀번호 fields), submit button ("로그인"), social login buttons (if configured), "로그인 없이 둘러보기" link, dev login panel (dev mode only).
- Screenshot: `01-login-initial.png`
- Viewport-specific notes: Layout is single-column centered (`max-w-sm mx-auto`) on all viewports. No mobile/desktop layout difference.
- Theme-specific notes: `bg-white` / `bg-gray-900`. Text `text-gray-900` / `text-white`.
- Locale-specific notes: All text Korean.

### S02-02: "홈으로" back link -- default
- Action: observe back link
- Target: `a[href="/home"][aria-label="홈으로 돌아가기"]`
- Expected Result: Left arrow SVG + "홈으로" text. `text-gray-500`, `min-h-[44px]`, `min-w-11`. `aria-label="홈으로 돌아가기"`.
- Screenshot: `02-back-link-default.png`
- Viewport-specific notes: None.
- Theme-specific notes: `text-gray-500` / `text-gray-400`.
- Locale-specific notes: None.

### S02-03: "홈으로" back link -- hover
- Action: hover over back link
- Target: `a[href="/home"][aria-label="홈으로 돌아가기"]`
- Expected Result: Text changes to `text-gray-700` (light) / `text-gray-200` (dark). Transition-colors.
- Screenshot: `03-back-link-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover text.
- Locale-specific notes: None.

### S02-04: Login tab -- active state
- Action: observe login tab (default active)
- Target: `[data-testid="auth-tab-login"]`
- Expected Result: Bottom border `border-gray-900` (light) / `border-white` (dark), text `text-gray-900` / `text-white`. `border-b-2`.
- Screenshot: `04-login-tab-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different border/text colors.
- Locale-specific notes: None.

### S02-05: Register tab -- inactive state
- Action: observe register tab
- Target: `[data-testid="auth-tab-register"]`
- Expected Result: `border-transparent`, text `text-gray-400`.
- Screenshot: `05-register-tab-inactive.png`
- Viewport-specific notes: None.
- Theme-specific notes: Gray-400 in both.
- Locale-specific notes: None.

### S02-06: Register tab -- hover
- Action: hover over register tab
- Target: `[data-testid="auth-tab-register"]`
- Expected Result: Text changes to `text-gray-600`. Transition-colors.
- Screenshot: `06-register-tab-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-07: Register tab -- click (switch to register mode)
- Action: click register tab
- Target: `[data-testid="auth-tab-register"]`
- Expected Result: Register tab becomes active (bottom border, dark text). Login tab becomes inactive. Nickname field appears below password. Submit button text changes to "가입하기". Social login buttons remain.
- Screenshot: `07-register-mode.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same border/text patterns as login active.
- Locale-specific notes: None.

### S02-08: Switch back to login tab
- Action: click login tab
- Target: `[data-testid="auth-tab-login"]`
- Expected Result: Login tab active again. Nickname field disappears. Button text "로그인".
- Screenshot: `08-login-mode-again.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-09: Email input -- empty default state
- Action: observe email input
- Target: `#login-email`
- Expected Result: Placeholder "이메일". Input has label "이메일 주소" via FormField. Style: `rounded-xl border-gray-200 bg-gray-50 px-4 py-3 text-sm` (light) / `border-gray-700 bg-gray-800` (dark). Placeholder `text-gray-400` / `text-gray-500`.
- Screenshot: `09-email-empty.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different bg, border, placeholder colors.
- Locale-specific notes: None.

### S02-10: Email input -- focus
- Action: click/tab into email input
- Target: `#login-email`
- Expected Result: Border changes to `border-blue-500`, background to `bg-white` (light) / `bg-gray-900` (dark), focus ring `ring-4 ring-blue-500/10`. Transition.
- Screenshot: `10-email-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different focused bg.
- Locale-specific notes: None.

### S02-11: Email input -- type valid email
- Action: type "test@example.com" into email field
- Target: `#login-email`
- Expected Result: Text appears in input. Text color `text-gray-900` (light) / `text-gray-100` (dark). No inline validation (form uses `noValidate`, validation only on submit via toast).
- Screenshot: `11-email-valid.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different text colors.
- Locale-specific notes: None.

### S02-12: Email input -- blur after valid input
- Action: Tab away from email input
- Target: `#login-email`
- Expected Result: Input returns to unfocused style (gray border, gray bg). Value remains. No error shown (no inline validation).
- Screenshot: `12-email-blur-valid.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-13: Password input -- focus
- Action: click/tab into password input
- Target: `#login-password`
- Expected Result: Same focus style as email (blue border, ring). Placeholder "비밀번호 (6자 이상)". Label "비밀번호".
- Screenshot: `13-password-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same pattern.
- Locale-specific notes: None.

### S02-14: Password input -- type short password
- Action: type "abc" (< 6 chars)
- Target: `#login-password`
- Expected Result: Dots appear (type="password"). No inline error -- validation only on submit.
- Screenshot: `14-password-short.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-15: Submit with short password -- toast error
- Action: click submit button (or press Enter)
- Target: `[data-testid="auth-submit"]`
- Expected Result: Toast appears with error: "비밀번호는 6자 이상이어야 해요". Button does not enter loading state.
- Screenshot: `15-password-short-toast.png`
- Viewport-specific notes: Toast position may vary.
- Theme-specific notes: Toast styling per theme.
- Locale-specific notes: None.

### S02-16: Submit with empty email and password -- toast error
- Action: clear fields, click submit
- Target: `[data-testid="auth-submit"]`
- Expected Result: Toast: "이메일과 비밀번호를 입력해주세요".
- Screenshot: `16-empty-submit-toast.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-17: Submit button -- default state
- Action: observe submit button with form empty
- Target: `[data-testid="auth-submit"]`
- Expected Result: Button text "로그인". Styled as primary Button variant: `bg-blue-500 text-white`, `min-h-[48px]` (lg size), `rounded-2xl`, `font-bold`, full width. Button is NOT disabled when empty (no client-side disabled logic based on field content -- validation happens on submit).
- Screenshot: `17-submit-default.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same blue button.
- Locale-specific notes: None.

### S02-18: Submit button -- hover
- Action: hover over submit button
- Target: `[data-testid="auth-submit"]`
- Expected Result: `hover:bg-blue-600`. Transition 150ms.
- Screenshot: `18-submit-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-19: Submit button -- focus ring
- Action: Tab to submit button
- Target: `[data-testid="auth-submit"]`
- Expected Result: `focus-visible:ring-2 focus-visible:ring-blue-500/40`.
- Screenshot: `19-submit-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-20: Submit button -- loading state
- Action: fill valid email + password (6+ chars), click submit (mock API to delay response)
- Target: `[data-testid="auth-submit"]`
- Expected Result: Button text changes to "로그인 중...". Button becomes `disabled` (opacity-50, pointer-events-none).
- Screenshot: `20-submit-loading.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-21: Failed login -- error toast
- Action: submit with invalid credentials (API returns error)
- Target: Toast component
- Expected Result: Toast appears with error message: "로그인에 실패했어요" (fallback) or server-provided message via `extractErrorMessage`.
- Screenshot: `21-login-error-toast.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-22: Kakao login button -- default
- Action: observe Kakao login button
- Target: `a[aria-label="카카오 계정으로 로그인"]`
- Expected Result: Yellow background `bg-[#FEE500]`, dark text `text-[#191919]`, Kakao icon SVG, text "카카오로 시작하기". `min-h-[44px]`, `rounded-xl`. `aria-label` set. Note: Button only renders if `NEXT_PUBLIC_KAKAO_CLIENT_ID` and `NEXT_PUBLIC_KAKAO_REDIRECT_URI` env vars are set. If not set, entire social section is hidden.
- Screenshot: `22-kakao-default.png`
- Viewport-specific notes: Full width on all viewports.
- Theme-specific notes: Kakao yellow is same in both themes.
- Locale-specific notes: None.

### S02-23: Kakao login button -- hover
- Action: hover over Kakao button
- Target: `a[aria-label="카카오 계정으로 로그인"]`
- Expected Result: `hover:brightness-95` -- slightly darker.
- Screenshot: `23-kakao-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-24: Kakao login button -- active
- Action: mousedown on Kakao button
- Target: `a[aria-label="카카오 계정으로 로그인"]`
- Expected Result: `active:scale-[0.98]`.
- Screenshot: `24-kakao-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-25: Naver login button -- default + hover + active
- Action: observe, hover, mousedown on Naver button
- Target: `a[aria-label="네이버 계정으로 로그인"]`
- Expected Result: Green background `bg-[#03C75A]`, white text, Naver icon SVG, "네이버로 시작하기". Same hover (brightness-95) and active (scale-0.98) as Kakao. `aria-label` set.
- Screenshot: `25-naver-states.png`
- Viewport-specific notes: None.
- Theme-specific notes: Naver green is same in both themes.
- Locale-specific notes: None.

### S02-26: Social login divider
- Action: observe divider between form and social buttons
- Target: Divider with "또는" text
- Expected Result: Horizontal lines with "또는" centered. Lines `bg-gray-200` / `bg-gray-700`. Both lines have `aria-hidden="true"`.
- Screenshot: `26-social-divider.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different line colors.
- Locale-specific notes: None.

### S02-27: "로그인 없이 둘러보기" link -- default
- Action: observe browse-without-login link
- Target: `[data-testid="browse-without-login"]`
- Expected Result: Text "로그인 없이 둘러보기" with right arrow icon, `text-gray-400`, `min-h-[44px]`, centered.
- Screenshot: `27-browse-link-default.png`
- Viewport-specific notes: None.
- Theme-specific notes: `text-gray-400` in both themes.
- Locale-specific notes: None.

### S02-28: "로그인 없이 둘러보기" link -- hover
- Action: hover over link
- Target: `[data-testid="browse-without-login"]`
- Expected Result: Text `text-gray-600` (light) / `text-gray-300` (dark). Transition-colors.
- Screenshot: `28-browse-link-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover colors.
- Locale-specific notes: None.

### S02-29: "로그인 없이 둘러보기" link -- click
- Action: click link
- Target: `[data-testid="browse-without-login"]`
- Expected Result: Navigation to `/home`.
- Screenshot: `29-browse-link-click.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-30: Dev login panel -- layout (navigate back to `/login`)
- Action: observe dev login panel at bottom
- Target: `[data-testid="dev-login-panel"]`
- Expected Result: Only visible in non-production (`process.env.NODE_ENV !== 'production'`). Gray background `bg-gray-50` / `bg-gray-800`. "개발 모드" label. Text input + "입장" button row. 3 quick persona chips below: "축구왕민수", "농구러버지영", "하키마스터준호".
- Screenshot: `30-dev-panel-layout.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different bg colors.
- Locale-specific notes: None.

### S02-31: Dev login input -- focus + type
- Action: click into dev input, type "테스트유저"
- Target: `[data-testid="dev-login-input"]`
- Expected Result: Input focuses with blue border/ring. Text appears. `aria-label="테스트 닉네임"`. `bg-white` / `bg-gray-900`.
- Screenshot: `31-dev-input-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different bg on input.
- Locale-specific notes: None.

### S02-32: Dev login input -- Enter key submit
- Action: press Enter while dev input is focused
- Target: `[data-testid="dev-login-input"]`
- Expected Result: Triggers `handleDevLogin()`. If successful, navigates to `/home` (or `redirectTo`).
- Screenshot: `32-dev-input-enter.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-33: Dev login "입장" button -- hover + click
- Action: hover, then click "입장" button
- Target: `[data-testid="dev-login-submit"]`
- Expected Result: Secondary variant Button: `bg-gray-900 text-white` (light) / `bg-white text-gray-900` (dark). Hover: `bg-gray-800` / `bg-gray-100`. Click triggers dev login.
- Screenshot: `33-dev-submit-hover-click.png`
- Viewport-specific notes: None.
- Theme-specific notes: Inverted colors in dark mode.
- Locale-specific notes: None.

### S02-34: Dev persona chip "축구왕민수" -- hover + click
- Action: hover, then click "축구왕민수" chip
- Target: Quick persona button "축구왕민수"
- Expected Result: Hover: `bg-gray-100` (light). `rounded-full`, `text-xs`. Click: triggers `handleDevLogin('축구왕민수')` -- navigates to home.
- Screenshot: `34-dev-persona-soccer.png`
- Viewport-specific notes: None.
- Theme-specific notes: Chip `bg-white` / `bg-gray-700`, border `border-gray-200` / `border-gray-600`.
- Locale-specific notes: None.

### S02-35: Dev persona chip "농구러버지영" -- hover + click
- Action: hover, then click "농구러버지영"
- Target: Quick persona button "농구러버지영"
- Expected Result: Same pattern as S02-34. Triggers dev login with this name.
- Screenshot: `35-dev-persona-basketball.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same as S02-34.
- Locale-specific notes: None.

### S02-36: Dev persona chip "하키마스터준호" -- hover + click
- Action: hover, then click "하키마스터준호"
- Target: Quick persona button "하키마스터준호"
- Expected Result: Same pattern. Triggers dev login.
- Screenshot: `36-dev-persona-hockey.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same.
- Locale-specific notes: None.

### S02-37: Register mode -- nickname field appears
- Action: click register tab, observe nickname field
- Target: `#login-nickname`
- Expected Result: New FormField "닉네임" appears with Input. Placeholder "닉네임". Same input styling.
- Screenshot: `37-register-nickname-field.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same input theme as email/password.
- Locale-specific notes: None.

### S02-38: Register mode -- submit without nickname
- Action: fill email + password, leave nickname empty, click submit
- Target: `[data-testid="auth-submit"]`
- Expected Result: Toast error: "닉네임을 입력해주세요".
- Screenshot: `38-register-no-nickname-toast.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-39: Register mode -- submit button text
- Action: observe submit button in register mode
- Target: `[data-testid="auth-submit"]`
- Expected Result: Button text "가입하기". Loading state text: "가입 중...".
- Screenshot: `39-register-submit-text.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-40: Register mode -- successful registration
- Action: fill all fields valid, submit (mock API success)
- Target: Toast + navigation
- Expected Result: Toast success: "가입 완료! 환영합니다". Navigates to `redirectTo` (default `/home`).
- Screenshot: `40-register-success.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-41: Register mode -- failed registration
- Action: submit with duplicate email (mock API error)
- Target: Toast
- Expected Result: Toast error: "가입에 실패했어요" (fallback) or server message.
- Screenshot: `41-register-error-toast.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-42: Redirect preservation
- Action: navigate to `/login?redirect=/profile`
- Target: Page behavior after successful login
- Expected Result: After successful login (via any method), user is redirected to `/profile` instead of default `/home`. The `sanitizeRedirect` function strips dangerous values: absolute URLs, `//`, `javascript:`, etc. all fallback to `/home`.
- Screenshot: `42-redirect-preserved.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-43: Redirect sanitization -- malicious input
- Action: navigate to `/login?redirect=https://evil.com`
- Target: `sanitizeRedirect` output
- Expected Result: Redirect value sanitized to `/home`. After login, user goes to `/home`, not the external URL.
- Screenshot: `43-redirect-sanitized.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-44: Already authenticated redirect
- Action: visit `/login` while already authenticated (auth store has token)
- Target: useEffect redirect
- Expected Result: Immediately redirects to `/home` via `router.replace('/home')`.
- Screenshot: `44-already-authed.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S02-45: Full keyboard tab navigation
- Action: Tab through all elements on login page
- Target: All focusable elements
- Expected Result: Tab order: back link > login tab > register tab > email input > password input > submit button > kakao button (if present) > naver button (if present) > browse-without-login link > dev input > dev submit button > persona chips (3). Each shows focus indicator.
- Screenshot: `45-tab-navigation.png`
- Viewport-specific notes: None.
- Theme-specific notes: Focus rings visible in both themes.
- Locale-specific notes: None.

### S02-46: FormField label-input association
- Action: inspect label-input associations
- Target: All FormField components
- Expected Result: `<label htmlFor="login-email">` linked to `<input id="login-email">`. Same for `login-password` and `login-nickname`. Clicking label focuses input.
- Screenshot: `46-label-association.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

---

## S03 -- Onboarding Flow (`/onboarding`)

### S03-01: Initial load (step 1 -- sport selection)
- Action: navigate to `/onboarding`
- Target: Onboarding page (fixed fullscreen overlay z-60)
- Expected Result: Full-screen white/dark overlay. Header: step indicator dots (2 dots, first active), "건너뛰기" button, X close button. Title: "무슨 운동을 좋아하세요?". Subtitle: "관심 종목을 선택하면 맞춤 매치를 추천해드려요". 9 sport chips in 3x3 grid. Bottom: "다음" button.
- Screenshot: `01-onboarding-initial.png`
- Viewport-specific notes: Max-width `max-w-md mx-auto` on all viewports. Layout identical across viewports.
- Theme-specific notes: `bg-white` / `bg-gray-900`. Dots: active = `bg-gray-900` / `bg-white`, inactive = `bg-gray-200` / `bg-gray-700`.
- Locale-specific notes: All text Korean.

### S03-02: Step indicator dots
- Action: observe step indicator
- Target: `div[aria-label="진행 단계: 1/2"]`
- Expected Result: 2 horizontal bars. Step 1 active: `w-8 bg-gray-900` (light) / `bg-white` (dark). Step 2 inactive: `w-4 bg-gray-200` / `bg-gray-700`. `h-1 rounded-full`. Transition 300ms on width and color.
- Screenshot: `02-step-indicator.png`
- Viewport-specific notes: None.
- Theme-specific notes: Active/inactive colors differ by theme.
- Locale-specific notes: None.

### S03-03: "건너뛰기" button -- hover
- Action: hover over "건너뛰기"
- Target: Skip button in header
- Expected Result: Text `text-gray-500` to `text-gray-600` (light) / `text-gray-400` (dark). `min-h-[44px]`.
- Screenshot: `03-skip-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover colors.
- Locale-specific notes: None.

### S03-04: "건너뛰기" button -- click
- Action: click "건너뛰기"
- Target: Skip button
- Expected Result: Saves `onboarding_completed=true` to localStorage, saves selected sports (if any), navigates to `/home`.
- Screenshot: `04-skip-click.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S03-05: Close (X) button -- default
- Action: observe X button
- Target: `button[aria-label="온보딩 닫기"]`
- Expected Result: SVG X icon, `min-h-[44px] min-w-11`, `text-gray-400` (light) / `text-gray-500` (dark), rounded-full.
- Screenshot: `05-close-default.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different icon colors.
- Locale-specific notes: None.

### S03-06: Close (X) button -- hover
- Action: hover over X button
- Target: `button[aria-label="온보딩 닫기"]`
- Expected Result: Text `text-gray-600` / `text-gray-300`, background `bg-gray-100` / `bg-gray-800`.
- Screenshot: `06-close-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover states.
- Locale-specific notes: None.

### S03-07: Close (X) button -- click
- Action: click X button
- Target: `button[aria-label="온보딩 닫기"]`
- Expected Result: Navigates to `/home` (no localStorage save).
- Screenshot: `07-close-click.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S03-08: Sport chip "축구" -- default state
- Action: observe unselected 축구 chip
- Target: First sport chip button
- Expected Result: Sport icon (SVG), label "축구", `rounded-2xl p-4`, `border-gray-200` / `border-gray-700`, `bg-white` / `bg-gray-900`. No checkmark. `text-gray-600` / `text-gray-400`.
- Screenshot: `08-sport-soccer-default.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different border/bg/text.
- Locale-specific notes: None.

### S03-09: Sport chip "축구" -- hover
- Action: hover over 축구 chip
- Target: First sport chip
- Expected Result: Border changes to `border-gray-300` / `border-gray-600`.
- Screenshot: `09-sport-soccer-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Slightly darker border.
- Locale-specific notes: None.

### S03-10: Sport chip "축구" -- click (select)
- Action: click 축구 chip
- Target: First sport chip
- Expected Result: Selected state: `ring-2 ring-blue-500 border-blue-500 bg-blue-50` / `bg-blue-950/20`. Text becomes `text-gray-900` / `text-white`. Checkmark badge appears at top-right (`-top-1 -right-1`, `bg-gray-900` / `bg-white` circle with white/dark check SVG). `active:scale-[0.96]` on click.
- Screenshot: `10-sport-soccer-selected.png`
- Viewport-specific notes: None.
- Theme-specific notes: Selection ring blue-500 in both. Badge circle colors inverted per theme.
- Locale-specific notes: None.

### S03-11: Sport chip "축구" -- click again (deselect)
- Action: click 축구 chip again
- Target: First sport chip
- Expected Result: Returns to default unselected state. Checkmark badge disappears. Ring and blue bg removed.
- Screenshot: `11-sport-soccer-deselected.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same as default.
- Locale-specific notes: None.

### S03-12: Sport chips -- select 풋살
- Action: click 풋살 chip
- Target: Second sport chip
- Expected Result: Same selected state pattern as 축구.
- Screenshot: `12-sport-futsal-selected.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same.
- Locale-specific notes: None.

### S03-13: Sport chips -- select 농구
- Action: click 농구 chip
- Target: Third sport chip
- Expected Result: Same selected state.
- Screenshot: `13-sport-basketball-selected.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same.
- Locale-specific notes: None.

### S03-14: Sport chips -- multi-select (3 sports simultaneously)
- Action: observe all 3 selected (축구 deselected in S03-11, then select futsal + basketball + one more)
- Target: Grid of 9 sport chips
- Expected Result: 3 chips show selected state simultaneously (ring, blue bg, checkmark). Others remain default.
- Screenshot: `14-multi-select.png`
- Viewport-specific notes: None.
- Theme-specific notes: Blue-50 vs blue-950/20 backgrounds.
- Locale-specific notes: None.

### S03-15: Sport chips -- remaining 6 sports hover + select
- Action: hover and click each remaining sport: 배드민턴, 테니스, 아이스하키, 수영, 야구, 배구
- Target: Each sport chip
- Expected Result: Each shows same hover/select pattern. Sport icons render correctly via `SportIconMap`. Icon has `aria-hidden="true"`.
- Screenshot: `15-sport-{name}-select.png` (6 screenshots)
- Viewport-specific notes: None.
- Theme-specific notes: Same pattern.
- Locale-specific notes: None.

### S03-16: "다음" button -- no sport selected
- Action: deselect all sports, observe "다음" button
- Target: Bottom "다음" button
- Expected Result: Button text: "다음". Not disabled (no disabled prop). `bg-gray-900` / `bg-white`, `text-white` / `text-gray-900`. `rounded-xl`, `py-3.5`, full width. Note: button is NOT disabled when no sport selected -- the flow allows skipping sport selection.
- Screenshot: `16-next-no-selection.png`
- Viewport-specific notes: None.
- Theme-specific notes: Inverted colors per theme.
- Locale-specific notes: None.

### S03-17: "다음" button -- with sports selected
- Action: select 축구 and 농구, observe button
- Target: "다음" button
- Expected Result: Button text changes to "축구, 농구 선택 완료" (dynamically generated from `sportLabel` mapping).
- Screenshot: `17-next-with-selection.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same color scheme.
- Locale-specific notes: None.

### S03-18: "다음" button -- hover
- Action: hover over "다음" button
- Target: "다음" button
- Expected Result: `hover:bg-gray-800` (light) / `hover:bg-gray-100` (dark).
- Screenshot: `18-next-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover colors.
- Locale-specific notes: None.

### S03-19: "다음" button -- active
- Action: mousedown on button
- Target: "다음" button
- Expected Result: `active:scale-[0.98]`.
- Screenshot: `19-next-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S03-20: "다음" button -- click (transition to step 2)
- Action: click "다음" button
- Target: Page content
- Expected Result: Step 1 content replaced by step 2. Step indicator: first dot becomes inactive (`w-4`), second becomes active (`w-8`). Transition on dots: 300ms width + background-color. Header changes: X button disappears, only "건너뛰기" remains.
- Screenshot: `20-step2-transition.png`
- Viewport-specific notes: None.
- Theme-specific notes: Dot colors change.
- Locale-specific notes: None.

### S03-21: Step 2 -- features display
- Action: observe step 2 content
- Target: Features section
- Expected Result: Title: "TeamMeet은 이런 걸 해줘요". Subtitle: dynamic based on selected sports (e.g., "축구, 농구 매치를 바로 찾아볼 수 있어요") or fallback "운동 파트너를 찾는 가장 빠른 방법". 3 feature cards with colored borders/backgrounds and dot indicators: blue (AI matching), emerald (trust), amber (all-in-one).
- Screenshot: `21-step2-features.png`
- Viewport-specific notes: None.
- Theme-specific notes: Feature card colors: `bg-blue-50` / `bg-blue-900/20` etc. Dot colors same in both themes.
- Locale-specific notes: None.

### S03-22: Step 2 -- "시작하기" button -- hover + click
- Action: hover, then click "시작하기"
- Target: Blue CTA button at bottom
- Expected Result: `bg-blue-500`, `hover:bg-blue-600`, `active:scale-[0.98]`. Click: saves to localStorage (onboarding_completed + preferred_sports), navigates to `/home`.
- Screenshot: `22-step2-start-hover-click.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same blue button.
- Locale-specific notes: None.

### S03-23: Step 2 -- "종목 다시 선택" back button
- Action: observe, then click "종목 다시 선택"
- Target: Text button below "시작하기"
- Expected Result: Text `text-gray-500`, `hover:text-gray-600` / `hover:text-gray-400`. Click: returns to step 1 (sport selection), previous selections preserved. Step indicator reverts.
- Screenshot: `23-step2-back.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover colors.
- Locale-specific notes: None.

### S03-24: Tab navigation through all elements
- Action: Tab through all elements in step 1, then step 2
- Target: All interactive elements
- Expected Result: Step 1 tab order: 건너뛰기 > X close > 9 sport chips > 다음 button. Step 2 tab order: 건너뛰기 > 시작하기 > 종목 다시 선택. Each shows focus indicator.
- Screenshot: `24-tab-navigation.png`
- Viewport-specific notes: None.
- Theme-specific notes: Focus visible.
- Locale-specific notes: None.

---

## S04 -- Public Info Pages

### S04-A: About Page (`/about`)

#### S04-A-01: Initial load
- Action: navigate to `/about`
- Target: Full page
- Expected Result: LandingNav + Hero ("TeamMeet을 만든 이유") + Mission card + Problems section (asymmetric grid: 1 large + 2 small) + Approaches section (numbered cards) + Stats/Values section + Team section (4 members, 2x2 grid) + Bottom CTA + LandingFooter.
- Screenshot: `A-01-about-initial.png`
- Viewport-specific notes: Problems grid: mobile stacked, md+ `grid-cols-5` (3+2). Team grid: mobile stacked, sm+ `grid-cols-2`. Stats/Values: mobile stacked, lg+ `grid-cols-2`.
- Theme-specific notes: Standard light/dark patterns.
- Locale-specific notes: None.

#### S04-A-02: Approach cards hover (3 cards)
- Action: hover over each of 3 approach cards
- Target: Cards in "이렇게 해결합니다" section
- Expected Result: Background `bg-white` to `bg-gray-50` / `bg-gray-800` to `bg-gray-750`. Transition 300ms. Each has numbered prefix (01, 02, 03), icon, title with stat badge, description.
- Screenshot: `A-02-approach-hover.png`
- Viewport-specific notes: Mobile stacked, sm+ side-by-side layout within card.
- Theme-specific notes: Different hover backgrounds.
- Locale-specific notes: None.

#### S04-A-03: Team member cards
- Action: observe 4 team member cards
- Target: Team section cards
- Expected Result: Each card: colored initial avatar (J blue, K emerald, P amber, L purple), name, role, bio. `rounded-2xl`, border.
- Screenshot: `A-03-team-cards.png`
- Viewport-specific notes: Mobile stacked. Sm+ 2x2 grid.
- Theme-specific notes: Standard card themes.
- Locale-specific notes: None.

#### S04-A-04: Bottom CTA -- "지금 시작하기" + "서비스 둘러보기"
- Action: hover over both CTA buttons
- Target: Two buttons in dark CTA section
- Expected Result: Primary: `bg-blue-500` hover `bg-blue-400`. Secondary: `text-gray-400` hover `text-white` + `bg-white/5`. Both have `active:scale-[0.97]` and focus-visible outline.
- Screenshot: `A-04-about-cta.png`
- Viewport-specific notes: Mobile -- stacked. Sm+ -- inline.
- Theme-specific notes: Section always dark.
- Locale-specific notes: None.

#### S04-A-05: ScrollReveal animations on scroll
- Action: scroll through entire page
- Target: All ScrollReveal-wrapped sections
- Expected Result: Each section fades in with slide-up as it enters viewport (threshold 0.15, rootMargin -40px). Staggered delays on card grids.
- Screenshot: `A-05-scroll-reveal.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S04-B: FAQ Page (`/faq`)

#### S04-B-01: Initial load
- Action: navigate to `/faq`
- Target: Full page
- Expected Result: LandingNav + Hero ("자주 묻는 질문") + Category tabs (전체, 서비스, 매칭, 결제, 계정) + Accordion container with 18 FAQ items (all collapsed) + Contact CTA card + LandingFooter.
- Screenshot: `B-01-faq-initial.png`
- Viewport-specific notes: Category tabs: mobile horizontal scroll. Sm+ centered. Accordion full width.
- Theme-specific notes: Standard themes.
- Locale-specific notes: None.

#### S04-B-02: Category tab "전체" -- active state
- Action: observe default active tab
- Target: "전체" button
- Expected Result: `bg-blue-500 text-white`, `rounded-xl`, `px-5 py-2.5`.
- Screenshot: `B-02-tab-all-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: Blue-500 same in both.
- Locale-specific notes: None.

#### S04-B-03: Category tab "서비스" -- hover
- Action: hover over "서비스" tab
- Target: "서비스" button
- Expected Result: `bg-gray-200` / `bg-gray-700`, text `text-gray-700` / `text-gray-300`. Inactive style with hover.
- Screenshot: `B-03-tab-service-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different hover bg/text.
- Locale-specific notes: None.

#### S04-B-04: Category tab "서비스" -- click
- Action: click "서비스" tab
- Target: "서비스" button
- Expected Result: Tab becomes active (blue bg). "전체" becomes inactive. FAQ list filters to 4 service items. `openIndex` resets to null.
- Screenshot: `B-04-tab-service-active.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-05: Category tab "매칭" -- click
- Action: click "매칭" tab
- Target: "매칭" button
- Expected Result: Filters to 6 matching-related FAQs.
- Screenshot: `B-05-tab-matching.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-06: Category tab "결제" -- click
- Action: click "결제" tab
- Target: "결제" button
- Expected Result: Filters to 4 payment FAQs.
- Screenshot: `B-06-tab-payment.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-07: Category tab "계정" -- click
- Action: click "계정" tab
- Target: "계정" button
- Expected Result: Filters to 4 account FAQs.
- Screenshot: `B-07-tab-account.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-08: Category tab -- focus ring
- Action: Tab to category tab
- Target: Any category tab button
- Expected Result: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400`.
- Screenshot: `B-08-tab-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: Blue outline.
- Locale-specific notes: None.

#### S04-B-09: Category tab -- active press
- Action: mousedown on tab
- Target: Any category tab button
- Expected Result: `active:scale-[0.97]`.
- Screenshot: `B-09-tab-active-press.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-10: FAQ item -- hover (question text)
- Action: hover over first FAQ question
- Target: AccordionItem button
- Expected Result: Question text gains `text-blue-500` via `group-hover` transition. Category badge visible (`text-blue-500 bg-blue-50` / `bg-blue-900/30`).
- Screenshot: `B-10-faq-item-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Badge bg differs.
- Locale-specific notes: None.

#### S04-B-11: FAQ item -- click to expand (first item)
- Action: click first FAQ item
- Target: AccordionItem button
- Expected Result: Answer panel expands with CSS grid transition (`grid-template-rows: 0fr to 1fr`, opacity 0 to 1, duration 300ms). ChevronDown rotates 180deg (`rotate-180`, becomes `text-blue-500`). `aria-expanded="true"`. Panel has `role="region"` and `aria-labelledby`.
- Screenshot: `B-11-faq-expand.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-12: FAQ item -- click to collapse (same item)
- Action: click same FAQ item again
- Target: AccordionItem button
- Expected Result: Answer panel collapses (grid-template-rows: 1fr to 0fr, opacity to 0). ChevronDown rotates back. `aria-expanded="false"`.
- Screenshot: `B-12-faq-collapse.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-13: FAQ accordion behavior -- only one open at a time
- Action: expand first item, then click second item
- Target: Two AccordionItem buttons
- Expected Result: First item collapses, second expands. State managed by single `openIndex` -- only one item open at a time.
- Screenshot: `B-13-faq-accordion.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-14: FAQ item -- focus ring
- Action: Tab to FAQ question button
- Target: AccordionItem button
- Expected Result: `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 rounded-lg`.
- Screenshot: `B-14-faq-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-B-15: Contact CTA card
- Action: scroll to contact section
- Target: "더 궁금한 점이 있나요?" card
- Expected Result: Card with email icon, heading, description, "이메일 문의하기" button (links to `mailto:support@teammeet.kr`), email address text.
- Screenshot: `B-15-contact-cta.png`
- Viewport-specific notes: None.
- Theme-specific notes: Card `bg-gray-50` / `bg-gray-800/50`, border.
- Locale-specific notes: None.

#### S04-B-16: Contact CTA "이메일 문의하기" button -- hover + focus
- Action: hover, then Tab to "이메일 문의하기"
- Target: `a[href="mailto:support@teammeet.kr"]`
- Expected Result: Hover: `bg-blue-600`. Focus: `outline-2 outline-offset-2 outline-blue-400`. Active: `scale-[0.97]`.
- Screenshot: `B-16-contact-btn-hover.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same blue button.
- Locale-specific notes: None.

### S04-C: Guide Page (`/guide`)

#### S04-C-01: Initial load
- Action: navigate to `/guide`
- Target: Full page
- Expected Result: LandingNav + Hero ("이용 가이드") + 6-step tutorial section (cards with mock UI previews, alternating layout on desktop) + Team matching guide (6 feature cards + flow summary) + Mercenary/Marketplace section (2-column split) + Bottom CTA + LandingFooter.
- Screenshot: `C-01-guide-initial.png`
- Viewport-specific notes: Tutorial cards: mobile stacked (text above, mock UI below). Desktop alternating direction (`lg:flex-row-reverse` for even indices). Feature cards: mobile 1-col, sm 2-col, lg 3-col.
- Theme-specific notes: Standard themes. Mock UI previews have colored backgrounds.
- Locale-specific notes: None.

#### S04-C-02: Tutorial step cards -- layout + ScrollReveal
- Action: scroll through 6 step cards
- Target: Step cards 1-6
- Expected Result: Each card fades in with staggered delay. Each contains: numbered blue circle, icon, title/subtitle, description, detail checklist (CheckCircle2 icons), mock UI preview panel (colored bg, progress bar showing step/6).
- Screenshot: `C-02-tutorial-steps.png`
- Viewport-specific notes: Desktop: odd cards text-left/mock-right, even cards reversed.
- Theme-specific notes: Mock UI: `bg-blue-50` / `bg-blue-900/20`. Inner items `bg-white` / `bg-gray-800`.
- Locale-specific notes: None.

#### S04-C-03: Team matching feature cards hover
- Action: hover over each of 6 team feature cards
- Target: Cards in "팀 매칭 이용법" section
- Expected Result: Each card: background `bg-white` to `bg-gray-50` / `bg-gray-800` to `bg-gray-750`. Transition 300ms. Icons in blue-50/blue-900 bg.
- Screenshot: `C-03-team-cards-hover.png`
- Viewport-specific notes: Mobile 1-col, sm 2-col, lg 3-col.
- Theme-specific notes: Different hover backgrounds.
- Locale-specific notes: None.

#### S04-C-04: Team matching flow summary
- Action: observe flow summary box
- Target: Blue flow summary card at bottom of team section
- Expected Result: 6 step pills ("팀 등록" > "매치 생성" > ... > "상호 평가") connected by ArrowRight icons. Pills have blue border.
- Screenshot: `C-04-team-flow-summary.png`
- Viewport-specific notes: Pills wrap on mobile.
- Theme-specific notes: `bg-blue-50` / `bg-blue-900/20` container.
- Locale-specific notes: None.

#### S04-C-05: Mercenary/Marketplace split section
- Action: scroll to "용병 & 장터" section
- Target: Two-column split (용병 시스템 + 장터)
- Expected Result: Two cards side by side on desktop, stacked on mobile. Each has blue header bar, feature items with icons, tag chips at bottom.
- Screenshot: `C-05-mercenary-marketplace.png`
- Viewport-specific notes: Mobile stacked. Lg+ 2-col (`lg:grid-cols-2`).
- Theme-specific notes: Blue-500 headers same. Card body themes differ.
- Locale-specific notes: None.

#### S04-C-06: Bottom CTA
- Action: scroll to bottom CTA
- Target: Dark CTA section
- Expected Result: "이제 직접 경험해보세요" heading, "지금 시작하기" button. Same dark section pattern as other pages.
- Screenshot: `C-06-guide-bottom-cta.png`
- Viewport-specific notes: None.
- Theme-specific notes: Dark section.
- Locale-specific notes: None.

### S04-D: Pricing Page (`/pricing`)

#### S04-D-01: Initial load
- Action: navigate to `/pricing`
- Target: Full page
- Expected Result: LandingNav + Hero ("요금 안내") + 3 pricing cards (무료, 프로, 팀) + Match fee section + Pricing FAQ accordion (6 items) + Bottom CTA + LandingFooter.
- Screenshot: `D-01-pricing-initial.png`
- Viewport-specific notes: Pricing cards: mobile stacked, md+ 3-col. Fee section: 3 stat items mobile stacked, sm+ inline.
- Theme-specific notes: Standard themes.
- Locale-specific notes: None.

#### S04-D-02: Pricing card -- "무료" plan
- Action: observe free plan card
- Target: First pricing card
- Expected Result: Gray icon (Sparkles), name "무료", price "0원", description, 5 feature items with gray checkmarks, CTA button "무료로 시작하기" (`bg-gray-900` / inverted dark). No recommended badge.
- Screenshot: `D-02-plan-free.png`
- Viewport-specific notes: None.
- Theme-specific notes: Button inverts per theme.
- Locale-specific notes: None.

#### S04-D-03: Pricing card -- "프로" plan (recommended)
- Action: observe pro plan card
- Target: Second pricing card
- Expected Result: Blue icon (Zap), name "프로", price "9,900원/월", "추천" badge floating at top (`-top-3.5`), border `border-blue-500 ring-2 ring-blue-500`. 6 features with blue checkmarks. CTA "프로 시작하기" (`bg-blue-500`).
- Screenshot: `D-03-plan-pro.png`
- Viewport-specific notes: None.
- Theme-specific notes: Blue ring/border same in both themes. Badge `bg-blue-500` with Sparkles icon.
- Locale-specific notes: None.

#### S04-D-04: Pricing card -- "팀" plan
- Action: observe team plan card
- Target: Third pricing card
- Expected Result: Violet icon (Users), name "팀", price "19,900원/월", 6 features. CTA "팀 시작하기" (gray/inverted button).
- Screenshot: `D-04-plan-team.png`
- Viewport-specific notes: None.
- Theme-specific notes: Same pattern as free plan button.
- Locale-specific notes: None.

#### S04-D-05: Pricing card CTA buttons -- hover + focus + active
- Action: hover, Tab focus, mousedown on each of 3 CTA buttons
- Target: 3 plan CTA links
- Expected Result: Free/Team: `hover:bg-gray-800` / `hover:bg-gray-100`. Pro: `hover:bg-blue-600`. Focus: `outline-2 outline-offset-2 outline-blue-400`. Active: `scale-[0.97]`. All link to `/login`.
- Screenshot: `D-05-plan-cta-states.png`
- Viewport-specific notes: None.
- Theme-specific notes: Free/Team button inverts per theme.
- Locale-specific notes: None.

#### S04-D-06: Match fee section
- Action: scroll to "개별 매치 참가비 안내"
- Target: Fee info card
- Expected Result: 3 stats (참가비 범위: 5,000~30,000원, 설정 주체: 호스트, 플랫폼 수수료: 10% in blue). 4 bullet points with blue checkmarks below divider.
- Screenshot: `D-06-match-fee.png`
- Viewport-specific notes: Stats: mobile stacked, sm+ 3-col. Text below always full width.
- Theme-specific notes: Card `bg-white` / `bg-gray-800`, shadow in light only.
- Locale-specific notes: None.

#### S04-D-07: Pricing FAQ -- expand/collapse
- Action: click first pricing FAQ, then second
- Target: PricingFaq accordion items
- Expected Result: First item: border changes to `border-blue-200` / `border-blue-800` when open. Content expands (`max-h-[300px]` with opacity transition). ChevronDown rotates 180deg. Click second: first collapses (max-h-0, opacity-0), second expands. `aria-expanded` toggles. Panel has `role="region"` + `aria-labelledby`.
- Screenshot: `D-07-pricing-faq.png`
- Viewport-specific notes: None.
- Theme-specific notes: Open border color differs.
- Locale-specific notes: None.

#### S04-D-08: Pricing FAQ -- all 6 items expand/collapse cycle
- Action: click each of 6 FAQ items sequentially
- Target: All PricingFaq items
- Expected Result: Each item expands/collapses correctly. Only one open at a time (state `openFaq` is single index).
- Screenshot: `D-08-pricing-faq-all.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

#### S04-D-09: Pricing FAQ -- focus ring on buttons
- Action: Tab through FAQ buttons
- Target: PricingFaq accordion buttons
- Expected Result: `focus-visible:outline-2 outline-offset-2 outline-blue-400 rounded-2xl`.
- Screenshot: `D-09-pricing-faq-focus.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

---

## S05 -- OAuth Callback Pages

### S05-01: Kakao callback -- loading state (`/callback/kakao?code=validcode`)
- Action: navigate to `/callback/kakao?code=testcode`
- Target: KakaoCallbackPage
- Expected Result: Centered spinner (10x10 circle, `animate-spin`, `border-4 border-gray-200 border-t-blue-500`) + "로그인 중..." text. Spinner has `role="status"` and `aria-label="로그인 처리 중"`. Full-height `min-h-dvh`.
- Screenshot: `01-kakao-loading.png`
- Viewport-specific notes: Centered on all viewports.
- Theme-specific notes: `bg-white` / `bg-gray-900`. Spinner border `border-gray-200` / same. Text `text-gray-500` / `text-gray-400`.
- Locale-specific notes: None.

### S05-02: Kakao callback -- error state (no code param)
- Action: navigate to `/callback/kakao` (no code) or `/callback/kakao?error=access_denied`
- Target: Error display
- Expected Result: Error message centered: "카카오 로그인이 취소되었거나 오류가 발생했어요." + "로그인 페이지로" button (primary variant). No spinner.
- Screenshot: `02-kakao-error.png`
- Viewport-specific notes: Centered on all viewports.
- Theme-specific notes: Text `text-gray-700` / `text-gray-300`. Button primary blue.
- Locale-specific notes: None.

### S05-03: Kakao callback -- error button hover + click
- Action: hover, then click "로그인 페이지로" button
- Target: Button in error state
- Expected Result: Hover: `bg-blue-600`. Click: `router.replace('/login')`.
- Screenshot: `03-kakao-error-btn.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-04: Kakao callback -- API error (code present but server rejects)
- Action: navigate with code that triggers server error (mock API failure)
- Target: Error display
- Expected Result: Error message: "카카오 로그인에 실패했어요. 다시 시도해 주세요." + "로그인 페이지로" button.
- Screenshot: `04-kakao-api-error.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-05: Kakao callback -- success redirect
- Action: navigate with valid code (mock API success)
- Target: Router redirect
- Expected Result: Spinner shown briefly, then `router.replace('/home')`. Auth store updated with tokens + user.
- Screenshot: `05-kakao-success.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-06: Naver callback -- loading state (`/callback/naver?code=validcode&state=xxx`)
- Action: navigate to `/callback/naver?code=testcode&state=validstate` (with matching sessionStorage)
- Target: NaverCallbackPage
- Expected Result: Same spinner + "로그인 중..." as Kakao. Same `role="status"` and `aria-label`.
- Screenshot: `06-naver-loading.png`
- Viewport-specific notes: Same as Kakao.
- Theme-specific notes: Same.
- Locale-specific notes: None.

### S05-07: Naver callback -- error state (no code)
- Action: navigate to `/callback/naver` (no code) or with error param
- Target: Error display
- Expected Result: "네이버 로그인이 취소되었거나 오류가 발생했어요." + "로그인 페이지로" button.
- Screenshot: `07-naver-error.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-08: Naver callback -- CSRF state mismatch
- Action: navigate with code but mismatched state parameter
- Target: Error display
- Expected Result: "보안 검증에 실패했어요. 다시 로그인해 주세요." + "로그인 페이지로" button. sessionStorage `naverOAuthState` does not match URL `state` param.
- Screenshot: `08-naver-csrf-error.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-09: Naver callback -- API error
- Action: navigate with valid code/state but mock API failure
- Target: Error display
- Expected Result: "네이버 로그인에 실패했어요. 다시 시도해 주세요." + button.
- Screenshot: `09-naver-api-error.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-10: Naver callback -- success redirect
- Action: navigate with valid code/state (mock API success)
- Target: Router redirect
- Expected Result: Spinner briefly, then `router.replace('/home')`. Auth store updated. sessionStorage `naverOAuthState` removed.
- Screenshot: `10-naver-success.png`
- Viewport-specific notes: None.
- Theme-specific notes: None.
- Locale-specific notes: None.

### S05-11: Callback Suspense fallback
- Action: observe initial render before Suspense resolves
- Target: Suspense fallback div
- Expected Result: Empty div with `min-h-dvh bg-white dark:bg-gray-900`. Brief flash before inner component mounts.
- Screenshot: `11-callback-suspense.png`
- Viewport-specific notes: None.
- Theme-specific notes: Different bg.
- Locale-specific notes: None.

---

## Summary

| Scenario | Steps | Screenshots per step | Total screenshots |
|----------|-------|---------------------|-------------------|
| S01 -- Landing Page | 56 (+ 11 sport chip hover variants) | 12 | ~804 |
| S02 -- Login/Register | 46 | 12 | 552 |
| S03 -- Onboarding Flow | 24 (+ 6 sport variants) | 12 | ~360 |
| S04-A -- About Page | 5 | 12 | 60 |
| S04-B -- FAQ Page | 16 | 12 | 192 |
| S04-C -- Guide Page | 6 | 12 | 72 |
| S04-D -- Pricing Page | 9 | 12 | 108 |
| S05 -- OAuth Callbacks | 11 | 12 | 132 |
| **Total** | **~173+** | -- | **~2,280** |

## Accessibility Checklist (Cross-cutting)

These items apply to ALL scenarios above:

- [ ] All interactive elements have min 44x44px touch target
- [ ] All `<img>` / icon-only elements have `aria-label` or `aria-hidden="true"`
- [ ] All form inputs have associated `<label htmlFor>` + `<input id>`
- [ ] All expandable sections use `aria-expanded` + `aria-controls` + `role="region"` + `aria-labelledby`
- [ ] Focus rings visible on all focusable elements (blue-400/500 outline, 2px offset)
- [ ] Tab order follows logical reading order
- [ ] Color contrast >= 4.5:1 for all text in both light and dark themes
- [ ] No information conveyed by color alone (always paired with text/icon/pattern)
- [ ] `prefers-reduced-motion: reduce` respected (ScrollReveal skips animation)
- [ ] Keyboard navigation: Tab, Shift+Tab, Enter (activates buttons/links), Escape (closes mobile menu)
