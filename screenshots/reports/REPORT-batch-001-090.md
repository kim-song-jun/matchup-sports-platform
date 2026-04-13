# UI/UX Review Report — Batch 00001–00090
> Reviewed: 2026-04-13 | Files: 90

## Summary

| Category | Critical | Warning | Good |
|----------|----------|---------|------|
| Design   | 8 | 11 | 7 |
| QA/UX    | 6 | 8 | 5 |
| A11y     | 5 | 4 | 2 |
| **Total**| **19** | **23** | **14** |

---

## Issues by Screenshot

### 🔴 Critical Issues

- **[00017]** **Build Error — 폰트 파일 누락**: `Module not found: Can't resolve '../../fonts/PretendardVariable.woff2'`. 앱 진입 자체 불가. → Fix needed: 폰트 파일 경로를 `apps/web/public/fonts/` 또는 `next/font/local`로 정확히 일치시켜야 함.

- **[00039, 00040, 00041, 00042]** **API 서버 루트 404 JSON raw 노출**: 브라우저에서 `{"status":"error","statusCode":404,"message":"Cannot GET /"}` 가 그대로 표시됨. → Fix needed: `next.config.ts` rewrites 경로 확인, 또는 API `/` 루트에 최소한의 redirect 처리.

- **[00069, 00070]** **Next.js Build Error — 라우트 충돌**: `You cannot have two parallel pages that resolve to the same path: /(admin)/matches/page and /(main)/matches/page`. 프로덕션 배포 차단 수준의 빌드 실패. → Fix needed: admin 매치 페이지를 `/admin/matches`로 경로 분리하거나 route group naming 충돌 해결.

- **[00085, 00086]** **404 에러 페이지 미구현**: Next.js 기본 404 "This page could not be found." 페이지만 노출. 앱 내비게이션도 없고 "홈으로" CTA도 없어 사용자가 정상 흐름 복귀 불가. → Fix needed: `app/not-found.tsx` 구현 — 헤더/내비게이션 포함 + "홈으로 돌아가기" blue CTA 필수.

- **[00083, 00084]** **비로그인 "매치 만들기" 가드 — 페이지 전체 치환**: 비로그인 시 매치 찾기 페이지 전체가 로그인 유도 화면으로 치환. EmptyState 컴포넌트도 아니고 이전 컨텍스트도 소실. → Fix needed: 로그인이 필요한 액션은 모달 또는 toast로 처리하고 현재 페이지 유지.

- **[00051~00054]** **홈 화면 종목 카드 — 종목 컬러 배경 DESIGN.md 위반**: 풋살(녹색), 농구(주황) 등 원형 배경이 불투명 단색. DESIGN.md: "카드 배경을 종목 컬러로 칠하지 않는다. tint는 `/40` opacity 이하만 허용". → Fix needed: opacity를 `/20`~`/30`으로 낮추거나 흰 배경 + 도트+배지 조합으로 교체.

- **[00035~00038 vs 00051~00054]** **홈 화면 2가지 버전 동시 존재**: 이모지 그리드 버전과 종목별 컬러 원형 아이콘 버전이 혼재. 두 버전 모두 DESIGN.md와 불일치. → Fix needed: 단일 디자인 시스템으로 통일.

- **[00008, 00010, 00033, 00034]** **매치 목록 카드 "마감임박" 배지 색상 불일치**: 카드마다 시각적으로 다르며 일부에서 지정 패턴(`bg-amber-50 text-amber-600 rounded-full px-2 py-0.5 text-2xs font-medium`) 미준수. → Fix needed: amber 토큰으로 전체 통일.

---

### 🟡 Warning Issues

- **[00003]** **마이페이지 — QA Visual Audit Watch 컴포넌트 노출**: 테스트용 QA 도구가 프로덕션 화면에 노출됨. → Suggestion: 프로덕션 빌드 시 제거 처리.

- **[00004]** **팀 수정 폼 — 이미지 URL 3개 직접 입력**: 텍스트 필드 3개로 이미지 URL 입력. UX 불편 + 폼 섹션 간 `mt-8` 여백 미적용. → Suggestion: 파일 업로드 UI 또는 미리보기 지원 권장.

- **[00015, 00018, 00021~00027]** **홈 화면 — "다가오는 일정" 섹션 EmptyState 부재**: 일정 없을 때 섹션 자체가 사라짐. → Suggestion: "첫 매치를 만들어보세요" EmptyState + CTA 표시.

