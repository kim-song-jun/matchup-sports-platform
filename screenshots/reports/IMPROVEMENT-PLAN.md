# 디자인·UX·A11y 통합 개선 계획서
> 기준: DESIGN.md canonical rules vs 시각 감사 결과 (4 batches, 211장)  
> 작성: 2026-04-13 | 분석팀: Design Lead + UX Manager + UI Manager (병렬 에이전트)

---

## 총평

| 팀 | Critical | Warning | 검증 완료 |
|----|----------|---------|----------|
| 디자인 | 27건 | 27건 | DESIGN.md §1-12 전 항목 |
| UX | 12건 | 9건 | 사용자 여정 5개 Journey 전수 |
| A11y | 7건 (WCAG) | 7건 | 실제 코드 확인 기반 (오탐 3건 제거) |

**스크린샷 분석 vs 실제 코드 불일치 주의**: A11y 팀이 실제 코드를 열어본 결과, 로그인 폼 label/로그인 폼 placeholder-only/하단내비 aria-label 3건은 **이미 구현 완료** — 스크린샷 오탐. 아래 과제표는 실제 미구현 건만 포함.

---

## P0 — 즉시 수정 (빌드 차단 / 브랜드 파괴)

### P0-A: 빌드·런타임 차단

| # | 이슈 | 파일 | 수정 방법 | 난이도 |
|---|------|------|-----------|--------|
| A1 | **폰트 파일 경로 미스매치** — `../../fonts/PretendardVariable.woff2` 경로 오류 | `apps/web/src/app/layout.tsx:10` | 폰트 파일을 `apps/web/public/fonts/`로 이동 후 `src: '/fonts/PretendardVariable.woff2'`로 수정 | S |
| A2 | **404 커스텀 페이지 미구현** — Next.js 기본 "This page could not be found." 노출 | `apps/web/src/app/not-found.tsx` (신규) | `EmptyState` + `<h1>페이지를 찾을 수 없어요</h1>` + `/home` blue CTA. `<main id="main-content">` 랜드마크 필수 | S |
| A3 | **React Runtime Error** — 강좌 운영 시간 객체 React child 직접 전달 (`{fri,mon,sat...}`) | 강좌 관련 컴포넌트 (재현 시 스택 추적 필요) | `Object.entries(operatingHours).map(([day, val]) => ...)` 포매터 적용. `ErrorState` fallback 보장 | S |
| A4 | **API 서버 404 raw JSON 노출** — 브라우저에 `{"status":"error","statusCode":404}` 직접 표시 | `next.config.ts` rewrites + API 레이어 | `lib/api.ts` 404 응답 시 throw + 각 페이지 catch에서 `<ErrorState>` 렌더. 글로벌 `error.tsx` 추가 | M |

### P0-B: 브랜드 정체성 위반

| # | 이슈 | 파일 | 수정 방법 | 난이도 |
|---|------|------|-----------|--------|
| B1 | **DESIGN.md 자체 브랜드명 "Teameet" 잔존** — canonical source 불일치 | `DESIGN.md` (1행 포함 5곳+) | `sed -i 's/Teameet/TeamMeet/g' DESIGN.md` 후 맥락 검토. **B2 수정 전 필수 선행** | S |
| B2 | **UI 전체 "Teameet" → "TeamMeet" 교체** — 로고·헤더·Admin 사이드바·랜딩 전체 | `grep -rn "Teameet" apps/web/src/` | 텍스트 치환 + 로고 SVG `<text>/<title>` 수정 + `public/` 로고 이미지 교체 | M |

---

## P1 — 이번 스프린트 (디자인 시스템 일관성)

### 디자인 규칙 위반

