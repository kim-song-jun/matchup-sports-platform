# 2026-04-08 Design Page Inventory

## 목적

디자인팀(`design-main`, `ux-manager`, `ui-manager`) 평가 전에 현재 웹 앱의 실제 페이지 표면적을 route 기준으로 정리한다. 이 문서는 "무슨 페이지가 있는가", "각 페이지가 어떤 UI/기능 블록을 가지는가", "디자인 리뷰를 어떤 묶음으로 나눌 것인가"를 빠르게 파악하기 위한 인벤토리다.

## 전체 규모

- 총 page route 파일: `83`
- 공개 페이지: `6`
- 인증 페이지: `1`
- 메인 사용자 페이지: `55`
- 관리자 페이지: `21`

## 공통 레이아웃

### Root

- `/`
- 실제 랜딩이 아니라 세션에 따라 `/landing` 또는 `/home`으로 보내는 redirect spinner 페이지
- 디자인 리뷰 우선순위는 낮다

### Main App Shell

- 파일: `apps/web/src/app/(main)/layout.tsx`
- Desktop: 좌측 `Sidebar` + 우측 본문
- Mobile/Tablet: 하단 `BottomNav` + 내부 `Footer`
- 대부분의 메인 사용자 페이지는 이 shell 위에 올라간다

### Admin Shell

- 파일: `apps/web/src/app/admin/layout.tsx`
- 좌측 고정 admin nav, 모바일 햄버거/overlay, 권한 guard/auth wall 포함
- 관리자 페이지 디자인 리뷰는 이 shell 일관성부터 같이 봐야 한다

## 1. 공개 / 마케팅 페이지

### `/landing`

- 역할: 서비스 메인 랜딩
- 주요 블록:
  - 히어로
  - 팀 매칭/프로필 생성/매치 참가 설명
  - social proof 성격의 팀/사용자 카드
  - CTA

### `/about`

- 역할: 서비스 문제 정의와 제품 가치 설명
- 주요 블록:
  - 실력 차이/재미없는 경기 문제 제시
  - 서비스 철학/효과 설명
  - 통계/활성 팀 등 신뢰 요소

### `/guide`

- 역할: 온보딩/사용법 가이드
- 주요 블록:
  - 회원가입
  - 프로필 설정
  - 매치 탐색
  - 단계형 usage explainer

### `/pricing`

- 역할: 요금제/기능 비교
- 주요 블록:
  - 플랜 카드
  - 기능 비교
  - 프리미엄/팀 기능 가치 제안

### `/faq`

- 역할: 자주 묻는 질문
- 주요 블록:
  - 아코디언/질문 리스트
  - 결제/매칭 취소/팀 매칭/용병 관련 정보

### `/`

- 역할: 세션 분기 redirect
- 주요 블록:
  - 단일 로딩 스피너

## 2. 인증 페이지

### `/login`

- 역할: 로그인 + 회원가입 + dev-login
- 주요 블록:
  - 브랜드 헤더
  - 로그인/회원가입 전환
  - 소셜 로그인 성격의 CTA
  - 테스트 닉네임 기반 dev-login 패널

## 3. 메인 사용자 앱: 핵심 허브

### `/home`

- 역할: 개인화 홈
- 주요 블록:
  - 인사/로그인 상태 헤더
  - 다가오는 일정
  - 배너 캐러셀
  - 종목 필터
  - 추천 매치
  - 팀/강좌/장터 섹션

### `/onboarding`

- 역할: 첫 사용자 설정
- 주요 블록:
  - AI 매칭 가치 제안
  - 종목/레벨/지역 설정
  - 단계형 onboarding flow

### `/notifications`

- 역할: 알림 허브
- 주요 블록:
  - 알림 목록
  - 유형별 아이콘/상태
  - 읽음/미읽음 처리

### `/badges`

- 역할: 배지/신뢰 뱃지 열람
- 주요 블록:
  - 배지 카드 그리드
  - 배지 설명
  - 팀/사용자 신뢰 지표

### `/reviews`

- 역할: 내 평가 요약
- 주요 블록:
  - 리뷰 상태/안내
  - 완료 매치 기반 평가 요청 문구

### `/profile`

- 역할: 프로필 허브
- 주요 블록:
  - 프로필 헤더
  - 매너/기록/종목 프로필
  - 프로필 편집/설정 진입 링크

