# Task 193: 전술보드 미저장 이탈 확인

Status: Review
**Owner**: issue #1540 수정 세션
**Created**: 2026-10-02

## Context
Refs #1540. 실제 alpha 전술보드에서 로컬 배치 후 페이지 Back은 경고 없이 팀 상세로 가고 재진입 시 서버 baseline으로 돌아온다. 저장된 데이터 소실/권한 우회가 아닌 P3 작성분 손실이다. #1411/PR1469는 다른 친선 참석명단 경로다.

## Goal
기존 공용 미저장 guard를 전술보드의 실제 dirty에 연결해 계속 작성/나가기와 clean 저장 후 이탈을 구별한다. 별도 초안 저장이나 새 모달 디자인은 만들지 않는다.

## Original Conditions (must all be satisfied)
- [ ] alpha CSS402/787/1180에서 dirty 페이지 Back이 작성분을 조용히 버리지 않음.
- [ ] 계속 작성 후 배치 유지, 나가기 뒤에만 기존 서버 baseline으로 재진입.
- [ ] clean 페이지 Back은 경고 없이 동작.
- [ ] 같은 fixture의 실제 수정 after/UTC/폭/console/network는 별도 승인된 alpha 배포 후 검증. 원 이슈 OPEN/Refs 유지.

## User Scenarios
1. 선수를 배치/이동한 팀장·매니저가 Back을 누르면 기존 계속 작성/나가기 확인을 본다.
2. 계속 작성/Escape 후 배치와 미저장 상태가 남고, 명시 나가기 후 재진입은 기존 서버 기준이다.
3. 저장 성공은 clean으로 떠나고 저장 실패/409는 실제 오류와 미저장 배치를 유지한다.

## Test Scenarios
### Happy path
- [x] 실제 TacticsBoardClient/PitchFormationEditor/공용 guard와 AppBackLink, 실제 jsdom history로 page Back·취소·나가기·clean.
### Edge cases
- [x] 반복·Escape/취소·브라우저 Back·beforeunload·팀원 보기 전용·저장 성공 및 재진입 baseline.
### Error paths
- [x] API 경계에서 저장 실패/409의 메시지·미저장 배치·이탈 확인 유지, 실제 serializer payload 보존.
### Mock data updates needed
- 기존 테스트 API 경계 mock과 공용 history-router만 사용. 제품 editor/guard/모달/AppBackLink는 mock하지 않는다. 실제 서버 저장 없음.

## Parallel Work Breakdown
- Read-only 조사: actual client/guard 및 issue1411/PR1469·전술 기존PR1226·402 중복 대조. 데이터/브라우저 수정 없음.
- Owned: apps/v1_web/src/app/teams/[id]/tactics/[gameId]/tactics-board-client.tsx, tactics-board-client.test.tsx, 이 task, .changeset/tactics-unsaved-back.md.
- Forbidden: 공용 guard/history/shell 및 다른 PR 미병합 코드, API/DTO/스키마/저장/권한 계약, 실제 팀·가입·QA179·결과·실데이터 저장, merge/deploy/main/유료 리뷰 재요청.
- 부모가 기존 이탈 guard의 최소 연결을 지정. 이벤트 로직 연결이며 기존 디자인/문구/배치/스타일 그대로 사용한다.

## Acceptance Criteria
- [x] 실제 사용자 계약 RED→GREEN, 관련 편집기/serializer/guard 회귀, scope lint/type·필수 aggregate6·Changeset·diff/tech-debt.
- [ ] 명시4 pathspec 커밋/Ready dev PR/정확한 head CI/독립 리뷰를 구분해 기록.
- [ ] 실제 alpha 전체 검증 미완과 before/after 한계를 명시.

## Tech Debt Resolved
- 전술보드의 dirty는 저장 CTA에만 연결됐고 공용 이탈 보호와 연결되지 않았다.

## Security Notes
- guard는 실제 dirty만 사용하며 자동 저장·초안 보존 성공으로 위장하지 않는다. 원래 저장 API·version conflict/팀장·매니저·팀원 계약 유지.
- .env/토큰/회원 명단/full private tactics 자료를 읽거나 공개하지 않는다. 허용된 control crop3개만 확인, 서버 Save/Submit0.

## Risks & Dependencies
- [원본 공개 proof](https://github.com/kim-song-jun/matchup-sports-platform/blob/cbcb48dafb32b4f5302e31fc490dc7ccfb62f9cc/docs/qa/2026-10-02-local-tactics-draft/local-tactics-three-width-summary.json)는 page Back3폭이며 browserBack/OS/새로고침의 dirty 실패는 관찰하지 않았다.
- 공개 before 사진은 tablet1/desktop2(control crop)이며 mobile 사진은 없다. bytes/SHA256/Gitblob3/3 확인, 실제 픽셀3/3 검토. desktop 재진입/새로고침은 수정 after가 아니다.
- 실제 serving SHA/기기/저장 성공·실패/다른 계정/전체 console/network·접근성은 미검증. 수정 after는 별도 승인 alpha 배포 대기.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-02 | 부모/수정 세션 | 이탈 확인 또는 로컬 복구? | 부모의 최소 이탈 guard 지정과 기존 제품 패턴을 따라 useUnsavedChangesGuard/기존 모달 연결. 새 draftSaved 계약을 만들지 않는다. |
| 2026-10-02 | 원 이슈 | browserBack도 실제 재현인가? | 아니오. 원본 pageBack과 별도 합성 history 경계 테스트를 분리한다. |

## Progress Snapshot
- Fresh origin/dev be228ba1b6dc92ec7e4222d8f8e4e7e9a8e5e14d; /tmp/teameet-issue-1540-20261002; fix/issue-1540-tactics-unsaved-back. 다른 미병합 PR 코드 없음.
- 실제 dirty와 기존 useUnsavedChangesGuard/모달 연결. 성공·loading·board/members error 모두 모달을 렌더해 오류 중 dead-end를 만들지 않는다. 새 디자인/초안 저장/공용 guard 변경 없음.
- 신규10 RED:7 FAIL/3 PASS(기존14 SKIP),10.85s → 첫 GREEN 실제 client/editor/guard/cold4 suite68 PASS,12.64s. 오류/로딩 전환3건 추가 후 실제 client+shell2 suite30 PASS,3.95s; 마지막 모달 위치 최소화 뒤 신규13 PASS,2.47s. 유일5 suite74건(신규13+기존61); 모델 standalone 테스트는 없으며 실제 client의 payload 직렬화를 검증했다.
- scope frontend lint(typecheck+pattern),필수 aggregate6,web patch Changeset,diff/tech-debt/scope PASS. 단일 worker/직렬; 로컬 전체 suite/build/DB 없음. host load42.04/31.72/22.77,swap사용9562.38MB/총10240MB,Node245/browser86/Docker10,alphaHEAD200. 사용자 지속 진행에 따라 최소 검증하며 타 세션 프로세스를 정리하지 않았다.
- 실제 hooks/컨트롤러/팀 manager/member service/version CAS 저장 계약은 읽기 대조만 했으며 변경하지 않았다. 테스트 API 호출은 경계 mock이고 실제 서버 Save/Submit0.
- 명시4 pathspec 커밋/Ready dev PR/정확한 head CI/독립 리뷰는 PR 기록에 이어 남긴다. 원 전체 alpha AC/after/이슈 종료는 승인 배포 대기.
