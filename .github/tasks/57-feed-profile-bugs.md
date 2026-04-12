# Task 57: Feed Empty State & Profile Desktop Timeout Bugs

발견 출처: Task 56 visual audit (batch5 run v2-batch5-full, 2026-04-12)

---

## Bug 1 (P1): `/feed` empty state 텍스트 버그

### Context

`/feed` 페이지는 로그인한 사용자의 활동 피드를 보여준다. 피드 데이터가 없을 때 empty state를 렌더링하는데, 로그인 여부와 관계없이 동일한 "로그인하면 내 활동 피드를 볼 수 있어요" 문자열을 출력하고 있다.

### Goal

인증된 사용자에게는 "아직 활동 내역이 없어요" 계열 메시지를, 비인증 사용자에게는 "로그인하면 내 활동 피드를 볼 수 있어요" 메시지를 별도로 노출한다.

### Reproduction

1. 로그인한 상태로 `/feed` 접근
2. 활동 데이터가 없는 계정(신규 dev-login 페르소나 등) 사용
3. empty state 텍스트가 "로그인하면 내 활동 피드를 볼 수 있어요"로 노출됨 (인증 상태임에도 불구하고)

### Fix Location

- `apps/web/src/app/(main)/feed/page.tsx` lines 157-160: 로그인 상태(`isAuthenticated`/세션 여부)와 빈 데이터 조건 분리
- `apps/web/messages/ko.json` lines 252-253: 인증 사용자용 empty state 문자열 키 추가 (예: `feed.emptyAuthenticated`)

---

## Bug 2 (P2): `/profile` desktop-md navigation timeout

### Context

visual audit batch5에서 `/profile` 페이지를 desktop-md viewport로 캡처할 때 120초 timeout이 발생했다. 동일 페이지를 mobile-md viewport로 캡처할 때는 정상 동작했다.

### Goal

desktop-md viewport에서 `/profile` 페이지가 timeout 없이 로드되어야 한다.

### Reproduction

1. `node scripts/qa/run-visual-audit.mjs capture --route /profile --viewports desktop-md --states default` 실행
2. 120초 후 navigation timeout 발생
3. `--viewports mobile-md` 로 동일 실행 시 정상 캡처

### Suspected Cause

desktop-only 렌더링 분기 또는 desktop viewport에서만 트리거되는 데이터 fetch / SSR 로직. `useEffect` 내 viewport 조건부 fetch, 또는 desktop 전용 컴포넌트의 무한 대기 가능성.

### Fix Location

- `apps/web/src/app/(main)/profile/page.tsx`: desktop viewport 조건부 렌더링 분기 확인
- `apps/web/src/app/(main)/profile/` 하위 client component: `useEffect` 또는 React Query `enabled` 조건 확인
- ready selector가 desktop layout에서만 존재하지 않는 DOM 요소를 기다리고 있는지 `scripts/qa/visual-audit-config.mjs`에서 `/profile` 엔트리 검토
