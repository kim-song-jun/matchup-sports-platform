# 61d -- UI/UX Test Scenarios: Profile, Settings, Chat, Notifications, Payments, Reviews, Badges, Feed, User Profile, My Pages

**Scope**: Part D of the exhaustive UI/UX visual QA audit  
**App**: `apps/web/` (Next.js App Router)  
**Matrix**: 12 combinations per scenario (3 viewports x 2 languages x 2 themes)

| Dimension | Values |
|-----------|--------|
| Viewport | mobile (390x844), tablet (768x1024), desktop (1440x900) |
| Language | Korean (ko), English (en) |
| Theme | Light mode, Dark mode |

---

## S32 -- Profile Page (`/profile`)

**Source**: `apps/web/src/app/(main)/profile/page.tsx`, `components/profile/edit-profile-modal.tsx`

### S32-01 Initial Load (Authenticated)

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Navigate to `/profile` as authenticated user | `useRequireAuth()` passes; `mounted` becomes `true`; profile card renders with `data-testid="profile-summary"` | -- |
| 2 | Verify MobileGlassHeader | Title from `t('profile.title')`, subtitle "기록, 일정, 알림을 한 곳에서 정리하세요." | Mobile: glass header visible; Desktop (`@3xl`): hidden, replaced by block heading |
| 3 | Verify desktop heading | Blue uppercase label "내 계정", h1 title, subtitle paragraph, Settings link with icon | Desktop only; hidden on mobile |
| 4 | Verify `animate-fade-in` on mount | Page fades in | Reduced-motion: animation disabled |

### S32-02 Profile Card

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Avatar circle | 48x48 (`h-12 w-12`) rounded-full, blue-50 bg, first character of `user.nickname` | Dark: `dark:bg-blue-900/20 dark:text-blue-300` |
| 2 | Nickname | `text-lg font-bold`, truncated if long | Dark: `dark:text-white` |
| 3 | Bio (if present) | `text-sm text-gray-500` below nickname | Only if `user.bio` is truthy |
| 4 | Manner score + match count | Star icon (filled) + score with 1 decimal, pipe separator, match count text | -- |
| 5 | Sport profiles section | For each `sportProfile`: sport icon from `SportIconMap`, sport label, level badge, ELO rating, match record | Dark mode: `dark:border-gray-700 dark:bg-gray-700/60` |
| 6 | Stats grid (3 columns) | totalMatches, mannerScore (1 decimal), sportProfiles count | `divide-x divide-gray-100` between columns |

### S32-03 Settings Gear Icon

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Default state | Mobile: icon-only button in header actions with `aria-label={tc('settings')}`, 44px min touch target | Desktop: text+icon link "설정" |
| 2 | Hover | Mobile: `hover:bg-white dark:hover:bg-gray-800`; Desktop: `hover:bg-gray-50 dark:hover:bg-gray-700` | -- |
| 3 | Focus (keyboard Tab) | Focus ring visible (blue-500 outline) | -- |
| 4 | Click | Navigate to `/settings` | -- |

### S32-04 Edit Profile (Pencil Icon + Modal)

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Pencil button default | `aria-label={t('editProfile')}`, 44x44 min, `bg-gray-50` | Dark: `dark:bg-gray-700` |
| 2 | Hover | `hover:bg-gray-100 dark:hover:bg-gray-600` | -- |
| 3 | Active (press) | `active:scale-[0.98]` transform | -- |
| 4 | Click | `showEditModal` = true, `EditProfileModal` renders (dynamic import, `ssr: false`) | -- |

#### S32-04a EditProfileModal

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Modal opens | Title "프로필 수정", 5 form fields visible, backdrop visible | `Modal` component with focus trap, ESC, backdrop close |
| 2 | Nickname input (`#profile-nickname`) -- focus | Border highlight, cursor in field | Pre-populated with `user.nickname` |
| 3 | Nickname input -- type new value | Characters appear, field updates `form.nickname` | -- |
| 4 | Nickname input -- clear to empty | Empty string in state; no inline validation shown (server-side) | -- |
| 5 | Bio textarea (`#profile-bio`) -- focus | 2 rows, `resize-none` | Pre-populated with `user.bio` |
| 6 | Bio textarea -- type long text | Content grows within 2 rows (no resize) | -- |
| 7 | Phone input (`#profile-phone`) -- focus | Placeholder "010-0000-0000" | Pre-populated if exists |
| 8 | Phone input -- type digits | Characters appear | -- |
| 9 | City input (`#profile-city`) -- focus | Placeholder "서울" | -- |
| 10 | District input (`#profile-district`) -- focus | Placeholder "마포구" | -- |
| 11 | "취소" button -- hover | `hover:bg-gray-50` | -- |
| 12 | "취소" button -- click | Modal closes, no API call, `showEditModal` = false | -- |
| 13 | "저장" button -- default | Blue bg, white text | -- |
| 14 | "저장" button -- hover | `hover:bg-blue-600` | -- |
| 15 | "저장" button -- click (success) | `isSubmitting` = true, button shows "저장 중...", `disabled:opacity-50`; API `PATCH /users/me`; success toast "프로필이 수정되었어요"; modal closes; auth store + query cache updated | -- |
| 16 | "저장" button -- click (error) | Error toast via `extractErrorMessage(err, '수정에 실패했어요...')` | Button re-enables after `finally` |
| 17 | Close via X button | Modal closes | -- |
| 18 | Close via backdrop click | Modal closes | -- |
| 19 | Close via ESC key | Modal closes | -- |
| 20 | Focus trap | Tab cycles through: nickname -> bio -> phone -> city -> district -> 취소 -> 저장 -> back to nickname | -- |

### S32-05 Upcoming Schedule

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Section heading | "다가오는 일정" + subtitle | Mobile: below profile card; Desktop: right column (340px) |
| 2 | List view tab -- default | `role="tab"`, `aria-selected="true"`, blue-50 bg, List icon | -- |
| 3 | Calendar view tab -- default | `role="tab"`, `aria-selected="false"`, gray text | -- |
| 4 | Calendar view tab -- hover | `hover:bg-gray-100 dark:hover:bg-gray-700` | -- |
| 5 | Calendar view tab -- click | `aria-selected="true"`, `MiniCalendar` renders, list tab deselects | -- |
| 6 | List view -- empty | `EmptyState` with Calendar icon, `te('noSchedule')`, `te('noScheduleDesc')`, action "매칭 찾기" -> `/matches` | -- |
| 7 | List view -- with matches | Up to 3 upcoming matches; each: month label, date number, title (truncated), time, weekday | -- |
| 8 | Match item -- hover | `hover:bg-gray-100 dark:hover:bg-gray-700` | -- |
| 9 | Match item -- active | `active:scale-[0.98]` | -- |
| 10 | Match item -- click | Navigate to `/matches/{id}` | -- |
| 11 | "매칭 찾기" link | Blue text link next to tabs | Navigate to `/matches` |

### S32-06 Chat & Notification Quick-Access

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Layout | 2-column grid with divider, rounded-2xl card | Only shown when authenticated |
| 2 | Chat link | MessageCircle icon in blue-50 square, label from `t('chatLabel')`, min-h-44px | -- |
| 3 | Chat unread badge | Red circle (`bg-red-500`) with count (capped at "99+") | Hidden when `chatUnread` <= 0 |
| 4 | Chat link -- hover | `hover:bg-gray-50 dark:hover:bg-gray-700/60` | -- |
| 5 | Chat link -- click | Navigate to `/chat` | -- |
| 6 | Notification link | Bell icon, label from `t('notificationsLabel')` | -- |
| 7 | Notification unread badge | Same styling, shows `notifUnread` | Hidden when 0 |
| 8 | Notification link -- click | Navigate to `/notifications` | -- |

### S32-07 Menu Groups (6 groups, 18+ items)

