# UI/UX Review Report — Batch 00148–00179
> Reviewed: 2026-04-13 | Files: 32

## Summary
| Category | Critical | Warning | Good |
|----------|----------|---------|------|
| Design   | 5 | 8 | 6 |
| QA/UX    | 3 | 5 | 4 |
| A11y     | 4 | 3 | 2 |
| **Total**| **12** | **16** | **12** |

---

## Issues by Screenshot

### 🔴 Critical Issues

- **[00148, 00157, 00166, 00173, ALL]** **브랜드명 위반 — "Teameet" 전체 잔존**: 로고, 사이드바, Admin 헤더("Teameet Admin"), 랜딩 전체에 "Teameet" 표시. 브랜드명은 **TeamMeet**. → Fix needed: 앱 셸 전체(로고·헤더·admin 사이드바·랜딩)에서 "Teameet" → "TeamMeet" 전면 교체.

- **[00163, 00164, 00171]** **랜딩 hero — 전면 파란 그라디언트 + 곡선 wave divider**: DESIGN.md Section 5: "glossy glass showcase, stacked heavy shadows 금지". 그라디언트 blob이 copy/CTA보다 시각적으로 우세. → Fix needed: solid 배경 + 클린 섹션 대비로 교체. 헤드라인·CTA가 시각 1순위여야 함.

- **[00159, 00169]** **마이페이지 — 파란 프로모션 hero 블록 위반**: "운동 메이트, 찾고 계셨죠?" 상단 hero 카드. DESIGN.md Section 9: "유틸리티 페이지 hero 블록 금지. compact tool layout이 기본." → Fix needed: hero 배너 제거. 필요시 compact 프로필 헤더(아바타+이름+통계)로 대체.

- **[00167, 00176]** **매치 목록 카드 — 한쪽 색상 보더 안티패턴**: 마감임박 카드에 오렌지, 일반 카드에 파란 left-side 컬러 바. CLAUDE.md 명시 금지: "border-l-4 border-blue-400 같은 패턴 사용 금지." → Fix needed: 컬러 바 제거. 긴박함은 배지("마감임박" pill) 또는 서브틀 배경색으로 표현.

- **[00160, 00170]** **Admin "주의 필요" 블록 — 아이콘 없이 빨간 배경만**: 컬러 단독 위험 신호. CLAUDE.md: "컬러만으로 정보 전달 금지." → Fix needed: Lucide `AlertTriangle` 아이콘 추가.

- **[00179]** **매치 만들기 비로그인 — EmptyState 미사용**: 빈 데스크톱 화면에 텍스트 + 버튼만. → Fix needed: `EmptyState` 컴포넌트 (아이콘 + 헤드라인 + 로그인 CTA) 적용.

- **[00152]** **마이페이지 비로그인 — 비활성 메뉴 구분 없음**: 로그인 프롬프트 아래 접근 불가 메뉴가 동일하게 표시. → Fix needed: 비인증 항목 숨김 또는 `opacity` + "로그인이 필요합니다" tooltip.

- **[00155, 00173]** **"마감임박" 배지 + 정원 — 컬러 단독 표시**: 빨간 텍스트만, 아이콘 없음. → Fix needed: 시계/경고 아이콘 + 컬러 병행.

- **[00148, 00157, 00166, 00173]** **하단 내비 아이콘 버튼 aria-label 미확인**: 비활성 탭이 아이콘만 표시. → Fix needed: 모든 bottom nav `<button>`에 `aria-label` 보장.

- **[00149, 00162, 00167, 00176]** **필터 칩 비활성 상태 — 대비 부족**: `text-gray-400/500` on white가 4.5:1 미달 가능. → Fix needed: `text-gray-700` 이상 또는 `border border-gray-200` 추가.

- **[00153]** **Admin 통계 카드 — 시맨틱 구조 없음**: 숫자+레이블이 `div` 스택, `<dl><dt><dd>` 또는 `aria-label` 미적용. → Fix needed: `<dl>` 구조 또는 `aria-label="총 사용자: 10"` 추가.

- **[00174]** **장터 목록 행 터치 타겟 44px 미달**: 텍스트 라인만 탭 가능. → Fix needed: 전체 카드 행을 단일 `<a>` 블록 + `min-h-[44px]`로 래핑.

---

### 🟡 Warning Issues

