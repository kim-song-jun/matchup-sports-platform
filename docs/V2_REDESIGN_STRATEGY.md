# MatchUp V2 Redesign Strategy

> 목적: 기능 축소 없이 디자인 중심으로 v2를 재정의하고, 전문성과 신뢰감을 강화한다.
> 기준일: 2026-03-30

---

## 1. V2 목표

### 핵심 방향

- 기능은 최대한 유지한다.
- 사용자가 보는 첫 인상은 "기능이 많은 데모"가 아니라 "운영 준비가 된 스포츠 플랫폼"으로 바꾼다.
- 디자인 언어는 단순 토스 스타일 복제에서 벗어나 MatchUp만의 정체성을 만든다.
- glass morphism은 장식이 아니라 정보 위계를 강화하는 제한적 재질로 사용한다.

### V2에서 바뀌어야 하는 인식

현재:
- 화면 수는 많지만 제품 메시지가 넓게 퍼져 있음
- 브랜드명이 `MatchUp`과 `TeamMeet`로 혼재
- 카드/리스트 중심 UI가 기능 카탈로그처럼 보임

V2:
- "AI 매칭 + 신뢰 기반 스포츠 운영"이라는 한 문장으로 읽혀야 함
- 브랜드명은 하나로 통일
- 탐색, 일정, 신뢰, 결제가 하나의 운영 시스템처럼 보여야 함

### 브랜드 정리 권장안

- 문서와 사업 자료 기준으로 `MatchUp`을 메인 브랜드로 통일 권장
- `TeamMeet`는 v1 웹 내부 임시 브랜드로 보고 제거

---

## 2. V2 포지셔닝

### 한 줄 정의

**"신뢰 가능한 생활체육 운영을 만드는 스포츠 매칭 OS"**

### 사용자에게 보일 핵심 가치 3개

1. 정확한 매칭
2. 믿을 수 있는 상대
3. 경기 운영까지 이어지는 일관된 경험

### 기능 우선순위 해석

전면에 내세울 것:
- 홈
- 매치 탐색
- 팀 매칭
- 프로필/신뢰 지표
- 체크인/평가
- 결제

유지하되 전면에서 한 걸음 뒤로 뺄 것:
- 강좌
- 장터
- 용병
- 뱃지
- 관리자 고급 기능

이 원칙은 기능 삭제가 아니라 정보 구조 재배치다.

---

## 3. 디자인 콘셉트

### 콘셉트 이름

**Arena Glass**

### 콘셉트 설명

Arena Glass는 "경기장 조명 아래의 컨트롤 패널" 같은 인상을 목표로 한다.
투명하고 부드러운 레이어를 쓰되, 금융 앱처럼 차갑거나 크립토 대시보드처럼 과장되지 않아야 한다.
스포츠 서비스답게 에너지와 긴장감은 유지하되, 정보는 단단하고 또렷해야 한다.

### 톤 키워드

- Precise
- Trustworthy
- Athletic
- Calm under pressure

### 시각적 방향

- 배경: 밝은 쿨 그레이 + 미세한 블루 틴트
- 핵심 패널: 반투명 유리 레이어 + 얇은 보더 + 짧은 그림자
- 정보 밀집 영역: 유리 대신 불투명 솔리드 카드 사용
- 하이라이트: 블루 단일 액센트 유지, 필요 시 네이비 보조축 추가

---

## 4. Glass 사용 규칙

### 사용해도 되는 곳

- 글로벌 네비게이션
- 모바일 하단탭
- 상단 sticky header
- 대시보드 요약 패널
- 히어로 영역의 featured card
- 모달 및 오버레이 계층

### 솔리드로 유지해야 하는 곳

- 경기 일정 표
- 결제 금액 요약
- 평가 폼
- 관리자 테이블
- 긴 텍스트 상세 영역
- 검색 결과 카드의 핵심 텍스트 본문

### 이유

스포츠 일정, 비용, 평점, 상태값은 "분위기"보다 "판독성"이 중요하다.
glass는 프레임과 계층을 만드는 데 쓰고, 실제 데이터는 높은 대비의 솔리드 표면 위에 놓아야 한다.

---

## 5. 디자인 시스템 제안

### Color

- Primary: 더 단단한 electric blue
- Secondary base: deep navy
- Background: cool gray mist
- Surface Solid: white / near-white
- Surface Glass: white with low alpha + blur
- Status colors: success / warning / error는 지금보다 채도를 약간 낮춰 전문성 강화

예시 방향:
- `primary`: `#2563EB`
- `primary-strong`: `#1D4ED8`
- `navy-900`: `#0F172A`
- `slate-mist`: `#EEF3F8`
- `glass-white`: `rgba(255,255,255,0.58)`
- `glass-stroke`: `rgba(255,255,255,0.42)`

### Typography

- 현재 Pretendard 유지
- 제목은 더 응축되고 강하게
- 본문은 지금보다 대비를 높이고 줄 수를 줄여야 함
- 숫자 정보는 별도 숫자 스타일 규칙 부여

### Radius

- 공용 radius는 `16px` 중심
- hero / featured panel만 `24px`
- 작은 badge/chip은 `999px`

### Shadow

- 그림자는 넓고 흐린 shadow 1종 + focused shadow 1종으로 제한
- glow 효과는 CTA나 핵심 배지에만 제한적으로 사용

### Motion

- glass 패널은 fade + slight lift 정도만 허용
- metrics, filter, tab은 빠르고 건조한 반응성 유지
- 랜딩만 조금 더 연출하고 앱 내부는 과장 금지