| # | 이슈 | 위반 규칙 | 파일 | 수정 방법 | 난이도 |
|---|------|-----------|------|-----------|--------|
| 1 | **랜딩 hero 전면 파란 그라디언트 + wave divider** | §5 Surface Matrix (Landing: glossy showcase 금지) | `apps/web/src/app/landing/` | `bg-gradient-to-b from-blue-600` 제거 → `bg-white` solid. wave divider SVG 제거. copy + blue-500 CTA로 에너지 표현 | L |
| 2 | **매치·강좌·팀매칭 카드 한쪽 색상 보더** (`border-l-4 border-blue-*`) | §4.2 Border + CLAUDE.md anti-pattern | 각 card 컴포넌트 | `border-l-4 border-blue-400` 제거 → `border border-gray-100` 전체 보더. 강조는 `bg-blue-50` 배경 또는 배지 | S |
| 3 | **Admin KPI 카드 컬러 보더** (`border-t-4 border-blue/green/amber/purple`) | §4.2 Border | `apps/web/src/app/admin/dashboard/page.tsx` | 컬러 보더 제거 → 아이콘 컬러 또는 `bg-blue-50` 배경 tint로 대체 | S |
| 4 | **홈 팀매칭 배너 glass 재질** (content 영역 glass 사용) | §4.4 Glass (chrome만 허용) | `apps/web/src/app/(main)/home/home-client.tsx` | `backdrop-blur`/`bg-white/20` 제거 → `bg-white` 또는 `bg-gray-50` solid | S |
| 5 | **매치 디테일 중첩 border container** (4개 섹션 각각 full border) | §4.2 (다중 border 중첩 금지) | `apps/web/src/app/(main)/matches/[id]/` | 내부 4개 섹션 border 제거 → `border-t border-gray-100` 구분선 + `mt-6` 여백. 외곽 1개만 유지 | M |
| 6 | **마이페이지 파란 프로모션 hero 블록** ("운동 메이트, 찾고 계셨죠?") | §4.3 Layout (utility page hero 금지) | `apps/web/src/app/(main)/profile/page.tsx` | hero 블록 전면 제거 → compact tool layout: 아바타+이름+통계 행(`grid grid-cols-3`) `p-5 bg-white` | M |
| 7 | **강좌 가격 `text-3xl` hero 취급** | §11 (text-3xl: admin KPI·프로필 통계만) | `apps/web/src/components/lesson/lesson-card.tsx` | `text-3xl` → `text-sm font-bold`. 정보 위계 §11: 시간→장소→참가현황→가격 순 재배치 | S |
| 8 | **"마감임박" 배지 amber 토큰 미준수 + 아이콘 없음** | §12 (경고: `bg-amber-50 text-amber-600`) | 매치·강좌 card 컴포넌트 | `bg-amber-50 text-amber-600 rounded-full px-2 py-0.5 text-2xs font-medium` + Lucide `Clock` 아이콘 (`h-3 w-3 aria-hidden`) | S |
| 9 | **Admin "모집중" 배지 green 토큰** (DESIGN.md 미정의) | §12 Status 색상 맵 | `apps/web/src/app/admin/` 배지 전반 | `bg-green-50 text-green-600` → `bg-blue-50 text-blue-600` (성공/모집중=blue) | S |
| 10 | **홈 화면 2가지 버전 혼재** (이모지 그리드 vs 종목 컬러 원형 아이콘) | §10 Card System (신규 패턴 추가 금지) | `apps/web/src/app/(main)/home/` | 이모지 그리드 버전 완전 제거. 단일 버전으로 통일 | S |
| 11 | **종목 컬러 원형 배경 opacity 위반** (홈 풋살/농구 불투명 단색) | §12 (tint `/40` 이하만 허용) | 홈 종목 아이콘 컴포넌트 | `bg-green-500` → `bg-green-500/30`, `bg-orange-500` → `bg-orange-500/30`. `sportCardAccent[type]` tint 클래스 사용 | S |
| 12 | **OAuth 버튼 3색 경쟁** (파란/올리브골드/초록 동등 경쟁) | §3 One accent, quiet neutrals | `apps/web/src/app/(auth)/login/page.tsx` | 소셜 버튼 `bg-white border border-gray-200` 통일 + 로고+텍스트. 일반 로그인을 primary 위치로 | M |
| 13 | **비로그인 빈 화면 4곳** (장터·팀·클럽 목록 전체 숨김 + 매치 만들기) | §13 EmptyState 필수 사용 | 각 목록 page.tsx | 비로그인 분기에서 목록 숨김 제거 → `<EmptyState icon={...} title="로그인이 필요해요" cta={{ label: "로그인", href: "/login" }} />` | M |
| 14 | **이미지 fallback 부재** (강좌·장터·팀 카드) | §13 로딩 상태 스켈레톤 | 각 card 컴포넌트 | `onError` → `bg-gray-100` + `SportIconMap[type]`. `next/image placeholder="blur"` + `blurDataURL` | M |

### UX 여정별 즉시 수정