| # | Group | Items | Test Points |
|---|-------|-------|-------------|
| 1 | 매칭 | 매치 히스토리 (History icon -> `/my/matches?tab=history`), 내 매치 (Swords -> `/my/matches?tab=created`), 내 팀 매칭 (Users -> `/my/team-matches`) | Hover: `hover:bg-gray-50`; Active: `active:scale-[0.98]`; Each has ChevronRight; min-h-44px touch target |
| 2 | 팀 & 용병 | 내 팀 (Users -> `/my/teams`), 내 용병 (UserCheck -> `/my/mercenary`) + quickAction "등록" (Plus icon -> `/mercenary/new`, blue pill badge) | QuickAction only shown when authenticated |
| 3 | 강좌 & 장터 | 내 강좌 (BookOpen -> `/my/lessons`), 내 수강권 (Ticket -> `/my/lesson-tickets`), 내 판매 (ShoppingBag -> `/my/listings`) | -- |
| 4 | 평가 & 결제 | 내 평가 (Star -> `/reviews`), 받은 평가 (MessageSquare -> `/my/reviews-received`), 결제 내역 (CreditCard -> `/payments`) | -- |
| 5 | 활동 & 기록 | 내 뱃지 (Award -> `/badges`), 활동 피드 (Activity -> `/feed`) | -- |
| 6 | 서비스 | 소개 (Info -> `/about`), FAQ (HelpCircle -> `/faq`), 이용약관 (FileText -> `/settings/terms`), 개인정보 (Shield -> `/settings/privacy`) | -- |

**Per menu item tests:**

| # | Step | Expected |
|---|------|----------|
| 1 | Default | Icon (18px, gray-500) + label (text-md font-medium) + ChevronRight (18px, gray-300) |
| 2 | Hover | Row background `hover:bg-gray-50 dark:hover:bg-gray-700/70` |
| 3 | Active (press) | `active:scale-[0.98]` |
| 4 | Focus (keyboard) | Focus ring visible on link |
| 5 | Click (authenticated) | Navigate to `item.href` |
| 6 | Click (unauthenticated) | Navigate to `/login` |
| 7 | Group label | `text-2xs font-semibold uppercase tracking-[0.12em] text-gray-400` |
| 8 | Group border | `rounded-xl border border-gray-100 bg-white` card; items separated by `border-b` except last |
| 9 | Dark mode | `dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/70` |

### S32-08 Logout Button

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Default | LogOut icon (20px, gray-500) + "로그아웃" text (gray-500), rounded-xl border card | Only shown when authenticated |
| 2 | Hover | `hover:bg-gray-50 dark:hover:bg-gray-700` | -- |
| 3 | Focus (keyboard Tab) | Focus ring | -- |
| 4 | Click | `logout()` called, `router.push('/login')` | -- |

### S32-09 Viewport Differences

| Viewport | Layout |
|----------|--------|
| Mobile | Single column; MobileGlassHeader; safe-area-top padding; bottom spacer h-24 |
| Desktop (`@3xl`) | 2-column grid `[1fr_340px]` for profile + schedule; desktop heading instead of glass header; no safe-area padding |

---

## S33 -- Settings Page (`/settings`)

**Source**: `apps/web/src/app/(main)/settings/page.tsx`, `settings-client.tsx`

### S33-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Navigate to `/settings` | `animate-fade-in`; MobileGlassHeader with "설정", subtitle, back button | Desktop: hidden glass header, block heading with blue "환경" label |
| 2 | Sections render | 계정, 알림, 화면, 기타, 정보 sections + LogoutButton | Each in `SettingsSection` wrapper |

### S33-02 Account Section

| # | Step | Expected |
|---|------|----------|
| 1 | "프로필 수정" link | User icon, label "프로필 수정", desc "닉네임, 프로필 사진 변경", ChevronRight | 
| 2 | Hover | `hover:bg-gray-50 dark:hover:bg-gray-700` |
| 3 | Click | Navigate to `/profile` |
| 4 | "개인정보 관리" link | Shield icon, desc "비밀번호 변경, 계정 보안" |
| 5 | Click | Navigate to `/settings/account` |

### S33-03 Notification Section

| # | Step | Expected |
|---|------|----------|
| 1 | "알림 설정" link | Bell icon, desc "매치, 팀, 채팅, 결제 알림", ChevronRight |
| 2 | Click | Navigate to `/settings/notifications` |

### S33-04 ThemePicker

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Layout | "테마 설정" label, 3-column grid: 라이트/다크/시스템 | -- |
| 2 | Current theme button | Blue border+bg, white text, Sun/Moon/Monitor icon | Active state from `useThemeStore().theme` |
| 3 | Inactive button | Gray border, gray-50 bg, gray-500 text | -- |
| 4 | "라이트" -- hover | `hover:bg-gray-100 dark:hover:bg-gray-600` | -- |
| 5 | "라이트" -- click | `setTheme('light')` -> immediate theme change to light mode | Button becomes active (blue) |
| 6 | "다크" -- click | `setTheme('dark')` -> page switches to dark mode | Button becomes active |
| 7 | "시스템" -- click | `setTheme('system')` -> follows OS preference | Button becomes active |

### S33-05 Language Setting

| # | Step | Expected |
|---|------|----------|
| 1 | Display | Globe icon, "언어 설정", "한국어" subtitle | Static display, no interaction |

### S33-06 Information Section

| # | Step | Expected |
|---|------|----------|
| 1 | "이용약관" link | FileText icon, ChevronRight; click -> `/settings/terms` |
| 2 | "개인정보 처리방침" link | Shield icon; click -> `/settings/privacy` |
| 3 | "앱 정보" | Info icon, "TeamMeet v1.0.0" | Static display |

### S33-07 LogoutButton

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Visibility | Only rendered after hydration when `clientAuth` = true | Hidden when logged out |
| 2 | Default | LogOut icon in gray circle, "로그아웃" in red-500 | -- |
| 3 | Hover | `hover:bg-gray-50 dark:hover:bg-gray-700` | -- |
| 4 | Click | `logout()` + `router.push('/login')` | -- |

---

## S34 -- Settings/Account (`/settings/account`)

**Source**: `apps/web/src/app/(main)/settings/account/page.tsx`

### S34-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Auth check | `useRequireAuth()` -- redirect if not logged in | -- |
| 2 | MobileGlassHeader | "개인정보 관리", subtitle, back button | Desktop: breadcrumb "설정 > 개인정보 관리" |
| 3 | Pre-populated fields | Nickname "축구왕김선수", email "player@example.com", phone "010-1234-5678" | Hardcoded defaults in state |

### S34-02 Form Fields

| # | Field | Input ID | Type | Test Points |
|---|-------|----------|------|-------------|
| 1 | 닉네임 | `account-nickname` | text | Label "닉네임", hint "2~12자, 한글/영문/숫자 사용 가능"; focus/type/blur |
| 2 | 이메일 | `account-email` | email | Label "이메일"; focus/type/blur |
| 3 | 전화번호 | `account-phone` | tel | Label "전화번호", `inputMode="tel"`; focus/type/blur |
| 4 | 비밀번호 | -- | -- | Static display: shield icon, "소셜 로그인 사용 중", "카카오 계정으로 로그인..." |
| 5 | 소셜 계정 | -- | -- | Kakao (연결됨, green badge), Naver (연결하기 button), Apple (연결하기 button) |

### S34-03 Save Button

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Default | "변경사항 저장", `size="lg"`, `fullWidth` | -- |
| 2 | Hover | Blue hover state | -- |
| 3 | Click (success) | `api.patch('/users/me', { nickname, email, phone })`, toast "변경사항이 저장되었어요" | -- |
| 4 | Click (error) | Toast "저장하지 못했어요. 네트워크 연결을 확인해주세요" | -- |

### S34-04 Account Delete Flow

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | "회원 탈퇴" button | `variant="dangerSoft"`, red border, full-width | Subtitle "탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다." |
| 2 | Click | `showDeleteModal` = true, `DeleteModal` renders | -- |

#### S34-04a DeleteModal

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Open | AlertTriangle icon in red-50 circle, "정말 탈퇴하시겠어요?", warning text, confirmation input | Modal `size="sm"` |
| 2 | Confirmation input -- empty | "탈퇴하기" button `disabled`, `disabled:opacity-40` | -- |
| 3 | Confirmation input -- wrong text | Button remains disabled | -- |
| 4 | Type "탈퇴합니다" | Button becomes enabled (red bg) | `deleteConfirmText === '탈퇴합니다'` |
| 5 | "탈퇴하기" -- click | (Implementation pending -- no onClick handler in current code) | -- |
| 6 | "취소" button -- click | Modal closes, `deleteConfirmText` preserved in state | -- |
| 7 | Close via backdrop | Modal closes | -- |
| 8 | Close via ESC | Modal closes | -- |
| 9 | Focus trap | Tab cycles: confirm input -> 취소 -> 탈퇴하기 | -- |

