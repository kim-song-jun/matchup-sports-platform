# Teameet Comprehensive Improvement Plan

> **Date**: 2026-04-09
> **Scope**: 프로젝트 전반 분석 기반 개선점 + 신규 기능 계획

---

## 현재 프로젝트 상태 요약

### 완성도 (높음)
- **백엔드**: 16개 모듈 모두 Controller + Service + Module + Spec 완비
- **프론트엔드**: 30+ 페이지 모두 기능적으로 구현됨
- **테스트**: Backend 22 unit + 4 integration / Frontend 19 unit / E2E 14 specs
- **DB**: 25+ Prisma 모델, enum 포함 완성된 스키마
- **인프라**: Docker Compose, Turborepo, GitHub Actions 구성 완료

### 핵심 갭 (기존 백로그 FTR-001~012 중 미완료)
| ID | 기능 | 상태 |
|----|------|------|
| FTR-001 | 미디어 라이트박스 | ✅ 완료 |
| FTR-002 | 매치 탐색 2.0 | ✅ v1 완료 (saved search, GPS 미완) |
| FTR-003 | 알림 delivery + action center | ✅ v1 완료 (설정 영속화 미완) |
| FTR-004 | 매치 수정/취소 (PATCH /matches/:id) | ✅ 완료 — PATCH/cancel/close + 프론트 edit 연결 |
| FTR-005 | 업로드 파이프라인 | ⚠️ 백엔드 완료, 프론트 UI 미구현 |
| FTR-006 | 팀 상세 실데이터 전환 | ❌ 부분적 mock 잔존 |
| FTR-007 | 채팅 리치 액션 | ❌ 이미지/신고/차단 미구현 |
| FTR-008 | 팀 초대/멤버 검색 | ❌ 초대 flow 없음 |
| FTR-009 | OAuth 소셜 로그인 실연동 | ✅ 완료 — 카카오/네이버 env 분기 실연동 |
| FTR-010 | 장터/레슨 커머스 완성 | ❌ 결제 연동 없음 (명시적 미지원) |
| FTR-011 | 도착 인증 (GPS+사진) | ❌ 시뮬레이션 상태 |
| FTR-012 | 추천/랭킹 자동화 | ❌ 기본 skill-level 근접도만 |

---

## Phase 1: Production Critical (즉시 착수)

> 프로덕션 출시의 최소 요건. 이것 없이는 실사용 불가.

### 1-1. 결제 시스템 실연동 (Toss Payments)
**우선순위**: 🔴 Critical
**상태**: ✅ 2026-04-09 구현 완료
- `payments.service.ts` env 분기: `TOSS_SECRET_KEY` 없으면 mock 모드 유지
- `POST /payments/webhook` 웹훅 엔드포인트 추가
- confirm: Toss API 실연동 + amount 검증, 10초 타임아웃
- refund: Toss cancel API 실연동
- 프론트엔드 TossPayments SDK 위젯 연동 (`apps/web/src/lib/payment-ui.ts`)
**의존**: 토스 상점키 (test/production) — 키 없을 때 mock 모드로 fallback

### 1-2. OAuth 소셜 로그인 (카카오/네이버)
**우선순위**: 🔴 Critical
**상태**: ✅ 2026-04-09 구현 완료
- `auth.service.ts` env 분기: `KAKAO_CLIENT_ID`/`NAVER_CLIENT_ID` 없으면 mock 모드 유지
- 카카오/네이버 REST API 토큰 교환 + 사용자 정보 조회 실연동
- 이메일 기준 기존 사용자 매칭 / 신규 자동 가입
- 프론트 소셜 로그인 버튼 활성화 + OAuth 콜백 페이지 추가
- Apple 로그인은 Phase 2로 이연 (iOS 앱 배포 시)
**의존**: 카카오/네이버 개발자 앱 키 — 키 없을 때 mock 모드로 fallback

### 1-3. 매치 수정/취소 API (FTR-004)
**우선순위**: 🔴 Critical — 프론트 edit UI는 이미 존재하나 백엔드 없음
**상태**: ✅ 2026-04-09 구현 완료
- `PATCH /matches/:id` — host만 수정 가능
- `POST /matches/:id/cancel` — `CancelMatchDto { reason }` + 참가자 환불 트리거
- `POST /matches/:id/close` — recruiting → full 상태 전환
- 참가자 알림 발송 연결
- 프론트 edit 페이지 API 연결, 상세 호스트 관리 영역, 상태 배지 반영
**변경 파일**: `matches.controller.ts`, `matches.service.ts`, `match.dto.ts`

