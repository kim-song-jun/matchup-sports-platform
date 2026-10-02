# 대회·리그 팀매치 경계 — Alpha 실행 기록

Date: 2026-10-03 KST
Task: [감사·수정·배포](../../.github/tasks/20261003-competition-team-match-surface-audit.md)
Code PRs: [#1545](https://github.com/kim-song-jun/matchup-sports-platform/pull/1545), [#1552](https://github.com/kim-song-jun/matchup-sports-platform/pull/1552)

## 변경 계약

- 관리자 통합 팀매치 목록에서 친선·리그·대회를 구분하고 소속 관리자 화면으로 이동한다. 유형 필터가 목록과 상태 집계에 함께 적용된다.
- 일반 관리자 상태 변경은 대회·리그 경기에서 409로 차단되며 경기 상태·감사 로그를 쓰지 않는다.
- 공개 공동 기록 진입은 실제 소유권에 따라 대회·리그 경기 상세로 이동하며 `from`을 보존한다.
- 모집 컨택은 삭제되지 않은 친선 모집 경기만 인정한다.
- 진행 중 리그 경기의 팀 해체 안내는 리그 경기 경로를 사용한다.

## 실행 범위와 한계

- Persona: 비로그인 공개 관전자. 실제 Alpha API/브라우저만 사용한다.
- Browser: WSLg headed Chromium, 새 context마다 인증 없는 상태.
- Viewports: 390×844, 768×1024, 1440×900.
- 배포 전 대회 공동 기록: 3/3 일반 상세 404. 배포 전 리그 공동 기록: 3/3 정상 전용 경기 상세. 리그는 회귀 확인용 정상 기준이다.
- 배포 후 대회 3/3·리그 3/3: 정확한 전용 상세, 소유권 응답, managed/read-only, `from` 유지, 실제 뒤로 가기 모두 통과. 가로 넘침 0건.
- 최종 Alpha 커밋 `1d09562a9b7d1b2be261a89519167ff2a031a576`, release `1.1.2-alpha.20261003.g1d09562a9b7d`. CI 37047094770 / Alpha 37047094838 성공. landing·health 200, `data.checks.db: true`. 서버 교체 중 일시 502는 정상으로 처리하지 않았으며 교체 후 정상 응답을 재확인했다.
- 관리자 인증 정보가 없어 관리자 목록·상세·유형 필터의 실제 로그인 클릭과 3폭 시각 QA는 **미검증**이다. 해당 UI의 회귀 테스트와 서버 mutation 테스트를 실제 관리자 QA로 대체했다고 주장하지 않는다.
- Copilot 리뷰 요청은 사용량 제한으로 실행되지 않았다(초기 월간 제한 HTTP 402, 후속 요청 주간 제한 HTTP 429). 최신 외부 clean 리뷰는 없다. 필수 CI와 내부 변경 리뷰 결과는 별도로 기록한다.

## 재현과 산출물

```sh
QA_STAGE=after QA_KIND=tournament QA_EXPECTED_COMMIT=<deployed-sha> node scripts/qa/verify-competition-team-match-boundaries.mjs
QA_STAGE=after QA_KIND=league QA_EXPECTED_COMMIT=<deployed-sha> node scripts/qa/verify-competition-team-match-boundaries.mjs
```

headless 없이 실제 display와 Playwright Chromium 및 시스템 라이브러리가 필요하다. 실행 전 호스트 부하를 확인하고 직렬 실행한다. `.env*` 또는 인증 토큰을 사용하지 않는다. 표본은 공개 경기이며 `/tmp`에 ID만 캐시한다.

- Raw screenshots, console/network results, PID/PPID trees: `output/playwright/visual-audit/competition-team-match-{tournament,league}-{before,after}/`.
- Canonical screenshots: `docs/screenshots/competition-team-match-20261003/`.
- `/api/v1/auth/me`의 401은 비로그인 인증 확인 응답으로 별도 기록한다. 다른 HTTP 실패와 pageerror/console 오류를 정상 응답으로 숨기지 않는다.
- 각 실행은 `finally`에서 자신이 시작한 브라우저를 닫는다. 외부 서비스나 다른 작업자의 프로세스는 중지하지 않는다.

## Viewport verdict

| 대상 | 390×844 | 768×1024 | 1440×900 |
|---|---|---|---|
| 대회 배포 전 | 일반 상세 404 | 일반 상세 404 | 일반 상세 404 |
| 대회 최종 배포 후 | PASS, 기록·라인업·복귀 | PASS, 기록·라인업·복귀 | PASS, 기록·라인업·복귀 |
| 리그 배포 전 | 정상 기준 | 정상 기준 | 정상 기준 |
| 리그 최종 배포 후 | PASS, 상태·라인업·복귀 | PASS, 상태·라인업·복귀 | PASS, 상태·라인업·복귀 |
| 관리자 목록·상세 | 미검증 | 미검증 | 미검증 |

12/12 before/after screenshots processed; 6/6 final public pages passed. Screenshots at all widths visually inspected: hierarchy/spacing readable, no horizontal overflow; league long team names wrap at mobile. Final tournament console/network shows only the known anonymous auth/me 401 (1 per width); league shows no failures. Unexpected error count 0. Both browser trees closed; PID/PPID cross-check found 0 remaining owned processes. No app data mutations were performed.

Gallery publication is recorded in the task after SHA-pinned image URLs return 200. Screenshots and this final report are evidence-only commits on the existing feature branch; deployed runtime stays on the dev merge SHA above.