### S34-05 Navigation

| # | Step | Expected |
|---|------|----------|
| 1 | Mobile back button | MobileGlassHeader `showBack` -> back navigation |
| 2 | Desktop breadcrumb | "설정" link (hover: `hover:text-gray-600`) -> `/settings`; "개인정보 관리" static text |

---

## S35 -- Settings/Notifications (`/settings/notifications`)

**Source**: `apps/web/src/app/(main)/settings/notifications/page.tsx`

### S35-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Auth check | `useRequireAuth()`, returns null if not authenticated | -- |
| 2 | Header | MobileGlassHeader "알림 설정" + subtitle; Desktop breadcrumb "설정 > 알림 설정" | -- |
| 3 | Info banner | Blue-tinted card with BellRing icon explaining server sync | -- |

### S35-02 Server-Side Toggles (4 categories)

| # | Category | Key | Icon | Description |
|---|----------|-----|------|-------------|
| 1 | 매치 알림 | `matchEnabled` | Trophy | "새 매치, 참가 확인, 경기 상태 변경을 계정 전체에서 동기화합니다." |
| 2 | 팀 알림 | `teamEnabled` | Users | "팀 가입, 신청 승인/거절, 운영 공지를 계정 전체에서 동기화합니다." |
| 3 | 채팅 알림 | `chatEnabled` | MessageCircle | "새 메시지와 단체 채팅방 업데이트를 계정 전체에서 동기화합니다." |
| 4 | 결제 알림 | `paymentEnabled` | CreditCard | "결제 완료, 환불, 주문 상태 변경을 계정 전체에서 동기화합니다." |

**Per toggle tests:**

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Toggle default | `role="switch"`, `aria-checked` matches server value, `aria-label="{label} 켜짐/꺼짐"` | -- |
| 2 | Toggle -- off state | Gray track `bg-gray-200 dark:bg-gray-600`, knob at left (`translate-x-0`) | -- |
| 3 | Toggle -- hover | Cursor pointer (no `cursor-not-allowed`) | -- |
| 4 | Toggle -- click (off -> on) | `handleServerToggle` called with `!currentValue`; `savingKey` set; "저장 중" text appears; knob slides right (`translate-x-[22px]`), track turns `bg-blue-500` | `duration-200` transition |
| 5 | Toggle -- API success | Toast "알림 설정이 계정에 저장되었어요"; "저장 중" disappears | -- |
| 6 | Toggle -- API error | Toast "알림 설정을 저장하지 못했어요..."; value reverts (query invalidation) | -- |
| 7 | Toggle -- disabled during mutation | All toggles `disabled`, `cursor-not-allowed`, `opacity-50` via `updatePreferences.isPending` | -- |
| 8 | Toggle -- click (on -> off) | Same flow, value flips to false | -- |

### S35-03 Loading State

| # | Step | Expected |
|---|------|----------|
| 1 | While `preferencesQuery.isLoading` | 4 skeleton rows: 40x40 rounded icon + 2 text lines + toggle placeholder | `PreferenceSkeleton` with `animate-pulse` |

### S35-04 Error State

| # | Step | Expected |
|---|------|----------|
| 1 | When `preferencesQuery.isError` | `ErrorState` with "알림 설정을 불러오지 못했어요" and retry button | Retry: `preferencesQuery.refetch()` |

### S35-05 DND Toggle (Device-Local)

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Default | Moon icon, "방해금지 시간", desc with 22:00~08:00, `role="switch"` | State from localStorage key `teameet:notification-dnd-enabled` |
| 2 | Click off -> on | `dndEnabled` = true, localStorage updated, toast "이 기기에서 방해금지 시간을 켰어요" | -- |
| 3 | Click on -> off | `dndEnabled` = false, toast "이 기기에서 방해금지 시간을 껐어요" | -- |

### S35-06 Browser Push Permission

| # | Step | Expected |
|---|------|----------|
| 1 | Granted | Smartphone icon, "브라우저 Push 권한", desc "허용되어 있습니다", badge "허용됨" |
| 2 | Denied | Desc "브라우저 설정에서 Push 차단을 해제해야...", badge "차단됨" |
| 3 | Default | Desc "아직 브라우저 권한이 결정되지 않았습니다", badge "미정" |
| 4 | Unsupported | Desc "현재 브라우저는 Push 권한 상태를 제공하지 않습니다", badge "미지원" |

### S35-07 Unsupported Section

| # | Step | Expected |
|---|------|----------|
| 1 | Display | Dashed border, gray-50 bg, title "현재 지원하지 않는 범위", description about email/marketing/master toggle | Static informational |

---

## S36 -- Settings/Terms & Privacy

### S36-01 Terms (`/settings/terms`)

**Source**: `apps/web/src/app/(main)/settings/terms/page.tsx`

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Initial load | `TermsNavHeader` component, `animate-fade-in` | -- |
| 2 | Content sections | 4 sections: "제1장 서비스 이용약관", "제2장 개인정보 수집 및 이용", "제3장 결제 및 환불 규정", "제4장 분쟁 해결" | Each in rounded-2xl bordered card |
| 3 | Section typography | `text-base font-bold` title, `text-sm leading-relaxed text-gray-600` body | Dark: `dark:text-gray-400` |
| 4 | Scroll | Content scrollable on all viewports | -- |
| 5 | Footer | "최종 수정일: 2026년 1월 1일" centered | -- |
| 6 | Back navigation | Via `TermsNavHeader` | -- |

### S36-02 Privacy (`/settings/privacy`)

**Source**: `apps/web/src/app/(main)/settings/privacy/page.tsx`

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Initial load | `PrivacyNavHeader`, `animate-fade-in` | -- |
| 2 | Content sections | 5 sections: "1. 수집하는 정보", "2. 이용 목적", "3. 보관 기간", "4. 제3자 제공", "5. 이용자 권리" | Same card styling as Terms |
| 3 | Scroll | Full content scrollable | -- |
| 4 | Footer | "최종 수정일: 2026년 1월 1일" | -- |
| 5 | Back navigation | Via `PrivacyNavHeader` | -- |

---

## S37 -- Chat List (`/chat`)

**Source**: `apps/web/src/app/(main)/chat/page.tsx`

### S37-01 Desktop 2-Column Layout

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Layout | `@3xl:grid @3xl:grid-cols-[380px_1fr]`, full height `calc(100dvh-5rem)` | Hidden on mobile |
| 2 | Left panel | Room list with header "채팅" + subtitle, scrollable `overflow-y-auto` | Border-r separator |
| 3 | Right panel (no selection) | Centered empty state: MessageCircle icon (28px), `t('selectRoom')`, `t('selectRoomDesc')` | Gray-50 bg |
| 4 | Right panel (selected) | `ChatRoomEmbed` renders with selected room | -- |

### S37-02 Mobile Full-Page Layout

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Layout | `@3xl:hidden`, MobileGlassHeader with back, room list in px-5 | Safe-area-top padding |
| 2 | Bottom spacer | `h-24` for bottom nav clearance | -- |

### S37-03 Chat Room Items

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Room item | Avatar circle (44px, first char), room name (truncated), last message time, last message preview (truncated) | -- |
| 2 | Unread badge | Blue circle `bg-blue-500` with count, `text-xs font-bold text-white` | Hidden when `unreadCount` <= 0 |
| 3 | Hover | `hover:bg-gray-50 dark:hover:bg-gray-700` | -- |
| 4 | Active (press) | `active:scale-[0.98]` | -- |
| 5 | Click -- mobile | Navigate to `/chat/{id}` via `<Link>` | -- |
| 6 | Click -- desktop | `setSelectedRoomId(room.id)`, inline switch (no navigation); active item gets `bg-gray-50` | -- |
| 7 | Active room indicator | `border-gray-100` highlighted | Desktop only |

### S37-04 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 3 skeleton items: `h-[72px] animate-pulse rounded-2xl bg-gray-100` |
| 2 | Error | `ErrorState` with "채팅방을 불러오지 못했어요" + retry |
| 3 | Empty | `EmptyState` with MessageCircle icon, `t('noChatRooms')`, `t('noChatRoomsDesc')` |
| 4 | Unauthenticated | Returns null (blank page) |

### S37-05 Relative Time Formatting

