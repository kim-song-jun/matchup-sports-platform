# Task 170 — 리그 경기 명단을 참가 명단(계정 포함)으로

> **정본**: `docs/design/competition-canonical-flow.md` §3 "명단 = 출전자".
> **결정**: 2026-09-14 사용자 확정 — D1=C · D2=A · D3=A · D4=A. alpha 실측 뒤 **D1′=A 로 재확정**(Ambiguity Log 1) · alpha QA 전체 흐름 승인(QA=A).

## Context

- 마이페이지 선수 카드·활동 기록은 참가자↔계정 연결(`V1ParticipantIdentityLinkCurrent`)이 있어야 보인다.
- 리그 대진(`createLeagueFixture`)은 팀 활성 멤버 전원을 **계정 없이** 넣었다. 팀장이 라인업을 따로 내지
  않으면 연결이 생기지 않아, 선수는 경기마다 "이 선수가 저예요" 신청 → 다른 참가자 24시간 내 확인을 거쳐야 했다.
  대회는 참가 명단 선수를 계정과 함께 넣어 자동 연결된다.
- alpha 실측(2026-09-14, 읽기 전용·건수만):
  - 결과 확정 리그 72경기 · 선수 행 1,106 중 연결 48(4%) · 68경기가 라인업 없이 확정. 대회는 67%.
  - 신청 14건: 승인 2 · 만료 5 · 거절 4 · 대기 3. 같은 기간 라인업·명단 자동 연결 4,905건.
  - 대진이 있는 리그 58개 중 45개가 시즌 시작 **전**에 대진 생성. 확정 신청 127팀 중 대진 생성 시점에 명단이 있던 팀 0.
- 명단 자동 확정 잡(`league-roster-autoconfirm.service.ts`)은 `DISABLE_LEAGUE_ROSTER_AUTOCONFIRM_CRON=false` 일 때만
  돌고 배포 설정에 없어 alpha·프로덕션 모두 꺼져 있다. 대진이 이미 있는 리그는 건너뛴다.

## Goal

리그 참가 명단을 낸 팀의 선수는, 결과가 확정되면 신청 없이 마이페이지 카드·활동 기록에 그 경기가 뜬다.

## Original Conditions

- [x] D1=C — 대진 생성 때 참가 명단으로 만든다(대회와 동일) — PR #1195
- [x] D1′=A — 참가 명단이 바뀌면 시작 전 경기의 시스템 명단을 다시 맞추고, 자동 확정 잡의 "대진 있으면 건너뜀"을 푼다 — PR #1196
- [x] R=A — **정규 리그는 초안(draft)에서도 명단 수정 허용** + 막힌 이유를 상태별 문구로 — PR #1197
- [x] D2=A — 참가 명단이 없는 팀은 지금처럼 팀원 전원을 계정 없이
- [ ] D3=A — 명단 자동 확정 잡을 alpha 에서 먼저 켜고, 프로덕션은 alpha 실측 뒤 별도 결정
- [x] D4=A — 이미 확정된 리그 경기는 백필하지 않는다(새 대진부터)

## User Scenarios

1. 팀장이 리그 참가 명단에 선수 3명을 낸다 → 운영자가 대진을 만든다 → 경기 명단에 3명이 계정과 함께 들어간다 →
   결과 확정 → 세 선수의 마이페이지에 경기가 뜬다.
2. 명단을 내지 않은 팀 → 경기 명단은 팀원 전원(계정 없음) → 기록은 기존 신청 흐름으로.
3. alpha — 시즌 시작 시각에 명단 미제출 팀이 자격을 통과한 팀원으로 자동 확정된다(대진이 아직 없는 리그만).

## Test Scenarios

- **happy**: 두 팀 모두 명단 → 명단 인원만큼 참가자, 전원 `ROSTER_ASSERTED` (unit · integration)
- **edge**: 한 팀만 명단 → 그 팀만 연결 (unit) · 제외된(`removedAt`) 선수는 빠진다 (integration)
- **edge**: 명단 24명이어도 연결 statement 는 경기당 2건 (unit)
- **regression**: 명단 없는 팀 연결 0건 (unit) · 대회 경로 `ROSTER_ASSERTED` (unit) · 참가자당 statement 1건 (unit)
- **mock updates**: `league-match-admin.service.spec.ts` fake tx 에 참가 명단 players · `createManyAndReturn`/`createMany`

