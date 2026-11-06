# Task 20261114: 결선 대진 카드 배정 표시

Status: In Progress
**Owner**: QA root → frontend implementation
**Created**: 2026-10-28

## Context
MD-QA [#177](https://teameet.jmandu.kr/issues/177/)는 결선에 팀을 배정하고 결과를 확정한 후에도 대진 목록 카드가 배정 대기와 자동 생성을 표시한다고 제보했다. 원래 재현은 Alpha `842f47fde`이며 현행 dev `392906709c15bf3e31d5b4099d8f203b032f39c5` 코드에서 결선 슬롯을 무시하는 판정을 확인했다.

## Goal
결선 카드와 준비 상태 요약이 실제 슬롯·경기 계약을 반영한다.

## Original Conditions (must all be satisfied)
- [ ] 결선 배정 팀 또는 배정 슬롯 수를 실제 데이터에 맞게 표시한다.
- [ ] 팀 배정/경기 시작 후 부적절한 추천 및 자동 생성 액션을 숨기거나 차단한다.
- [ ] 상단 요약이 결선 단계와 조를 혼동하지 않는다.

## User Scenarios
운영자가 조별 경기를 마치고 결선 진출 팀을 배정한 뒤 목록에서 4강과 결승의 실제 상태를 확인한다.

## Test Scenarios
### Happy path
- [ ] 배정된 결선 슬롯과 해당 fixture가 있으면 준비 상태를 표시한다.
### Edge cases
- [ ] 빈 슬롯, 부분 배정, 부전승, 결승 진출 전후 및 일반 조 대조.
### Error paths
- [ ] 배정 또는 경기 시작 이후 부적절한 조별 자동 생성이 노출되지 않는다.
### Mock data updates needed
- [ ] 실제 기존 슬롯·경기 응답 계약을 사용하는 컴포넌트 fixture를 보완한다.

## Parallel Work Breakdown
- Frontend: 브래킷 카드·헬퍼·목록 및 전용 테스트. 공유 API/types/hooks는 범위 밖.
- 독립 리뷰: 슬롯·부전승·상태와 액션의 적대적 반례를 확인한다.
- Root: 직렬 검증·Git/PR·리포트 댓글·배포 후 실제 Alpha 확인.

## Acceptance Criteria
- [ ] 원 조건 및 실제 소비자 회귀 검증.
- [ ] 최신 커밋 독립 리뷰 및 CI; 실제 Alpha 증거는 별도 기록.
- [ ] 원 제보에 PR·정확한 상태 기록.

## Tech Debt Resolved
결선 슬롯과 조 팀을 혼동하는 목록 표시.

## Security Notes
기존 관리자 권한 및 경기 데이터 변경 경계를 유지한다.

## Risks & Dependencies
슬롯 승자 전파·부전승은 팀 ID와 fixture 결과가 다를 수 있으므로 단순 개수만으로 완료를 단정하지 않는다.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-10-28 | 배정 수의 기준 | 현행 API slots/fixture 계약과 화면에 맞춰 검증한다. |

## Progress Snapshot
- 2026-10-28: 리포트 및 최근 댓글 0개 확인; 김성준 담당·확인 중 저장 확인. 최신 dev 소스와 기존 task/PR 중복 조사 후 전용 작업 공간 생성. 원 Alpha 제보의 라이브 재검증은 아직 미실행.
- 실제 Alpha `392906709c15bf3e31d5b4099d8f203b032f39c5`, 관리자 계정, 1280px 승제21 목록에서 4강·결승의 배정 대기/추천/자동 생성과 하단 실제 팀·결과를 함께 확인했다. 읽기만 수행했고 원 화면 캡처는 QA 로컬 증거에 있다.
- 실제 BracketTab 소비자 테스트의 기존 요약 불일치 RED 후, 슬롯·fixture 승자 전파를 반영하고 부분 배정과 BYE 대조를 추가했다. 관련 3개 테스트 파일 80/80 GREEN. 수동 결선에서 경기 생성 전 자동 생성 버튼은 최초 생성에 필요한 기존 흐름으로 유지한다.
- 별도 정적 리뷰에서 이 수동 흐름 차단 지적을 실제 소비자 계약 대조 후 철회했다. Changeset을 추가했으며 최신 커밋 독립 재리뷰·CI·배포 후 Alpha 재검증은 대기다.
- 커밋 전 TypeScript 검사는 통과했다. Windows 기본 find로 패턴 검사가 실행 실패한 뒤 Git의 find를 PATH에 지정해 동일 패턴 검사를 통과했다. 최신 origin/dev와 차이는 없었다.
