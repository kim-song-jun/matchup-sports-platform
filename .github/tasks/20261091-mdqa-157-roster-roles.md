# MD-QA #157: 역할에 맞는 팀 명단 안내와 운영진 진입

Status: In Progress
**Owner**: QA root → dedicated frontend owner
**Created**: 2026-10-16

## Context
https://teameet.jmandu.kr/issues/157/ 상세·재현·최근 댓글을 읽고 root가 실제 UI에서 김성준 담당·확인 중 선점 성공을 확인했다. 팀원이 아닌 플랫폼 운영진은 참가 선수 탭에서 팀장에게 문의하라는 막다른 안내를 보며, 보기 전용 팀원·운영진도 선수 추가/번호/GK 관리라는 편집 CTA를 본다. PR1939의 #158-160은 문구/중복 제목/피리어드 이름 수정이며 이 역할 계약의 중복 수정은 아니다.

## Goal
현재 실제 권한에 맞는 참가 선수 보기 문구와 운영진의 기존 admin 명단 검토 진입을 제공한다.

## Original Conditions
- [x] 실제 담당·확인 중 저장과 report157-claimed.png 확인.
- [x] fetch 직후 managed origin/dev7596c6baa 기반 전용 worktree와 feature branch.
- [ ] 실제 소비자 RED→최소 수정→committed GREEN→독립 review→dev PR→기존 댓글·실측 근거.

## User Scenarios
비팀원 운영진은 팀장 문의 대신 기존 admin shell의 해당 신청 명단 검토로 갈 수 있다. 보기 전용 팀원은 참가 선수 보기 문구를 보고 편집 가능하다는 안내를 받지 않는다. 실제 팀장/manager의 기존 관리 진입과 API 인가는 유지한다.

## Test Scenarios
- 실제 page/component + auth/permission response + router/HTTP 소비자에서 세 역할의 CTA와 목적지.
- 비운영진·보기 전용 사용자의 편집 진입/관리 링크 노출을 넓히지 않는 대조군.
- API 오류·미등록 명단은 실제 원인/재시도로 유지하며 무조건 빈 성공/가짜 경로 금지.

## Parallel Work Breakdown
Phase A frontend owner는 규칙·DESIGN·reference·관련 v1 API와 component를 대조하고 exact owned page/component/test 경로를 제안한 뒤 테스트만 준비한다. Root actual RED 전 production 변경 금지. 공유 hook/type/MSW/DTO/schema는 root 단일 owner 지정 없이 수정하지 않는다. Root owns validation/Git/PR/browser/SSOT. Worker self-commit/tests/runtime/browser 금지. 다른 작업을 되돌리지 않는다.

## Acceptance Criteria
- [ ] 실제 권한별 문구·동작·목적지 일치, admin shell 유지, 팀장 기능 보존.
- [ ] real consumer RED/GREEN과 독립 C0/W0, fixture/API 문서/Changeset 동기화.
- [ ] diff/debt/import/committed scope·types·CI 검수.
- [ ] dev 배포 SHA의 390/768/1440 actual alpha와 console/network/댓글·이미지 저장 확인.

## Tech Debt Resolved
역할에 맞지 않는 false affordance와 dead-end 안내만 범위 내 정리.

## Security Notes
권한을 새로 부여하지 않고 기존 서버 gate와 사용자 신원/개인정보 범위를 유지한다. 내부 ID로 근거 없는 admin 링크를 조합하지 않는다. 비밀/.env 읽기 금지.

## Risks & Dependencies
#155/#156 backend roster 변경과 별도 checkout·파일 소유권. PR1939 같은 surface의 문구 변경과 최신 dev 통합 시 교차 검수. Attachment100 제한은 보존하며 중복 checkout을 만들지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-16 | root | 운영진 목적지 | 실제 기존 admin 신청 관리·명단 검토 route/API 계약으로 검증 |

## Progress Snapshot
- root: IAB2 DOM locator claim 성공·김성준/확인 중 표시·스크린샷 보존. branch fix/mdqa-157-roster-roles, base7596c6baa. 구현/RED/GREEN/PR/alpha NOTRUN.

- 2026-10-15 root actual RED: real CompetitionRosterManager→GameRosterClient→MSW HTTP 8 cases, 4 FAIL / 4 PASS, 14.43s (mdqa157-roster-roles-red.log). Two ADMIN competition destinations and read-only CTA reproduced; owner/manager/member-denial/error-retry controls retained. Production only two existing UI files changed; immutable candidate 49fe0781915b8df8d00341841c4e46e14733632b, independent frontend/security static C0/W0 (3/3 source/test, verified real admin gates). Existing admin registration list is an honest entry to roster review, no query auto-open or new permissions promised. GREEN/type/CI/dev merge/alpha remain pending.
- 2026-10-15 root committed validation: c38d6c93b67a1cdf792bad1ce4a26ad956b82c57 (dev a264 normal integration) real role regression plus existing manager/game-roster consumers 3 files 54/54 PASS,179.65s. Earlier Windows cmd array selected no files (exit1/NOTRUN), retained separately; corrected explicit paths ran all54. Web tsc --noEmit --incremental false exit0; v1 pattern guard PASS. Independent final5/5 and peer heading overlap C0/W0. Tracked source clean, no untracked app imports or added debt markers. Root prepares dev PR; CI/dev merge/actual alpha390/768/1440 remain pending. Authenticated IAB navigation/focus timed out and kernel reset; actual alpha is NOTRUN, not an authorization/app failure. Last project census fresh all-assignee32/32,2pages:158total/126done/2intake/30progress.