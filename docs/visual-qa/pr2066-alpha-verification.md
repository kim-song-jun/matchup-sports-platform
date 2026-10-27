# PR #2066 alpha 배포·화면 확인

- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2066
- 사용자 지시: 리뷰 대기 없이 배포. PR CI 통과 후 dev에 일반 merge.
- Merge: `392906709c15bf3e31d5b4099d8f203b032f39c5` (2026-10-27 08:32:54 UTC).
- dev push CI: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40474275674 — success.
- alpha 배포: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40474275771 — success.
- 2026-10-27 08:58:30 UTC: landing HTTP 200, `x-teameet-commit` 일치, release `1.12.0-alpha.20261027.g392906709c15`, health `data.checks.db=true`.
- 기존 로컬 dev worktree를 `fetch` 후 `merge --ff-only origin/dev`로 같은 merge commit까지 동기화했다. 다른 작업트리의 미커밋 변경은 건드리지 않았다.

## 범위와 판정

대상 대회의 공개 상세·시상 페이지를 익명 관전자로 확인했다. 기존 prizeBreakdown은 편집하지 않고 실제 배포 데이터의 호환성을 확인했다.

| Surface | 390 | 768 | 1440 |
|---|---|---|---|
| 공개 상세 | PASS | PASS | PASS |
| 공개 시상·리뷰 | PASS | PASS | PASS |
| 관리자 정보 / 시상 입력 | BLOCKED | BLOCKED | BLOCKED |

- 공개 6/6: HTTP 200, 배포 SHA 일치, JS page error 0, document 가로 넘침 0, 새 console/network 오류 0. 시상명·상품·우승팀 연결이 유지된다.
- 기존 before/after 양쪽에서 익명 `GET /api/v1/auth/me` 401과 그 console 메시지가 관측된다. 원본 JSON에 보존했고, 배포로 새로 생긴 오류로 세지 않았다.
- 관리자 3/3은 실제 로그인 화면으로 이동했다. 이 호스트에 private alpha 로그인 상태가 없어 세 구역 입력·임의 개인상 작성·저장/재조회는 수동 PASS로 판정하지 않았다. 해당 계약은 구현 테스트와 CI로 검증했다.
- 생성 화면·캠페인의 alpha 실로그인/개별 화면 검증도 이 수동 범위에 포함하지 않았다.
- 기존 공개 데이터는 팀 시상만 포함한다. 이번 배포에서 사용자 대회에 QA 개인상을 저장해 런타임 검증을 대신하지 않았다.

## 시각 확인

각 after 이미지의 hierarchy·시상별 상품 묶음·모바일/태블릿 고정 셸·데스크톱 열 배치를 직접 확인했다. 공개 화면의 기존 배치에서 새 가로 넘침이나 시상 내용 손실은 보이지 않는다.

before는 `d1080c6843063c7b9459d1aedc355bc9458b3742`, after는 merge SHA다. 모바일/태블릿 상세는 내부 scroller여서 최초 상단 screenshot에 시상 영역이 포함되지 않았다. after에는 실제 시상 영역으로 이동한 focus 캡처를 추가했다. 같은 scroll 위치의 mobile/tablet focus before는 확보하지 못했으며 동일 위치 pixel diff PASS라고 주장하지 않는다.

- `pr2066-alpha-before/`: 배포 전 공개 상세·시상 6장, 원본 observations, lifecycle.
- `pr2066-alpha-after/`: 배포 후 공개 6장·관리자 인증 차단 3장, 원본 observations, lifecycle. helper exit 2는 관리자 BLOCKED를 구분한 결과다.
- `pr2066-alpha-focus/`: 공개 상세 시상 영역 3폭 추가 캡처와 관측 결과.

## 수명주기와 정리

Windows Edge headed 세션을 사용했다. before PID 47236 / parent 10192, after와 focus는 각 lifecycle JSON에 PID/parent를 기록한다. 각 세션에서 browser.close → server.close 후 owned tree 종료를 확인했다. 로컬 Next/API 서버를 띄우지 않았다. Linux Chromium은 libnspr4 부재로 시작에 실패했고 Playwright가 해당 시도와 임시 profile을 정리했다.

화면 증거는 별도 `qa/pr2066-alpha-evidence` 브랜치에 보관한다. 이미 머지된 기능 브랜치를 새 구현에 재사용하거나 증거 때문에 dev 재배포를 만들지 않는다.