| # | Journey | 마찰 포인트 | 파일 | 수정 방법 |
|---|---------|-----------|------|-----------|
| U1 | 탐색 | **정원 표시 "명" 접미사 누락** (`10/12`만 표시) | `apps/web/src/components/match/match-card.tsx:83` | `{currentPlayers}/{maxPlayers}명` + `aria-label="참가 X명, 최대 Y명"` |
| U2 | 탐색 | **마감임박 색상 단독 전달** (빨간 바만, 텍스트 없음) | match-card, team-match-card | "N자리 남음" 텍스트 배지 병행. `aria-label`에 의미 서술 |
| U3 | 관리 | **채팅 비로그인 blank screen** (`return null`) | `apps/web/src/app/(main)/chat/page.tsx:93` | `return null` → `<EmptyState icon={Lock} title="로그인이 필요해요" action={{ label: "로그인", href: "/login?redirect=/chat" }} />` |
| U4 | 관리 | **마이페이지 비로그인 메뉴 시각 구분 없음** | `apps/web/src/app/(main)/profile/page.tsx:238` | 비로그인 항목: `opacity-40` + `aria-disabled="true"` + 잠금 아이콘 |
| U5 | 참여 | **팀 수정 폼 이미지 URL 직접 입력** | 팀 편집 폼 컴포넌트 | `ImageUpload` 컴포넌트(`components/ui/image-upload.tsx`)로 교체 |
| U6 | 첫 방문 | **홈 닉네임 "님" 단독 표시** (fallback 없음) | `apps/web/src/app/(main)/home/home-client.tsx:118` | `user?.name ? \`${user.name}님\` : "안녕하세요"`. 로딩 중 스켈레톤 |
| U7 | 참여 | **매치 만들기 시설 미선택 시 에러 지연** | `apps/web/src/app/(main)/matches/new/page.tsx:346` | venueId 없을 때 "다음" 버튼 비활성화 또는 인라인 경고 선행 |

---

## P2 — 다음 스프린트 (접근성·UX 개선)

### WCAG 2.1 AA 위반 (실제 코드 확인 기반)

| # | SC | 이슈 | 파일 | 수정 방법 |
|---|-----|------|------|-----------|
| Ac1 | 1.4.3 | **다크모드 `text-red-500` 대비 미달** (~3.8:1 추정) | `apps/web/src/app/globals.css:165` | `.dark .text-red-500` 값을 4.5:1 충족하는 밝은 값으로 조정. 또는 dark `bg-red-50` override를 더 어둡게 |
| Ac2 | 1.3.1 | **Admin MetricCard `<p>` 스택** — 스크린리더 관계 파악 불가 | `apps/web/src/app/admin/dashboard/page.tsx:96-121` | `<dl><dt>{label}</dt><dd>{value}</dd></dl>` 또는 `aria-label="{label}: {value}"` |
| Ac3 | 4.1.3 | **Admin 경고 블록 `role="alert"` 누락** | `apps/web/src/app/admin/dashboard/page.tsx:61`, `transfer-ownership-modal.tsx:117` | `role="alert" aria-live="polite"` 추가 |
| Ac4 | 2.4.6 | **구장 디테일 이미지 버튼 `aria-label` 없음** | `apps/web/src/app/(main)/venues/[id]/page.tsx:209` | `aria-label="{venue.name} 이미지 전체 보기"` |
| Ac5 | 1.3.1 | **구장 허브 탭 `aria-selected` 누락** — 활성 상태를 색상만으로 표현 | `apps/web/src/app/(main)/venues/[id]/page.tsx` `HubSectionTab` | `role="tab"` + `aria-selected={active}` + 부모 `role="tablist"` |
| Ac6 | 1.4.1 | **`cancelled` 배지 아이콘 없음** — `full`(회색)과 색맹 시 구분 불가 | `apps/web/src/components/match/team-match-card.tsx:16` | `XCircle` 아이콘 (`h-3 w-3 aria-hidden`) 추가 |
| Ac7 | — | **로그인 닉네임 `id` 중복** — register 모드에서 `id="login-nickname"` 재사용 | `apps/web/src/app/(auth)/login/page.tsx:237-247` | `mode === 'register'` 시 `id="register-nickname"` + `htmlFor` 동일하게 |

### A11y Warning