### 1-4. 이미지 업로드 파이프라인 (FTR-005)
**우선순위**: 🟠 High
**상태**: ⚠️ 2026-04-09 백엔드 완료, 프론트엔드 UI 미구현
- **백엔드 완료**: `POST /uploads` (멀티파트, 최대 5개·10MB·jpeg/png/webp/gif), `GET /uploads/:id`, `DELETE /uploads/:id` (소유자만), sharp webp 변환 + 1200px 리사이즈 + 300px 썸네일, 로컬 스토리지 (`uploads/` 디렉토리), Prisma `Upload` 모델 추가
- **잔여**: 프론트엔드 드래그&드롭 UI (`components/ui/image-upload.tsx`), 매치 생성/수정·팀 프로필·장터·구장 리뷰·프로필 사진 연결
- **Capacitor**: `@capacitor/camera` 연동은 Phase 4 (모바일 앱 배포 시)
**의존**: 현재 로컬 스토리지 사용, S3 전환은 배포 환경 결정 후

---

## Phase 2: Core Experience (핵심 경험 강화)

> 사용자 retention과 engagement를 결정짓는 기능들.

### 2-1. 지도 통합 (카카오맵)
**우선순위**: 🟠 High
**이유**: 스포츠 매칭의 핵심은 "내 근처". 위치 기반 기능 없이는 반쪽
**작업 범위**:
- 구장 상세에 카카오맵 표시
- 매치 목록에서 지도 뷰 (리스트/맵 토글)
- GPS 기반 "내 근처 매치" 필터링 + 거리순 정렬
- 구장 검색 시 지도 영역 기반 필터
- Capacitor `@capacitor/geolocation` 연동
**신규 파일**: `components/map/kakao-map.tsx`, 백엔드 geospatial 쿼리

### 2-2. 팀 초대 시스템 (FTR-008)
**우선순위**: 🟠 High
**작업 범위**:
- 닉네임/이메일로 사용자 검색 API
- 초대 링크 생성 (만료 기한 포함)
- 초대 수락/거절 UI
- 초대 상태 관리 (pending/accepted/declined/expired)
- 초대 시 알림 발송
**예상 파일**: `teams.controller.ts` 확장, 신규 Prisma 모델 `TeamInvitation`

### 2-3. 채팅 리치 액션 (FTR-007)
**우선순위**: 🟡 Medium
**작업 범위**:
- 이미지 첨부 (업로드 파이프라인 의존)
- 사용자 신고/차단 기능 (disputes 모듈 연동)
- 타이핑 인디케이터 (Socket.IO typing event)
- 채팅방 내 거래/매치 요약 카드 (pinned info)
- 메시지 삭제

### 2-4. 알림 설정 영속화
**우선순위**: 🟡 Medium
**작업 범위**:
- `NotificationPreference` Prisma 모델 추가
- 카테고리별 on/off (매치, 팀, 채팅, 결제, 마케팅)
- 채널별 on/off (인앱, 웹 푸시, 이메일)
- `/settings/notifications` 페이지

---

## Phase 3: Differentiation (차별화 기능)

> "그냥 게시판"을 넘어서는 AI/데이터 기반 기능.

### 3-1. AI 매칭 알고리즘 고도화 (FTR-012)
**우선순위**: 🟡 Medium
**현재 상태**: `matching-engine.service.ts`에 basic skill-level 근접도만 사용
**작업 범위**:
- 매칭 점수 다차원화: 실력, 위치, 시간대 선호, 과거 매칭 이력, 팀 케미
- "왜 이 매치를 추천하는지" 이유 뱃지 (`recommendation_reason`)
- 개인화된 홈 피드 (로그인 유저 vs 비로그인 차등)
- 매칭 후 만족도 피드백 → 알고리즘 학습 루프

