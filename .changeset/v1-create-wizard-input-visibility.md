---
"v1_web": patch
---

라이트모드 스크린샷 피드백: 매치/팀/팀매치 생성 위저드의 제목·설명 입력창이
페이지 배경과 구분이 안 되고, 대표(배경) 이미지 프리뷰 빈 상태도 애매했다.

**근본 원인(다크모드 세션 작업과 무관, git blame으로 확인한 기존 코드)**:
`.tm-create-input`의 `background: var(--grey50)`가 페이지 프레임(`.tm-app-frame`)의
배경과 완전히 같은 토큰이라 fill만으로는 절대 구분되지 않았다(실측 대비 1.05:1).
border(`--grey100`)도 1.10:1로 사실상 경계가 안 보였다.

두 독립 설계안(A: 최소변경/기존토큰재사용, B: `.tm-input` 표준 시맨틱 토큰 정렬)을
검토해 공통 결론(신규 토큰 발명 없이 기존 P1 컴포넌트 토큰 재사용)으로 수렴했다:
- `.tm-create-input`: `background: var(--grey50)` → `var(--input-surface)`,
  `border: var(--grey100)` → `var(--border-strong)`
- `.tm-create-image-preview`(빈 상태): `background-color: var(--grey150)` 추가
  (`.tm-auth-progress-bars`의 "아직 채워지지 않음" 세그먼트와 동일 시맨틱 재사용)
- `.tm-create-stepper-button`(−/+ 버튼): 위 변경으로 가운데 select만 밝아지면
  스테퍼가 3분할처럼 보이는 부작용이 있어, 사용자 확인 후 동일 톤으로 통일

**트레이드오프**: 이 값들도 엄밀한 WCAG 1.4.11 3:1은 충족하지 못한다(border
1.40~1.46:1) — 앱 전체의 "헤어라인 미니멀" 보더 언어(CLAUDE.md) 안에서 인지 가능한
최대치로 절충했다. 완전한 3:1 준수는 카드/입력창 전반의 보더 두께를 앱 전체에서
바꿔야 하는 별도의 더 큰 작업이다.

검증: `pnpm lint` clean, `pnpm test` 211 suites/1335 tests 통과. 이 화면은 로그인이
필요해 alpha에서 dev-login으로 스크린샷 검증이 불가능한 화면이라, 배포 후 사용자가
직접 실제 화면에서 확인 필요.