### D1′ 동기화 (2026-09-14)

- **happy**: 명단 추가(팀장) → 시작 전 경기 명단이 명단 선수(계정·연결·`started`)로 새 리비전, 감사 표시, 상대 사이드 불변 (integration)
- **happy**: 명단 삭제 → 동기화 리비전 위에서 다시 맞춤 (integration) · 자동 확정 잡이 대진 있는 리그도 채우고 맞춤 (integration)
- **edge**: 팀장이 저장한 리비전 · 제출한 리비전 1 · 시작 시각 지난 경기 → 건드리지 않음 · 같은 명단 → 새 리비전 없음 (integration)
- **wiring**: 명단 추가·삭제·어드민 삭제·팀 탈퇴 정리가 같은 리그·팀으로 동기화를 부른다 (unit)

### R 초안 리그 명단 (2026-09-14)

- **발견(alpha QA)**: 새로 만든 리그는 `draft` 인데 명단을 고칠 수 있는 상태는 `open·closed·in_progress` 뿐이라,
  팀장이 대진 생성 전에는 명단을 낼 수 없었다. 화면은 그 상태를 "대회가 종료되었거나 취소돼"로 안내했다.
  리그가 `in_progress` 가 되는 것은 **일괄 대진 생성** 때뿐이다.
- **수정**: 판정을 상태만 보던 것에서 `isRosterMutableTournament({ kind, status })` 로 바꿔 **정규 리그 + draft** 를
  더한다(대회 초안은 그대로 막는다 — 신청 생성이 `status !== 'open'` 을 막아 명단이 존재할 수 없다).
  서버 명단 추가·삭제·후보 목록·탈퇴 정리 쿼리와 웹 두 화면이 같은 규칙을 본다.
- **문구**: `tournamentRosterClosedMessage(status)` — 완료·취소면 "종료되었거나 취소돼", 그 밖이면 "아직 공개되지 않아".
- **테스트**: 서버 unit(리그 초안 허용 · 대회 초안 차단 + 문구) · 웹 unit(판정·문구) · integration(초안 리그에서 팀장이 명단 제출).

## D1′ 설계

- **대상**: 리그(`teamMatch.leagueId`)의 그 팀 사이드 · 게임 `SCHEDULED` · 시작 시각 전 · 취소 안 된 경기.
- **시스템 명단 판정**: 최신 라인업이 DRAFT 이고 (리비전 1 이거나 동기화 감사 행이 있는 리비전). 라인업 행에 작성자
  칸이 없어 스키마를 늘리지 않고 `V1OperationAudit(action=LEAGUE_ROSTER_SYNCED, requestId=gameId:lineupId)` 로 표시한다
  — Task 168 의 마이그레이션 체인·스키마 해시 증거를 흔들지 않기 위해서다.
- **쓰기**: 새 리비전(supersedes) + 참가자 `createManyAndReturn` + 연결 2 statement(SYSTEM `LEAGUE_ROSTER_SYNC`) +
  본인이 끈 공개 제외(REVOKED) 승계(`team-matches/lineup-consent-carry.ts`, 팀장 재저장·정정 복사와 같은 규칙).
- **트리거**: `insertPlayerIntoRoster` · `removePlayer` · `removePlayerForAdmin` · `removeUserFromActiveRosters` · 자동 확정 잡.
  대회에서 불려도 리그 경기가 없어 조회 1건으로 끝난다.

## Parallel Work Breakdown

- **Backend (순차 — 같은 계약)**: `league-fixture-creation.ts` → `league-match-admin.service.ts` → `games.service.ts`
- **Infra (독립)**: `deploy/docker-compose.alpha.yml` 워커 env
- **Frontend**: 없음

## Acceptance Criteria

