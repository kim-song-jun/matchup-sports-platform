# MatchUp

> AI 기반 멀티스포츠 소셜 매칭 플랫폼

An AI-powered social sports matching platform for recreational athletes in Korea — covering futsal, basketball, badminton, ice hockey, and more.

---

## Features

**매치 시스템**
- 종목별 개인 매치 모집 및 참가 (11개 종목 지원)
- 레벨 / 성별 / 지역 기반 필터링
- 실시간 참가자 현황 및 팀 구성
- 매치 완료 후 상대방 스킬 / 매너 평가

**팀 매칭**
- 팀 프로필 생성 및 홍보 (SNS 연동, 홍보 영상)
- 팀 대 팀 매치 신청 / 승인 2단계 플로우
- GPS 기반 현장 도착 인증
- 쿼터별 스코어 기록 및 경기 결과 관리
- 팀 신뢰점수 (매너, 지각률, 노쇼율, 정보 일치도)
- 팀 뱃지 시스템 (매너왕, 시간약속, 정직한 팀 등)

**레슨 / 수강권**
- 코치 레슨 개설 (그룹 레슨, 연습 경기, 클리닉)
- 1회권 / 다회권 / 기간 무제한권 판매
- 정기 스케줄 관리 및 출결 체크인

**장터 (Marketplace)**
- 스포츠 용품 판매 / 대여 / 공동구매
- 에스크로 기반 안전 결제
- 판매자 신뢰 리뷰 (상품 상태 정확도, 소통, 배송 속도)

**결제**
- 토스페이먼츠 연동 (카드, 토스페이, 네이버페이, 카카오페이, 계좌이체)
- 부분 환불 지원
- 정산 관리 (어드민)

**실시간 채팅**
- Socket.IO 기반 매치 / 팀 채팅방
- 읽음 처리, 타이핑 인디케이터

**알림**
- 인앱 알림 (매치 참가, 팀 매칭, 결제, 레슨 등)
- FCM 푸시 알림 지원

**어드민**
- 사용자 / 팀 / 매치 / 레슨 / 장터 전체 관리
- 분쟁 처리, 정산, 통계 대시보드

---

## Tech Stack

| 분류 | 기술 | 버전 |
|------|------|------|
| **Frontend** | Next.js (App Router) | 15.x |
| **Frontend** | React | 19.x |
| **Frontend** | Tailwind CSS | 4.x |
| **Frontend** | Zustand | 5.x |
| **Frontend** | TanStack Query | 5.x |
| **Frontend** | next-intl (i18n) | 4.x |
| **Mobile** | Capacitor (iOS / Android) | 6.x |
| **Backend** | NestJS | 11.x |
| **Backend** | TypeScript | 5.7.x |
| **Backend** | Socket.IO | 4.x |
| **ORM** | Prisma | 6.x |
| **Database** | PostgreSQL | 16 |
| **Cache** | Redis | 7 |
| **Auth** | JWT + OAuth (카카오 / 네이버 / 애플) | — |
| **Payment** | 토스페이먼츠 | — |
| **Monorepo** | pnpm workspaces + Turborepo | pnpm 9.x |
| **Testing** | Vitest (FE) / Jest (BE) / Playwright (E2E) | — |
| **Deploy** | Docker + Nginx | — |

---

## Project Structure

```
sports-platform/
├── apps/
│   ├── web/                  # Next.js 프론트엔드 (포트 3003)
│   │   └── src/
│   │       ├── app/          # App Router 페이지
│   │       │   ├── (auth)/   # 로그인 / 온보딩
│   │       │   ├── (main)/   # 주요 기능 페이지
│   │       │   ├── admin/    # 어드민 패널
│   │       │   └── landing/  # 랜딩 페이지
│   │       ├── components/   # 공유 UI 컴포넌트
│   │       ├── hooks/        # 커스텀 훅
│   │       ├── lib/          # 유틸리티, 상수, API 클라이언트
│   │       ├── stores/       # Zustand 스토어
│   │       └── types/        # TypeScript 타입 정의
│   └── api/                  # NestJS 백엔드 (포트 8100)
│       └── src/
│           ├── auth/         # 인증 (JWT, OAuth)
│           ├── users/        # 사용자 프로필, 스포츠 프로필
│           ├── matches/      # 개인 매치
│           ├── team-matches/ # 팀 매칭
│           ├── teams/        # 팀 관리
│           ├── lessons/      # 레슨 / 수강권
│           ├── marketplace/  # 장터
│           ├── venues/       # 구장
│           ├── payments/     # 결제
│           ├── chat/         # 채팅
│           ├── notifications/ # 알림
│           ├── reviews/      # 리뷰
│           ├── disputes/     # 분쟁
│           ├── settlements/  # 정산
│           ├── realtime/     # Socket.IO Gateway
│           └── admin/        # 어드민 API
│       └── prisma/
│           ├── schema.prisma # DB 스키마
│           └── seed.ts       # 초기 데이터
├── packages/                 # 공유 패키지 (예정)
├── e2e/                      # Playwright E2E 테스트
├── deploy/                   # 배포 설정 (Dockerfile, Nginx)
├── docker-compose.yml        # 로컬 개발 (PostgreSQL + Redis)
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker + Docker Compose

### Installation

```bash
# 저장소 클론
git clone https://github.com/your-org/sports-platform.git
cd sports-platform