- **[00015, 00018]** **홈 모바일 — "팀 매칭 오픈" 배너 glass 재질**: 콘텐츠 영역에 반투명 배너 배치. DESIGN.md `glass as chrome, solid as content` 원칙 위반. → Suggestion: `bg-blue-600 text-white` solid 재질로 처리.

- **[00031]** **팀 매치 상세 — 신청 현황 EmptyState CTA 누락**: "아직 신청한 팀이 없어요" 상태에 CTA 없음. → Suggestion: "팀에게 공유하기" 등 CTA 추가.

- **[00032]** **강좌 캘린더 — 예약 버튼 터치 타겟 미달 가능성**: 버튼이 44px 미만 가능성. → Suggestion: `min-h-[44px] min-w-[80px]` 보장 확인.

- **[00033, 00034]** **매치 목록 카드 — 정보 과밀**: 모바일 2열 카드에 배지 2개 초과. → Suggestion: 레벨 정보를 카드에서 제거하고 상세 페이지로 이동.

- **[00059~00060, 00073~00074]** **데스크톱 홈/매치 — 빈 공간 과다**: `max-w` 제한 미적용으로 우측 공간 낭비. → Suggestion: `max-w-6xl mx-auto` 또는 2단 레이아웃 적용.

- **[00061, 00062]** **장터 목록 — 이미지 없는 상품 플레이스홀더 미흡**: 종목 아이콘만 표시. → Suggestion: `bg-gray-100 rounded-lg` + 카테고리 아이콘 + "사진 없음" 텍스트.

- **[00071, 00072]** **데스크톱 홈 — 동일 카드 중복 표시**: "배드민턴 복식 모집" 카드 2번 연속. → Suggestion: API 응답 중복 제거 또는 React Query dedupe key 확인.

- **[00079]** **Admin 매치 — "모집중" 배지 green 토큰 미정의**: DESIGN.md에 없는 컬러. → Suggestion: `bg-blue-50 text-blue-600`으로 통일.

---

### ✅ Good Patterns

- **[00015, 00018]** 모바일 홈 정보 구조 — DESIGN.md 리스트 페이지 레시피 준수.
- **[00021, 00022]** EmptyState 컴포넌트 올바른 사용 (아이콘 + 제목 + 서브텍스트).
- **[00025]** 모바일 하단 내비게이션 — 5탭, 활성 탭 blue accent, glass-mobile-nav 위치 적절.
- **[00032]** 강좌 캘린더 — 상태 구분 컬러+텍스트 병행 (컬러 단독 정보 전달 금지 준수).
- **[00087, 00088]** 데스크톱 매치 상세 — 2단 레이아웃 (DESIGN.md 디테일 페이지 레시피 준수).
- **[00077]** Admin KPI 메트릭 카드 — `text-3xl` 숫자 + 아이콘 + 레이블 패턴 올바름.
- **[00089, 00090]** 마이페이지 모바일 — compact tool layout (유틸리티 페이지 레시피 준수).

---

## Patterns & Recurring Issues

### 1. 이중 디자인 시스템 혼재 (최우선 해결)
같은 홈/매치 목록 화면이 2가지 버전으로 동시 존재. 리팩토링 중간 상태로 추정. 단일 버전 통일 필요.

### 2. 런타임/빌드 오류 3건 (배포 차단)
- 폰트 누락 빌드 에러 (00017)
- 라우트 충돌 빌드 에러 (00069~00070)
- API 서버 404 JSON raw 노출 (00039~00042)

### 3. 비로그인 상태 처리 불일치
모바일 마이페이지: EmptyState + 로그인 버튼 (올바름) vs 데스크톱 매치 만들기 가드: 페이지 전체 치환 (잘못됨).

### 4. 404 에러 페이지 완전 부재
`app/not-found.tsx` 미구현으로 사용자 이탈 위험.

### 5. 종목 컬러 배경 opacity 위반 반복
홈 화면 버전 B (00051~00054, 00065~00066) 전반에 걸쳐 반복.

### 6. Admin 상태 배지 컬러 일관성 부재
"모집중" green 표시 — DESIGN.md 미정의 토큰.

---

**총평**: 디자인 시스템 리팩토링 중간 단계. 우선순위: ① 빌드 에러 3건 → ② 404 페이지 → ③ 홈 화면 단일 버전 통일 → ④ 비로그인 가드 UX 일관화.