### `/user/[id]`

- 역할: 타 사용자 프로필
- 주요 블록:
  - 공개 프로필
  - 활동/기록/종목 정보

## 4. 개인 매치 영역

### `/matches`

- 역할: 매치 목록/탐색
- 주요 블록:
  - 검색
  - 종목 필터 칩
  - 상세 필터(날짜/정렬)
  - 매치 카드 리스트

### `/matches/new`

- 역할: 매치 생성
- 주요 블록:
  - step indicator
  - 종목 선택
  - 매치 정보 입력
  - 시설/일시 선택
  - 최종 확인/등록

### `/matches/[id]`

- 역할: 매치 상세
- 주요 블록:
  - 타이틀 카드
  - 일시/장소/인원/참가비 info card
  - 참가 현황 progress
  - 참가/탈퇴/수정 CTA
  - 참가자 리스트

### `/matches/[id]/edit`

- 역할: 매치 수정
- 주요 블록:
  - 기존 정보 prefill form
  - 시설/일시/인원/레벨 수정
  - 저장/삭제

### `/my/matches`

- 역할: 참가/생성 매치 히스토리
- 주요 블록:
  - 탭(`참가 매치`, `내가 만든 매치`)
  - 전적/통계 요약
  - 생성 매치 카드
  - 취소/수정 액션

## 5. 팀 / 팀 매칭 영역

### `/teams`

- 역할: 팀 탐색
- 주요 블록:
  - 팀 카드 리스트
  - 종목/지역 기반 탐색

### `/teams/new`

- 역할: 팀 등록
- 주요 블록:
  - 팀명
  - 팀 소개
  - 종목/지역/레벨
  - 등록 CTA

### `/teams/[id]`

- 역할: 팀 상세
- 주요 블록:
  - 팀 헤더
  - 배지/팀 규모/소개
  - 오픈채팅/참여 CTA

### `/teams/[id]/edit`

- 역할: 팀 수정
- 주요 블록:
  - 팀 기본 정보 수정
  - 저장/삭제

### `/teams/[id]/members`

- 역할: 멤버 관리
- 주요 블록:
  - 멤버 목록
  - 역할 표시
  - 초대/탈퇴/관리 액션

### `/my/teams`

- 역할: 내 팀 허브
- 주요 블록:
  - 운영 중 팀 목록
  - empty state + 팀 만들기 CTA

### `/team-matches`

- 역할: 팀 매칭 목록
- 주요 블록:
  - 모집글 리스트
  - 상태 배지
  - 팀 매칭 CTA

### `/team-matches/new`

- 역할: 팀 매칭 모집글 작성
- 주요 블록:
  - 종목/타이틀/일정
  - 비용 부담/무료초청
  - 용병 허용
  - 등록 CTA

### `/team-matches/[id]`

- 역할: 팀 매칭 상세
- 주요 블록:
  - 모집글 상세
  - 신청 modal/메시지
  - 상태/취소 표시

### `/team-matches/[id]/edit`

- 역할: 팀 매칭 모집글 수정
- 주요 블록:
  - 폼 수정
  - 취소/저장

### `/team-matches/[id]/arrival`

- 역할: 도착 인증
- 주요 블록:
  - arrival status
  - 인증 CTA

### `/team-matches/[id]/score`

- 역할: 스코어 입력
- 주요 블록:
  - 점수 입력 UI
  - 제출 CTA

### `/team-matches/[id]/evaluate`

- 역할: 경기 평가
- 주요 블록:
  - 매너/평가 입력
  - 코멘트

### `/my/team-matches`

- 역할: 내가 만든/신청한 팀 매칭
- 주요 블록:
  - 탭
  - 상태 카드
  - 취소/수정 액션

## 6. 용병 영역

### `/mercenary`

- 역할: 용병 모집 목록
- 주요 블록:
  - 모집글 카드
  - 신청 CTA
  - empty state

### `/mercenary/new`

- 역할: 용병 모집 작성
- 주요 블록:
  - 팀 보유 guard
  - 모집 정보 입력
  - 등록 CTA

### `/mercenary/[id]/edit`

- 역할: 용병 모집 수정
- 주요 블록:
  - 모집 내용 편집
  - 삭제/저장

### `/my/mercenary`

- 역할: 내 용병 모집글 관리
- 주요 블록:
  - 내 모집글 리스트
  - 취소/수정
  - empty state