| Time Delta | Display |
|------------|---------|
| < 1 min | "방금" |
| < 60 min | "N분 전" |
| < 24 hours | "N시간 전" |
| < 7 days | "N일 전" |
| >= 7 days | "M/D" |

---

## S38 -- Chat Room (`/chat/[id]`)

**Source**: `apps/web/src/app/(main)/chat/[id]/page.tsx`, `chat-room-embed.tsx`

### S38-01 Mobile Full-Screen

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Layout | `fixed inset-0 z-[60]`, covers entire viewport including bottom nav | -- |
| 2 | Back button | Calls `router.back()` | Arrow SVG icon |
| 3 | Safe area | `pt-[var(--safe-area-top)]` on header, `pb-[calc(0.75rem+var(--safe-area-bottom))]` on input bar | -- |

### S38-02 Desktop Embedded

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Layout | `lg:flex-col lg:h-[calc(100dvh-5rem)]`, rounded-2xl with border | Hidden on mobile |
| 2 | Back button | Calls `router.push('/chat')` | `embedded={true}` |

### S38-03 Header

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Room name | `text-lg font-bold`, truncated | Fallback "채팅방" if no `room.name` |
| 2 | Info toggle button | ChevronDown/ChevronUp, `aria-label`, 44px touch target | Toggles `showMatchInfo` |
| 3 | Info panel (expanded) | Match info: Calendar + date, MapPin + room name | `animate-fade-in` |
| 4 | More menu button (MoreVertical) | 44px touch, toggles dropdown | -- |
| 5 | Menu dropdown | 3 items: 신고하기 (Flag), 차단하기 (Ban), 나가기 (LogOut, red text) | `animate-fade-in`, shadow-lg, z-50 |
| 6 | Menu -- click outside | Closes via `mousedown` listener | -- |

### S38-04 Message List

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Loading | 3 skeleton bars with `animate-pulse`, alternating widths | -- |
| 2 | Empty | `EmptyState` "아직 메시지가 없어요" | -- |
| 3 | Messages | Grouped by date with `DateSeparator`; `ChatBubble` for each message | Own messages right-aligned, others left |
| 4 | System messages | `[system]` prefix stripped, rendered as `SystemMessage` | -- |
| 5 | "더 보기" button | When `hasNextPage`, centered rounded-full button | Disabled text "불러오는 중..." while `isFetchingNextPage` |
| 6 | Auto-scroll | First load: instant scroll to bottom; subsequent: smooth scroll if near bottom (`< 100px`) | -- |
| 7 | Read sync | `markLatestMessageAsRead` called when near bottom or on mount | Error: toast "읽음 상태 동기화가 지연되고 있어요" (once) |

### S38-05 Message Input

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Input field | `id="chat-message-input"`, sr-only label "메시지 입력", placeholder "메시지를 입력하세요", maxLength 2000 | -- |
| 2 | Focus | Border highlight, cursor in field | -- |
| 3 | Type text | Characters appear, `input` state updates | -- |
| 4 | Send button -- disabled | `!input.trim()`, `opacity-40 cursor-not-allowed` | -- |
| 5 | Send button -- enabled | Blue bg `bg-blue-500`, Send icon | -- |
| 6 | Send button -- hover | `hover:bg-blue-600` | -- |
| 7 | Send button -- click | Optimistic message appended; input cleared; `sendMessageMutation.mutate`; input refocused | -- |
| 8 | Send -- error | Optimistic message removed; toast "메시지 전송에 실패했어요" | -- |
| 9 | Enter key | Triggers `handleSend` (not Shift+Enter) | -- |
| 10 | Shift+Enter | Does NOT send (only Enter without Shift sends) | -- |

### S38-06 Emoji Picker

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Emoji button -- default | Smile icon, gray-400 | -- |
| 2 | Emoji button -- click | `showEmoji` toggles; when active: blue-500 text, blue-50 bg | -- |
| 3 | Emoji grid | 12 emojis in flex-wrap; each 44px min touch target | -- |
| 4 | Emoji -- click | Emoji appended to input, picker closes | -- |

### S38-07 File Attachment

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Paperclip button | `aria-label="파일 첨부"`, 44px touch | -- |
| 2 | Click | Toast "파일 첨부 기능을 준비 중이에요"; hidden file input triggered | -- |

### S38-08 Quick Actions

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Display | Horizontal scrollable row: "빠른 메시지" label + 3 pill buttons | -- |
| 2 | "입금 완료" -- click | Input set to "입금 완료했습니다! 확인 부탁드립니다.", input focused | -- |
| 3 | "유니폼 색상 조율" -- click | Input set to corresponding message | -- |
| 4 | "위치 공유" -- click | Input set to "구장 위치 공유드립니다. 안전하게 오세요!" | -- |

### S38-09 Report Modal

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Open | Menu -> 신고하기 -> `ReportModal` opens with `targetType="chatRoom"` | -- |
| 2 | Content | 4 report reasons, detail textarea, submit/cancel | -- |
| 3 | Close | X, backdrop, ESC, cancel button | -- |

### S38-10 Leave Modal

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Open | Menu -> 나가기 -> `showLeaveModal` = true | -- |
| 2 | Content | LogOut icon, "채팅방을 나가시겠어요?" | -- |
| 3 | "나가기" -- click | Toast "채팅방을 나갔어요", navigate to `/chat` | -- |
| 4 | "취소" -- click | Modal closes | -- |

### S38-11 WebSocket Integration

| # | Step | Expected |
|---|------|----------|
| 1 | Incoming message | `handleWsMessage` inserts into query cache first page; optimistic duplicates removed | -- |
| 2 | Room change | All state reset: input, menus, optimistic messages, read tracking | -- |

---

## S39 -- Notifications (`/notifications`)

**Source**: `apps/web/src/app/(main)/notifications/page.tsx`

### S39-01 Authenticated State

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Initial load | MobileGlassHeader "알림", subtitle with unread count or default text | -- |
| 2 | Unread count display | Subtitle: `t('unreadCount', { count })` when > 0 | -- |
| 3 | "모두 읽음" button | In header actions; `aria-label`, min-h-44px, `text-xs font-semibold`; disabled during `isPending` | Hidden when unreadCount = 0 or unauthenticated |
| 4 | "모두 읽음" -- click | `markAllRead.mutateAsync()`, success toast `t('markAllReadToast')` | Error: toast `t('markAllReadErrorToast')` |

### S39-02 Notification Cards

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Unread card | Blue border `border-blue-100`, `bg-blue-50/70`, font-semibold title, blue unread dot (2.5px) | `data-testid="notification-unread-dot"` |
| 2 | Read card | Gray border `border-gray-100`, no dot, lighter title text | -- |
| 3 | Type icon | Based on `notificationVisualType`: match(Trophy/amber), team(Users/green), chat(MessageCircle/blue), payment(CreditCard/emerald), system(Bell/gray) | -- |
| 4 | Time display | `formatTimeAgo` output | -- |
| 5 | CTA link | When `target` exists: "확인하기" (or `ctaLabel`) with ChevronRight | -- |
| 6 | Card with link -- click | Navigate to target URL, mark as read | `handleOpenNotification` with location.assign |
| 7 | Card without link -- click | Mark as read only | `handleMarkRead` |
| 8 | Card -- hover | `hover:bg-gray-50` (read) or `hover:bg-blue-50/90` (unread) | -- |
| 9 | Card -- active | `active:scale-[0.98]` | -- |
| 10 | Focus ring | `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2` | -- |

### S39-03 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 3 skeleton cards with icon, text lines, `animate-pulse` |
| 2 | Empty (authenticated) | `EmptyState` with Bell icon, `te('noNotifications')` |
| 3 | Unauthenticated | `EmptyState` with login CTA button -> `/login` |

### S39-04 Background Refetch

| # | Step | Expected |
|---|------|----------|
| 1 | Tab focus | `window.focus` -> refetch notifications + unread count |
| 2 | Visibility change | `document.visibilitychange` -> refetch when visible |

---

## S40 -- Payment History (`/payments`)

**Source**: `apps/web/src/app/(main)/payments/page.tsx`

### S40-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Header | MobileGlassHeader "결제 내역" with back; Desktop: h1 + subtitle | -- |
| 2 | Date filters | Two `<Input type="date">` with sr-only labels "시작 날짜" / "종료 날짜", separated by "~" | -- |