# 의존성 설치
pnpm install
```

### Environment Setup

```bash
# 백엔드 환경변수
cp apps/api/.env.example apps/api/.env

# 프론트엔드 환경변수
cp apps/web/.env.example apps/web/.env.local
```

필수 환경변수:

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `REDIS_URL` | Redis 연결 문자열 |
| `JWT_SECRET` | JWT 서명 키 |
| `KAKAO_CLIENT_ID` | 카카오 OAuth 앱 키 |
| `NAVER_CLIENT_ID` | 네이버 OAuth 앱 키 |
| `TOSS_SECRET_KEY` | 토스페이먼츠 시크릿 키 |
| `NEXT_PUBLIC_API_URL` | 프론트엔드에서 사용할 API 주소 |

### Start Development

```bash
# 1. DB + Redis 실행 (Docker)
docker compose up -d

# 2. DB 스키마 반영
pnpm db:push

# 3. 초기 데이터 시드 (선택)
pnpm db:seed

# 4. 개발 서버 실행
pnpm dev
```

- 프론트엔드: http://localhost:3003
- 백엔드 API: http://localhost:8100
- Swagger 문서: http://localhost:8100/api

---

## Development

### 주요 명령어

```bash
pnpm dev            # 전체 개발 서버 실행 (Turborepo)
pnpm build          # 전체 프로덕션 빌드
pnpm lint           # 전체 린트
pnpm clean          # 빌드 캐시 정리

pnpm db:push        # Prisma 스키마를 DB에 반영
pnpm db:migrate     # Prisma 마이그레이션 생성 및 적용
pnpm db:studio      # Prisma Studio 실행 (DB 브라우저)
pnpm db:seed        # 초기 데이터 시드
```

### 개별 앱 명령어

```bash
# 프론트엔드
cd apps/web
pnpm dev            # Next.js dev server (포트 3003)
pnpm build
pnpm test           # Vitest 단위 테스트
pnpm test:watch

