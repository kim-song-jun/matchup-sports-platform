# Teameet v1 코딩 패턴 · 가이드라인 (배포 표준)

> v1 스택(`apps/v1_web` + `apps/v1_api`)의 **기본 개발 방식**. 신규 코드·리뷰·서브에이전트 작업은
> 이 패턴을 따른다. CLAUDE.md(전역 규칙)·DESIGN.md(디자인 시스템)을 v1 관점에서 구체화·강제한다.
> 위반은 리뷰에서 **Critical**(범위 내 기술부채는 즉시 해결, 이연 금지).

## 1. 상태(enum) 라벨 — 단일 소스
- 백엔드 status는 영문 코드(`requested`, `active`, `left`…). UI에서 `status === 'x' ? '한글' : status`
  삼항으로 직접 렌더 **금지** — 매핑 안 된 값이 영문 그대로 노출된다(WS11 Rank6 사고).
- 모든 상태 표시는 라벨 모듈 경유: `lib/v1-status-labels.ts`(consumer), `lib/admin-labels.ts`(admin).
  미매핑 값도 안전한 한글 fallback(`'처리됨'`/`'—'`)으로 떨어지게 한다. 새 status는 모듈에만 추가.

## 2. 디자인 토큰 — 하드코딩 색/사이즈 금지
- 색: `var(--blue500)` 등 토큰. 하드코딩 hex/rgba 금지(정당한 OAuth 브랜드색은 명명 토큰화).
  알파 오버레이/스크림도 `--scrim`·`--overlay-text` 류 토큰으로(값 동일하게 정의 후 var() 참조).
- 폰트: `globals.css` @theme의 `--font-size-*` 토큰. `text-[Npx]`/`font-size:Npx` 임의값 금지.
- 컴포넌트 CSS가 참조하는 토큰은 반드시 `:root`에 정의(미정의 var는 런타임 silent fail — WS1 사고).
- light-only: `dark:` variant 금지.

## 3. 접근성(a11y) — WCAG 2.1 AA + 프로젝트 44px
- 인터랙티브 요소 **min 44×44px**(`.tm-chip`/버튼 등). 키보드 `focus-visible` ring(blue500 2px).
- 아이콘/무텍스트 버튼 `aria-label`, 토글 `role="switch" aria-checked`, 칩 `aria-pressed`,
  전송중 `aria-busy`. 장식 `aria-hidden`.
- **정적 하드코딩 id 금지** — 같은 컴포넌트가 다중 렌더되면 `aria-labelledby`/`htmlFor`가 깨진다.
  `useId()` 사용(WS11 Rank5).
- 모달: `role="dialog"` + `aria-modal` + ESC + focus-trap(공유 Modal 컴포넌트 사용).
- 컬러만으로 정보 전달 금지(아이콘/텍스트 병행).

## 4. 카피 — 해요체 단일 어조
- 모든 UI/에러 문구 **해요체**(`~해요`·`~돼요`·`~예요`). 합니다체(`~입니다`·`~습니다`·`~됩니다`) 금지.
- 영문 enum/raw 코드 사용자 노출 금지(§1). placeholder 영문 예시 금지. 용어 일관(대회/매치/팀…).
- 에러 메시지는 `extractErrorMessage(err, '…해요')` 사용, 직접 타입단언 금지.

## 5. 컴포넌트 패턴
- 인라인 마크업 전 공유 컴포넌트 확인·재사용: `EmptyState`/`Card`/`ListItem`/`Modal`/`StateCard`.
- 중복 컴포넌트(예: 필터시트 3중 복제)는 공유 추출. view-model ↔ view 분리 유지.
- React 19.2: `forwardRef` 금지, `ref`를 Props에 직접 포함.

## 6. 데이터 상태 — loading/error/ready
- API 의존 화면은 loading(skeleton)/error(재시도 카드)/ready 3상태 모두 처리.
- **실패 시 mock/fallback을 실데이터처럼 노출 금지**(WS11 Rank4) — ready일 때만 fallback.
- 비가역 액션은 `window.confirm` 대신 모달 ConfirmDialog.

## 7. 주석(가이드라인) — "왜"를 남긴다
- 비자명한 분기·가드·계약·회피책에는 **이유 주석**(무엇이 아니라 왜). 예시는 이 세션 커밋 참조:
  토큰 정의 의도, a11y 터치타깃 사유, status fallback 이유, urgent 라벨 정정 배경.
- WIP/미완 주석은 배포 전 제거 또는 영문 `TODO:`로 정리(합니다체 WIP 주석 금지).
- dead code·임시 우회는 같은 변경에서 완전 제거(이연 금지).

## 8. 테스트 — 진짜 테스트만
- "이 테스트가 깨지면 실제 버그를 잡는가"를 만족. mock-verifying-mock·정적 문자열 통과용 금지.
- v1_web=Vitest+TL+MSW, v1_api=Jest(PrismaService mock). 서비스 계약·상태전이·가드·멱등·계산 검증.
- e2e: `e2e/v1-tests/` + `e2e/v1.config.ts` (`pnpm test:e2e:v1`, Playwright, :3013, 헤더 dev-auth fixture) — 실제 사용자 플로우. (구앱 `:3003` 스위트와 별도)

---
> 이 문서는 이번 배포 준비(2026-06-23) 세션에서 확립·적용한 패턴을 codify한 것이다.
> 진행·결정 ledger: `docs/ops/deploy-2026-06-23-readiness.md`. 화면 감사 backlog: `docs/ops/ws11-audit-findings.md`.