## 7. 강좌 영역

### `/lessons`

- 역할: 강좌 목록
- 주요 블록:
  - 강좌 카드 리스트
  - 필터/탐색

### `/lessons/new`

- 역할: 강좌 등록
- 주요 블록:
  - 강좌 정보
  - 일시/상세
  - 등록 CTA

### `/lessons/[id]`

- 역할: 강좌 상세
- 주요 블록:
  - 강좌 소개
  - 오리엔테이션/세션 정보
  - 예약/수강 CTA

### `/lessons/[id]/edit`

- 역할: 강좌 수정
- 주요 블록:
  - 강좌 수정 폼
  - 삭제/저장

### `/my/lessons`

- 역할: 내가 등록한 강좌
- 주요 블록:
  - 강좌 리스트
  - 취소/상태 배지

### `/my/lesson-tickets`

- 역할: 내 수강권
- 주요 블록:
  - 수강권 카드
  - 상태/잔여 횟수
  - 재등록/취소 연결

## 8. 장터 영역

### `/marketplace`

- 역할: 장터 목록
- 주요 블록:
  - 상품 카드
  - 카테고리 탐색

### `/marketplace/new`

- 역할: 매물 등록
- 주요 블록:
  - 상품 정보 입력
  - 상세 설명
  - 등록 CTA

### `/marketplace/[id]`

- 역할: 상품 상세
- 주요 블록:
  - 상품 이미지/정보
  - 좋아요/신고
  - 대여 신청/채팅 CTA

### `/marketplace/[id]/edit`

- 역할: 상품 수정
- 주요 블록:
  - 매물 수정 폼
  - 저장

### `/my/listings`

- 역할: 내 등록 상품
- 주요 블록:
  - 매물 리스트
  - empty state

## 9. 시설 영역

### `/venues`

- 역할: 시설 검색
- 주요 블록:
  - 시설명/지역 검색
  - 시설 카드 리스트

### `/venues/[id]`

- 역할: 시설 상세
- 주요 블록:
  - 시설 소개
  - 리뷰
  - 이 시설 기반 매치/상대팀 모집

## 10. 결제 영역

### `/payments`

- 역할: 결제 내역
- 주요 블록:
  - 타입별 결제 카드(매치/강좌/장터)
  - 상태 배지

### `/payments/checkout`

- 역할: 결제하기
- 주요 블록:
  - 결제 수단 선택
  - 주문 요약
  - 테스트 모드 안내

### `/payments/[id]`

- 역할: 결제 상세
- 주요 블록:
  - 주문 정보
  - 상태/결제 수단
  - 환불 진입

### `/payments/[id]/refund`

- 역할: 환불 요청
- 주요 블록:
  - 환불 사유
  - 환불 정책/요약

## 11. 설정 영역

### `/settings`

- 역할: 설정 허브
- 주요 블록:
  - 프로필/개인정보/알림/약관 링크 카드

### `/settings/account`

- 역할: 개인정보 관리
- 주요 블록:
  - 프로필/개인 정보 수정
  - 저장 상태 피드백

### `/settings/notifications`

- 역할: 알림 설정
- 주요 블록:
  - 매치/채팅/결제/장터 알림 토글

### `/settings/privacy`

- 역할: 개인정보/프라이버시 문서
- 주요 블록:
  - 정책 텍스트

### `/settings/terms`

- 역할: 이용약관
- 주요 블록:
  - 약관 텍스트

## 12. 평가 / 배지 / 개인 기록

### `/my/reviews-received`

- 역할: 내가 받은 평가
- 주요 블록:
  - 평가 카드
  - 매치 기준 묶음

### `/badges`

- 역할: 배지 열람
- 주요 블록:
  - 신뢰/활동/검증 배지 리스트

### `/reviews`

- 역할: 평가 허브
- 주요 블록:
  - 평가 요청/상태

## 13. 관리자 영역

### 핵심 허브

- `/admin/dashboard`
  - KPI 카드
  - 운영 바로가기

### 운영 리스트 / 상세

- `/admin/matches`, `/admin/matches/[id]`
  - 매치 검색, 상태 관리, 참가자 열람
- `/admin/users`, `/admin/users/[id]`
  - 사용자 리스트, 상세 프로필/종목 정보