### S40-02 Type Tabs

| # | Tab | Filter | Test Points |
|---|-----|--------|-------------|
| 1 | 전체 | `all` | Default active; `role="tab"`, `aria-selected="true"`, white bg |
| 2 | 매치 | `match` | Hover: `hover:text-gray-700`; Click: filters to match payments |
| 3 | 강좌 | `lesson` | Same interaction pattern |
| 4 | 장터 | `marketplace` | Same interaction pattern |

**Tab container**: `rounded-xl bg-gray-100 p-1 overflow-x-auto scrollbar-hide`, `role="tablist"`

### S40-03 Payment Items

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Item layout | Source icon (11x11 rounded-xl), title (truncated), status badge, method+date, venue, amount, ChevronRight | -- |
| 2 | Status badge | Colored pill: `paymentStatusConfig[status]` | -- |
| 3 | Hover | `hover:bg-gray-50 dark:hover:bg-gray-700` | -- |
| 4 | Active | `active:scale-[0.98]` | -- |
| 5 | Click | Navigate to `/payments/{id}` | -- |
| 6 | Amount | `formatAmount(payment.amount)` -- bold, blue-500 on detail but gray-900 on list | -- |

### S40-04 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 3 skeleton boxes `h-24 animate-pulse rounded-2xl` |
| 2 | Error | `ErrorState` "결제 내역을 불러오지 못했어요" + retry |
| 3 | Empty | `EmptyState` CreditCard icon, "아직 결제 내역이 없어요" |
| 4 | Filtered empty | Same empty state when filters return no results |

### S40-05 Date Range Filter

| # | Step | Expected |
|---|------|----------|
| 1 | Set dateFrom | Click input, select date; filters `payment.createdAt < dateFrom` |
| 2 | Set dateTo | Click input, select date; filters `payment.createdAt > dateTo + T23:59:59` |
| 3 | Both set | Combined filter applied |

---

## S41 -- Payment Detail (`/payments/[id]`)

**Source**: `apps/web/src/app/(main)/payments/[id]/page.tsx`

### S41-01 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 3 skeleton blocks with `animate-pulse` |
| 2 | Error | `ErrorState` "결제 상세를 불러오지 못했어요" + retry |
| 3 | Not found | `EmptyState` ReceiptText icon, "결제를 찾을 수 없어요", action -> `/payments` |

### S41-02 Content Sections

| # | Section | Content |
|---|---------|---------|
| 1 | Status banner | Colored card with status icon (24px), status label, formatted date |
| 2 | TrustSignalBanner | Shown when `paymentMode.state !== 'ready'` (mock/unavailable) |
| 3 | 결제 금액 | Amount in blue-500; refund amount in red-500 if exists |
| 4 | 결제 수단 | Method icon + label + description |
| 5 | 연결된 일정 | Source badge, title, date/venue; "일정 보기" link if `source.href` exists |
| 6 | 영수증 정보 | Order ID (mono font), receipt number with copy button |
| 7 | 결제 타임라인 | Timeline with dots: 주문 생성, completed, refunded (if applicable) |
| 8 | 환불 규정 | Only if `status === 'completed' && source.kind === 'match'`; refund policy card + action |

### S41-03 Receipt Copy

| # | Step | Expected |
|---|------|----------|
| 1 | Copy button -- click | `navigator.clipboard.writeText(receiptNumber)`; Copy icon turns green-500 for 2s |
| 2 | Hover | `hover:text-blue-500` |

### S41-04 Refund Action

| # | Step | Expected | Conditions |
|---|------|----------|------------|
| 1 | "환불 요청" link | Red bordered button with RotateCcw icon -> `/payments/{id}/refund` | `refundPolicy.percentage > 0` and not blocked by mode |
| 2 | Mock mode | Button text "테스트 환불 처리" | `paymentMode.state === 'mock'` |
| 3 | Unavailable | Amber warning text about legacy refund | `paymentMode.state === 'unavailable'` |
| 4 | No refund | Gray info text | `refundPolicy.percentage === 0` |

---

## S42 -- Refund Request (`/payments/[id]/refund`)

**Source**: `apps/web/src/app/(main)/payments/[id]/refund/page.tsx`

### S42-01 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 3 skeleton blocks |
| 2 | Error | `ErrorState` "환불 정보를 불러오지 못했어요" |
| 3 | Not found | `EmptyState` "환불 대상을 찾을 수 없어요" -> `/payments` |
| 4 | Mode blocked | `EmptyState` "실결제 환불 연동이 비활성화되어 있어요" |
| 5 | Not refundable | `EmptyState` "지금은 환불할 수 없어요" with policy description |

### S42-02 Refund Reason Selection

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | 4 reason buttons | 2x2 grid: 일정 변경, 개인 사정, 매치 취소, 기타 | -- |
| 2 | Default | No selection; all gray borders | -- |
| 3 | Select one | Selected: blue ring, blue bg, white text; unselected: gray border | Only one active |
| 4 | Additional reason textarea | `id="refund-additional-reason"`, sr-only label, placeholder "추가 사유를 입력해 주세요 (선택)", 3 rows | -- |

### S42-03 Refund Policy Display

| # | Step | Expected |
|---|------|----------|
| 1 | 3 policy rows | "경기 24시간 전" (전액), "1~24시간 전" (50%), "1시간 이내" (환불 불가) |
| 2 | Active row | Highlighted with `refundPolicy.bgColor` and `refundPolicy.color` |
| 3 | Predicted amount | Large text with RotateCcw icon |

### S42-04 Submit Flow

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Submit button -- no reason | Disabled: `bg-gray-200 text-gray-500 cursor-not-allowed` | -- |
| 2 | Submit button -- reason selected | Enabled: `bg-red-500 text-white` | -- |
| 3 | Submit button -- click | Opens confirmation modal | -- |
| 4 | Confirmation modal | Payment/refund amounts, warning text, 취소/환불 요청 buttons | Modal `title` varies by mock mode |
| 5 | Confirm -- loading | Loader2 spinner + "처리중" | `refundPayment.isPending` |
| 6 | Confirm -- success | Toast, redirect to `/payments/{id}` | Mock: "환불 시뮬레이션이 완료되었어요" |
| 7 | Confirm -- error | Error toast via `extractErrorMessage` | -- |
| 8 | Cancel | Modal closes | -- |

### S42-05 Fixed Bottom Bar (Mobile)

| # | Step | Expected |
|---|------|----------|
| 1 | Mobile | Fixed at `bottom-[calc(60px+var(--safe-area-bottom))]`, shows predicted amount + submit | -- |
| 2 | Desktop | `@3xl:relative @3xl:border-0` | -- |

---

## S43 -- Checkout Page (`/payments/checkout`)

**Source**: `apps/web/src/app/(main)/payments/checkout/page.tsx`

### S43-01 Invalid Parameters

| # | Step | Expected |
|---|------|----------|
| 1 | No `source` param | `EmptyState` "결제 정보가 없어요" + action "홈으로 돌아가기" -> `/home` |
| 2 | Unsupported source | `TrustSignalBanner` warning about supported sources (match/lesson only) |

### S43-02 Order Summary

| # | Step | Expected |
|---|------|----------|
| 1 | Source badge | "매치" or "강좌" in blue-50 pill |
| 2 | Item name | From `searchParams.name` |
| 3 | Schedule | Calendar icon + formatted `scheduledAt` (if present) |
| 4 | Venue | MapPin icon + `venue` (if present) |

### S43-03 Payment Method Selector

| # | Method | Icon | Description | Test Points |
|---|--------|------|-------------|-------------|
| 1 | 신용/체크카드 | CreditCard | "모든 카드 가능" | Default selected |
| 2 | 토스페이 | Wallet | "토스 간편결제" | -- |
| 3 | 네이버페이 | Wallet | "네이버 간편결제" | -- |
| 4 | 카카오페이 | Wallet | "카카오 간편결제" | -- |

**Per method button:**

| # | Step | Expected |
|---|------|----------|
| 1 | Unselected | Gray border, gray icon bg, gray text, empty radio circle |
| 2 | Selected | Blue ring-2, blue border, blue-50 bg, blue icon, blue text, blue filled radio |
| 3 | Click | `setSelectedMethod(id)`, only one active at a time |
| 4 | Disabled | When `!isSupportedCheckout || isProcessing`: `opacity-50 cursor-not-allowed` |

