# Task 20261113: 개인 매치 동시 신청 충돌

Status: In Progress
**Owner**: QA root → backend implementation
**Created**: 2026-10-28

## Context
MD-QA [#184](https://teameet.jmandu.kr/issues/185/)는 같은 계정의 개인 매치 동시 신청 중 한 건만 저장되지만 나머지 일부가 409 대신 500이 된다고 보고한다. 원 제보의 재현은 로컬 PostgreSQL 16이며 Alpha 재현은 미실행이다. 최신 dev `392906709c15bf3e31d5b4099d8f203b032f39c5`에서 매치 잠금 전에 신청과 eligibility를 읽는 경로를 확인했다.

## Goal
같은 사용자의 경합 신청에서 기존 권한·상태 계약을 유지하며 중복 저장과 내부 오류를 방지한다.

## Original Conditions (must all be satisfied)
- [ ] 동시 신청은 한 건만 접수하고 다른 요청은 기존의 이미 신청됨 409 또는 같은 결과를 반환한다.
- [ ] 재신청·참가·정원·취소 등 기존 상태와 인증 규칙을 보존한다.

## User Scenarios
같은 계정에서 신청 버튼의 빠른 중복 클릭이나 재시도 시 첫 신청만 생성되고 나머지는 이해 가능한 충돌 응답을 받는다.

## Test Scenarios
### Happy path
- [ ] 정상 최초 신청과 재신청을 보존한다.
### Edge cases
- [ ] 잠금 경합을 실제로 강제한 동일 사용자 동시 신청과 재신청을 검증한다.
- [ ] 참가·신청 상태 변화 및 정원 경계를 대조한다.
### Error paths
- [ ] 500 대신 계약된 409, 중복 로그·알림 부재를 확인한다.
### Mock data updates needed
- [ ] 영향받는 API 테스트 fixture만 계약에 맞춘다.

## Parallel Work Breakdown
- Backend 구현: `apps/v1_api/src/matches/matches.service.ts` 및 해당 API 테스트. 공유 DTO/schema/API 계약 변경은 범위 밖.
- 독립 리뷰: 구현자와 다른 에이전트가 경합·권한·알림·회귀 반례를 검사한다.
- Root: 직렬 검증, Git/PR, 기존 리포트 댓글 및 dev/Alpha 확인.

## Acceptance Criteria
- [ ] 실제 실패하는 좁은 회귀 후 수정과 GREEN 근거.
- [ ] 최신 커밋 독립 리뷰 및 CI 확인; 실제 Alpha 근거와 분리.
- [ ] 기존 QA 리포트에 PR과 정확한 상태 기록.

## Tech Debt Resolved
- 신청 판정의 잠금 전 오래된 상태 의존.

## Security Notes
활성 계정과 기존 viewer/role 상태 검증을 우회하지 않는다. 다른 사용자의 신청이나 알림을 변경하지 않는다.

## Risks & Dependencies
PostgreSQL 통합 검증에는 별도 테스트 DB가 필요하며 불가 시 정확한 미검증 범위를 기록한다. 다른 신청 상태 전이의 조건부 갱신과 경합에 주의한다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-28 | 중복 응답 | 제보가 허용한 409 중 기존 계약을 우선한다. |

## Progress Snapshot
- 2026-10-28: 로그인된 IAB에서 제보 원문 및 댓글 0개 확인. 김성준 담당·확인 중으로 저장 확인. 신규 작업 중복 조사 후 origin/dev에서 버그 전용 작업 공간 생성. 기존 행 잠금 이전 상태 사용과 500 경로는 소스 분석이며 이 실행의 DB 재현은 미실행.
- 잠금 대기 중 경쟁 신청 서비스 테스트: base 원본 소스 복사본으로 기대 충돌 대신 성공이 반환되어 RED 1건, 수정 소스에서 동일 신청·정원·이미 참가한 사용자 3건 GREEN. 잠금/상태는 모의했으며 실제 DB 경합을 대체하지 않는다. Windows Jest의 경로 glob 문제로 동등한 transform·환경을 가진 임시 로컬 설정을 사용했다. PostgreSQL 강제 잠금 테스트 2건은 Docker daemon 연결 불가로 미실행이다.
- 별도 리뷰의 Changeset 누락을 추가했다. 최신 커밋 리뷰·원격 CI·Alpha 실측은 대기다.