| # | 이슈 | 파일 | 수정 방법 |
|---|------|------|-----------|
| W1 | **필터 칩 비활성 대비 부족** (`text-gray-500` on white ~4.0:1) | 필터 칩 컴포넌트 전반 | `text-gray-500` → `text-gray-600 dark:text-gray-400` |
| W2 | **강좌 캘린더 예약 버튼 터치 타겟 미확인** | `apps/web/src/components/lesson/lesson-calendar.tsx` | `min-h-[44px] min-w-[44px]` 명시적 적용 |
| W3 | **Admin 통계 차트 바 aria-label 없음** | `apps/web/src/app/admin/statistics/page.tsx:91-103` | `role="img" aria-label="월별 매치 수 차트"` 또는 각 바에 `aria-label="{month}: {count}건"` |
| W4 | **장터 목록 행 터치 타겟 미달** (짧은 제목 시 44px 미달) | 장터 목록 행 컴포넌트 | `min-h-[44px]` 명시적 추가 |
| W5 | **구장 별점 aria-label 없음** | `apps/web/src/app/(main)/venues/[id]/page.tsx:216-220` | `aria-label="별점 {rating}점, 리뷰 {count}건"` |
| W6 | **채팅방 제목 truncate ellipsis 없음** ("매"로 잘림) | `apps/web/src/app/(main)/chat/page.tsx` `ChatRoomItem` | `truncate` + `min-w-0` + `title` attribute로 전체 이름 제공 |
| W7 | **알림 설정 "꺼짐" 상태 구분 불가** (브라우저 차단 vs 사용자 off) | `apps/web/src/app/(main)/settings/notifications/page.tsx` | 브라우저 차단 시: 토글 대신 "브라우저 설정에서 허용 필요" 배지 + 링크 |

### UX 다음 스프린트

| # | Journey | 이슈 | 수정 방법 |
|---|---------|------|-----------|
| U8 | 관리 | 알림 설정 내부 기술 문구 노출 | 해당 섹션 삭제 또는 "준비 중" 배지 |
| U9 | 탐색 | 강좌 필터 칩 오버플로 "+N" 없음 | 우측 엣지 fade-out gradient 스크롤 힌트 추가 |
| U10 | 탐색 | 지역 필터 자유 텍스트 입력 | 주요 도시 드롭다운 또는 칩 선택 UI |
| U11 | 참여 | 결제 흐름 step indicator 없음 | 참가신청→결제준비→확인에 progress bar 추가 |
| U12 | 관리 | 프로필 스포츠 프로필 없을 때 안내 미흡 | `<EmptyState size="sm">` + "종목 추가하기" CTA |
| U13 | 온보딩 | 데스크톱 온보딩 공백 과다 | 우측 trust 신호 (지역 동호인 수 등) 또는 2열 레이아웃 |

---

## 기술 부채

| # | 이슈 | 파일 | 수정 방법 | 우선순위 |
|---|------|------|-----------|---------|
| T1 | **venue mock 데이터 하드코딩** (`mockUpcomingMatches`, tech debt 주석 인정) | `apps/web/src/app/(main)/venues/[id]/page.tsx:52-79` | venue 매치 목록 API 연결 또는 섹션 제거. inline mock은 CLAUDE.md 위반 | High |
| T2 | **`formatCurrencyCompact` 로컬 정의** (`lib/utils.ts` 중복) | `apps/web/src/app/admin/statistics/page.tsx` | `lib/utils.ts`에 `export` 추가 후 import. 기존 `formatAmount` 확장 검토 | Medium |
| T3 | **스크린샷 중복 과다** (93장 중 ~40장 중복) | `scripts/qa/run-ultraplan-visual-audit.mjs` | perceptual hash 기반 중복 제거 (npm `imghash`). diff threshold 10% 이하 자동 skip | Low |
| T4 | **DevTools 열린 채 캡처** (QA 뷰포트 오염) | Playwright config / 캡처 스크립트 | `devtools: false` 명시. 캡처 전 DevTools 닫힘 확인 | Low |

---

## 반복 패턴 (4 배치 전체에서 3회+ 반복)

