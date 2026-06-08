# Admin Toss-style UI — Visual QA 보고서

> **빌드 방식**: Next.js standalone (`INTERNAL_API_ORIGIN=http://localhost:8121`) — CSS 완전 적용 확인  
> **캡처 일시**: 2026-06-08  
> **캡처 수**: 28/28 (7 routes × 4 viewports) — ✅ 전체 성공  
> **Tailwind 활성화**: `globals.css` 에 `@import "tailwindcss"` 추가로 유틸리티 클래스 생성 활성화  
> **PR**: [#19 feat/v1-admin-redesign-toss](../../)

---

## 판정 요약

| 페이지 | 모바일 | 태블릿 | 데스크탑 | 와이드 | 판정 |
|--------|-------|-------|---------|-------|------|
| 대시보드 | ✅ | ✅ | ✅ | ✅ | PASS |
| 매치 관리 | ✅ | ✅ | ✅ | ✅ | PASS |
| 팀매치 | ✅ | ✅ | ✅ | ✅ | PASS |
| 팀 운영 | ✅ | ✅ | ✅ | ✅ | PASS |
| 리뷰 | ✅ | ✅ | ✅ | ✅ | PASS |
| 알림 | ✅ | ✅ | ✅ | ✅ | PASS |
| 활동 내역 | ✅ | ✅ | ✅ | ✅ | PASS |

**Critical: 0 / Warning: 0 / Total: 28 PASS**

---

## 1. 대시보드 `/admin`

### 모바일 (390px)
![dashboard_mobile](final-2026-06-08T14-06-51/dashboard_mobile.png)

### 태블릿 (768px)
![dashboard_tablet](final-2026-06-08T14-06-51/dashboard_tablet.png)

### 데스크탑 (1280px)
![dashboard_desktop](final-2026-06-08T14-06-51/dashboard_desktop.png)

### 와이드 (1440px)
![dashboard_wide](final-2026-06-08T14-06-51/dashboard_wide.png)

---

## 2. 매치 관리 `/admin/matches`

### 모바일 (390px)
![matches_mobile](final-2026-06-08T14-06-51/matches_mobile.png)

### 태블릿 (768px)
![matches_tablet](final-2026-06-08T14-06-51/matches_tablet.png)

### 데스크탑 (1280px)
![matches_desktop](final-2026-06-08T14-06-51/matches_desktop.png)

### 와이드 (1440px)
![matches_wide](final-2026-06-08T14-06-51/matches_wide.png)

---

## 3. 팀매치 `/admin/team-matches`

### 모바일 (390px)
![team-matches_mobile](final-2026-06-08T14-06-51/team-matches_mobile.png)

### 태블릿 (768px)
![team-matches_tablet](final-2026-06-08T14-06-51/team-matches_tablet.png)

### 데스크탑 (1280px)
![team-matches_desktop](final-2026-06-08T14-06-51/team-matches_desktop.png)

### 와이드 (1440px)
![team-matches_wide](final-2026-06-08T14-06-51/team-matches_wide.png)

---

## 4. 팀 운영 `/admin/teams`

### 모바일 (390px)
![teams_mobile](final-2026-06-08T14-06-51/teams_mobile.png)

### 태블릿 (768px)
![teams_tablet](final-2026-06-08T14-06-51/teams_tablet.png)

### 데스크탑 (1280px)
![teams_desktop](final-2026-06-08T14-06-51/teams_desktop.png)

### 와이드 (1440px)
![teams_wide](final-2026-06-08T14-06-51/teams_wide.png)

---

## 5. 리뷰 `/admin/reviews`

### 모바일 (390px)
![reviews_mobile](final-2026-06-08T14-06-51/reviews_mobile.png)

### 태블릿 (768px)
![reviews_tablet](final-2026-06-08T14-06-51/reviews_tablet.png)

### 데스크탑 (1280px)
![reviews_desktop](final-2026-06-08T14-06-51/reviews_desktop.png)

### 와이드 (1440px)
![reviews_wide](final-2026-06-08T14-06-51/reviews_wide.png)

---

## 6. 알림 `/admin/notifications`

### 모바일 (390px)
![notifications_mobile](final-2026-06-08T14-06-51/notifications_mobile.png)

### 태블릿 (768px)
![notifications_tablet](final-2026-06-08T14-06-51/notifications_tablet.png)

### 데스크탑 (1280px)
![notifications_desktop](final-2026-06-08T14-06-51/notifications_desktop.png)

### 와이드 (1440px)
![notifications_wide](final-2026-06-08T14-06-51/notifications_wide.png)

---

## 7. 활동 내역 `/admin/audit`

### 모바일 (390px)
![audit_mobile](final-2026-06-08T14-06-51/audit_mobile.png)

### 태블릿 (768px)
![audit_tablet](final-2026-06-08T14-06-51/audit_tablet.png)

### 데스크탑 (1280px)
![audit_desktop](final-2026-06-08T14-06-51/audit_desktop.png)

### 와이드 (1440px)
![audit_wide](final-2026-06-08T14-06-51/audit_wide.png)

---

## 기술 노트

### 주요 이슈 및 해결

1. **Tailwind v4 유틸리티 클래스 미적용** (Critical, 해결됨)
   - 원인: `globals.css`에 `@import "tailwindcss"` 없음 → PostCSS 플러그인이 유틸리티 생성 안 함
   - 해결: `globals.css` 첫 줄에 `@import "tailwindcss"` 추가
   - 결과: CSS 파일 51KB → 73KB, 모든 Tailwind 유틸리티 정상 생성

2. **API 리라이트 Docker 호스트명 문제** (Critical, 해결됨)
   - 원인: `next.config.ts` 빌드 시점에 `http://v1_api:8121` 하드코딩
   - 해결: `INTERNAL_API_ORIGIN=http://localhost:8121` 환경변수로 빌드

3. **Playwright dev 모드에서 CSS 미적용** (해결됨)
   - Tailwind v4는 dev 모드에서 HMR 웹소켓으로 CSS 주입 → headless Playwright에서는 스타일 없음
   - 해결: production 빌드 후 `pnpm start`로 정적 CSS 파일 생성하여 캡처

4. **`/admin/reviews` 타임아웃** (해결됨)
   - 원인: `waitUntil: 'networkidle'` + 동시 2개 API 호출 → 500ms 정지 조건 미충족
   - 해결: `waitUntil: 'load'` 로 변경

### 디자인 시스템 적용 현황

- **컬러**: `#3182F6` 단일 액센트, `#F7F8FA` 배경, `#191F28` 텍스트
- **레이아웃**: 220px 고정 사이드바 (데스크탑), 모바일 상단 탭바
- **카드**: `rounded-2xl`, `border-gray-100`, 미니멀 shadow
- **타이포**: 계층적 `text-[28px]` 타이틀 → `text-[15px]` 본문 → `text-[13px]` 메타
- **KPI 카드**: 아이콘 + 레이블 + 큰 숫자, 색상 톤 (neutral/positive/warning/danger)
- **목록 행**: 타이틀 + 메타 + 배지 + 화살표 일관된 패턴

