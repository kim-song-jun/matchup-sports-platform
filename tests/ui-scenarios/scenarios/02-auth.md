# 02-auth — Authentication & Onboarding Scenarios

> **Target pages**: `/login`, `/callback/kakao`, `/callback/naver`, `/onboarding`
> **Total scenarios**: 25
> **Viewports**: D1~D3(Desktop) · T1~T3(Tablet) · M1~M3(Mobile) — 9 types

---

### SC-02-001: Login page initial load (login tab)

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Not authenticated |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | Page loads with "TeamMeet" brand heading, subtitle "같이 운동할 사람, 찾고 계셨죠?", login/register tabs, email form | `SC-02-001-S01` |
| 2 | `wait(500)` | Suspense boundary resolves; form fields and social login buttons visible | `SC-02-001-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Background `bg-white dark:bg-gray-900` applied | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "TeamMeet" heading `text-3xl font-extrabold` visible | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "로그인" tab active with `border-gray-900` underline | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Form max-width `max-w-sm` centered | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | "홈으로" back link top-left with chevron icon, min-h 44px | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Email and password input fields rendered with labels | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | "로그인" submit button full-width, `size="lg"` | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-002: Login page — Suspense loading fallback

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Slow network / initial SSR |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` (throttled) | Skeleton loading state: brand skeleton (h-12 w-32), subtitle skeleton (h-4 w-48), 3 input skeletons (h-12 rounded-xl) | `SC-02-002-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Skeleton layout centered vertically and horizontally | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | 3 skeleton input placeholders visible | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-003: Switch to register tab

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login page loaded, login tab active |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("회원가입" tab)` | "회원가입" tab active (`border-gray-900`), "로그인" tab inactive (`border-transparent text-gray-400`) | `SC-02-003-S01` |
| 2 | `wait(100)` | Nickname input field appears below password; submit button text changes to "가입하기" | `SC-02-003-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | "회원가입" tab underline `border-gray-900 dark:border-white` | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Nickname field (`#register-nickname`) visible with label | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Submit button text is "가입하기" | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | 3 form fields (email, password, nickname) in `space-y-3` layout | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-004: Switch back to login tab

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Register tab active |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("로그인" tab)` | "로그인" tab active, nickname field hidden, submit button text "로그인" | `SC-02-004-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Nickname field no longer rendered | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Submit button text is "로그인" | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-005: Email login — valid credentials

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login tab active, registered user exists |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "test@example.com")` | Email input populated | `SC-02-005-S01` |
| 2 | `type(#login-password, "password123")` | Password input populated (masked) | `SC-02-005-S02` |
| 3 | `click("로그인" button)` | Button text changes to "로그인 중...", button disabled (`disabled` attr) | `SC-02-005-S03` |
| 4 | `wait(1000)` | Redirect to `/home` (or `redirect` param target) | `SC-02-005-S04` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Loading state: button text "로그인 중..." and disabled | ☐ | ❌ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Auth store tokens set (accessToken, refreshToken) | ☐ | ❌ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Router navigates to `/home` | ☐ | ❌ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-006: Email login — empty fields validation

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login tab active, fields empty |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("로그인" button)` | Toast error: "이메일과 비밀번호를 입력해주세요" | `SC-02-006-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Toast appears with error type and correct message | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No API call made | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Form is not submitted (no loading state) | ☐ | ✅ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-007: Email login — short password validation

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login tab active |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "test@example.com")` | Email input populated | `SC-02-007-S01` |
| 2 | `type(#login-password, "123")` | Password input populated (3 chars) | `SC-02-007-S02` |
| 3 | `click("로그인" button)` | Toast error: "비밀번호는 6자 이상이어야 해요" | `SC-02-007-S03` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Toast error message matches "비밀번호는 6자 이상이어야 해요" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No API call made | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-008: Email login — server error (wrong credentials)

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login tab active |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "wrong@example.com")` | Email populated | `SC-02-008-S01` |
| 2 | `type(#login-password, "wrongpassword")` | Password populated | `SC-02-008-S02` |
| 3 | `click("로그인" button)` | Loading state: "로그인 중..." | `SC-02-008-S03` |
| 4 | `wait(1000)` | Toast error: "로그인에 실패했어요" (or server-provided message via `extractErrorMessage`) | `SC-02-008-S04` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Button re-enables after error (isLoading = false) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Toast error displayed | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Form fields retain entered values | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-009: Email register — valid submission

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Register tab active |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "new@example.com")` | Email populated | `SC-02-009-S01` |
| 2 | `type(#login-password, "password123")` | Password populated | `SC-02-009-S02` |
| 3 | `type(#register-nickname, "테스트유저")` | Nickname populated | `SC-02-009-S03` |
| 4 | `click("가입하기" button)` | Button text "가입 중...", disabled | `SC-02-009-S04` |
| 5 | `wait(1000)` | Toast success: "가입 완료! 환영합니다", redirect to `/home` | `SC-02-009-S05` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Loading state: "가입 중..." button text and disabled | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Success toast displayed | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Redirect to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-010: Email register — missing nickname validation

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Register tab active |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "new@example.com")` | Email populated | `SC-02-010-S01` |
| 2 | `type(#login-password, "password123")` | Password populated | `SC-02-010-S02` |
| 3 | `click("가입하기" button)` | Toast error: "닉네임을 입력해주세요" (nickname empty) | `SC-02-010-S03` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Toast error with correct message | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No loading state triggered | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-011: Email register — server error (duplicate email)

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Register tab active, email already registered |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "existing@example.com")` | Email populated | `SC-02-011-S01` |
| 2 | `type(#login-password, "password123")` | Password populated | `SC-02-011-S02` |
| 3 | `type(#register-nickname, "기존유저")` | Nickname populated | `SC-02-011-S03` |
| 4 | `click("가입하기" button)` | Loading, then toast error: "가입에 실패했어요" (or server message) | `SC-02-011-S04` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Button re-enables after error | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Error toast with fallback "가입에 실패했어요" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-012: Form submit via Enter key

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login tab active, valid email and password entered |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `type(#login-email, "test@example.com")` | Email populated | `SC-02-012-S01` |
| 2 | `type(#login-password, "password123")` | Password populated | `SC-02-012-S02` |
| 3 | `press(Enter)` | Form submitted (same as clicking "로그인" button), loading state triggers | `SC-02-012-S03` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Form `onSubmit` fires on Enter | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Loading state visible | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-013: Social login — Kakao button

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | `NEXT_PUBLIC_KAKAO_CLIENT_ID` and `NEXT_PUBLIC_KAKAO_REDIRECT_URI` env vars set |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | Kakao button visible below divider "또는", with KakaoIcon (yellow bg) and text "카카오로 시작하기" | `SC-02-013-S01` |
| 2 | `hover("카카오로 시작하기" button)` | Hover effect: `bg-gray-50 dark:bg-gray-700` | `SC-02-013-S02` |
| 3 | `click("카카오로 시작하기" button)` | Browser navigates to `kauth.kakao.com/oauth/authorize?...` with correct `client_id` and `redirect_uri` | `SC-02-013-S03` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Kakao icon: yellow bg circle (#FEE500) with dark speech-bubble SVG | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Button `aria-label="카카오 계정으로 로그인"` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Button `min-h-[44px]` touch target | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Active press: `scale-[0.98]` transform | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | OAuth URL includes `response_type=code` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-014: Social login — Naver button

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | `NEXT_PUBLIC_NAVER_CLIENT_ID` and `NEXT_PUBLIC_NAVER_REDIRECT_URI` env vars set |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | Naver button visible with NaverIcon (green "N") and text "네이버로 시작하기" | `SC-02-014-S01` |
| 2 | `hover("네이버로 시작하기" button)` | Hover effect applied | `SC-02-014-S02` |
| 3 | `click("네이버로 시작하기" button)` | Browser navigates to `nid.naver.com/oauth2.0/authorize?...` with `state` param; `naverOAuthState` saved to `sessionStorage` | `SC-02-014-S03` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Naver icon: green (#03C75A) "N" SVG | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Button `aria-label="네이버 계정으로 로그인"` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | CSRF state saved to sessionStorage | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | OAuth URL includes `state` param | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-015: Social login — buttons hidden when env vars missing

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | `NEXT_PUBLIC_KAKAO_CLIENT_ID` and `NEXT_PUBLIC_NAVER_CLIENT_ID` not set |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | Social login section (divider "또는" + OAuth buttons) not rendered; `SocialLoginButtons` returns null | `SC-02-015-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | No "또는" divider rendered | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No OAuth buttons rendered | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-016: "로그인 없이 둘러보기" link

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login page loaded |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `hover("로그인 없이 둘러보기" link)` | Text color changes: `text-gray-400` -> `text-gray-600 dark:text-gray-300` | `SC-02-016-S01` |
| 2 | `click("로그인 없이 둘러보기" link)` | Navigate to `/home` without authentication | `SC-02-016-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Link has `min-h-[44px]` touch target | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Arrow icon visible next to text | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | `data-testid="browse-without-login"` present | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-017: "홈으로" back link

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | Login page loaded |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `hover("홈으로" link)` | Text color: `text-gray-500` -> `text-gray-700 dark:text-gray-200` | `SC-02-017-S01` |
| 2 | `click("홈으로" link)` | Navigate to `/home` | `SC-02-017-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | `aria-label="홈으로 돌아가기"` present | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Chevron-left SVG icon visible | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Touch target `min-h-[44px] min-w-11` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-018: Redirect param — sanitization and application

| Item | Value |
|------|-------|
| **URL** | `/login?redirect=/matches/123` |
| **Auth** | all |
| **Precondition** | Valid redirect param |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login?redirect=/matches/123)` | Page loads normally; redirect stored internally | `SC-02-018-S01` |
| 2 | `type(#login-email, "test@example.com")` | Email populated | `SC-02-018-S02` |
| 3 | `type(#login-password, "password123")` | Password populated | `SC-02-018-S03` |
| 4 | `click("로그인" button)` | After successful login, redirect to `/matches/123` (not `/home`) | `SC-02-018-S04` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | `sanitizeRedirect` returns `/matches/123` for valid relative path | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Router pushes to `/matches/123` after login | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-019: Redirect param — open redirect prevention

| Item | Value |
|------|-------|
| **URL** | `/login?redirect=https://evil.com` |
| **Auth** | all |
| **Precondition** | Malicious redirect param |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login?redirect=https://evil.com)` | Page loads; `sanitizeRedirect` returns `/home` (blocks absolute URL) | `SC-02-019-S01` |
| 2 | `navigate(/login?redirect=//evil.com)` | `sanitizeRedirect` returns `/home` (blocks protocol-relative URL) | `SC-02-019-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Absolute URL redirect blocked -> fallback `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Protocol-relative URL blocked -> fallback `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | No redirect to external domain | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-020: Authenticated user auto-redirect

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | authenticated |
| **Precondition** | User already logged in (auth store `isAuthenticated = true`) |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | `useEffect` detects `isAuthenticated`, calls `router.replace('/home')` — user never sees login form | `SC-02-020-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Automatic redirect to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Login page not displayed (flash-free) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-021: Dev login panel (development environment only)

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | `NODE_ENV !== 'production'` |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | Dev login panel visible at bottom: gray bg area with "개발 모드" label, nickname input, "입장" button, 3 persona chips | `SC-02-021-S01` |
| 2 | `type([data-testid="dev-login-input"], "테스트닉")` | Dev nickname input populated | `SC-02-021-S02` |
| 3 | `click("입장" button)` | Dev login API called with "테스트닉", loading state, redirect to `/home` | `SC-02-021-S03` |
| 4 | `click("축구왕민수" chip)` | Dev login API called with "축구왕민수", redirect to `/home` | `SC-02-021-S04` |
| 5 | `click("농구러버지영" chip)` | Dev login with "농구러버지영" | `SC-02-021-S05` |
| 6 | `click("하키마스터준호" chip)` | Dev login with "하키마스터준호" | `SC-02-021-S06` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Dev panel `bg-gray-50 dark:bg-gray-800 rounded-t-2xl` styling | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | `data-testid="dev-login-panel"` present | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Persona chips: rounded-full, border, hover effect | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Enter key submits dev login from input field | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | All buttons disabled during loading (`disabled:opacity-50`) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-022: Kakao OAuth callback — success

| Item | Value |
|------|-------|
| **URL** | `/callback/kakao?code=valid_code` |
| **Auth** | all |
| **Precondition** | Kakao OAuth flow completed, valid authorization code |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/kakao?code=valid_code)` | Spinner visible (h-10 w-10 `animate-spin`, blue-500 top border), "로그인 중..." text | `SC-02-022-S01` |
| 2 | `wait(1500)` | API `POST /auth/kakao` succeeds; auth store updated; `router.replace('/home')` | `SC-02-022-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Spinner `role="status"` with `aria-label="로그인 처리 중"` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Centered layout: `flex min-h-dvh items-center justify-center` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Background `bg-white dark:bg-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Redirect to `/home` after auth store update | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-023: Kakao OAuth callback — error / cancellation

| Item | Value |
|------|-------|
| **URL** | `/callback/kakao?error=access_denied` |
| **Auth** | all |
| **Precondition** | User cancelled Kakao OAuth or error occurred |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/kakao?error=access_denied)` | Error message: "카카오 로그인이 취소되었거나 오류가 발생했어요." with "로그인 페이지로" button | `SC-02-023-S01` |
| 2 | `click("로그인 페이지로" button)` | `router.replace('/login')` — navigate to login page | `SC-02-023-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Error text `text-base text-gray-700 dark:text-gray-300 text-center` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | "로그인 페이지로" button `variant="primary"` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Centered layout with gap-4 | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-024: Kakao OAuth callback — API failure

| Item | Value |
|------|-------|
| **URL** | `/callback/kakao?code=invalid_code` |
| **Auth** | all |
| **Precondition** | Valid code format but API rejects it |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/kakao?code=invalid_code)` | Spinner shown initially | `SC-02-024-S01` |
| 2 | `wait(2000)` | API fails; error message: "카카오 로그인에 실패했어요. 다시 시도해 주세요." with "로그인 페이지로" button | `SC-02-024-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Spinner replaced by error message | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Error message exact text match | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "로그인 페이지로" button functional | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-025: Naver OAuth callback — success

| Item | Value |
|------|-------|
| **URL** | `/callback/naver?code=valid_code&state=matching_state` |
| **Auth** | all |
| **Precondition** | Naver OAuth completed, `naverOAuthState` in sessionStorage matches `state` param |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/naver?code=valid_code&state=matching_state)` | Spinner visible, "로그인 중..." text | `SC-02-025-S01` |
| 2 | `wait(1500)` | CSRF state verified, API `POST /auth/naver` succeeds, `sessionStorage.naverOAuthState` removed, redirect to `/home` | `SC-02-025-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Spinner with `aria-label="로그인 처리 중"` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | sessionStorage `naverOAuthState` cleaned up | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Redirect to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-026: Naver OAuth callback — CSRF state mismatch

| Item | Value |
|------|-------|
| **URL** | `/callback/naver?code=valid_code&state=wrong_state` |
| **Auth** | all |
| **Precondition** | `naverOAuthState` in sessionStorage does NOT match `state` param |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/naver?code=valid_code&state=wrong_state)` | Error message: "보안 검증에 실패했어요. 다시 로그인해 주세요." with "로그인 페이지로" button | `SC-02-026-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | CSRF error message displayed | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No API call made (blocked before request) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | "로그인 페이지로" button navigates to `/login` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-027: Naver OAuth callback — error / cancellation

| Item | Value |
|------|-------|
| **URL** | `/callback/naver?error=access_denied` |
| **Auth** | all |
| **Precondition** | User cancelled Naver OAuth |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/naver?error=access_denied)` | Error: "네이버 로그인이 취소되었거나 오류가 발생했어요." with "로그인 페이지로" button | `SC-02-027-S01` |
| 2 | `click("로그인 페이지로" button)` | Navigate to `/login` | `SC-02-027-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Error text matches exactly | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Button variant "primary" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-028: Naver OAuth callback — API failure

| Item | Value |
|------|-------|
| **URL** | `/callback/naver?code=invalid_code&state=valid_state` |
| **Auth** | all |
| **Precondition** | Valid state, but API rejects code |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/callback/naver?code=invalid_code&state=valid_state)` | Spinner shown | `SC-02-028-S01` |
| 2 | `wait(2000)` | Error: "네이버 로그인에 실패했어요. 다시 시도해 주세요." with button | `SC-02-028-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Spinner transitions to error state | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Error message and recovery button visible | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-029: Onboarding — Step 1 (sport selection) initial load

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Onboarding not yet completed |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/onboarding)` | Full-screen overlay (`fixed inset-0 z-[60]`), step indicator (dot 1 active, dot 2 inactive), heading "무슨 운동을 좋아하세요?", 9 sport cards in 3-column grid, "다음" button, "건너뛰기" and close (X) buttons | `SC-02-029-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Full-screen overlay `fixed inset-0 z-[60] bg-white dark:bg-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Step indicator: dot 1 `w-8 bg-gray-900`, dot 2 `w-4 bg-gray-200` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 9 sport options in `grid-cols-3 gap-3` layout | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Each sport card: icon + label, `rounded-2xl p-4 border` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | "건너뛰기" button `min-h-[44px]` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Close (X) button `min-h-[44px] min-w-11 rounded-full` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | Max-width `max-w-md mx-auto` container | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V8 | `aria-label` on step progress: "진행 단계: 1/2" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-030: Onboarding — sport card selection toggle

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 1 visible, no sports selected |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("풋살" sport card)` | Card selected: `ring-2 ring-blue-500 border-blue-500 bg-blue-50`, checkmark badge top-right, label bold, "다음" button changes to "풋살 선택 완료" | `SC-02-030-S01` |
| 2 | `click("농구" sport card)` | Second card selected, button text "풋살, 농구 선택 완료" | `SC-02-030-S02` |
| 3 | `click("풋살" sport card)` | Futsal deselected (toggle off), ring/badge removed, button text "농구 선택 완료" | `SC-02-030-S03` |
| 4 | `click("농구" sport card)` | All deselected, button text reverts to "다음" | `SC-02-030-S04` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Selected card `ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/20` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Checkmark badge: `bg-gray-900 dark:bg-white` circle, top-right `-top-1 -right-1` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Unselected card: `border-gray-200 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Active press: `scale-[0.96]` on card | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Button text dynamically reflects selected sports | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-031: Onboarding — "다음" button proceeds to Step 2

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 1 visible, sports optionally selected |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("다음" button)` | Step transitions to "features"; step indicator dot 2 active (`w-8 bg-gray-900`), dot 1 inactive; heading "TeamMeet은 이런 걸 해줘요"; 3 feature cards visible | `SC-02-031-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Step indicator updated: dot 2 `w-8`, dot 1 `w-4` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Heading "TeamMeet은 이런 걸 해줘요" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | 3 feature cards in `space-y-3` layout | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | "시작하기" button `bg-blue-500 text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | "종목 다시 선택" link below CTA | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-032: Onboarding — Step 2 feature cards display

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 2 (features) visible |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `wait(300)` | 3 feature cards rendered with staggered animation (100ms delay each): blue accent (AI matching), emerald accent (trust system), amber accent (all-in-one platform) | `SC-02-032-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Card 1: `bg-blue-50 dark:bg-blue-900/20 border-blue-200` with blue dot | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Card 2: `bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200` with emerald dot | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Card 3: `bg-amber-50 dark:bg-amber-900/20 border-amber-200` with amber dot | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Each card `rounded-2xl border p-5` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Staggered `animationDelay`: 0ms, 100ms, 200ms | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-033: Onboarding — Step 2 subtitle reflects selected sports

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 2 visible, "풋살" and "농구" selected in Step 1 |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/onboarding)` -> select sports -> `click("다음")` | Subtitle: "풋살, 농구 매치를 바로 찾아볼 수 있어요" | `SC-02-033-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Subtitle includes selected sport names | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | No sports selected: subtitle "운동 파트너를 찾는 가장 빠른 방법" | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-034: Onboarding — "종목 다시 선택" goes back to Step 1

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 2 visible |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("종목 다시 선택" button)` | Returns to Step 1 (sport grid), step indicator dot 1 active, previously selected sports retained | `SC-02-034-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Sport grid visible again | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Previously selected sports still have ring-2 highlight | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Step indicator reverts to dot 1 active | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-035: Onboarding — "시작하기" completes onboarding

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 2 visible, sports selected |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("시작하기" button)` | `localStorage.onboarding_completed` set to "true"; `localStorage.preferred_sports` set to JSON array; redirect to `/home` | `SC-02-035-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | `localStorage.getItem('onboarding_completed') === 'true'` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | `localStorage.preferred_sports` contains selected sport keys | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Redirect to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Button `active:scale-[0.98]` press effect | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-036: Onboarding — "건너뛰기" from Step 1

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 1 visible |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("건너뛰기" button)` | `localStorage.onboarding_completed` set to "true"; no `preferred_sports` saved (empty selection); redirect to `/home` | `SC-02-036-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | `onboarding_completed` set in localStorage | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | `preferred_sports` not set (no selection) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Redirect to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-037: Onboarding — close (X) button from Step 1

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 1 visible |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click(X close button)` | Navigate to `/home` via `router.push('/home')` (no localStorage write — onboarding not marked complete) | `SC-02-037-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | `aria-label="온보딩 닫기"` on close button | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Navigate to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | `onboarding_completed` NOT set (may re-show onboarding) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Close button hover: `hover:bg-gray-100 dark:hover:bg-gray-800` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-038: Onboarding — "건너뛰기" from Step 2

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | Step 2 visible |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `click("건너뛰기" button)` | Same as "시작하기": localStorage set, redirect to `/home` | `SC-02-038-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | `onboarding_completed` set | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Redirect to `/home` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-039: Dark mode — login page

| Item | Value |
|------|-------|
| **URL** | `/login` |
| **Auth** | all |
| **Precondition** | System dark mode enabled |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/login)` | Dark mode applied: `bg-gray-900`, heading `text-white`, tabs `dark:border-white` active, inputs dark bg, social buttons `dark:bg-gray-800 dark:border-gray-700` | `SC-02-039-S01` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Page background `dark:bg-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Heading `dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Active tab `dark:border-white dark:text-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Social buttons `dark:bg-gray-800 dark:border-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | Dev panel `dark:bg-gray-800` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V6 | Divider `dark:bg-gray-700` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V7 | All text meets WCAG 4.5:1 contrast ratio | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |

---

### SC-02-040: Dark mode — onboarding page

| Item | Value |
|------|-------|
| **URL** | `/onboarding` |
| **Auth** | all |
| **Precondition** | System dark mode enabled |

#### Steps

| # | Action | Expected Result | Screenshot |
|---|--------|-----------------|------------|
| 1 | `navigate(/onboarding)` | Dark mode: `bg-gray-900`, heading `text-white`, sport cards `dark:border-gray-700 dark:bg-gray-900`, step dots `dark:bg-white` active | `SC-02-040-S01` |
| 2 | `click("풋살" card)` | Selected: `dark:bg-blue-950/20`, checkmark badge `dark:bg-white` with `dark:text-gray-900` check SVG | `SC-02-040-S02` |

#### Verification Checklist

| # | Verification Item | D1 | D2 | D3 | T1 | T2 | T3 | M1 | M2 | M3 |
|---|-------------------|----|----|----|----|----|----|----|----|-----|
| V1 | Overlay `dark:bg-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V2 | Active step dot `dark:bg-white` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V3 | Selected card `dark:bg-blue-950/20` with blue ring | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V4 | Feature cards dark accent variants (blue-900/20, emerald-900/20, amber-900/20) | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| V5 | CTA button "다음" `dark:bg-white dark:text-gray-900` | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
