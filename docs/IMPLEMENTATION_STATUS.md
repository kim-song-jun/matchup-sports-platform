# MatchUp 구현 현황 문서

> 최종 업데이트: 2026-04-10
> 기획서 대비 구현 상태 + 변경/추가 사항 정리

---

## 1. 프로젝트 규모 요약

| 항목 | 수량 |
|------|------|
| 프론트엔드 페이지 | 68개 |
| 백엔드 모듈 | 21개 |
| API 엔드포인트 | 70+ |
| API Hooks | 62개 |
| DB 모델 (Prisma) | 16개 |
| Git 커밋 | 173개 |
| 총 코드 라인 | ~25,000줄 |

---

## 2. 기술 스택 변경사항

### 기획서 (원본)
| 영역 | 기획서 스택 |
|------|-----------|
| 백엔드 | FastAPI (Python) |
| 프론트엔드 | React Native + Expo |
| ORM | SQLAlchemy + Alembic |
| 실시간 | Node.js 별도 서버 |

### 실제 구현 (변경됨)
| 영역 | 구현 스택 | 변경 사유 |
|------|----------|----------|
| 백엔드 | **NestJS (TypeScript)** | 프론트와 동일 언어, 풀스택 TS 통일 |
| 프론트엔드 | **Next.js 15 (App Router)** | 웹 우선 + Capacitor 래핑 전략 |
| 모바일 | **Capacitor 6** | React Native 대신 웹앱 래핑 |
| ORM | **Prisma** | TypeScript 타입 안전성 |
| 실시간 | **NestJS Gateway (Socket.IO)** | 백엔드 통합, 별도 서버 불필요 |
| 모노레포 | **pnpm + Turborepo** | 빌드 캐싱, 워크스페이스 관리 |
| UI | **Tailwind CSS v4 + Toss UI 스타일** | 기획서에 없던 디자인 시스템 |
| 상태관리 | **Zustand + TanStack Query** | 클라이언트/서버 상태 분리 |

---

## 3. 기획서 대비 구현 현황

### ✅ 완전 구현 (기획서 요구사항 충족)

#### 3-1. 팀 프로필 기능
| 요구사항 | 구현 상태 | 라우트 |
|---------|----------|-------|
| 팀명, 종목, 활동지역 | ✅ | /teams/new, /teams/[id] |
| 주 활동 요일/시간대 | ✅ (설명 필드) | /teams/[id] |
| 팀 소개 | ✅ | /teams/[id] |
| 평균 연령대 | ⚠️ 필드 미포함 (description으로 대체) | - |
| 유니폼 색상 | ⚠️ 필드 미포함 | - |
| 연락 담당자 | ✅ contactInfo | /teams/[id] |
| 선수 출신 유무 | ✅ hasProPlayers (TeamMatch) | /team-matches/new |
| 용병 참여 여부 | ✅ allowMercenary (TeamMatch) | /team-matches/new |
| 자기기입 레벨 | ✅ level (1-5) | /teams/new |
| SNS/홍보 | ✅ Instagram, YouTube, Shorts, 카카오톡 | /teams/[id] |

#### 3-2. 경기 모집글 기능
| 요구사항 | 구현 상태 | 비고 |
|---------|----------|------|
| 종목 선택 | ✅ 축구/풋살 | |
| 경기 날짜/시간 | ✅ matchDate, startTime, endTime | |
| 총 경기 시간 | ✅ totalMinutes (기본 120분) | |
| 쿼터 수 (2/4/6/8/10) | ✅ quarterCount | |
| 구장명/주소 | ✅ venueName, venueAddress | |
| 구장 편의정보 | ✅ venueInfo (JSON) | |
| 총 구장비 / 상대팀 부담 | ✅ totalFee, opponentFee | |
| 취소 규정 | ✅ cancellationPolicy | |
| 상대팀 레벨 조건 | ✅ requiredLevel | |
| 선수 출신 여부 안내 | ✅ hasProPlayers | |
| 용병 여부 | ✅ allowMercenary | |
| 경기 스타일 | ✅ matchStyle (friendly/competitive/manner_focused) | |
| 심판 유무 | ✅ hasReferee | |
| 특이사항 | ✅ notes | |