| 패턴 | 등장 배치 | DESIGN.md 규칙 | 일괄 수정 |
|------|-----------|---------------|----------|
| **컬러 단독 상태 표시** | 001·091·148·181 (전 배치) | §12 "컬러만으로 상태 전달 금지" | `grep -rn "bg-red-\|bg-amber-" apps/web/src/` → 텍스트+아이콘 누락 건 전수 확인 |
| **EmptyState 미사용** | 001·091·148 | §13 "반드시 empty-state.tsx 사용" | `grep -rn "return null\|데이터가 없\|결과가 없" apps/web/src/` → 교체 |
| **Utility 페이지 hero 블록** | 091·148 (동일 이슈 반복 미수정) | §4.3 utility page hero 금지 | `/my/*`, `/profile`, `/settings` 상단 대형 배너 전면 제거 |
| **브랜드명 Teameet 잔존** | 148·181 + DESIGN.md | 브랜드명 지시 (TeamMeet) | `grep -rn "Teameet" apps/web/src/ DESIGN.md` 전수 교체 |
| **한쪽 색상 보더** (`border-l-4`) | 148·CLAUDE.md | §4.2 Border | `grep -rn "border-l-" apps/web/src/` → 전체 보더 또는 배경 톤으로 교체 |

---

## 잘 지켜진 패턴 (유지 · 확산)

| 패턴 | 현재 적용 위치 | 확산 대상 |
|------|--------------|----------|
| `glass-mobile-nav` chrome 한정 사용 | `bottom-nav.tsx` | 유지. 다른 content 영역 확산 금지 |
| `active:scale-[0.98]` 카드 피드백 | 매치·팀 카드 | 강좌·장터 카드에도 적용 |
| `formatCurrency()` 금액 포맷 | 매치·강좌·장터 | 전체 금액 표시 통일 유지 |
| `blue-500` 단일 CTA | 주요 액션 버튼 전반 | 장터 "글쓰기" 버튼도 `bg-gray-900` → `bg-blue-500`으로 통일 필요 |
| 채팅 EmptyState | `chat/page.tsx` 채팅방 선택 전 | 이 패턴을 비로그인 상태에도 적용 (현재는 `return null`) |
| 매치 목록 빈 상태 | `matches-client.tsx` Search 아이콘 + CTA | 홈 "전체 매치" 빈 상태에도 동일 적용 |
| `sportCardAccent` 도트+배지 | 종목 배지 전반 | 홈 종목 원형 아이콘도 이 시스템으로 통일 |
| `useRequireAuth()` 훅 | 매치 만들기, 프로필 | 채팅, 마이페이지 메뉴 항목에 통일 적용 |

---

## 수정 순서 권장 (의존 관계)

```
[P0-B1] DESIGN.md 브랜드명 수정
  → [P0-B2] UI 전체 Teameet → TeamMeet 교체
    → [P1-1] 랜딩 hero 재설계 (브랜드명 확정 후)

[P0-A1] 폰트 경로 수정 (빌드 블로커)
  → [P0-A2] not-found.tsx 생성

[P0-A3/A4] 런타임 에러 수정
  → [P1-13/14] 이미지 fallback 추가

[P1-2, P1-3] 한쪽 보더 제거 (매치카드 + Admin KPI)   ← 병렬 가능
[P1-6] 마이페이지 hero 제거                            ← 병렬 가능
[P1-8, U2] 마감임박 amber 배지 + 텍스트               ← 병렬 가능
[U3] 채팅 비로그인 EmptyState                          ← 병렬 가능

[P2 Ac1~Ac7] A11y Critical → [P2 W1~W7] A11y Warning (순차)

[T1] venue mock 제거 (독립, 언제든 가능)
```

---

## 그레프 요약 (파일별 수정 집중도)

```
apps/web/src/app/(main)/home/home-client.tsx          ██████ P0-B2, P1-10,11, U6
apps/web/src/app/(main)/profile/page.tsx              █████  P1-6, U4
apps/web/src/app/(auth)/login/page.tsx                █████  P1-12, Ac7
apps/web/src/app/admin/dashboard/page.tsx             ████   P1-3, Ac2, Ac3
apps/web/src/components/match/match-card.tsx           ████   P1-2,8, U1,2
apps/web/src/app/(main)/chat/page.tsx                 ████   U3, W6
apps/web/src/app/(main)/venues/[id]/page.tsx          ████   Ac4, Ac5, T1, W5
apps/web/src/app/globals.css                          ███    Ac1
apps/web/src/app/layout.tsx                           ██     P0-A1
DESIGN.md                                             ██     P0-B1
```
