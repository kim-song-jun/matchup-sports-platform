# 정규 리그 LIVE 당일 노출 · 시즌 진행 중 — alpha 검증

- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/1989
- dev merge / 실제 서비스 SHA: `d512270834a18c1880546d797fec2c8e6ac2066b`
- 배포: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39187578348 — success
- PR CI / dev CI: `39186426885` / `39187578350` — Web·API·Gates success.
- 일시: 2026-10-19 KST. 비로그인 공개 방문자, 실제 alpha, headed Chromium.

## 실행과 범위

`node scripts/qa/verify-league-live-matchday-alpha.cjs before|after`

실제 공개 API에서 오늘 경기가 없는 진행 중 정규 리그를 고른다. 상세(`/tournaments/:id`)와 진행 중 정규 리그 목록(`/tournaments?kind=league&status=in_progress`)을 390/768/1440px로 확인했다. 데이터 생성·상태 조작·모킹·시드·로그인 우회는 하지 않았다.

## 결과

| 폭 | 상세 | 목록 | 가로 넘침 |
|---|---|---|---|
| 390 | 시즌 진행 중 1개, LIVE 0개, 일정 보기 링크 1개 — PASS | 시즌 진행 중 배지 20개 — PASS | 없음 |
| 768 | 시즌 진행 중 1개, LIVE 0개, 일정 보기 링크 1개 — PASS | 시즌 진행 중 배지 20개 — PASS | 없음 |
| 1440 | 시즌 진행 중 1개, LIVE 0개, 일정 보기 링크 1개 — PASS | 시즌 진행 중 배지 20개 — PASS | 없음 |

대상 6/6 화면 PASS. before에는 세 폭 모두 LIVE DOM 2개(모바일/데스크톱 각각), 일정 보기 링크 0개였다. after는 각 폭에서 보이는 일정 링크가 1개이고 해당 위치가 기존 레이아웃 안에서 유지된다. 일부 baseline/목록 스크린샷의 비대상 홍보 미디어는 로딩 중이며, 이 작업은 상태 배지·진입 CTA를 확인했다.

- landing HTTP 200, `X-Teameet-Commit`이 머지 SHA와 일치. API health의 `data.checks.db=true`.
- 페이지 예외 0. console/network는 비로그인 `/api/v1/auth/me` 401이 3건으로 before/after 동일하며, 다른 실패 응답은 없다.
- 실제 당일 경기의 LIVE 양성 케이스와 자정 전환은 관련 로컬 회귀 349개에 포함된다. 이 실측에서는 경기 일정을 조작하지 않았으므로 해당 조건을 실제 alpha에서 재현했다고 주장하지 않는다.
- 시작한 브라우저 PID/PPID는 JSON에 기록했고 모든 실행에서 browser.close로 종료했다. 상주 서버를 시작하지 않았다.

## 증거

`docs/screenshots/league-live-matchday-2026-10-19/`의 before/after PNG 12개 및 `before-evidence.json`, `after-evidence.json`.

## 리뷰 예외

Copilot run `39186430661`은 `Model "claude-opus-5" is not available` 오류로 리뷰를 실행하지 못했다. 사용자가 **이번 PR에 한해 CI 통과 후 Copilot 없이 dev 배포**를 명시 승인했고 PR 코멘트에 기록했다. Copilot clean으로 계산하지 않았으며 모델·계정·머지 규칙은 변경하지 않았다.
