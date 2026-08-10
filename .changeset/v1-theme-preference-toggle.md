---
"v1_api": minor
"v1_web": minor
---

라이트/다크/기기 설정 화면 테마 선호도를 추가한다. 기본값은 항상 라이트 — OS의
prefers-color-scheme을 자동으로 따라가지 않는다. `/my/settings/theme`에서 선택하면
계정에 저장돼(`V1User.themePreference`, 기본 light) 로그인한 다른 기기에서도 같은
값을 불러온다.

프론트엔드는 Tailwind dark variant 전략을 `prefers-color-scheme` 미디어쿼리에서
`<html>.dark` 클래스 기반으로 전환했다(`@custom-variant dark`). `ThemeProvider`가
로컬(localStorage) 즉시 적용 + 로그인 시 계정 값 동기화 + FOUC 방지 인라인 스크립트를
담당한다.

핵심 사용자 화면(홈/마이페이지/매치/팀/팀매치/대회/공유 컴포넌트)의 다크모드 시인성
문제 16건도 함께 고쳤다 — Tailwind `gray-*`/하드코딩 hex에 `dark:` variant 누락,
`var(--blue50)`/`var(--orange50)` 같은 다크 미대응 파스텔 배경 위에서 다크 모드일 때
텍스트 색이 뒤집혀 대비가 무너지던 조합 등. 관리자 콘솔(`admin/`)은 이번 스코프에서
제외했다.