### 3-2. ELO/신뢰 시스템 자동화
**우선순위**: 🟡 Medium
**작업 범위**:
- 경기 결과 기반 ELO 레이팅 자동 계산
- 노쇼/지각 자동 감점 + 경고 → 제재 단계
- 팀 신뢰 점수 누적 대시보드
- 배지 자동 발급 (N경기 참가, 무노쇼 N연속 등)
- 매너 점수/MVP 투표

### 3-3. 도착 인증 실구현 (FTR-011)
**우선순위**: 🟡 Medium
**작업 범위**:
- Geolocation API로 구장 반경 확인
- 사진 촬영 업로드 (Capacitor camera)
- 지각/미도착 자동 기록 → 신뢰 점수 반영

### 3-4. 장터/레슨 커머스 완성 (FTR-010)
**우선순위**: 🟡 Medium (결제 연동 Phase 1 완료 후)
**작업 범위**:
- 장터 에스크로 결제 flow
- 레슨 티켓 구매/사용 flow
- 판매자/강사 정산 자동화

---

## Phase 4: Growth & Polish (성장 + 완성도)

> 사용자 기반이 형성된 후 성장을 가속화하는 기능들.

### 4-1. 전문 검색 (Elasticsearch/Meilisearch)
**현재**: 제목/설명 LIKE 검색만 가능
**개선**:
- 매치/구장/장터/레슨 전문 검색
- 자동완성, 오타 교정
- 인기 검색어, 최근 검색어

### 4-2. 활동 피드 + 소셜 기능
**작업 범위**:
- 사용자 팔로우
- 활동 피드 (친구의 매치 참가, 팀 활동 등)
- 매치 하이라이트 공유
- SNS 공유 (카카오톡, 링크 복사)

### 4-3. 통계 대시보드 (개인/팀)
**작업 범위**:
- 개인: 월별 경기 수, 종목별 분포, 승률, 레이팅 추이
- 팀: 전적, 상대 전적, 멤버별 기여도
- 시각화 (차트/그래프)

### 4-4. 고급 관리자 기능
**작업 범위**:
- 실시간 대시보드 (접속자, 진행 중인 매치)
- 사용자 제재 관리 (경고/정지/영구 정지)
- 콘텐츠 모더레이션 (자동 필터링)
- 매출/정산 리포트
- 프로모션/쿠폰 관리

### 4-5. 모바일 앱 네이티브 기능
**현재**: Capacitor 의존성 설치되어 있으나 대부분 미사용
**작업 범위**:
- `@capacitor/camera`: 프로필 사진, 도착 인증
- `@capacitor/geolocation`: 내 근처 매치
- `@capacitor/haptics`: 알림/인터랙션 피드백
- `@capacitor/share`: 매치/팀 공유
- `@capacitor/push-notifications`: 네이티브 푸시
- 바이오메트릭 인증 (Face ID / 지문)

---

## 신규 기능 제안 (백로그에 없던 것)

### NEW-01. 대기열/웨이팅 리스트
**이유**: 인기 매치 정원 초과 시 "다음에 자리 나면 알림" 기능이 없음
**작업**:
- 정원 초과 시 대기열 등록
- 취소 발생 시 순번대로 자동 알림
- 대기 현황 표시

### NEW-02. 반복 매치 (정기전)
**이유**: 매주 같은 시간/장소에서 경기하는 동호인이 매번 새로 생성해야 함
**작업**:
- 반복 규칙 설정 (매주/격주/매월)
- 자동 매치 생성 (Cron job — `@nestjs/schedule` 이미 설치됨)
- 참가자 자동 이관 옵션
- 정기전 관리 UI

### NEW-03. 구장 예약 시스템
**이유**: 현재 구장 정보는 조회만 가능, 예약은 외부에서 해야 함
**작업**:
- 구장 관리자 계정 (구장 owner role)
- 시간대별 예약 가능 현황
- 매치 생성 시 구장 예약 연동
- 구장 관리자 대시보드

### NEW-04. 실시간 경기 스코어보드
**이유**: 경기 중/후 결과 기록이 없어 전적 관리가 안 됨
**작업**:
- 실시간 스코어 입력 UI
- 경기 타임라인 (골/반칙/교체 등)
- 경기 결과 자동 기록
- MVP 투표

### NEW-05. 멀티 언어 완성 (i18n)
**현재 상태**: `ko.json`/`en.json` 존재하나 대부분 페이지에서 하드코딩 한국어 사용
**작업**:
- 모든 UI 텍스트를 translation key로 전환
- 영어 번역 완성
- 언어 전환 UI

