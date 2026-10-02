# Android Play readiness

Canonical task: `.github/tasks/156-android-app-fcm-foundation.md`.

- [x] Email/social age 14+ birthday boundary, invalid/future dates.
- [x] HTTP rejects unauthenticated, nonparticipant and self report/block attempts.
- [x] Report stores immutable message snapshot and operator inquiry/outbox.
- [x] Persistent bilateral chat block filters history/preview/unread/realtime/new notification recipients; third member still receives.
- [x] Only the actor removes their own block; history restored after unblock.
- [x] All migrations apply to a fresh isolated PostgreSQL database.
- [x] Headed responsive browser: 390/768/1440, before/after, dialog report/block/unblock, console/network.
- [ ] Production deletion URL, privacy v1.3 response and Play certificate assetlinks.
- [ ] D-U-N-S/org verification, signed AAB, real device FCM/upgrade, Play pre-launch report and listing screenshots.
- [ ] Personal upload-object retention/removal evidence and final Data safety declarations.

## 실행 결과 — 2026-09-19

- Branch `fix/android-play-readiness`, dev base `82698757d`, isolated worktree `/tmp/teameet-android-play-readiness`. 미커밋 로컬 결과이며 배포/PR 완료를 의미하지 않는다.
- 실제 Nest API + 격리 PostgreSQL, 가상 QA 사용자. API 모킹 없음. 브라우저는 headed Chromium, 로컬 Web `23013` / API `28121`.
- 390×844 / 768×1024 / 1440×1000: 3/3 검토. 채팅, 신고 모달, 차단 관리, 삭제 안내, 가입 연령 안내의 가로 넘침 없음. 모바일 신고 접수→차단→차단 목록→해제 후 메시지 복원 성공.
- 원본 캡처 24장(before 9 / after 15) 및 console/network/process 결과: `output/playwright/visual-audit/android-play-readiness/`. 기존 UI는 HEAD 소스로 캡처한 뒤 수정본을 복원했다.
- 채팅/삭제 화면 HTTP 실패 0. `AppShellFrame` render 중 상태 갱신 경고 2종은 before/after 모두 존재. 가입 미완료 계정은 `/me/settings` 403이 before/after 모두 존재. 기존 문제이지만 console-clean 판정은 하지 않는다.
- 아래 이미지는 로컬 QA 증거다. 개발 표시가 포함되며 Play 등록용 실기기 스크린샷이 아니다. Android WebView/키보드/시스템 바/FCM은 이번 브라우저 검증에 포함되지 않는다.
- 전체 build/전체 suite를 반복하지 않았다. 관련 단위 테스트 및 HTTP/DB 통합 검증, API/Web 타입 검사, Play 소스 정책 검사로 범위를 제한했다.

## 화면 증거

| 화면 | 이전 | 구현 후 |
|---|---|---|
| 모바일 채팅 | [이전](../screenshots/android-play-readiness/before-mobile-chat.png) | [신고·차단 진입](../screenshots/android-play-readiness/after-mobile-chat.png) |
| 가입 연령 안내 | [이전](../screenshots/android-play-readiness/before-mobile-signup-age.png) | [만 14세 안내](../screenshots/android-play-readiness/after-mobile-signup-age.png) |
| 모바일 신고 | — | [신고 모달](../screenshots/android-play-readiness/after-mobile-report-dialog.png), [접수 결과](../screenshots/android-play-readiness/after-mobile-report-saved.png) |
| 차단 관리 | — | [차단 목록·해제](../screenshots/android-play-readiness/after-mobile-blocked-users.png) |
| 계정 삭제 | 기존 기능 재검증 | [공개 삭제 안내](../screenshots/android-play-readiness/after-mobile-account-deletion.png) |
| 태블릿/데스크톱 | 원본 경로에 채팅 baseline 보관 | [태블릿](../screenshots/android-play-readiness/after-tablet-report-dialog.png), [데스크톱](../screenshots/android-play-readiness/after-desktop-report-dialog.png) |

재현 스크립트: `scripts/qa/capture-play-readiness.mjs`, `scripts/qa/capture-play-signup-age.mjs`.
격리 QA fixture 준비 후 로컬 서버에서 사용한다. 실제 운영 계정으로 실행하지 않는다.

정리: 이번 작업에서 생성한 headed 브라우저, Web/API 프로세스, PostgreSQL 클러스터 종료 완료. 원본·대표 캡처와 소스는 작업 트리에 보관한다.

## 전체 viewport 원본 갤러리

| 화면 | Mobile 390 | Tablet 768 | Desktop 1440 |
|---|---|---|---|
| before chat | [화면](../screenshots/android-play-readiness/before-mobile-chat.png) | [화면](../screenshots/android-play-readiness/before-tablet-chat.png) | [화면](../screenshots/android-play-readiness/before-desktop-chat.png) |
| before signup-age | [화면](../screenshots/android-play-readiness/before-mobile-signup-age.png) | [화면](../screenshots/android-play-readiness/before-tablet-signup-age.png) | [화면](../screenshots/android-play-readiness/before-desktop-signup-age.png) |
| before account-deletion | [화면](../screenshots/android-play-readiness/before-mobile-account-deletion.png) | [화면](../screenshots/android-play-readiness/before-tablet-account-deletion.png) | [화면](../screenshots/android-play-readiness/before-desktop-account-deletion.png) |
| after chat | [화면](../screenshots/android-play-readiness/after-mobile-chat.png) | [화면](../screenshots/android-play-readiness/after-tablet-chat.png) | [화면](../screenshots/android-play-readiness/after-desktop-chat.png) |
| after signup-age | [화면](../screenshots/android-play-readiness/after-mobile-signup-age.png) | [화면](../screenshots/android-play-readiness/after-tablet-signup-age.png) | [화면](../screenshots/android-play-readiness/after-desktop-signup-age.png) |
| after account-deletion | [화면](../screenshots/android-play-readiness/after-mobile-account-deletion.png) | [화면](../screenshots/android-play-readiness/after-tablet-account-deletion.png) | [화면](../screenshots/android-play-readiness/after-desktop-account-deletion.png) |
| after report-dialog | [화면](../screenshots/android-play-readiness/after-mobile-report-dialog.png) | [화면](../screenshots/android-play-readiness/after-tablet-report-dialog.png) | [화면](../screenshots/android-play-readiness/after-desktop-report-dialog.png) |

[모바일 차단 후 빈 대화](../screenshots/android-play-readiness/after-mobile-blocked-chat.png)
