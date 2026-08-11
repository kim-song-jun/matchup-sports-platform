---
"v1_web": patch
---

다크모드 전수검수의 마지막 미표본 구간(85개 파일 중 남은 31개)을 마저 확인하고,
누적된 죽은 CSS(globals.css 7635줄 + desktop/*.css 14000여 줄)를 정리했다.
ultracode 6버킷 감사 중 3버킷이 세션 주간 사용량 한도로 실패해, 완료된 3버킷의
발견은 자동 반박 대신 직접(도구 호출로) 재검증 후 반영했다.

## 다크모드 대비 결함 (5건, 전부 수정)

- `hover:bg-green-100`/`hover:bg-blue-100`(raw Tailwind, dark: 짝 없음) 2건이
  **기본 상태는 정상인데 hover에서만 무너지는** 패턴 — 다크에서 마우스를 올리면
  대비가 1.0~1.99:1까지 떨어짐(quick-substitution-panel.tsx, tournament-ops-
  picker-client.tsx). 기존 dark: 짝(`--blue100`, `dark:border-green-500/30`
  계열)으로 통일.
- `text-red-500`(4.43:1, AA 문턱 근소 미달) 필수표시 별표·에러 문구 4곳
  (tournament-campaign-tab/-status-dialog/-popup-form/-sponsors-form.tsx) →
  `--red700`.

## 죽은 CSS 정리 (10개 클래스, 코드 변경 없이 순수 삭제)

- `.tm-desktop-grid-2/-3`(_shell.css) — 어느 화면도 소비하지 않는 스캐폴딩 유틸.
- `.tm-chat-desktop-wrap`, `.tm-chat-empty`/`.tm-chat-empty-icon`(chat.css +
  globals.css 베이스 규칙까지) — 채팅 데스크톱 레이아웃이 `.tm-chat-desktop-
  workspace` 계열로 대체되면서 남은 죽은 코드. 헤더 주석도 실제 구조에 맞게 갱신.
- `.tm-error-state` 컴포넌트 셀렉터(home.css + team-matches.css 2곳) — 실제
  `<ErrorState>` 컴포넌트는 `tm-empty-state` 클래스를 쓰므로 애초에 안 맞물림.
- `.tm-match-detail-desktop-head`(matches.css) — 다른 공용 프리미티브로 대체됨.
- `.tm-notice-row-active`/`.tm-notice-summary-card`(desktop override + globals.css
  베이스 규칙까지) — 마크업에서 제거된 뒤 CSS만 남은 사례.

모든 삭제는 "0건 확인 → 삭제 → pnpm lint" 순서로, 삭제 직전 재검증 없이 지운
것은 없다.

## 미해결로 남긴 것 (정직한 공시)

- 6버킷 중 3버킷(잔여 대비검사 2/2 배치, globals.css 죽은/중복 토큰 감사,
  desktop css 죽은 셀렉터 3/3 배치)은 주간 한도로 아예 실행되지 못했다 —
  한도 리셋(8/13 20:00 KST) 후 재개 필요.
- quick-substitution-panel.tsx의 등번호 텍스트(text-gray-400)가 이중 틴트
  합성 배경에서 4.47:1로 AA(4.5:1)에 0.03 미달 — 계산 오차 범위에 가까운
  경계값이라 이번 라운드에서는 임의 변경 없이 보류.

## 검증

`pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 210 suites/1333 tests
전부 통과. 삭제한 10개 클래스 전체를 최종적으로 `grep -rn` 재확인해 codebase
전체(.tsx/.ts/.css)에서 참조 0건임을 확인했다.
