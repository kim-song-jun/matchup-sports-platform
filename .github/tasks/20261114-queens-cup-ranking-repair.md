# 퀸즈컵 예선 동점 순위 보정

Status: In Progress
Owner: Codex (single agent)
Created: 2026-11-14

## Context
사용자가 퀸즈컵 공개 순위 오류를 신고했다. 운영 공개 API의 예선 4조·24팀·60경기를 대조한 결과 승점/승무패/득실점은 일치하지만 대회 설정이 승자승 우선이고 안내문은 골득실·다득점·승자승 순서다. 사용자가 안내문 기준 보정과 dev PR·알파 배포를 승인했다.

## Goal
해당 대회만 공지 순서로 한 번 보정하고 실제 결과 기반 순위를 원자적으로 갱신한다.

## Original Conditions
- [x] 골득실 → 다득점 → 승자승을 적용한다(승점은 최우선).
- [ ] dev 대상 PR과 알파 배포 검증을 완료한다.
- [x] 운영 승격은 사용자만 수행한다.

## User Scenarios
- B조 승점 9·득실 +3 동률: 야수파FS(5득점)가 BSA(4득점)보다 위.
- C조 승점 8 동률: 서울 이랜드 FC(+2), 리브wfc(+1), 엘리제제이야(0).
- A/D조 순위와 모든 경기 점수·기존 결선 배정은 보존한다.

## Test Scenarios
- 합성 예선 60경기로 24팀 조별/통합 계산을 검증하고, 동일 승점에서 승자승과 골득실 순서가 달라지는 회귀를 증명한다. 실제 공개 60경기 원본의 영속 복사본은 없다.
- 대상 없음, 감사 receipt 존재, 잘못된 대회 정체성/규칙, 단계별 override, 불완전/비공식 결과를 검증한다.
- 계산 실패 시 트랜잭션이 실패하고 완료 receipt를 기록하지 않는다.

## Parallel Work Breakdown
병렬 에이전트 없음. Owned: 새 migration CLI/logic/spec/공개 fixture, deploy-alpha/prod의 CLI 호출, changeset, 이 문서. Forbidden: 플랫폼 기본 규칙, 일반 관리자 잠금, 결선/점수 변경, 운영 승격.

## Acceptance Criteria
- [x] 합성 예선 회귀 테스트(10 tests)와 API typecheck 통과.
- [ ] 최신 head Copilot clean/CI 통과 후 dev 머지.
- [ ] 알파 배포 SHA/health 및 대상 없음 no-op 확인.

## Tech Debt Resolved
공지와 저장 규칙의 불일치만 대회 ID로 한정해 보정. 영구적인 글로벌 기본값 변경이나 일반 잠금 우회 API를 추가하지 않는다.

## Security Notes
고정 ID·이름·종류·형식·기존 규칙·단계 override·예선 완결성 검증. 기존 canonical lock 순서와 serializable transaction. SYSTEM 감사기록에 전후 규칙/승인 사유/고정 requestId 기록. 재배포는 receipt가 있으면 아무것도 덮어쓰지 않는다. 비밀값 저장 없음.

## Risks & Dependencies
알파에는 해당 ID가 없어 공개 API 404. 실제 성적 회귀 테스트와 배포 no-op를 구분한다. 운영 데이터 보정은 미래 사용자 승인 운영 릴리스에서 실행된다. 운영 promote/직접 DB 쓰기는 이 작업에서 실행하지 않는다. Prisma schema 변경 없음: v1_tournaments.tie_break_order, v1_tournament_standings, v1_tournament_overall_standings, v1_operation_audits만 기록한다. 안내문 미명시 완전 동률 후속 기준은 기존 플랫폼 페어플레이/최소 실점/추첨을 유지한다.

## Ambiguity Log
2026-11-14: 사용자 확인으로 공지 기준 채택. 결선이 이미 진행되어 순위 수정으로 결선 재배정하지 않는다.

## Progress Snapshot
- 최신 origin/dev ac0382c89의 격리 worktree/브랜치 fix/queens-ranking-20261114.
- 공개 운영 API를 읽기만 했으며 보정은 아직 실행하지 않았다.
- `jest --selectProjects unit --runInBand --runTestsByPath src/tournaments/migration/queens-cup-ranking-repair.spec.ts`: 10/10 PASS (실제 계산기, source loader만 mock).
- `tsc --noEmit -p tsconfig.spec.json`: PASS. `bash -n deploy/deploy-alpha.sh`와 `bash -n deploy/deploy-prod.sh`: PASS.
- 수동 CLI 시나리오: 공개 사용자, viewport N/A. 운영 24팀의 집계 대조는 모두 일치(첫 조회); 순위는 B조 야수파FS/BSA와 C조 서울 이랜드 FC/리브wfc의 차이 확인. 후속 조회는 아래 404. 시작한 서버/브라우저/DB 컨테이너 없음.
- PR/배포 증거는 후속 갱신.
- 운영 공개 API가 2026-11-14 08:55 UTC부터 반복 404(TOURNAMENT_NOT_FOUND)를 반환하며 DB health는 정상. 비공개/취소/삭제 여부는 공개 API만으로 판별하지 않는다. 이 상태에서 운영 보정을 실행/성공했다고 말하지 않는다.
