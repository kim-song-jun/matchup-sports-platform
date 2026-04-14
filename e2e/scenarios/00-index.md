# E2E 시나리오 인덱스

> 생성일: 2026-04-14
> 총 시나리오: **409개** | 총 라인: **13,004줄**
> 커버리지: 90+ 페이지, 60+ 컴포넌트

## 시나리오 파일 목록

| # | 파일 | 영역 | 시나리오 수 | 라인 수 | UX 리뷰 |
|---|------|------|------------|---------|---------|
| 01 | [01-auth-landing.md](./01-auth-landing.md) | Auth, Onboarding, Landing, About, FAQ, Guide, Pricing | 64 | 1,789 | ✅ 25건 |
| 02 | [02-matches.md](./02-matches.md) | 개인 매치 CRUD, 팀 매치 CRUD, 도착인증, 스코어, 평가 | 50 | 1,476 | ✅ 22건 |
| 03 | [03-teams-mercenary.md](./03-teams-mercenary.md) | 팀 CRUD, 멤버 관리, 소유권 이전, 용병 CRUD | 42 | 1,249 | ✅ 15건 |
| 04 | [04-marketplace-lessons.md](./04-marketplace-lessons.md) | 장터 CRUD, 강좌 CRUD, 수강권, 캘린더 | 67 | 1,901 | ✅ 10건 |
| 05 | [05-chat-payments.md](./05-chat-payments.md) | 채팅, Socket.IO, 결제, 환불, 알림 | 60 | 1,805 | ✅ 20건 |
| 06 | [06-my-profile-settings.md](./06-my-profile-settings.md) | 마이페이지 9종, 프로필, 설정, 계정, 타 유저 | 37 | 1,425 | ✅ 20건 |
| 07 | [07-venues-home-other.md](./07-venues-home-other.md) | 시설, 홈, 피드, 리뷰, 뱃지, 대회, 네비게이션 | 51 | 1,992 | ✅ 31건 |
| 08 | [08-admin.md](./08-admin.md) | 관리자 대시보드, 사용자/매치/팀/시설/강좌/결제/정산/분쟁 관리 | 38 | 1,367 | ✅ 11건 |

## 페이지 커버리지 매트릭스

### Public Pages (비로그인)
| 페이지 | 경로 | 시나리오 파일 |
|--------|------|--------------|
| Root | `/` | 01 |
| Login | `/login` | 01 |
| Landing | `/landing` | 01 |
| About | `/about` | 01 |
| FAQ | `/faq` | 01 |
| Guide | `/guide` | 01 |
| Pricing | `/pricing` | 01 |
| OAuth Callback | `/callback/kakao`, `/callback/naver` | 01 |

### Main Pages (인증 필요)
| 페이지 | 경로 | 시나리오 파일 |
|--------|------|--------------|
| Home | `/home` | 07 |
| Onboarding | `/onboarding` | 01 |
| Feed | `/feed` | 07 |
| Matches | `/matches`, `/matches/new`, `/matches/[id]`, `/matches/[id]/edit` | 02 |
| Team Matches | `/team-matches/*` (list, new, detail, edit, arrival, score, evaluate) | 02 |
| Teams | `/teams/*` (list, new, detail, edit, members, matches, mercenary) | 03 |
| Mercenary | `/mercenary/*` (list, new, detail, edit) | 03 |
| Marketplace | `/marketplace/*` (list, new, detail, edit) | 04 |
| Lessons | `/lessons/*` (list, new, detail, edit) | 04 |
| Chat | `/chat`, `/chat/[id]` | 05 |
| Payments | `/payments/*` (list, detail, refund, checkout) | 05 |
| Notifications | `/notifications` | 05 |
| My Pages | `/my/*` (matches, team-matches, mercenary, lessons, listings, teams, etc.) | 06 |
| Profile | `/profile` | 06 |
| Settings | `/settings/*` (main, notifications, account, terms, privacy) | 06 |
| User Profile | `/user/[id]` | 06 |
| Venues | `/venues/*` (list, detail, edit) | 07 |
| Reviews | `/reviews` | 07 |
| Badges | `/badges` | 07 |
| Tournaments | `/tournaments/*` (list, new, detail) | 07 |

### Admin Pages
| 페이지 | 경로 | 시나리오 파일 |
|--------|------|--------------|
| Dashboard | `/admin/dashboard` | 08 |
| Statistics | `/admin/statistics` | 08 |
| Users | `/admin/users`, `/admin/users/[id]` | 08 |
| Matches | `/admin/matches`, `/admin/matches/[id]` | 08 |
| Team Matches | `/admin/team-matches`, `/admin/team-matches/[id]` | 08 |
| Teams | `/admin/teams`, `/admin/teams/[id]` | 08 |
| Venues | `/admin/venues`, `/admin/venues/[id]`, `/admin/venues/new` | 08 |
| Lessons | `/admin/lessons`, `/admin/lessons/[id]` | 08 |
| Lesson Tickets | `/admin/lesson-tickets` | 08 |
| Mercenary | `/admin/mercenary` | 08 |
| Payments | `/admin/payments` | 08 |
| Settlements | `/admin/settlements` | 08 |
| Reviews | `/admin/reviews` | 08 |
| Disputes | `/admin/disputes`, `/admin/disputes/[id]` | 08 |

## UX 리뷰 종합 통계

| 심각도 | 건수 | 주요 패턴 |
|--------|------|-----------|
| 🔴 Critical | ~34건 | 터치 타겟 44px 미달, `extractErrorMessage` 미사용, Modal 컴포넌트 미사용 (focus trap 누락), ARIA 역할 누락 |
| 🟡 Warning | ~80건 | 다크모드 쌍 누락, `aria-pressed`/`aria-selected` 누락, 하드코딩 색상, transition 누락 |
| 💡 Suggestion | ~40건 | 스켈레톤 통일, 애니메이션 개선, 컴포넌트 중복 제거, 마이크로카피 개선 |

### 반복 패턴 Top 5

| # | 패턴 | 발견 파일 수 | 수정 방법 |
|---|------|-------------|-----------|
| 1 | `err as { response?... }` 직접 타입 단언 | 8+ 파일 | `extractErrorMessage(err, 'fallback')` 사용 |
| 2 | 인라인 모달 (raw div) | 5+ 파일 | `components/ui/modal.tsx` 사용 |
| 3 | 터치 타겟 < 44px | 전체 | `min-h-[44px] min-w-[44px]` 추가 |
| 4 | 다크모드 쌍 누락 | 전체 | `bg-white` → `bg-white dark:bg-gray-800` 등 |
| 5 | `aria-pressed`/`aria-selected` 누락 | 6+ 파일 | 필터/탭 버튼에 ARIA 속성 추가 |

## 실행 순서

권장 실행 순서 (의존성 기반):
1. `01-auth-landing.md` — 로그인/온보딩이 다른 모든 테스트의 전제 조건
2. `07-venues-home-other.md` — 홈 + 내비게이션 검증
3. `02-matches.md` — 핵심 도메인 (개인 매치)
4. `03-teams-mercenary.md` — 핵심 도메인 (팀/용병)
5. `04-marketplace-lessons.md` — 부가 도메인
6. `05-chat-payments.md` — 횡단 관심사 (채팅, 결제)
7. `06-my-profile-settings.md` — 사용자 설정
8. `08-admin.md` — 관리자 (독립적)