#### 3-3. 심판 관련
| 요구사항 | 구현 상태 | 비고 |
|---------|----------|------|
| 심판 유무 체크 | ✅ hasReferee | /team-matches/new |
| 쿼터별 심판 자동 배정 | ✅ refereeSchedule (JSON) | /team-matches/[id] |
| 심판 배정표 UI | ✅ 테이블 형태 | /team-matches/[id] |
| 심판 인센티브 | ✅ 포인트+쿠폰+뱃지 진행도 | RefereeIncentive 컴포넌트 |

#### 3-4. 허위 레벨링 방지 (3단계)
| 단계 | 요구사항 | 구현 상태 |
|------|---------|----------|
| 1단계 | 자기기입 레벨 | ✅ selfLevel (TeamTrustScore) |
| 2단계 | 매칭 전 상호 확인 | ✅ confirmedInfo, confirmedLevel (TeamMatchApplication) |
| 3단계 | 경기 후 정보 일치도 평가 | ✅ 6항목 평가 (MatchEvaluation) |

**6항목 평가 구현:**
- levelAccuracy (수준 사전설명 일치)
- infoAccuracy (선수출신/용병 고지 일치)
- mannerRating (매너)
- punctuality (시간 약속)
- paymentClarity (비용 정산)
- cooperation (경기 운영 협조)

#### 3-5. 지각/노쇼 방지
| 요구사항 | 구현 상태 | 비고 |
|---------|----------|------|
| 도착 완료 버튼 | ✅ | /team-matches/[id]/arrival |
| 도착 시간 자동 저장 | ✅ arrivedAt (ArrivalCheck) | |
| GPS 기반 위치 인증 | ✅ lat, lng 저장 (시뮬레이션) | |
| 현장 사진 업로드 | ✅ photoUrl (UI 구현, 실제 업로드 미연동) | |
| 상대팀 상호 확인 | ✅ opponentStatus (normal/late/no_show) | |
| 경기 완료 확인 | ✅ gameCompleted | |
| 신뢰 지표 누적 | ✅ TeamTrustScore (lateRate, noShowRate, cancelRate) | |

#### 3-6. 팀 간 소통
| 요구사항 | 구현 상태 | 비고 |
|---------|----------|------|
| 매칭 성사 후 채팅 | ✅ | /chat, /chat/[id] |
| 입금 관련 안내 | ✅ 빠른 액션 "입금 완료" | 채팅 내 |
| 유니폼 색상 조율 | ✅ 빠른 액션 "유니폼 색상 조율" | 채팅 내 |
| 위치 공유 | ✅ 빠른 액션 "위치 공유" | 채팅 내 |
| 시스템 메시지 | ✅ "매칭이 성사되었습니다" 등 | 채팅 내 |

#### 3-7. 경기 종료 후 평가
| 요구사항 | 구현 상태 | 라우트 |
|---------|----------|-------|
| 팀 수준 일치 평가 | ✅ levelAccuracy | /team-matches/[id]/evaluate |
| 선수출신/용병 고지 일치 | ✅ infoAccuracy | |
| 매너 평가 | ✅ mannerRating | |
| 시간 약속 평가 | ✅ punctuality | |
| 비용 정산 평가 | ✅ paymentClarity | |
| 경기 운영 협조 | ✅ cooperation | |
| 팀 프로필 반영 | ✅ TeamTrustScore 모델 | /teams/[id] |

---

### ⚠️ 부분 구현 (기획서 요구사항 있으나 일부만)

| 요구사항 | 구현 상태 | 미구현 부분 |
|---------|----------|-----------|
| 지각/노쇼 자동 제재 | ⚠️ | 기록은 되지만 자동 매칭 제한 미구현 |
| ELO 레이팅 알고리즘 | ⚠️ | 공식/유틸 존재, 실제 경기 후 업데이트 미연동 |
| 분쟁 검토 → 운영 조치 | ⚠️ | Admin UI 있으나 자동화 미구현 |
| 결제/정산 | ⚠️ | UI 완성, 토스페이먼츠 실제 연동 미완 |
| OAuth 소셜 로그인 | ⚠️ | API 구조 있으나 실제 카카오/네이버/애플 미연동 |
| 푸시 알림 | ⚠️ | web-push VAPID 구현 완료, VAPID 키 생성 + 환경변수 설정 필요 |
| 이미지 업로드 | ⚠️ | UI 있으나 S3 업로드 미연동 |
| GPS 실제 위치 | ⚠️ | 시뮬레이션으로 구현, 실제 Geolocation API 미연동 |

