# Task 151 — 프로필 경기 MVP·대회 수상 분리

## Scope

- Backend: `apps/v1_api` 대회 수상자 계정 연결과 개인 활동 기록 집계
- Frontend: `apps/v1_web` 관리자 수상 입력 및 개인 활동 기록 UI
- Data: `V1TournamentAward.recipientUserId` nullable FK와 안전한 기존 데이터 보정
- Docs/QA: API 계약, 테스트, 반응형 화면 증거

## Requirements

- [x] 개인 활동 요약은 `출전`, `골`, `매치 MVP`, `대회 수상` 4개 지표를 구분한다.
- [x] 매치 MVP는 공식 경기 결과의 `mvpParticipantId`로 집계한다.
- [x] 대회 수상은 대회마다 다른 `awardLabel`을 그대로 목록에 표시한다.
- [x] 관리자 수상 입력은 확정 참가 명단의 `userId`를 수상 행에 저장한다.
- [x] 서버는 수상자 ID·이름·소속 팀이 같은 확정 참가 명단 행인지 검증한다.
- [x] 기존 이름-only 수상 행은 대회·팀·이름 기준 단일 후보일 때만 계정에 연결한다.

## Acceptance Criteria

1. `PUT /api/v1/admin/tournaments/:tournamentId/awards`가 `recipientUserId`를 받고 검증·저장하며 조회 응답에도 돌려준다.
2. `GET /api/v1/users/:id/records`가 `matchMvpCount`, `tournamentAwardCount`, `tournamentAwards[]`를 제공한다.
3. 본인 기록은 공개 동의와 무관하게 보이되, 타인 조회의 대회 수상 연결은 기존 기록 공개 동의 게이트를 따른다.
4. 개인 기록 화면이 4개 KPI와 실제 대회 수상명·대회명·팀명을 표시한다.
5. API/Web 대상 테스트, 타입 검사, 데스크톱·모바일 시각 검증을 통과한다.

## Ambiguity Log

- 기존 `summary.mvpCount`는 호환성을 위해 유지하되 `matchMvpCount`와 같은 값으로 내려보내고 Web은 새 필드를 사용한다.
- 대회 수상은 공개 대회 상세에 이미 이름으로 노출되지만 계정 연결 자체는 개인 기록 공개 범위에 해당하므로, 타인 조회에서는 기록 공개 동의가 유효할 때만 제공한다.
- 자동 보정은 동명이인 오연결을 막기 위해 동일 대회 내 `teamName + recipientName` 또는 팀명 없는 경우 전체 명단에서 단일 후보일 때만 수행한다.

## Progress Snapshot

- 2026-08-20: `dev` `1168c233` 기준 계약 조사 완료. 현재 어워드는 이름만 저장해 프로필 집계가 불가능함을 확인.
- 2026-08-20: nullable recipient FK, 단일 후보 backfill, 관리자 ID 선택/검증, 개인 기록 4개 KPI와 실제 수상명 목록 구현.
- 2026-08-20: API 대상 61개, Web 대상 53개 테스트 및 양 패키지 `tsc --noEmit` 통과. 공개 대회 상세은 동의 우회를 막기 위해 `recipientUserId`를 노출하지 않도록 회귀 테스트로 고정.
- 2026-08-20: PR #588 최초 CI에서 schema source snapshot guard가 변경을 감지해 실패. 새 migration 근거를 명시하고 현재 schema SHA-256으로 canonical fixture를 재핀.
- 2026-08-20: Windows worktree CRLF 해시가 아닌 Git committed LF blob을 Git Bash로 다시 계산해 source snapshot을 `6836627b...`로 교정.
