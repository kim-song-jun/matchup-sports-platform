# MatchUp - AI 스포츠 매칭 플랫폼 프로젝트 현황

> 최종 업데이트: 2026-04-10 | 스크린샷: v4 (Playwright 자동 캡처)

---

## 1. 프로젝트 개요

MatchUp은 생활체육 동호인을 위한 AI 기반 멀티스포츠 소셜 매칭 플랫폼입니다.
축구, 풋살, 농구, 배드민턴 등 11개 종목의 개인 및 팀을 AI로 최적 매칭합니다.

### 핵심 가치
- **AI 매칭**: 실력·위치·시간·매너를 종합 분석한 최적 매칭
- **신뢰 시스템**: 3단계 허위 레벨링 방지 + 6항목 상호 평가
- **올인원 플랫폼**: 매칭·채팅·결제·용병·장터까지 한 곳에서

### 타겟 사용자
- 20~40대 생활체육 동호인
- 퇴근 후/주말 운동 파트너를 찾는 모바일 중심 사용자

---

## 2. 기술 스택

| 영역 | 기술 |
|------|------|
| **모노레포** | pnpm workspaces + Turborepo |
| **프론트엔드** | Next.js 15 (App Router) + React 19 |
| **스타일링** | Tailwind CSS v4 |
| **상태관리** | Zustand 5 + React Query (TanStack) |
| **모바일** | Capacitor 6 (iOS/Android 래핑) |
| **백엔드** | NestJS 11 + TypeScript |
| **DB** | PostgreSQL 16 + Prisma 6 ORM |
| **캐시** | Redis 7 (ioredis) |
| **실시간** | Socket.IO (NestJS Gateway) |
| **인증** | JWT + OAuth (카카오/네이버/애플) |
| **결제** | 토스페이먼츠 |
| **문서** | Swagger (NestJS Swagger) |

### 디렉토리 구조
```
sports-platform/
├── apps/
│   ├── web/          → Next.js 프론트엔드 (포트 3003)
│   └── api/          → NestJS 백엔드 (포트 8111)
├── e2e/              → Playwright E2E
├── scripts/
│   ├── qa/           → 수동 QA 보조 스크립트
│   └── docs/         → 문서 스크린샷 캡처 스크립트
└── docs/             → 문서, canonical 스크린샷, 레퍼런스
```

---

## 3. 디자인 시스템

### 브랜드
- **성격**: 활발 · 스마트 · 친근
- **톤 밸런스**: 친근함 70% + 전문성 30%
- **레퍼런스**: 토스(Toss), 플랩(PLAB), 당근마켓, NRC

### 컬러 팔레트

| 토큰 | 값 | 용도 |
|------|-----|------|
| `blue-500` | #3182F6 | 유일한 액센트 컬러 |
| `blue-600` | #1B64DA | 호버/프레스 |
| `gray-50` ~ `gray-900` | 10단계 | 배경/텍스트/보더 |
| `success` | #34C759 | 성공 상태 |
| `warning` | #FF9500 | 경고 상태 |
| `error` | #FF3B30 | 에러 상태 |

### 타이포그래피
- **폰트**: Pretendard Variable (한국어 최적화)
- **스케일**: 12 / 13 / 14 / 15 / 16 / 17 / 18 / 22 / 26 / 28 / 36 / 44 / 56 px
- **행간**: heading leading-tight (1.15), body leading-relaxed (1.625)
- **자간**: 전역 -0.02em, heading tracking-tight