### NEW-06. PWA 오프라인 지원
**이유**: 체육관/운동장 등 네트워크 불안정 환경에서 사용
**작업**:
- Service Worker 캐싱 전략
- 오프라인 시 최근 데이터 표시
- 온라인 복귀 시 동기화

### NEW-07. 날씨 연동
**이유**: 야외 스포츠(풋살/농구 등)에 날씨 정보가 필수
**작업**:
- 매치 상세에 해당 일시/장소 날씨 예보 표시
- 우천 시 자동 알림 (매치 취소/연기 유도)
- 기상청 API 연동

### NEW-08. 레퍼리/심판 매칭
**이유**: 공식적인 경기에는 심판이 필요
**작업**:
- 심판 프로필/자격증 등록
- 매치 생성 시 심판 요청
- 심판 매칭 + 심판비 결제
- 심판 평가

---

## 기술 부채 해결

### TD-01. `any` 타입 제거
- `apps/web/src/app/(main)/chat/[id]/page.tsx` — 메시지 핸들링
- `apps/web/src/hooks/use-api.ts` — 응답 타입 assertion
- `apps/web/src/app/providers.tsx` — QueryClient 에러 핸들러

### TD-02. i18n 일관성
- 하드코딩 한국어 → next-intl translation key 전환
- 누락된 en.json 키 추가

### TD-03. Error Boundary 추가
- React Error Boundary 컴포넌트 생성
- 페이지별 fallback UI

### TD-04. Redis 캐싱 전략
- Redis 설치되어 있으나 캐싱 활용 최소
- 매치 목록, 구장 정보, 사용자 프로필 캐싱
- 캐시 무효화 전략

### TD-05. SEO / OpenGraph
- 페이지별 메타 태그
- 매치/팀/구장 공유 시 미리보기 카드
- sitemap.xml, robots.txt

### TD-06. Rate Limiting 강화
- `@nestjs/throttler` 설치되어 있으나 전역 적용 상태 확인 필요
- 엔드포인트별 차등 제한 (로그인 시도, 결제 등)

### TD-07. 미사용 Capacitor 플러그인 정리
- 사용하지 않는 플러그인은 제거하거나 Phase 4에서 구현 계획 명시

---

## 실행 순서 권장

```
Phase 1 (Production Critical) — 동시 진행 가능
├── 1-1. 결제 실연동 ──────────────────┐
├── 1-2. OAuth 소셜 로그인              │
├── 1-3. 매치 수정/취소 API             │ 2-3주
├── 1-4. 이미지 업로드 파이프라인       │
└───────────────────────────────────────┘

Phase 2 (Core Experience) — Phase 1 완료 후
├── 2-1. 지도 통합 (카카오맵)
├── 2-2. 팀 초대 시스템
├── 2-3. 채팅 리치 액션 (업로드 의존)
└── 2-4. 알림 설정 영속화

Phase 3 (Differentiation) — Phase 2 완료 후
├── 3-1. AI 매칭 고도화
├── 3-2. ELO/신뢰 자동화
├── 3-3. 도착 인증 실구현
└── 3-4. 장터/레슨 커머스

Phase 4 (Growth) — 점진적
├── NEW-01 ~ NEW-08 (선택적)
├── 4-1 ~ 4-5
└── TD-01 ~ TD-07 (상시)
```

---

## 의존성 그래프

```
결제 실연동 (1-1) ─────→ 장터/레슨 커머스 (3-4)
                   ├──→ 매치 취소 환불 (1-3)
                   └──→ 구장 예약 (NEW-03)

이미지 업로드 (1-4) ──→ 채팅 이미지 (2-3)
                   ├──→ 도착 인증 사진 (3-3)
                   └──→ 프로필/팀/구장 이미지 개선

OAuth (1-2) ───────→ 신규 사용자 온보딩 개선
                   └──→ 계정 연동 정책

지도 통합 (2-1) ───→ GPS 기반 매치 탐색 (FTR-002 v2)
                  └──→ 도착 인증 GPS (3-3)

@nestjs/schedule ──→ 반복 매치 (NEW-02)
                  └──→ 자동 제재 (3-2)
```
