# UI/UX Review Report — Batch 00091–00180
> Reviewed: 2026-04-13 | Files: 90

## Summary

| Category | Critical | Warning | Good |
|----------|----------|---------|------|
| Design   | 7 | 11 | 12 |
| QA/UX    | 5 | 8  | 8  |
| A11y     | 4 | 6  | 4  |
| **Total**| **16** | **25** | **24** |

---

## Issues by Screenshot

### 🔴 Critical Issues

- **[00091, 00092]** **매치 디테일 — 중첩 border container**: 정보 패널이 4개 박스로 분리, 각 박스마다 full border 적용. DESIGN.md 4.2 위반. → Fix needed: 개별 박스 border 제거, 단일 card + inner layout 통합.

- **[00099, 00100]** **React Runtime Error 실 서비스 노출**: `Objects are not valid as a React child — found object with keys {fri, mon, sat, sun, thu, tue, wed}`. 강좌 운영 시간 객체가 React child로 직접 전달됨. → Fix needed: `ErrorState` + ErrorBoundary 적용. 요일 객체 → "월~금" 문자열 포맷터 필요.

- **[00105, 00106]** **장터 비로그인 — 목록 전체 숨김**: EmptyState 미사용, 공개 목록도 숨겨짐. → Fix needed: 목록 공개 노출, 글쓰기 클릭 시 로그인 유도.

- **[00123, 00124]** **팀·클럽 비로그인 — 목록 전체 숨김**: 위와 동일 패턴. → Fix needed: 목록 공개 노출, 가입/연락만 로그인 필요.

- **[00160, 00170]** **마이페이지 — 파란 hero 배너 위반**: "운동 메이트, 찾고 계셨죠?" hero 배너. DESIGN.md 9절: 유틸리티 페이지 hero 블록 금지. → Fix needed: 배너 제거 또는 인라인 텍스트 링크로 대체.

- **[00127, 00128, 00129, 00130]** **강좌 디테일 — 가격 hero 취급**: 가격이 `text-3xl` 급으로 primary 표시. DESIGN.md 11절: "금액을 hero로 다루지 않는다". → Fix needed: `text-lg font-bold` 이하로 축소.

- **[00180]** **매치 만들기 비로그인 — EmptyState 미사용**: 센터에 작은 텍스트 + 버튼만, 데스크톱 콘텐츠 영역 거의 비어있음. → Fix needed: 아이콘 + 제목 + CTA 구조의 `EmptyState` 컴포넌트 적용.

---

### 🟡 Warning Issues

- **[00093, 00094]** 팀 카드 내 "연락하기" 인라인 CTA — 리스트 페이지 본문 CTA 배치 금지(DESIGN.md 14절). → Suggestion: 디테일 페이지로 이동.
- **[00101, 00102]** 시설 찾기 데스크톱 — 동일 카드 중복 표시. → Suggestion: 데이터 중복 방지.
- **[00111, 00112]** 설정 다크 모드 — 사이드바 라이트, 콘텐츠 다크 불일치. → Suggestion: 사이드바 다크 토큰 적용.
- **[00113, 00114]** 강좌 카드 — 가격 `text-lg font-bold` 우선 표시. → Suggestion: `text-sm font-bold`로 축소.
- **[00119, 00120]** 장터 모바일 — 썸네일 없는 항목 fallback 부재. → Suggestion: 카테고리 기반 fallback 아이콘.
- **[00121, 00122]** 팀 카드 "운영: 하키마스터준호" 비구조적 텍스트. → Suggestion: 아이콘 + 축약 표시.
- **[00125, 00126]** 팀 디테일 — "카버 이미지" placeholder 텍스트 노출. → Suggestion: 팀 색상 기반 solid 배경 fallback.
- **[00131, 00132]** 강좌 스켈레톤 — 실제 카드 레이아웃과 구조 불일치. → Suggestion: 실제 카드 비율 스켈레톤으로 수정.
- **[00148]** 홈 데스크톱 — 파란 배너 아래 배경 전환 불명확. → Suggestion: `bg-gray-50` 전환 명확히.
- **[00152, 00153]** 마이페이지 비로그인 — 제한 항목 비활성화 표시 없음. → Suggestion: `opacity-50` + 잠금 아이콘.
- **[00155]** 장터 빈 상태 CTA 텍스트만. → Suggestion: `bg-blue-500 text-white` 버튼 적용.
- **[00154, 00161, 00171]** Admin "주의 필요" 배너 — 항목별 액션 링크 없음. → Suggestion: 바로가기 링크 추가.

---

### ✅ Good Patterns

- **[00091, 00092]** 참가 현황 프로그레스 바 + "2/4명" 텍스트 병행 — 컬러+텍스트 조합 준수.
- **[00097, 00098]** Admin 강좌 관리 테이블 — utility-first 레이아웃, 정보 밀도 적절.
- **[00103, 00104]** 설정 페이지 — 유틸리티 페이지 레시피 정확 준수.
- **[00127–00130]** 강좌 디테일 데스크톱 — 2단 레이아웃 + sticky 사이드 패널 + 커리큘럼 구조 정확.
- **[00152, 00178]** 채팅 — 마스터-디테일 패턴, 미읽음 배지 명확.
- **[00154, 00161, 00171]** Admin KPI 카드 — 숫자+레이블 메트릭 패턴 준수.
- **[00164, 00172]** 랜딩 — solid hero + 큰 타이포 + CTA 2개, glass 과용 없음.
- **[00167, 00174]** 홈 모바일 — 3단계 섹션 구조, "전체보기" 링크 패턴 준수.
- **[00175]** 장터 모바일 — 썸네일 카드 패턴 정확 적용.

---

## Patterns & Recurring Issues

### 1. 비로그인 빈 화면 패턴 (Critical, 4곳+)
[00105, 00123, 00180, 00153] 반복. 읽기(목록)는 비로그인 허용, 쓰기만 로그인 게이팅 + EmptyState 통일 필요.

### 2. 외부 Naver Cafe 화면 혼입 (00133~00146)
14장이 앱 외부 화면. `/references/` 디렉토리 분리 관리 권장.

### 3. 가격 정보 hierarchy 불일치
강좌 디테일·카드에서 가격이 1순위 표시. `text-sm font-bold` 이하 통일.

### 4. 상태 배지 스타일 불일치
Admin 팀 관리(초록 텍스트) vs Admin 강좌 관리(초록 배지) — DESIGN.md 배지 패턴으로 전면 통일.

### 5. 마감임박 색상 단독 표시 (반복)
[00166, 00168, 00173, 00176, 00177] 빨간 하단 바만, 텍스트 배지 없음.

### 6. 이미지 fallback 부재 (반복)
강좌·장터·팀 카드에서 이미지 없는 항목에 fallback 없음.

---

**총평**: 가장 시급한 수정: ① React 런타임 에러(강좌 운영 시간 객체), ② 비로그인 빈 화면 4곳, ③ 마감임박 배지 텍스트 추가.