- `/admin/teams`, `/admin/teams/[id]`
  - 팀 리스트, 팀 상세/정지/수정
- `/admin/team-matches`
  - 팀 매칭 리스트/상태 관리
- `/admin/mercenary`
  - 용병 모집글 리스트/삭제
- `/admin/lessons`, `/admin/lessons/[id]`
  - 강좌 리스트/상세/참가자 확인
- `/admin/lesson-tickets`
  - 수강권 상태/환불/취소 관리
- `/admin/venues`, `/admin/venues/new`, `/admin/venues/[id]`
  - 시설 목록/등록/수정
- `/admin/payments`
  - 결제 내역 운영 뷰
- `/admin/settlements`
  - 정산 현황
- `/admin/reviews`
  - 평가 moderation
- `/admin/disputes`, `/admin/disputes/[id]`
  - 분쟁 목록/조사 상세
- `/admin/statistics`
  - 통계/대시보드 성격 페이지

## 디자인 리뷰 배치 제안

## 디자인 리뷰 진행 상태

- `Batch A` 완료
  - 문서: `docs/plans/2026-04-08-design-review-batch-a.md`
  - 핵심: 공개 페이지 first-match CTA 약함, 로그인 우선순위 혼선, 브랜드 accent 분산
- `Batch B` 완료
  - 문서: `docs/plans/2026-04-08-design-review-batch-b.md`
  - 핵심: 계정 IA 분산, shell breakpoint 문법 차이, 홈/프로필 정보 과밀
- `Batch C` 완료
  - 문서: `docs/plans/2026-04-08-design-review-batch-c.md`
  - 핵심: create flow false affordance, 매치 흐름 스타일 드리프트, find/create/history 연속성 약함
- `Batch D` 다음 진행
  - 범위: 팀 탐색/등록/상세/관리 + 팀 매칭 생성/상세/평가
- `Batch D~G` 대기
  - 팀/팀매칭, 거래/강좌/시설, 결제/리뷰, 관리자 순으로 진행 예정

### Batch A. 브랜드 / 공개 페이지

- `/landing`
- `/about`
- `/guide`
- `/pricing`
- `/faq`
- `/login`

### Batch B. 앱 shell / 홈 / 기본 허브

- `MainLayout`
- `/home`
- `/notifications`
- `/profile`
- `/settings`
- `/settings/*`

### Batch C. 개인 매치 플로우

- `/matches`
- `/matches/new`
- `/matches/[id]`
- `/matches/[id]/edit`
- `/my/matches`

### Batch D. 팀 / 팀 매칭 플로우

- `/teams`
- `/teams/new`
- `/teams/[id]`
- `/teams/[id]/edit`
- `/teams/[id]/members`
- `/my/teams`
- `/team-matches`
- `/team-matches/new`
- `/team-matches/[id]`
- `/team-matches/[id]/edit`
- `/team-matches/[id]/arrival`
- `/team-matches/[id]/score`
- `/team-matches/[id]/evaluate`
- `/my/team-matches`

### Batch E. 용병 / 강좌 / 장터 / 시설

- `/mercenary`
- `/mercenary/new`
- `/mercenary/[id]/edit`
- `/my/mercenary`
- `/lessons`
- `/lessons/new`
- `/lessons/[id]`
- `/lessons/[id]/edit`
- `/my/lessons`
- `/my/lesson-tickets`
- `/marketplace`
- `/marketplace/new`
- `/marketplace/[id]`
- `/marketplace/[id]/edit`
- `/my/listings`
- `/venues`
- `/venues/[id]`

### Batch F. 결제 / 리뷰 / 개인 기록

- `/payments`
- `/payments/checkout`
- `/payments/[id]`
- `/payments/[id]/refund`
- `/reviews`
- `/my/reviews-received`
- `/badges`

### Batch G. 관리자

- `AdminLayout`
- `/admin/dashboard`
- `/admin/*`

## 메모

- `apps/web/src/app/{auth}`, `apps/web/src/app/{main}` 디렉토리가 존재하지만 현재 active `page.tsx` 인벤토리에는 포함되지 않았다. 실제 route source of truth는 `apps/web/src/app/**/page.tsx` 기준으로 본다.
- 다음 단계에서는 각 batch를 단위로 `agent-design`을 돌리고, 결과를 별도 디자인 리뷰 문서에 누적하는 방식이 적합하다.