- **[00148]** 모바일 홈 종목 아이콘 버튼 drop-shadow — DESIGN.md: "큰 blur radius shadow 금지". → `border border-gray-100` flat 스타일로.
- **[00151, 00177]** 채팅 아바타 임의 색상 (파란/초록) — `sportCardAccent` 토큰 또는 neutral gray 사용.
- **[00154, 00168]** 장터 이미지 없는 항목 placeholder 비일관 — 카테고리 실루엣 아이콘 48px 통일.
- **[00160, 00170]** Admin "주의 필요" 하드코딩 3개 bullet — 실 데이터 연결 또는 항목 없을 때 블록 숨김.
- **[00159, 00169]** 마이페이지 통계 그리드에 마케팅 문구 KPI 취급 — 피처 하이라이트 리스트로 분리.
- **[00165, 00172, 00175]** 홈 데스크톱 "전체 매치" 인라인 빈 상태 — `EmptyState` + "매치 만들기" CTA로 교체.
- **[00163, 00164, 00171]** 랜딩 통계 바 — 숫자형(11개, 8종)과 텍스트 질적 표현(S-D, AI) 동일 시각 비중.
- **[00154, 00158, 00168]** 장터 "글쓰기" CTA — `bg-gray-900` 사용. → `bg-blue-500 text-white` primary 스타일로.
- **[00155]** 모바일 매치 목록 — 동일 카드 4개 중복 (시드 데이터 다양성 필요).
- **[00178]** 강좌 필터 칩 오버플로 — "+N" 확장 칩 없음.
- **[00148, 00157]** 모바일 종목 아이콘 — 텍스트 라벨 없음. `text-2xs` 레이블 추가 권장.
- **[00179]** 인증 게이트 페이지 — `<h1>` 랜드마크 + `role="status"` 알림 없음.

---

### ✅ Good Patterns

- **[00151, 00177]** 채팅 빈 상태 "채팅방을 선택하세요" — 아이콘 + 설명 텍스트, EmptyState 올바른 사용.
- **[00161]** 매치 목록 빈 상태 — 서치 아이콘 + "매치가 없어요" + 서브텍스트 정확.
- **[00158, 00168]** 장터 빈 상태 — "첫 번째 판매자가 되어보세요!" CTA 올바름.
- **[00148, 00157]** 모바일 홈 "팀 매칭 오픈!" 배너 — solid `bg-blue-500`, glass가 아닌 콘텐츠 배너로 올바름.
- **[00153, 00160, 00170]** Admin 통계 그리드 — 아이콘 + 숫자 + 레이블, 불필요한 shadow/border 없음.
- **[00149, 00162]** 팀 매칭 데스크톱 목록 — `grid-cols-2`, 3단계 정보 계층 일관, 한쪽 보더 없음.
- **[00174]** 모바일 하단 내비 — 활성 "장터" 탭 `blue-500` + 레이블, glass nav chrome 올바름.
- **[00154, 00168]** 장터 필터 칩 — 활성 `bg-blue-500 text-white`, 비활성 neutral.

---

## Patterns & Recurring Issues

### P1: 브랜드명 위반 (Critical — 전체 32장)
"Teameet"이 모든 화면에 잔존. **TeamMeet**으로 전면 교체가 최우선.

### P2: 유틸리티 페이지 Hero 블록 (Critical — 반복)
마이페이지 hero 배너 (00152, 00159, 00169). 이전 배치에서도 지적되었으나 미해결.

### P3: 한쪽 컬러 보더 카드 (Critical — 반복)
매치 목록 데스크톱 (00167, 00176). 이전 배치 지적 미해결.

### P4: 랜딩 Hero 과잉 (Critical — 반복)
00163, 00164, 00171 — 이전 배치에서도 지적. 미해결.

### P5: 컬러 단독 정보 전달 (A11y Critical — 반복)
빨간 바, 빨간 텍스트, 빨간 배경이 아이콘/텍스트 병행 없이 사용.

### P6: Auth-Gate UX 불일치 (QA Critical)
00179, 00152 — 빈 화면 auth-gate. EmptyState + `useRequireAuth()` 통일 필요.

### P7: 장터 "글쓰기" CTA 컬러 (Warning — 반복)
`bg-gray-900` 지속 사용. `bg-blue-500`으로 통일 필요.

### P8: 터치 타겟 44px 미달 (A11y Warning — 모바일)
장터 목록 행, 일부 매치 카드 메타 영역.