### S43-04 Terms Checkbox

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Unchecked | Empty rounded-md border, gray text | "결제하기" button disabled |
| 2 | Click | CheckCircle icon appears, `bg-blue-500 border-blue-500` | "결제하기" button enabled |
| 3 | Policy text | Varies by mock mode: test refund explanation vs real refund rules | -- |

### S43-05 Submit Button

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Disabled (no terms) | `bg-gray-200 text-gray-500 cursor-not-allowed` | -- |
| 2 | Enabled | `bg-blue-500 text-white`, shows amount + "결제하기" (or "테스트 결제하기") | -- |
| 3 | Free lesson | Button text "무료 수강권 등록하기" | When `amount === 0` and lesson source |
| 4 | Processing | Loader2 spinner + "테스트 결제 처리중..." or "결제 처리중..." | During mutations |
| 5 | Success (match) | Toast, redirect to `/payments/{id}` | -- |
| 6 | Success (lesson) | Toast, redirect to `/my/lesson-tickets?ticketId=...` | -- |
| 7 | Error | Toast via `extractErrorMessage` | -- |

### S43-06 TrustSignalBanner

| # | Step | Expected |
|---|------|----------|
| 1 | Mock mode | Shows trust signal with mock payment explanation |
| 2 | Non-mock | Not shown (or shown based on `paymentMode`) |

### S43-07 Fixed Bottom Bar

| # | Step | Expected |
|---|------|----------|
| 1 | Mobile | Fixed at `bottom-[calc(80px+var(--safe-area-bottom))]`, shows amount + pay button |
| 2 | Desktop | `@3xl:relative @3xl:border-0` |

---

## S44 -- Reviews (`/reviews`)

**Source**: `apps/web/src/app/(main)/reviews/page.tsx`

### S44-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Auth | `useRequireAuth()` | -- |
| 2 | Header | MobileGlassHeader "내 평가" + subtitle; Desktop: h1 + subtitle | -- |

### S44-02 Review Card (Per Pending Review)

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Collapsed state | Avatar (first char), nickname, match title, "평가하기" button | -- |
| 2 | "평가하기" button -- hover | `hover:bg-gray-50 dark:hover:bg-gray-800` | -- |
| 3 | "평가하기" button -- click | `expanded` = true, rating + comment form slides in (`animate-slide-up`) | Button text changes to "접기" |
| 4 | "접기" -- click | Form collapses | -- |

#### S44-02a Expanded Review Form

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | 실력 rating row | Label "실력", 5 star buttons, default value 3 | Star 1-3: amber-400 filled; 4-5: gray-200 outline |
| 2 | Star button | `aria-label="N점"`, 44px min touch target (`min-w-11 min-h-[44px]`) | -- |
| 3 | Click star 5 | Stars 1-5 all amber filled, `skillRating` = 5 | -- |
| 4 | Click star 2 | Stars 1-2 amber, 3-5 gray, `skillRating` = 2 | -- |
| 5 | 매너 rating row | Same as skill, with `mannerRating` state | Default 3 |
| 6 | Comment textarea | `id="review-comment-{matchId}-{targetId}"`, label "코멘트 (선택)", placeholder "한 마디 남겨주세요", 2 rows | -- |
| 7 | "평가 제출" button -- default | Blue-500 full-width, `text-base font-bold` | -- |
| 8 | "평가 제출" -- hover | `hover:bg-blue-600` | -- |
| 9 | "평가 제출" -- click | `submitMutation.mutate()`: POST `/reviews`, body with matchId, targetId, ratings, comment | -- |
| 10 | Submit -- loading | `disabled:opacity-50`, text "제출 중..." | -- |
| 11 | Submit -- success | Toast "평가가 제출되었어요"; query invalidated; card removed from list | -- |
| 12 | Submit -- error | Toast "평가 제출에 실패했어요..." | -- |

### S44-03 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 2 skeleton boxes `h-24 animate-pulse` |
| 2 | Empty | `EmptyState` Star icon, "작성할 평가가 없어요", "매치가 완료되면 평가 요청이 도착해요" |

---

## S45 -- Badges (`/badges`)

**Source**: `apps/web/src/app/(main)/badges/page.tsx`

### S45-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Header | Back button (ArrowLeft, mobile only), h1 "뱃지" | -- |
| 2 | Back button | `aria-label="뒤로 가기"`, 44px touch, `hover:bg-gray-50`, `active:scale-[0.98]` | Desktop: hidden via `@3xl:hidden` |

### S45-02 Filter Tabs

| # | Tab | Active Style | Content |
|---|-----|-------------|---------|
| 1 | "내 뱃지 (N)" | `bg-blue-500 text-white` | Earned badges only |
| 2 | "전체 뱃지 (N)" | Same when active | All badges (earned + unearned) |

**Tab attributes**: `role="tab"`, `aria-selected`, `role="tablist"` on container, min-h-44px, rounded-full pill

### S45-03 Badge Cards

| # | Type | Visual | States |
|---|------|--------|--------|
| 1 | Earned badge | Icon from `badgeVisualConfig`, name in bold, "획득" pill, description, requirement, earned date | `bg-white` card |
| 2 | Unearned badge | Lock icon instead of badge icon, gray-300/500 text, no "획득" pill, progress (e.g., "32/50") or "미달성" | `bg-gray-50` card, subdued colors |

**Per card:**

| # | Step | Expected |
|---|------|----------|
| 1 | `data-testid="badge-card"` | Present on each card |
| 2 | Icon area | 48x48 rounded-xl; earned: gray-100 bg with icon; unearned: gray-100 bg with Lock |
| 3 | Name | truncated, `text-sm font-semibold` |
| 4 | Earned date | `formatDateCompact(earnedAt)` + "획득" |
| 5 | Progress | `text-xs font-medium text-gray-500` e.g., "3/5" |
| 6 | `stagger-children` animation | Cards appear with stagger delay |

### S45-04 Badge Count

| # | Step | Expected |
|---|------|----------|
| 1 | "내 뱃지" tab count | `earnedBadges.length` (e.g., "(4)") |
| 2 | "전체 뱃지" tab count | `badges.length` (e.g., "(8)") |
| 3 | Accuracy | Counts match actual filtered lists |

---

## S46 -- Activity Feed (`/feed`)

**Source**: `apps/web/src/app/(main)/feed/page.tsx`

### S46-01 Initial Load

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Auth check | `useRequireAuth()`, deferred via `clientAuth` state | Returns null before hydration |
| 2 | Header | h1 `t('feed.title')` | No MobileGlassHeader; simple header |

### S46-02 Time Groups

| # | Group | Label | Content |
|---|-------|-------|---------|
| 1 | 오늘 | `t('today')` | Notifications from today |
| 2 | 이번 주 | `t('thisWeek')` | From start of week to yesterday |
| 3 | 지난달 | `t('lastMonth')` | From start of last month |
| 4 | 이전 | `t('older')` | Everything older |

**Per group**: uppercase tracking label + card with divide-y items. Empty groups hidden.

### S46-03 Activity Items

| # | Step | Expected |
|---|------|----------|
| 1 | Icon | Based on `resolveVisualType`: match/badge/team/payment/chat/system with specific colors |
| 2 | Title | `text-sm font-semibold` |
| 3 | Body | `text-xs text-gray-500` |
| 4 | Time | `text-2xs text-gray-400`, formatTimeAgo output |
| 5 | `aria-hidden="true"` | On icon span |

### S46-04 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | 5 skeleton cards |
| 2 | Empty | `EmptyState` Bell icon, `t('emptyTitle')`, `t('emptyDesc')` |

---

## S47 -- Public User Profile (`/user/[id]`)

**Source**: `apps/web/src/app/(main)/user/[id]/page.tsx`

### S47-01 States

| # | State | Expected |
|---|-------|----------|
| 1 | Loading | Pulse skeleton: 8x32 heading + 48px card + 32px card | `animate-pulse` |
| 2 | Not found | `EmptyState` User icon, "사용자를 찾을 수 없어요", action "홈으로" -> `/home` |
| 3 | Loaded | Full profile renders with `animate-fade-in` |

### S47-02 Profile Header