### 애니메이션
- **easing**: `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart)
- **duration**: 피드백 100-150ms, 상태 변경 200-300ms, 입장 400-600ms
- **스크롤 reveal**: IntersectionObserver 기반 fade-up
- **접근성**: `prefers-reduced-motion` 전역 존중

### 다크모드
- 라이트 기본 + 다크모드 지원
- 시스템 설정 자동 감지
- 사용자 수동 전환 (설정 페이지)

---

## 4. 소개 페이지 (공개 페이지)

### 4.1 랜딩 페이지 (`/landing`)
히어로(스크롤 애니메이션) + 통계 카운트업 + 공감 섹션 + AI 매칭 히어로 카드 + 3단계 가이드 + 종목 그리드 + 사용자 후기 + CTA.

**데스크탑:**
![랜딩 - 데스크탑](screenshots/v4_intro/landing_desktop.png)

**모바일:**
![랜딩 - 모바일](screenshots/v4_intro/landing_mobile.png)

### 4.2 이용 가이드 (`/guide`)
6단계 상세 튜토리얼 (회원가입→프로필→탐색→참가→경기→성장) + 팀 매칭 이용법 + 용병/장터 이용법.

**데스크탑:**
![가이드 - 데스크탑](screenshots/v4_intro/guide_desktop.png)

**모바일:**
![가이드 - 모바일](screenshots/v4_intro/guide_mobile.png)

### 4.3 요금 안내 (`/pricing`)
무료/프로(9,900원)/팀(19,900원) 3단 요금제 + 매치 참가비 구조(5,000~30,000원, 수수료 10%) + 요금 FAQ 아코디언.

**데스크탑:**
![요금 - 데스크탑](screenshots/v4_intro/pricing_desktop.png)

**모바일:**
![요금 - 모바일](screenshots/v4_intro/pricing_mobile.png)

### 4.4 FAQ (`/faq`)
18개 질문 아코디언 + 카테고리 필터(전체/서비스/매칭/결제/계정). expand/collapse 애니메이션.

**데스크탑:**
![FAQ - 데스크탑](screenshots/v4_intro/faq_desktop.png)

**모바일:**
![FAQ - 모바일](screenshots/v4_intro/faq_mobile.png)

### 4.5 소개 (`/about`)
비전/미션 + 문제 인식 + 접근법 + 숫자로 보는 MatchUp + 가치관 + 팀 소개.

**데스크탑:**
![소개 - 데스크탑](screenshots/v4_intro/about_desktop.png)

**모바일:**
![소개 - 모바일](screenshots/v4_intro/about_mobile.png)

### 소개 페이지 공통 요소
- **LandingNav**: GNB (이용 가이드/요금/FAQ/소개) + 모바일 햄버거 메뉴 + 현재 페이지 하이라이트
- **LandingFooter**: 페이지 간 네비게이션 + 법적 링크
- **ScrollReveal**: 스크롤 입장 애니메이션 (IntersectionObserver)
- **CountUp**: 숫자 카운트업 애니메이션
- **로컬 mock 이미지 팩**: 리스트/상세 카드에 외부 이미지 대신 `/mock/*` 생성 자산 + SVG fallback 사용
- 블루 단일 액센트 + 화이트 베이스 + gray-50 교차 배경

---

## 5. 주요 화면 — 사용자 앱

### 5.1 로그인
카카오/네이버/애플 소셜 로그인 + 개발용 빠른 로그인.

![로그인 - 데스크탑](screenshots/v4_intro/login_desktop.png)

### 5.2 홈
종목 선택 칩 + 프로모션 배너 캐러셀 + 오늘·내일 매치 + 전체 매치 리스트 + 빠른 메뉴.

![홈 - 데스크탑](screenshots/v4_intro/home_desktop.png)
![홈 - 모바일](screenshots/v4_intro/home_mobile.png)

### 5.3 매치 찾기
검색 + 종목 필터 + 날짜/정렬 상세 필터 + 매치 카드 리스트. shimmer 스켈레톤 로딩.

![매치 - 데스크탑](screenshots/v4_intro/matches_desktop.png)
![매치 - 모바일](screenshots/v4_intro/matches_mobile.png)

### 5.4 팀 매칭
S~D 등급 팀 매칭 모집글 리스트 + 종목/등급/날짜 필터.

![팀 매칭 - 데스크탑](screenshots/v4_intro/team_matches_desktop.png)

### 5.5 팀·클럽
동호회/팀 목록. 팀 정보 + 모집 상태 + 연락하기. 설명 line-clamp.

![팀 - 데스크탑](screenshots/v4_intro/teams_desktop.png)

### 5.6 강좌
그룹 레슨 / 연습 경기 / 자유 연습 필터 + 강좌 카드 + 진행 바.

![강좌](screenshots/v4_intro/lessons_desktop.png)

### 5.7 장터
스포츠 용품 중고거래/대여. 카테고리 필터 + 상품 카드 (가격, 상태, 조회/좋아요).

![장터](screenshots/v4_intro/marketplace_desktop.png)

### 5.8 시설 찾기
지역/종목 이중 필터 + 시설 카드 (평점, 가격, 주소, 지원 종목).

![시설](screenshots/v4_intro/venues_desktop.png)

### 5.9 용병
용병 모집/지원 게시판. 포지션/레벨/참가비/매너점수 정보.

![용병](screenshots/v4_intro/mercenary_desktop.png)

### 5.10 뱃지
내 뱃지 / 전체 뱃지 탭. 획득 상태 + 진행도 표시.

![뱃지](screenshots/v4_intro/badges_desktop.png)

### 5.11 프로필
유저 정보 + 종목별 ELO/레벨/전적 + 활동 통계 + 다가오는 일정 + 메뉴.

![프로필 - 데스크탑](screenshots/v4_intro/profile_desktop.png)
![프로필 - 모바일](screenshots/v4_intro/profile_mobile.png)

### 5.12 설정
테마(라이트/다크/시스템) + 알림 + 계정 관리 + 약관.

![설정](screenshots/v4_intro/settings_desktop.png)

---

## 6. 주요 화면 — 관리자

관리자 페이지는 이전 v3 스크린샷을 참조합니다.

### 6.1 대시보드
총 사용자/매치/결제 통계 + 최근 매치/결제 리스트.

![어드민 대시보드](screenshots/v3_20260325/19_admin_dashboard_desktop.png)

### 6.2 분쟁 관리
사용자 신고/분쟁 접수 + 처리 상태 관리.

![분쟁 관리](screenshots/v3_20260325/20_admin_disputes_desktop.png)

### 6.3 통계
종목별/기간별 매치/사용자/결제 분석.

![통계](screenshots/v3_20260325/21_admin_statistics_desktop.png)

### 6.4 결제/정산
결제 기록 + 정산 관리.

![결제 관리](screenshots/v3_20260325/22_admin_payments_desktop.png)
![정산 관리](screenshots/v3_20260325/23_admin_settlements_desktop.png)

---

## 7. 데이터베이스 모델 (25개)

### 핵심 모델
| 모델 | 설명 |
|------|------|
| `User` | 사용자 계정 (OAuth 연동) |
| `UserSportProfile` | 종목별 실력 프로필 (ELO, 레벨, 전적) |
| `Match` | 개인 매치 (모집~완료 라이프사이클) |
| `SportTeam` | 팀/동호회 (멤버, 신뢰도) |
| `TeamMatch` | 팀 vs 팀 매칭 (등급, 신청, 평가) |
| `Venue` | 시설 (빙상장 전용 필드 포함) |
| `Payment` | 결제 (카드/토스페이/네이버페이/카카오페이) |

### 지원 모델
| 모델 | 설명 |
|------|------|
| `Lesson` | 강좌/레슨 |
| `MarketplaceListing` | 장터 (판매/대여/공동구매) |
| `MercenaryPost` | 용병 모집 |
| `ChatRoom` / `ChatMessage` | 실시간 채팅 |
| `Review` | 상호 평가 (실력 + 매너) |
| `Badge` | 뱃지 시스템 |
| `Notification` | 알림 |
| `ArrivalCheck` | 도착 확인 |
| `MatchEvaluation` | 경기 후 평가 |

### 지원 종목 (11개)
축구, 풋살, 농구, 배드민턴, 아이스하키, 피겨스케이팅, 쇼트트랙, 수영, 테니스, 야구, 배구

---

## 8. API 구조

### 백엔드 모듈 (20개)
Auth, Users, Matches, TeamMatches, Teams, Venues, Lessons, Reviews, Payments, Marketplace, Mercenary, Chat, Realtime, Notifications, Badges, Disputes, Settlements, Admin, Health, Prisma

### 프론트엔드 API 훅 (86개)
React Query 기반 쿼리/뮤테이션 훅. `queryKeys` 팩토리 패턴으로 캐시 관리.

### API 문서
Swagger: `http://localhost:8100/docs`

---

## 9. 프론트엔드 구조

### 페이지 수: 78개
- 사용자 앱: 55개 (홈, 매치, 팀, 강좌, 장터, 시설, 채팅, 용병, 뱃지, 결제, 프로필, 설정 등)
- 관리자: 18개 (대시보드, 사용자/매치/팀/시설/결제/분쟁/정산 관리)
- 소개: 5개 (랜딩, 가이드, 요금, FAQ, 소개)

### 컴포넌트: 21개
UI (모달, 토스트, 스켈레톤), 레이아웃 (사이드바, 하단네비), 랜딩 (네비, 풋터, 스크롤 리빌, 카운트업), 매치/결제/프로필/시설/채팅/아이콘/관리자

### 상태 관리: Zustand 3개 스토어
- `auth-store`: 인증 상태
- `chat-store`: 채팅 (목업 데이터 포함)
- `theme-store`: 테마 (라이트/다크/시스템)

---

## 10. 성능 최적화

| 항목 | 적용 |
|------|------|
| 이미지 최적화 | Next.js Image (Capacitor 빌드 시만 비활성) |
| 폰트 프리로드 | Pretendard CDN preload |
| React Query | staleTime 60s, gcTime 5m, retry: false |
| 서버 컴포넌트 | `(main)/layout.tsx` 서버 컴포넌트 전환 |
| 쿼리 키 팩토리 | `queryKeys` 중앙화된 캐시 키 관리 |
| 스켈레톤 shimmer | 로딩 시 shimmer 그라데이션 |
| GPU 가속 | 애니메이션은 transform + opacity만 사용 |
| 접근성 | prefers-reduced-motion 전역 존중 |

---

## 11. 개발 환경

```bash
# 의존성 설치
pnpm install

# 전체 개발 스택 실행
make up

# 전체 개발 서버 로그 보기
make dev               # 프론트 3003 + 백엔드 8111

# DB 관리
make db:push           # Prisma 스키마 반영
make db:seed           # 시드 데이터
make down              # 개발 컨테이너 제거

# 스크린샷 캡처
pnpm docs:screenshots:overview
pnpm docs:screenshots:app

# Swagger 문서
open http://localhost:8111/docs
```

---

## 12. 향후 개선 방향

### 기능
- 실제 OAuth 연동 (카카오/네이버/애플)
- 토스페이먼츠 실결제 연동
- Socket.IO 실시간 채팅 구현
- Push 알림 (FCM/APNs)
- Capacitor 네이티브 빌드

### 디자인
- 실제 사용자 후기 교체
- 제품 목업 이미지 추가
- 모바일 앱 스토어 배지

### 성능
- 이미지 CDN + WebP 변환
- 번들 분석 + 코드 스플리팅 최적화
- SSG/ISR 활용 (소개 페이지)
- Web Worker 활용 (검색, 필터)

---

## 보안 레이어

| 레이어 | 항목 |
|--------|------|
| **nginx** | X-Frame-Options SAMEORIGIN, X-Content-Type-Options nosniff, X-XSS-Protection 1; mode=block, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy |
| **nginx** | Swagger(`/docs`) 내부망(10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) 접근 제한 |
| **nginx** | 업로드 엔드포인트(`/api/v1/uploads`) rate limiting (10r/s burst 20) |
| **SafeImage** | `normalizeSrc()` 경로 순회 방어 (`../` 차단), `data:image/` URL 제한, `resolvedPriority` 버그 수정 |
| **프론트엔드** | `useRequireAuth()` — 인증 필요 페이지 비로그인 접근 시 리디렉트 게이트 |
| **접근성** | WCAG 2.1 AA 준수 (컬러 대비 4.5:1, 키보드 접근성, 스크린리더, `prefers-reduced-motion`) |
