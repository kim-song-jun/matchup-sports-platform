# Task 106 — Team Match Result Lineup Gate

Status: Implemented — runtime QA pending
Target: backend + frontend
Environment: dev only

## Goal

팀매치 결과 화면에 들어갈 때 양 팀 중 한 팀이라도 제출된 참석명단이 없으면 결과 입력을 차단한다. 현재 사용자의 팀이 미제출이면 안내 후 해당 매치의 참석명단 등록 화면으로 이동할 수 있게 한다.

## Contract

- 최신 유효 참석명단이 `SUBMITTED` 또는 `LOCKED`이고 참가자가 한 명 이상 있어야 제출 완료로 본다.
- 결과 화면 read model은 `lineupReady`, `missingSides`, viewer의 `ownSideId`를 반환한다.
- 미제출 팀이 있으면 결과 화면 대신 `alertdialog` 안내를 표시한다.
- 내 팀이 미제출이면 `/team-matches/:id/lineup` 이동 CTA를 표시한다.
- 상대 팀만 미제출이면 상대 팀 제출을 기다리도록 안내한다.
- 공동 기록 mutation과 기존 result revision create/submit API도 `ROSTER_INCOMPLETE`로 우회 요청을 차단한다.

## Validation

- `pnpm --filter v1_web exec tsc --noEmit --pretty false`: 변경 계약 누락 2건을 발견해 fixture/MSW를 수정함. 나머지 실패는 dev worktree가 현재 checkout보다 새 dependency를 요구하지만 공유 node_modules에는 설치되지 않은 환경 drift.
- focused backend/frontend tests 및 browser QA는 dev dependency install 후 실행 필요.