| # | Step | Expected |
|---|------|----------|
| 1 | Avatar | 72x72 circle, gray-100 bg, first character in blue-500 3xl font |
| 2 | Nickname | `text-2xl font-bold` |
| 3 | Manner badge | Colored pill: 최고(green), 좋음(blue), 보통(gray), 주의(red) |
| 4 | Location | City + district if present |
| 5 | Bio | `text-base text-gray-600` if present |

### S47-03 Stats Grid

| # | Stat | Icon | Content |
|---|------|------|---------|
| 1 | 매너점수 | Star (amber, filled) | Score with 1 decimal |
| 2 | 매치 참여 | Trophy | `totalMatches` count |
| 3 | 소속 팀 | Users | `teamCount` |

### S47-04 Sport Profiles

| # | Step | Expected |
|---|------|----------|
| 1 | Section heading | TrendingUp icon + "종목별 프로필" |
| 2 | Per sport | Sport icon (16px), sport label, level label (blue-500), level bar (0-100%), match count, position |
| 3 | Level bar | `h-1.5 rounded-full bg-gray-200`, blue-500 fill with `transition-[width] duration-300` |

### S47-05 Manner Section

| # | Step | Expected |
|---|------|----------|
| 1 | Heading | Shield icon + "매너 정보" |
| 2 | Progress bar | `h-2 rounded-full`, green/gray/red based on score, animated width |
| 3 | Score display | `{score} / 5.0` in bold |
| 4 | Description | "매너 점수는 매치 후 상대방의 평가를 기반으로 산정됩니다" |

### S47-06 Navigation

| # | Step | Expected |
|---|------|----------|
| 1 | Mobile header | MobileGlassHeader with custom children: back button + "프로필" title |
| 2 | Desktop breadcrumb | "홈" link -> `/home`, user nickname text |
| 3 | Back button | `aria-label="뒤로 가기"`, `router.back()` |

---

## S48 -- My Pages (ALL sub-pages)

### S48-01 My Matches (`/my/matches`)

**Source**: `apps/web/src/app/(main)/my/matches/page.tsx`

| # | Step | Expected | States |
|---|------|----------|--------|
| 1 | Auth | `useRequireAuth()` | -- |
| 2 | Header | MobileGlassHeader "매치 히스토리" + back; Desktop: h2 + subtitle | -- |
| 3 | URL param `?tab=history` | Resolves to `participated` tab | -- |
| 4 | URL param `?tab=created` | Resolves to `created` tab | -- |

#### Tabs

| Tab | Label | Content |
|-----|-------|---------|
| `participated` | "참가 매치" | Match cards from API |
| `created` | "내가 만든 매치" | EmptyState "개설한 매치 목록은 곧 제공돼요" + "매치 만들기" CTA |

**Tab styles**: `role="tablist"`, rounded-xl bg-gray-100 p-1 container; active: `bg-white text-gray-900`; inactive: `text-gray-500 hover:text-gray-700`; `focus-visible:ring-2 focus-visible:ring-blue-500`

**Per match card (participated tab):**

| # | Step | Expected |
|---|------|----------|
| 1 | Sport badge + status badge | Colored pills |
| 2 | Title | Link to `/matches/{id}`, `hover:text-blue-500`, truncated |
| 3 | Info rows | Calendar (date + weekday), Clock (startTime~endTime), MapPin (venue), Users (currentPlayers/maxPlayers) |
| 4 | Fee | `formatCurrency` |
| 5 | Loading | 3 skeleton cards |
| 6 | Error | `ErrorState` + retry |
| 7 | Empty | `EmptyState` Trophy icon + "매치 찾기" CTA |

### S48-02 My Teams (`/my/teams`)

**Source**: `apps/web/src/app/(main)/my/teams/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | MobileGlassHeader "내 팀" + back; Desktop: h2 + subtitle |
| 2 | Loading | 3 skeleton cards with badge, text, button placeholders |
| 3 | Empty | `EmptyState` Users icon, "소속된 팀이 없어요", "팀 만들기" CTA -> `/teams/new` |

**Per team card:**

| # | Step | Expected |
|---|------|----------|
| 1 | Badges | Sport type (from `sportCardAccent`), level, role (owner=Crown/amber, manager=Shield/blue, member=Users/gray) |
| 2 | `data-testid` | `my-team-card-{id}`, `my-team-role-{id}`, `my-team-detail-{id}`, `my-team-members-{id}` |
| 3 | Team name | Link to `/teams/{id}`, `hover:text-blue-500`, truncated |
| 4 | Description | `line-clamp-1` |
| 5 | Stats | Members count (Users icon), location (MapPin) |
| 6 | Actions | "상세 보기" (blue-50) -> `/teams/{id}`, "멤버 관리"/"멤버 목록" (gray-50) -> `/teams/{id}/members` |
| 7 | Role-based label | member: "멤버 목록"; owner/manager: "멤버 관리" |

### S48-03 My Team Matches (`/my/team-matches`)

**Source**: `apps/web/src/app/(main)/my/team-matches/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Tabs | "내가 만든 매치" (hosted) / "내가 신청한 매치" (applied); URL param `?tab=` support |
| 2 | Header | MobileGlassHeader "내 팀 매칭"; Desktop: h2 + "모집글 작성" link (hosted tab only) |

**Hosted tab:**

| # | Step | Expected |
|---|------|----------|
| 1 | Post cards | Sport badge, status badge, team name, title (link), date/time/venue, action buttons |
| 2 | Actions (not cancelled) | "신청현황" (blue, with applicant count circle), "수정" (gray), "취소" (red) |
| 3 | "취소" -- click | Opens `DeleteModal` with AlertTriangle, confirmation text, 돌아가기/취소하기 buttons |
| 4 | Confirm delete | `api.patch` to cancelled, success toast, query invalidated |
| 5 | Empty | `EmptyState` Swords icon + "모집글 작성" CTA |
| 6 | Mobile FAB | Fixed blue circle `h-14 w-14`, Plus icon, bottom-right | `@3xl:hidden` |

**Applied tab:**

| # | Step | Expected |
|---|------|----------|
| 1 | Application cards | Status badge (pending/approved/rejected/withdrawn), host team name, title, date/time/venue |
| 2 | Card -- click | Navigate to `/team-matches/{id}` |
| 3 | Hover | `hover:border-gray-200`, `active:scale-[0.995]` |
| 4 | Empty | `EmptyState` Swords icon + "팀 매칭 찾기" CTA |

### S48-04 My Team Match Applications (`/my/team-match-applications`)

**Source**: `apps/web/src/app/(main)/my/team-match-applications/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | MobileGlassHeader "내 팀매칭 신청"; Desktop: h2 + subtitle |
| 2 | Cards | Same as applied tab in S48-03, plus `app.message` italic preview |
| 3 | Deleted match | Tombstone card: `opacity-60`, "삭제된 매칭" title, "이 팀 매칭은 더 이상 존재하지 않아요" |
| 4 | Loading | 3 skeleton blocks |
| 5 | Empty | `EmptyState` Swords + "팀 매칭 찾기" CTA |

### S48-05 My Lessons (`/my/lessons`)

**Source**: `apps/web/src/app/(main)/my/lessons/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | MobileGlassHeader "내가 등록한 강좌"; Desktop: h2 + subtitle |
| 2 | Filtering | Only lessons where `hostId === user.id && status === 'open'` |
| 3 | Loading/pending | 2 skeleton cards |
| 4 | Error (lessons) | `ErrorState` "등록한 강좌를 불러오지 못했어요" |
| 5 | Error (me) | `ErrorState` "내 강좌 소유 정보를 확인하지 못했어요" |
| 6 | Empty | `EmptyState` GraduationCap, "공개 중인 내 강좌가 없어요" |

**Per lesson card:**

| # | Step | Expected |
|---|------|----------|
| 1 | Badges | Sport type + status (공개중/취소됨/완료/마감) |
| 2 | Price | `formatCurrency` |
| 3 | Title | Link to `/lessons/{id}`, `hover:text-blue-500` |
| 4 | Info | Schedule, venue |
| 5 | Next lesson indicator | Blue-50 card with Clock icon, date, weekday, days until ("오늘"/"내일"/"N일 후") |
| 6 | Progress bar | Students count, fill percentage, red when full |

### S48-06 My Lesson Tickets (`/my/lesson-tickets`)