---

## 6. 컴포넌트 원칙

### 새로 정리할 공용 레이어

1. `shell`
2. `surface`
3. `glass-panel`
4. `section-header`
5. `status-chip`
6. `metric-tile`
7. `list-card`
8. `detail-sidebar`

### 공용 규칙

- 카드 종류를 줄인다.
- "일반 카드 / glass 카드 / dense 카드" 세 종류만 운영한다.
- 필터 칩 active 색상은 하나로 통일한다.
- sticky mobile header와 bottom nav는 같은 재질로 맞춘다.
- admin도 같은 토큰을 공유하되, 더 단단하고 덜 화려해야 한다.

---

## 7. 대표 화면 리디자인 방향

### 1. 랜딩

- 현재보다 더 제품 중심으로
- 11개 종목 나열보다 "정확한 매칭 / 신뢰 / 운영" 구조를 전면 배치
- 히어로에는 glass featured panel 1개만 강하게

### 2. 홈

- "오늘의 매칭 컨트롤 센터"처럼 보이게
- 배너형 프로모션 비중 축소
- 일정, 추천, 신뢰 지표, 빠른 액션을 더 시스템적으로 재배치

### 3. 매치 탐색

- 검색/필터를 상단 glass toolbar로 통합
- 결과 카드는 더 단단하게
- 종목 색은 보조 정보로만 쓰고 텍스트 대비를 우선

### 4. 팀 매칭 상세

- 신뢰 관련 데이터가 가장 전문적으로 보이게 해야 함
- 상대 정보, 비용, 심판 배정, 체크인 상태를 모듈형 dense panel로 재구성

### 5. 프로필

- 지금의 메뉴 허브 느낌보다 "선수 운영 대시보드" 느낌으로 전환
- 종목별 ELO, 일정, 리뷰, 결제 이력을 동일한 시스템 언어로 정리

---

## 8. 브랜치 전략

### 전제

현재 `main` worktree가 이미 많이 더럽다.
이 상태에서 바로 새 브랜치를 파면 기존 변경이 전부 따라가므로, 안전하게 분리하는 절차가 먼저 필요하다.

### 권장 순서

1. 현재 상태를 체크포인트로 분리
2. v2 공통 기반 브랜치 생성
3. 화면군별 브랜치 병렬 진행
4. 통합 브랜치에서 QA

### 권장 브랜치명

- `feat/v2-design-foundation`
- `feat/v2-shell-navigation`
- `feat/v2-home-discovery`
- `feat/v2-match-detail-flows`
- `feat/v2-profile-settings`
- `feat/v2-admin-surface`
- `feat/v2-integration`

### 현실적인 운영 방식

- foundation 브랜치에서 토큰, 공용 surface, shell, nav 먼저 정리
- 이후 페이지군 브랜치는 foundation에서 분기
- 마지막에 integration 브랜치에서 화면 간 어색함과 공용 규칙 누락을 정리

### 왜 이렇게 나누는가

- 기능 로직은 유지하고 시각 레이어만 바꾸려면 공용 레이어를 먼저 잡아야 함
- 페이지별로 바로 뜯으면 디자인이 다시 파편화됨
- 지금 저장소 구조상 `layout`, `sidebar`, `bottom-nav`, `globals.css`, 공용 UI 컴포넌트가 영향 반경이 큼

---

## 9. 구현 순서

### Phase A. Foundation

- 브랜드명 통일
- 색/그림자/보더/재질 토큰 정리
- `globals.css`의 dark override 구조 재정비
- glass와 solid surface 클래스 체계 정의

### Phase B. Shell

- root layout
- main layout
- sidebar
- bottom nav
- admin layout
- header / footer / modal 재질 통일

### Phase C. Core Screens

- landing
- home
- matches
- team matches
- profile

### Phase D. Extended Screens

- lessons
- marketplace
- teams
- venues
- payments
- settings

### Phase E. Admin

- dashboard
- tables
- detail panels
- actions / modals

---

## 10. 피해야 할 것

- 전 화면에 blur를 깔아 뿌옇게 만드는 것
- 카드마다 서로 다른 glass 강도 쓰기
- 텍스트 위에 반투명 배경 이미지를 겹치는 것
- neon, gradient glow, purple-heavy palette
- 정보가 많은 패널까지 glass로 처리하는 것
- 스포츠 서비스인데 게임 런처나 NFT 대시보드처럼 보이게 만드는 것

---

## 11. 첫 2주 우선순위

### Week 1

- 브랜드명 하나로 결정 및 전면 통일
- v2 토큰 초안 작성
- shell / navigation / modal / section-header 공용 레이어 구축
- 홈, 매치 탐색 시안 적용

### Week 2

- 팀 매칭 상세 / 프로필 / 결제 화면 적용
- admin 표면 언어 정리
- 모바일 가독성 / blur 강도 / 성능 QA
- 대표 스크린샷 다시 캡처하여 v1 대비 비교

---

## 12. 성공 기준

- 첫 화면에서 "무슨 서비스인지" 3초 안에 이해된다.
- 정보가 많은 화면에서도 읽기 피로가 줄어든다.
- 모바일 sticky 영역과 하단탭이 고급스럽고 안정적으로 보인다.
- admin까지 같은 제품군처럼 보인다.
- glass가 눈에 띄는 효과가 아니라 제품 신뢰를 높이는 재질로 인식된다.