# 백엔드
cd apps/api
pnpm dev            # NestJS watch mode (포트 8100)
pnpm build
pnpm test           # Jest 단위 테스트
pnpm test:cov       # 커버리지 포함
```

---

## Architecture

### API 규약

- 모든 엔드포인트: `GET /api/v1/*`
- 응답 형식: `{ status: string, data: T, timestamp: string }`
- 에러 코드: `DOMAIN_ERROR_CODE` 형태 (예: `MATCH_NOT_FOUND`, `PAYMENT_FAILED`)
- 페이지네이션: Cursor 기반 (`cursor`, `limit` 파라미터)

### 인증 플로우

1. 소셜 로그인 (카카오 / 네이버 / 애플) 또는 이메일 로그인
2. 서버에서 JWT Access Token + Refresh Token 발급
3. Access Token: Authorization 헤더 (`Bearer`)
4. Refresh Token: HTTP-only 쿠키

### 실시간 통신

- Socket.IO Gateway (`/realtime`)
- 채팅 메시지, 타이핑 인디케이터, 알림 실시간 전송
- Redis Pub/Sub로 다중 인스턴스 간 메시지 브로드캐스팅

### 프론트엔드 상태 관리

- 서버 상태: TanStack Query (캐싱, 리페치, 낙관적 업데이트)
- 클라이언트 상태: Zustand (인증, 알림, UI 상태)

---

## Database

Prisma + PostgreSQL 16. 주요 엔티티:

| 모델 | 설명 |
|------|------|
| `User` | 사용자 계정, OAuth, 위치, 매너 점수 |
| `UserSportProfile` | 종목별 레벨, ELO 레이팅, 포지션 |
| `Match` | 개인 매치 (모집, 진행, 완료) |
| `MatchParticipant` | 매치 참가 내역 |
| `Team` | 매치 내 팀 구성 |
| `Review` | 매치 참가자 간 상호 평가 |
| `Payment` | 토스페이먼츠 결제 내역 |
| `Notification` | 인앱 알림 |
| `Venue` | 구장 정보 (위치, 시설, 운영시간) |
| `VenueReview` | 구장 리뷰 |
| `SportTeam` | 팀 / 클럽 프로필 |
| `TeamMatch` | 팀 대 팀 매치 |
| `TeamMatchApplication` | 팀 매치 신청 / 승인 |
| `ArrivalCheck` | GPS 기반 도착 인증 |
| `MatchEvaluation` | 팀 매치 후 상호 평가 (6항목) |
| `TeamTrustScore` | 팀 신뢰 점수 집계 |
| `Badge` | 팀 뱃지 |
| `Lesson` | 레슨 개설 (코치 정보, 반복 일정) |
| `LessonTicketPlan` | 수강권 플랜 (1회권 / 다회권 / 기간권) |
| `LessonTicket` | 사용자 보유 수강권 |
| `LessonSchedule` | 레슨 회차별 일정 |
| `LessonAttendance` | 회차별 출결 |
| `MarketplaceListing` | 장터 상품 (판매 / 대여 / 공동구매) |
| `MarketplaceOrder` | 장터 주문 (에스크로 상태 관리) |
| `MarketplaceReview` | 거래 후 판매자 리뷰 |
| `Favorite` | 즐겨찾기 (매치 / 팀 / 구장 / 상품) |

지원 종목: `soccer`, `futsal`, `basketball`, `badminton`, `ice_hockey`, `figure_skating`, `short_track`, `swimming`, `tennis`, `baseball`, `volleyball`

---

## Testing

```bash
# 프론트엔드 단위 테스트 (Vitest + jsdom)
cd apps/web && pnpm test

# 백엔드 단위 테스트 (Jest)
cd apps/api && pnpm test

# 백엔드 커버리지
cd apps/api && pnpm test:cov

# E2E 테스트 (Playwright)
npx playwright test

# E2E 특정 테스트만
npx playwright test e2e/home.spec.ts
```

테스트 커버 영역:
- 홈 / 네비게이션 렌더링
- 매치 목록 / 상세 / 생성
- 팀 / 레슨 / 장터 페이지
- 다크모드 렌더링
- 반응형 레이아웃 (모바일 375px / 태블릿 768px / 데스크탑)
- 접근성 (터치 타겟 44px, aria-label)

---

## Deployment

Docker 이미지 빌드 및 배포 (`deploy/` 참고):

```bash
# 프론트엔드 이미지 빌드
docker build -f deploy/Dockerfile.web -t matchup-web .

# 백엔드 이미지 빌드
docker build -f deploy/Dockerfile.api -t matchup-api .

# 프로덕션 전체 실행
docker compose -f deploy/docker-compose.prod.yml up -d
```

- Nginx 리버스 프록시로 프론트(3003) / 백엔드(8100) 라우팅
- SSL 종료는 Nginx 레이어에서 처리
- EC2 초기 설정: `deploy/setup-ec2.sh` 참고

---

## Contributing

### 커밋 메시지 규약

```
type: short one-line summary (영어, 소문자, imperative mood)
```

| Type | 사용 시점 |
|------|-----------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `refactor` | 동작 변경 없는 코드 구조 개선 |
| `docs` | 문서만 수정 |
| `test` | 테스트 추가 / 수정 |
| `chore` | 빌드, CI, 도구 설정 변경 |
| `infra` | 인프라 변경 |

예시:
```
feat: add team arrival check with gps verification
fix: prevent double submission on payment form
refactor: extract sport profile logic into service class
```

### 브랜치 네이밍

```
feat/short-description
fix/short-description
docs/short-description
infra/short-description
```

### Pull Request

- 제목은 커밋 메시지와 동일한 형식
- 본문에 Summary / Changes / Dependencies 포함
- main 브랜치에 직접 push 금지

---

## License

Private — All rights reserved.