**Source**: `apps/web/src/app/(main)/my/lesson-tickets/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | MobileGlassHeader "내 수강권"; Desktop: h2 + subtitle |
| 2 | Highlight | `?ticketId=` param: ticket sorted first, ring-2 blue border, "방금 등록됨" blue pill, auto-scroll |
| 3 | Loading | 2 skeleton cards |
| 4 | Error | `ErrorState` + retry |
| 5 | Empty | `EmptyState` Ticket icon + "레슨 둘러보기" CTA; optionally `TrustSignalBanner` if highlight pending |

**Per ticket card:**

| # | Step | Expected |
|---|------|----------|
| 1 | Badges | Ticket type (1회권/다회권/기간권), status (사용 가능/만료/소진/환불/취소), sport type |
| 2 | Amount | `formatAmount(paidAmount)` |
| 3 | Lesson link | Title as link -> `/lessons/{id}`, ChevronRight |
| 4 | Plan name | Subtitle text |
| 5 | Info grid | 구매일, 수업 일시, 사용 현황 (잔여/전체), 만료 정보 (D-N) |

### S48-07 My Listings (`/my/listings`)

**Source**: `apps/web/src/app/(main)/my/listings/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | MobileGlassHeader "내 장터 매물"; Desktop: h2 + subtitle |
| 2 | Empty | `EmptyState` Package icon + "매물 등록" CTA -> `/marketplace/new` |

**Per listing card:**

| # | Step | Expected |
|---|------|----------|
| 1 | Image | 80x80 rounded-xl, lazy loading, fallback from `getListingImage` |
| 2 | Badges | Status (판매중/예약중/판매완료), condition (새 상품~하자) |
| 3 | Title | Link -> `/marketplace/{id}`, `hover:text-blue-500` |
| 4 | Price | `formatAmount` bold |
| 5 | Stats | Eye (viewCount), Heart (likeCount), date |
| 6 | "수정" button | Link -> `/marketplace/{id}/edit` |
| 7 | "상태변경" dropdown | ChevronDown; on click: dropdown with 판매중/예약중/판매완료 options |
| 8 | Status option -- click | `api.patch` status, success/error toast, dropdown closes |
| 9 | "삭제" button | Opens delete confirmation modal |
| 10 | Delete modal | AlertTriangle, "매물을 삭제하시겠어요?", 돌아가기/삭제하기 buttons |
| 11 | Confirm delete | `api.delete`, success toast, query invalidated |

### S48-08 My Mercenary (`/my/mercenary`)

**Source**: `apps/web/src/app/(main)/my/mercenary/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | Custom MobileGlassHeader with ArrowLeft back + "내 용병 모집/신청"; Desktop: h2 + subtitle |
| 2 | Tabs | "내 모집" (created) / "내 신청" (applied) | `role="tablist"` |

**Created tab:**

| # | Step | Expected |
|---|------|----------|
| 1 | Post cards | Sport badge, status (모집중/모집완료), fee, title (link), date/venue, application count |
| 2 | Actions (open) | "수정" (link -> `/mercenary/{id}/edit`), "취소" (red, opens modal) |
| 3 | Delete modal | Title "모집글 취소", confirmation text about notifications, 돌아가기/취소하기, loading state "취소 중..." |
| 4 | Empty | `EmptyState` UserCheck + "용병 모집하기" CTA |

**Applied tab:**

| # | Step | Expected |
|---|------|----------|
| 1 | Application cards | Sport badge, status badge (대기 중/승인됨/거절됨/취소됨), team name, date/venue |
| 2 | "신청 취소" button | Only for `pending` status; red border, `hover:bg-red-50`; disabled during withdrawal ("취소 중...") |
| 3 | Click cancel | `withdrawMutation.mutateAsync`, success/error toast |
| 4 | Empty | `EmptyState` UserCheck + "용병 모집 보기" CTA |

### S48-09 Reviews Received (`/my/reviews-received`)

**Source**: `apps/web/src/app/(main)/my/reviews-received/page.tsx`

| # | Step | Expected |
|---|------|----------|
| 1 | Header | MobileGlassHeader "내가 받은 평가"; Desktop: h2 + subtitle |
| 2 | Summary card | Average score (4xl font-black), star rating visual, review count, distribution bar chart (5-star to 1-star) |
| 3 | Distribution bars | Amber-400 fill proportional to count/total, gray-100 track |

**Per review card:**

| # | Step | Expected |
|---|------|----------|
| 1 | Avatar | User icon in 40x40 gray circle |
| 2 | Reviewer name | `text-sm font-semibold` |
| 3 | Date | `text-xs text-gray-500` |
| 4 | Star rating | 5 stars, amber-400 filled up to rating |
| 5 | Comment | `text-sm text-gray-700` |
| 6 | Match title | `text-xs text-gray-500` |

**Note**: Currently uses mock data (`mockReviewsReceived`).

---

## Cross-Cutting Concerns (All Scenarios)

### Accessibility

| # | Requirement | Verification |
|---|-------------|-------------|
| 1 | All interactive elements | `min-h-[44px]` or `min-w-11 min-h-[44px]` touch targets |
| 2 | Icon buttons | `aria-label` present |
| 3 | Decorative icons | `aria-hidden="true"` |
| 4 | Toggle switches | `role="switch"`, `aria-checked` |
| 5 | Tab components | `role="tablist"` container, `role="tab"` + `aria-selected` per button |
| 6 | Modals | `Modal` component provides `role="dialog"`, `aria-modal="true"`, ESC handler, focus trap |
| 7 | Form labels | `<label htmlFor>` + `<input id>` pairing; sr-only labels where visual label absent |
| 8 | Focus rings | `focus-visible:outline` or `focus-visible:ring-2 focus-visible:ring-blue-500` |
| 9 | Color contrast | 4.5:1 minimum for text; status indicators use color + text/icon |

### Dark Mode

| # | Requirement | Verification |
|---|-------------|-------------|
| 1 | Background | `dark:bg-gray-900` page, `dark:bg-gray-800` cards |
| 2 | Text | `dark:text-white` headings, `dark:text-gray-200`/`dark:text-gray-400` body |
| 3 | Borders | `dark:border-gray-700` |
| 4 | Interactive | `dark:hover:bg-gray-700` hover states |
| 5 | Badges/pills | Dark variants for all colored badges |
| 6 | Contrast | 4.5:1 maintained in dark mode |

### Animations & Transitions

| # | Animation | Usage |
|---|-----------|-------|
| 1 | `animate-fade-in` | Page loads |
| 2 | `animate-slide-up` | Review expand |
| 3 | `animate-pulse` | Loading skeletons |
| 4 | `transition-colors` | Hover/focus state changes |
| 5 | `transition-[colors,transform]` | Interactive elements with scale |
| 6 | `active:scale-[0.98]` | Cards, buttons on press |
| 7 | `stagger-children` | List items appear sequentially |
| 8 | `duration-200` | Toggle switch slide |
| 9 | `prefers-reduced-motion` | All animations disabled |

### Viewport-Specific Behavior

| Breakpoint | Behavior |
|------------|----------|
| Mobile (< @3xl) | MobileGlassHeader, safe-area padding, bottom spacer h-24, floating bottom nav clearance |
| Desktop (@3xl+) | Block headings, breadcrumbs, multi-column layouts, no safe-area padding, no bottom nav |
| Chat mobile | Full-screen z-60 overlay |
| Chat desktop | 2-column embedded layout |

### Keyboard Navigation

| # | Pattern | Expected |
|---|---------|----------|
| 1 | Tab through page | All interactive elements reachable in DOM order |
| 2 | Enter on links | Navigate |
| 3 | Enter on buttons | Activate |
| 4 | ESC in modals | Close modal |
| 5 | Tab in modals | Focus trapped within modal |
| 6 | Enter in chat input | Send message |
| 7 | Tab through tabs | Focus moves between tab buttons |

### i18n (Language Matrix)

| # | Requirement | Verification |
|---|-------------|-------------|
| 1 | All `t()` / `tc()` / `te()` / `tt()` keys | Render in ko/en without missing key fallback |
| 2 | Hardcoded Korean strings | Group labels ("매칭", "팀 & 용병"), static content (terms, privacy), button text | Verify en translations exist or are acceptable |
| 3 | Date/time formatting | Korean weekdays, relative time labels | Verify locale-appropriate |
| 4 | RTL | Not applicable (ko/en are LTR) | -- |