---

### 🆕 기획서에 없지만 추가 구현된 기능

| 기능 | 설명 | 라우트 |
|------|------|-------|
| **개인 매치 시스템** | 팀 매칭과 별도로 개인 단위 매치 | /matches/* |
| **강좌/레슨 시스템** | 그룹레슨, 연습경기, 자유연습, 클리닉 | /lessons/* |
| **장터 (마켓플레이스)** | 중고 판매, 대여, 공동구매 | /marketplace/* |
| **용병 모집 시스템** | 팀이 용병을 모집하고 개인이 신청 | /mercenary/* |
| **뱃지 시스템** | 8종 뱃지 (매너, 시간약속, 심판영웅 등) | /badges |
| **다크/라이트 테마** | 시스템 연동 + 수동 전환 | /settings |
| **시설 관리** | 시설 검색, 상세, 리뷰, 지도 | /venues/* |
| **내 콘텐츠 관리** | 내가 만든 매치/팀/강좌/매물 수정/삭제 | /my/* |
| **팀 멤버 관리** | 멤버 목록, 역할 변경, 추방, 초대 | /teams/[id]/members |
| **쿼터별 스코어** | 경기 후 쿼터별 점수 입력 | /team-matches/[id]/score |
| **결제 체크아웃** | 쿠폰, 결제수단, 가격 분석 | /payments/checkout |
| **환불 요청** | 시간 기반 환불 정책 자동 계산 | /payments/[id]/refund |
| **Admin 분쟁 관리** | 신고 접수 → 조사 → 해결/기각 | /admin/disputes |
| **Admin 통계** | 매치/매출/종목/시설 차트 | /admin/statistics |
| **Admin 정산 관리** | 정산 대기/완료/환불 관리 | /admin/settlements |
| **페이지 전환 Progress Bar** | 상단 파란색 로딩 바 | 전체 |
| **Skeleton 로딩** | 25개 라우트 Skeleton UI | 전체 |
| **이용약관/개인정보처리방침** | 법적 문서 페이지 | /settings/terms, /settings/privacy |

---

## 4. 전체 라우트 맵 (68개)

### 사용자 페이지 (50개)

```
인증
  /login                          소셜 로그인 + 개발자 빠른 로그인

메인
  /home                           홈 (종목 선택 + 추천 매치)
  /matches                        매치 찾기 (검색 + 필터)
  /matches/new                    매치 만들기 (4단계 폼)
  /matches/[id]                   매치 상세 (참가/탈퇴/캘린더)
  /matches/[id]/edit              매치 수정

팀 매칭
  /team-matches                   팀 매칭 모집글 목록
  /team-matches/new               모집글 작성 (5단계 폼)
  /team-matches/[id]              모집글 상세 (신청/승인/거절)
  /team-matches/[id]/arrival      도착 인증 (GPS/사진/상대확인)
  /team-matches/[id]/score        쿼터별 스코어 입력
  /team-matches/[id]/evaluate     경기 후 6항목 평가

팀/클럽
  /teams                          팀 목록 (검색/필터)
  /teams/new                      팀 등록
  /teams/[id]                     팀 상세 (신뢰지표/전적/뱃지)
  /teams/[id]/edit                팀 수정
  /teams/[id]/members             멤버 관리 (역할/추방/초대)

강좌
  /lessons                        강좌 목록 (타입 필터)
  /lessons/[id]                   강좌 상세 (커리큘럼/수강신청)

장터
  /marketplace                    매물 목록 (카테고리 필터)
  /marketplace/new                매물 등록
  /marketplace/[id]               매물 상세 (구매/좋아요/공유)
  /marketplace/[id]/edit          매물 수정 + 상태 변경

용병
  /mercenary                      용병 모집 목록
  /mercenary/new                  용병 모집 작성

시설
  /venues                         시설 목록 (종목/지역 필터)
  /venues/[id]                    시설 상세 (지도/리뷰/운영시간)

채팅
  /chat                           채팅 목록 (데스크탑 2컬럼)
  /chat/[id]                      채팅방 (버블UI/빠른액션)

기타
  /badges                         뱃지 시스템 (달성/미달성)
  /notifications                  알림
  /reviews                        평가 작성 (대기 목록)
  /payments                       결제 내역
  /payments/checkout              결제 체크아웃
  /payments/[id]                  결제 상세 + 타임라인
  /payments/[id]/refund           환불 요청
  /user/[id]                      사용자 공개 프로필

마이페이지
  /profile                        프로필 (매너점수/ELO/일정)
  /my/matches                     내가 만든 매치 (수정/취소)
  /my/team-matches                내 팀 매칭 모집글
  /my/teams                       내 팀 (수정/멤버관리/삭제)
  /my/lessons                     내가 등록한 강좌
  /my/listings                    내 장터 매물 (상태변경)
  /my/mercenary                   내 용병 모집
  /my/reviews-received            내가 받은 평가

설정
  /settings                       설정 (테마/로그아웃)
  /settings/account               개인정보 관리 (회원탈퇴)
  /settings/notifications         알림 설정 (8개 토글)
  /settings/terms                 이용약관
  /settings/privacy               개인정보 처리방침
```

### Admin 페이지 (18개)

```
  /admin/dashboard                대시보드 (통계 카드)
  /admin/matches                  매치 관리 (목록/검색)
  /admin/matches/[id]             매치 상세 (상태 변경)
  /admin/users                    사용자 관리 (목록/검색)
  /admin/users/[id]               사용자 상세 (경고/정지)
  /admin/lessons                  강좌 관리
  /admin/lessons/[id]             강좌 상세 (상태 변경)
  /admin/teams                    팀 관리
  /admin/teams/[id]               팀 상세 (뱃지/정지)
  /admin/venues                   시설 관리
  /admin/venues/new               시설 등록
  /admin/venues/[id]              시설 수정/삭제
  /admin/payments                 결제 관리
  /admin/disputes                 신고/분쟁 관리
  /admin/disputes/[id]            분쟁 상세 (해결/기각/경고/정지)
  /admin/statistics               통계 (차트)
  /admin/settlements              정산 관리 (대기/완료/환불)
```

---

## 5. DB 스키마 (Prisma 모델 16개)

```
핵심 모델:
  User              — 사용자 (OAuth, 프로필, 매너점수)
  UserSportProfile  — 종목별 프로필 (레벨, ELO, 포지션)
  Match             — 개인 매치
  MatchParticipant  — 매치 참가자
  Team              — 매치 내 팀 구성

팀 매칭 모델:
  SportTeam         — 팀/클럽 (프로필, SNS, 홍보)
  TeamMatch         — 팀 매칭 모집글 (쿼터, 심판, 비용)
  TeamMatchApplication — 신청/승인/거절 (상호확인 체크)
  ArrivalCheck      — 도착 인증 (GPS, 사진, 상대확인)
  MatchEvaluation   — 경기 후 6항목 평가
  TeamTrustScore    — 팀 신뢰 지표 누적
  Badge             — 뱃지 (8종)

부가 모델:
  Venue / VenueReview — 시설 + 리뷰
  Lesson            — 강좌/레슨
  MarketplaceListing / MarketplaceOrder / MarketplaceReview — 장터
  Payment           — 결제
  Notification      — 알림
  Review            — 동료 평가
```

---

## 6. 백엔드 API 모듈 (21개)

```
Core:       auth, users, matches, prisma, config, health, realtime
팀 매칭:    teams, team-matches
콘텐츠:     lessons, marketplace, venues, reviews, payments, notifications
신규 추가:  chat, mercenary, badges, disputes, settlements
Admin:      admin
```

### DTO 현황 (class-validator 기반)

| 모듈 | DTO 파일 |
|------|---------|
| lessons | `create-lesson.dto.ts` (신규, 2026-04-10) |
| teams | `create-team.dto.ts` (신규, 2026-04-10) |
| 기타 | auth/users/matches/team-matches/marketplace/payments 등 기존 DTO 유지 |

> limit 파라미터 NaN/음수 방어가 `lessons`, `marketplace`, `teams` 컨트롤러에 추가됨.

---

## 7. 프로덕션 전 남은 작업

### 🔴 필수 (서비스 런칭 전)
| 항목 | 설명 | 예상 작업량 |
|------|------|-----------|
| OAuth 실제 연동 | 카카오/네이버/애플 소셜 로그인 | 중 |
| 토스페이먼츠 연동 | 실제 결제 + 웹훅 | 대 |
| 이미지 업로드 | S3 + CloudFront CDN | 중 |
| VAPID 키 발급 | web-push 환경변수 설정 (코드 완성됨) | 소 |
| GPS 위치 API | Geolocation + 반경 계산 | 소 |
| EC2/Docker 배포 | deploy/ Dockerfile + nginx 설정 완성됨 | 소 |

### 🟡 권장 (런칭 후 개선)
| 항목 | 설명 |
|------|------|
| ELO 자동 업데이트 | 경기 결과 반영 자동화 |
| 지각/노쇼 자동 제재 | 누적 횟수 기반 매칭 제한 |
| 주소 검색 API | 카카오/네이버 주소 검색 |
| 달력 피커 | 날짜 선택 UI 고도화 |
| 이메일 알림 | 이메일 발송 시스템 |
| 앱스토어 배포 | Capacitor iOS/Android 빌드 |

---

## 8. 디자인 시스템

### 색상 규칙 (Toss UI 기반)
```
Accent:     blue-500 (#3182F6) — 유일한 강조색
Text:       gray-900 ~ gray-400 — 모든 텍스트
Background: gray-50 — 배경, white — 카드
Success:    green-500 — 성공 상태만
Error:      red-500 — 에러/위험만
Star:       amber-400 — 별점만 (유일한 예외)
```

### 레이아웃
```
Mobile:  하단 탭 네비게이션 (5탭) + 채팅 FAB
Desktop: 좌측 사이드바 (260px) + 콘텐츠 (960px)
Detail:  2컬럼 (1fr + 380px), sidebar-sticky
```

### 컴포넌트
```
Toast, Modal, Skeleton, ProgressBar, BadgeDisplay,
MapPlaceholder, ReviewForm, CheckoutModal, ChatRoomEmbed,
RefereeIncentive, SportIcons (6종)
```

---

## 9. 보안 및 접근성 현황 (2026-04-10 기준)

### nginx 보안 레이어
| 항목 | 구현 상태 |
|------|---------|
| X-Frame-Options | ✅ `DENY` (전체 location 블록) |
| X-Content-Type-Options | ✅ `nosniff` |
| X-XSS-Protection | ✅ `1; mode=block` |
| Referrer-Policy | ✅ `strict-origin-when-cross-origin` |
| Permissions-Policy | ✅ camera/microphone/geolocation 제한 |
| Swagger `/docs` 접근 제한 | ✅ `allow 127.0.0.1; deny all` |
| `/uploads/` rate limiting | ✅ 10req/min per IP, burst=5 |
| `client_max_body_size` | ✅ 55m |
| WebSocket keepalive | ✅ `proxy_read_timeout 86400s` |

### SafeImage 보안
| 항목 | 구현 상태 |
|------|---------|
| 경로 순회(`..`) 방어 | ✅ `normalizeSrc()` |
| `data:` URI 제한 | ✅ `data:image/` prefix만 허용 |
| 상대 경로 정규화 | ✅ 자동 처리 |
| 에러 루프 방지 | ✅ `usedFallback` 상태 |

### 접근성 (WCAG 2.1 AA)
| 항목 | 구현 상태 |
|------|---------|
| 폼 label 연결 (`htmlFor` + `id`) | ✅ 42개 파일 전수 적용 |
| 모달 aria 속성 | ✅ `role="dialog"`, `aria-modal`, `aria-labelledby`, ESC, focus trap |
| 이미지 alt 텍스트 | ✅ 의미 있는 alt 텍스트 (매치 카드 등) |
| 인증 보호 경로 | ✅ `useRequireAuth()` — 비로그인 시 리디렉트 |
| 다크모드 대비 | ✅ WCAG 4.5:1 유지 |
| `prefers-reduced-motion` | ✅ globals.css 적용 |
