# PR #2447 배포 준비 판정 — 2026-11-20

판정: **NO-GO — 현재 head로 dev 머지/Alpha 배포 보류**.

- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2447
- 검토 head: `8e6bf99ca27a6819854ac0b5301415e0e56a63b7`
- 비교 dev: `a45642e4a` (검토 시작 시 fetch)
- 범위: backend/frontend/admin 신원 전환 및 배포 준비 검토. 변경 파일 58개 목록 확인. 전체 58개 파일의 상세 리뷰 완료를 의미하지 않는다.
- 운영 승격은 사용자 전용이며 이번 작업에서 실행하지 않았다.

## 통과한 근거

GitHub check-runs API에서 해당 head의 Gates/API/Web/github-advanced-security 성공을 직접 확인했다. Build images/Deploy는 skipped이며 실제 배포 성공을 뜻하지 않는다.

https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/44484640852

PR 본문에는 동일 head attempt 2의 PostgreSQL 통합 212개 파일/1622 PASS, 단위 561개 파일/9369 PASS가 기록돼 있다. 이번 검토에서는 API job success를 독립 확인했으며 개별 DB 테스트 로그를 다시 추출하거나 로컬에서 재실행하지 않았다. 이전 attempt 실패 후 재실행 성공은 간헐 실패의 영구 해결 근거가 아니다.

서명 grant, 원 관리자 세션 결합, 10분 만료, 양쪽 sessionEpoch, 현재 관리자 권한, 종료 감사 및 Socket 신원 차단 구현을 읽었다. 기존 HTTP 회귀는 POST 차단과 신원 복귀를 검증하지만 실제 GET 서비스의 저장 부작용까지 보장하지 않는다.

## 배포 차단 사항

### 1. 회원 조회 중 GET 서비스가 실제 사용자 상태를 저장하고 메시지를 보낼 수 있음 — Critical

`apps/v1_api/src/auth/member-access.guard.ts`는 GET/HEAD/OPTIONS를 허용하고 그 뒤 대상을 회원 신원으로 설정한다. HTTP method만으로 기존 서비스의 무변경을 보장할 수 없다.

실제 연결 경로:

- `GET /api/v1/chat/rooms` → `ChatService.rooms`: 만료 컨택 `updateMany` 및 종료 방 보관 실행.
- `GET /api/v1/chat/rooms/:roomId` 및 `/messages` → `getActiveParticipantRoom`/`ensureEntered`: 참가자 생성·보정 경로, `visibleFromAt` 저장, 첫 입장 system message 생성. 조건이 맞으면 `deliverSystemLine` 실행.
- `GET /api/v1/notification-preferences` → `NotificationsService.preferences`: 설정 `upsert`. 기존 행 갱신 또는 없는 행 생성 가능.

근거: `apps/v1_api/src/chat/chat.controller.ts`, `chat.service.ts`의 `rooms`, `detail`, `messages`, `getRoomParticipant`, `ensureEntered`, `recordTeamMatchFirstEntry`; `apps/v1_api/src/notifications/notifications.controller.ts`와 `notifications.service.ts`의 `preferences`.

이는 PR의 “조회 전용 / 모든 쓰기·전송 차단” 계약과 어긋난다. 위 경로를 실제 회원으로 실행해 부작용을 재현하지 않았으며, 코드 흐름으로 확인한 finding이다. 실제 회원 데이터에 의도적으로 쓰기를 발생시키지 않았다.

해제 조건:

- 회원 조회 컨텍스트가 실제 GET 서비스까지 전달되도록 한다.
- 조회 중 lazy mutation, 참가 등록/입장 기록, system message/알림 전달을 금지하면서 기존 조회 권한·열람 시작 경계를 유지한다. 무조건 GET 허용 또는 조회 오류를 성공 데이터로 바꾸는 대체는 허용하지 않는다.
- 실제 route → guard → 실제 서비스 호출을 연결한 RED → GREEN 회귀를 추가한다. 채팅 참가/컨택/메시지/알림 설정의 DB before/after 불변과 외부 전달 0건을 검증한다. 기존 일반 회원 동작도 보존한다.
- 위 사례 이외에도 허용 GET의 lazy write 경로를 점검한다. 현재 발견 목록을 전체 서비스 보장으로 간주하지 않는다.