- [x] tsc 0(api·web) · 영향 unit green · integration green(CI) — #1195 통합 674→680, #1196 680→681
- [x] 변이 검증: 명단 분기 제거 red 2 · 일괄 연결 제거 red 1 · 동기화 호출 제거 red 1(추가/삭제/탈퇴정리) · 리그 draft 허용 제거 red 1(서버·웹 각각)
- [x] alpha 실화면(배포 `ce64e6801`) — 아래 "alpha QA 결과"
- [ ] 명단 자동 확정 잡 실제 발화 확인 — QA 리그 예약은 2026-10-14 00:00 KST · 프로덕션 설정은 별도 결정

## alpha QA 결과 (2026-09-14, 사용자 승인 하에 실행)

리그 `(QA) T170 명단 연결 0914`(시작 10/14) · A팀 명단 6명 제출 · B팀 명단 미제출(대조군).

| 확인 | 결과 |
|---|---|
| 초안 리그에서 팀장 명단 제출 | 화면 `수정 가능` → 선수01~06 6명 등록 (#1197 전에는 `수정 불가`) |
| 대진 생성 시 경기 명단 | A팀 6명 전원 `userId` + `ROSTER_ASSERTED` 연결(actor=운영자) · B팀 11명 연결 0 |
| 결과 확정(0:0) 후 공식 결과 | A 6행·B 11행 전원 `started` · A만 연결 보유 |
| 선수01(명단) 마이페이지 활동 기록 | 신청 없이 그 경기 노출 |
| 선수07(명단 밖) 활동 기록 | 노출 없음(3경기 그대로) |

3폭 스크린샷 갤러리: PR #1197 코멘트. QA 가 만든 대진·공식 결과는 삭제할 수 없어 alpha 에 영구히 남는다.

## Tech Debt Resolved

- 출처 명단 신원 연결: 참가자당 5 statement → 경기당 2 statement (대회 경로 포함)
- 리그 자동 로스터의 "userId 를 붙이지 않는다" 장문 주석 → 현재 계약으로 교체 · 스펙 주석의 트랜잭션 제한시간(120s → 실제 45s) 정정

## Security Notes

- 새 엔드포인트 없음. 연결 actor 는 대진을 만든 운영자(`platform_ops`).
- 공개 노출은 기존 기록 공개 동의 게이트 그대로다 — 연결이 생겨도 본인 동의 전에는 타인에게 보이지 않는다.

## Risks & Dependencies

- D1=C 만으로는 대진이 명단보다 먼저 만들어진 리그(alpha 45/58)에서 연결이 생기지 않아 D1′ 동기화를 더했다.
- 동기화와 팀장 라인업 저장이 **같은 순간** 같은 사이드에 새 리비전을 쓰면 `(gameId, sideId, revision)` unique 로 늦은 쪽
  트랜잭션이 실패한다(명단 변경 또는 저장이 에러로 끝나고 재시도하면 된다). 데이터가 틀어지지는 않는다.
- `league-result-participants.ts` 의 `assembleLeagueResultParticipants`·`carryForwardResultParticipants` 는 운영 코드
  호출처 0(스펙만) — 리그 결과가 콘솔 경로로 옮겨진 뒤 남은 dead code 로 보인다. 이 태스크가 건드리지 않은 파일이라
  제거는 별도로 판단한다.
- 참가 명단 선수가 상호평가 대상·출전정지 추적 대상이 된다 — 정본 "명단 = 출전자" 와 같은 뜻이라 막지 않는다.
- 대회도 명단 변경 뒤 기존 경기 명단을 다시 맞추지 않는다 — 범위 밖.
- Task 168 병렬 세션이 games·league 파일을 수정해 왔다. 착수 시점(2026-09-14) 전 worktree 미커밋 겹침 0 확인.

## Ambiguity Log

| # | 질문 | 상태 |
|---|---|---|
| 1 | D1=C 로는 대진이 명단보다 먼저 만들어진 리그(alpha 45/58)에서 연결이 0 — A(명단 변경 시 시작 전 경기 재동기화 + 잡의 건너뜀 해제) / B(명단 없는 팀이 있으면 대진 생성 차단) / C(유지) | **해소 — A** (2026-09-14 사용자 확정) |
