# Task 170 — 리그 경기 명단을 참가 명단(계정 포함)으로

> **정본**: `docs/design/competition-canonical-flow.md` §3 "명단 = 출전자".
> **결정**: 2026-09-14 사용자 확정 — D1=C · D2=A · D3=A · D4=A. D1 은 alpha 실측 뒤 재확인 중(Ambiguity Log 1).

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

- [x] D1=C — 대진 생성 때 참가 명단으로 한 번 만든다(대회와 동일). **재확인 대기**(Ambiguity Log 1)
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

## Parallel Work Breakdown

- **Backend (순차 — 같은 계약)**: `league-fixture-creation.ts` → `league-match-admin.service.ts` → `games.service.ts`
- **Infra (독립)**: `deploy/docker-compose.alpha.yml` 워커 env
- **Frontend**: 없음

## Acceptance Criteria

- [ ] v1_api tsc 0 · 영향 unit green · 추가 integration green(CI)
- [ ] 변이 검증: 명단 분기 제거 시 red 2 · 일괄 연결 제거 시 red 1
- [ ] alpha: 참가 명단을 낸 팀으로 대진 생성 → 참가자 `userId`·연결 확인 → 결과 확정 뒤 선수 마이페이지 카드·활동 기록 노출(ego-browser)
- [ ] alpha 자동 확정 잡 동작 확인 · 프로덕션 설정은 별도 결정

## Tech Debt Resolved

- 출처 명단 신원 연결: 참가자당 5 statement → 경기당 2 statement (대회 경로 포함)
- 리그 자동 로스터의 "userId 를 붙이지 않는다" 장문 주석 → 현재 계약으로 교체 · 스펙 주석의 트랜잭션 제한시간(120s → 실제 45s) 정정

## Security Notes

- 새 엔드포인트 없음. 연결 actor 는 대진을 만든 운영자(`platform_ops`).
- 공개 노출은 기존 기록 공개 동의 게이트 그대로다 — 연결이 생겨도 본인 동의 전에는 타인에게 보이지 않는다.

## Risks & Dependencies

- **D1=C 는 대진이 명단보다 먼저 만들어진 리그에서 연결을 만들지 못한다**(alpha 45/58 리그). Ambiguity Log 1.
- 참가 명단 선수가 상호평가 대상·출전정지 추적 대상이 된다 — 정본 "명단 = 출전자" 와 같은 뜻이라 막지 않는다.
- 대회도 명단 변경 뒤 기존 경기 명단을 다시 맞추지 않는다 — 범위 밖.
- Task 168 병렬 세션이 games·league 파일을 수정해 왔다. 착수 시점(2026-09-14) 전 worktree 미커밋 겹침 0 확인.

## Ambiguity Log

| # | 질문 | 상태 |
|---|---|---|
| 1 | D1=C 로는 대진이 명단보다 먼저 만들어진 리그(alpha 45/58)에서 연결이 0 — A(명단 변경 시 시작 전 경기 재동기화 + 잡의 건너뜀 해제) / B(명단 없는 팀이 있으면 대진 생성 차단) / C(유지) | 사용자 확인 대기 (2026-09-14) |