### 2. 최신 dev와 충돌 — Blocking

GitHub PR API: `base=dev`, `state=open`, `mergeable=false`, `mergeable_state=dirty`.

`git merge-tree --write-tree HEAD origin/dev`로 `docs/scenarios/index.md`의 실제 content conflict를 확인했다. 이 명령은 작업 트리나 PR branch를 병합하지 않는다. 양쪽 scenario 행을 보존해 최신 dev를 통합하고 새 head의 CI를 확인해야 한다.

### 3. 리뷰 및 변경 후 Alpha 검증 — Pending gates

GitHub reviews/comments API 응답은 각각 빈 배열이다. Copilot 승인/검토 완료라고 주장할 근거가 없다.

Ego Lite의 기존 로그인으로 Alpha 회원 목록 → 검색 → 테스트 회원 상세까지 클릭해 진입했다. 현재 화면에는 `회원 화면 조회`가 없고 기존 `회원 화면으로 보기` 대진표 조회만 있다. 이는 신규 기능이 배포되지 않았음을 확인한 baseline이며 신규 기능 PASS가 아니다.

baseline: 테스트 회원 `af191119-0000-4000-8000-000000001802`, 390/768/1440 × 900 캡처. 로컬 증거 `tmp/pr2447-review/before-member-{width}.png`. 변경 후 검증은 0/4 화면, viewport 0/3이며 console/network 합격 판정도 미실행이다.

## 배포 진행 순서

1. Critical 조회 부작용 수정 및 실제 서비스 회귀, API 계약/fixture 문서 동기화.
2. 최신 dev 문서 충돌 해결 → 새 head CI/리뷰 확인. 기존 head 성공을 새 head 검증으로 재사용하지 않는다.
3. 머지 직전 base=dev와 검증 head를 다시 확인한 뒤 dev PR 머지. dev 머지는 즉시 Alpha 배포를 시작한다.
4. Alpha가 merge SHA를 서빙하는지 확인하고 회원/팀 목록·상세 4개 화면과 신원 전환을 Ego Lite로 검증한다.
5. owner/ops 시작, support 거부, 일반 회원/관리자 대상 제한, 최근 로그인 요구, 10분 만료, 복귀, 다른 탭 종료, 쓰기·소켓 차단, GET 무변경을 검증한다. 390/768/1440 화면·console/network·감사 로그 증거를 기록한다.
6. 개인정보 및 세션 쿠키를 증거에 노출하지 않는다. 테스트 회원만 사용하고 조회 종료 후 원래 관리자 신원을 확인한다.
7. 실패 시 원인을 기록하고 기존 Alpha rollback runbook에 따라 복구한다. main 승격은 사용자 판단/실행으로 남긴다.

## 실행 환경과 cleanup

현재 Windows Node는 v24.15.0으로 프로젝트 요구 >=22.23.5 <23과 다르다. 격리 worktree에는 의존성 설치가 없고 로컬 Docker daemon도 연결되지 않는다. 로컬 테스트/빌드 성공을 주장하지 않으며 이미 성공한 원격 CI를 불필요하게 중복 실행하지 않았다.

원 작업 branch/worktree 및 다른 세션 변경은 보존했다. 검토 전용 branch `review/pr2447-deploy-20261120`에 이 판정과 기존 task의 resume 상태만 남긴다. API/Web 개발 서버를 시작하지 않았다. 신규 기능의 실제 회원 전환/저장/전송 또는 dev/main 머지는 실행하지 않았다.
