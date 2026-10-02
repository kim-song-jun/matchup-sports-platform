# Task 196: 참가 명단의 선택 팀·대회/리그 문맥 (#1549)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
같은 리그의 B/C 신청 상세는 대상 팀을 표시하지만 선수 명단 본문에는 팀·리그명이 없다. 실제 alpha C402/787/1180와 B402 before 및 등록별 Back은 올바른 엔티티로 연결된다. 실제 잘못된 저장/권한 우회는 관찰되지 않았다.

## Goal
이미 조회하는 현재 등록의 팀 상세 이름과 대회/리그 제목을 기존 기간·상태 카드 안에 최소 표시하고 Ready/base dev PR로 전달한다.

## Original Conditions (must all be satisfied)
- [x] 최신 fetch origin/dev의 독립 worktree/브랜치에서 작업하며 다른 미병합 코드를 섞지 않는다.
- [ ] C402/787/1180 및 B402에서 선택 팀·리그를 명확히 식별한다(수정 alpha는 배포 대기).
- [x] B/C 전환 시 현재 registrationId의 대상과 일치하며 이전 팀 문맥을 보여주지 않는다.
- [x] 현재 등록별 Back·기간·인원·상태·권한 제어와 기존 셸 헤더를 유지한다.
- [ ] 최소 표시·loading/error/권한/헤더 중복/긴 이름 회귀·lint/필수검사·명시 커밋/푸시·exact head CI/독립 리뷰를 기록한다.
- [x] 공개 실제 before7장/proof와 alpha after 잔여를 구분하고 서버/QA179/완료 결과를 변경하지 않는다.

## User Scenarios
- 다중 팀장은 추가 제어 위의 기존 명단 카드에서 현재 팀과 대회/리그를 확인한다.
- 다른 등록으로 이동할 때 대상 ID와 일치하는 조회 결과만 이름으로 표시한다.
- 로딩·오류·권한 미확정에는 임의 팀 이름을 채우지 않으며 기존 실패·재시도/편집 차단을 유지한다.
- 긴 한글/연속 문자열 팀명·대회명은 생략하지 않고 줄바꿈한다.

## Test Scenarios
### Happy path
- [x] 실제 roster client+기존 Card의 B/C·대회/리그 문맥과 기존 기간·인원·Back.
### Edge cases
- [x] 같은 client 재렌더의 등록/대회/팀ID 불일치·placeholder·긴 이름 및 셸/본문 제목 중복 회귀.
### Error paths
- [x] roster 로딩/오류와 team 권한 pending/실패·member/manager·종료/잠금/마감 차단.
### Mock data updates needed
- API/DTO/schema 변경 없음. 새 tests의 hook fixture는 실제 registration/tournament/team ID·name 계약을 채운다. 기존 권한/기간 fixture는 변경하지 않는다.

## Parallel Work Breakdown
### Frontend
- [x] 사용자 지시 ‘팀·대회/리그 문맥 최소표시’를 기존 Card의 두 줄 텍스트로 보강한다. 새 셸 제목/별도 hero/새 컨트롤·layout 선택을 만들지 않는다.
### Read-only evidence
- [x] 독립 담당자는 공개7사진+proof/중복/이름 출처 계약만 대조한다. 제품/커밋/브라우저/서버 작업 금지.
### Sequential
- [ ] 실제 렌더 RED→GREEN·관련 권한/기간 테스트·lint·6aggregate·Changeset·명시4경로 커밋·Ready PR·CI/실제 리뷰.
- [ ] 승인된 alpha 배포 뒤 같은 데이터 C402→787→1180 및 B402 이름/긴이름/Back/추가 제어·반복/취소/Escape·console/network와 이미지 after를 남긴다.
### Owned / Forbidden files
- Owned: `apps/v1_web/src/app/tournaments/[id]/registrations/[registrationId]/roster/tournament-roster-client.tsx`, 같은 폴더 `tournament-roster-context.test.tsx`, 이 문서, `.changeset/roster-team-context.md`.
- Forbidden: 공용 shell/hooks/types/스타일/API/DTO/schema·다른 worktree/PR1545·실제 선수 명단/결과/권한/배포.

## Acceptance Criteria
- [x] 팀명은 이미 조회하는 현재 team detail에서, 대회/리그명은 현재 tournament detail에서 가져오며 임의 seed/다른 엔티티로 대체하지 않는다.
- [x] 기존 period/status Card에 문맥1회, 새 h1/h2/Back 헤더는 추가하지 않는다. 긴 이름은 wrap하고 ellipsis/nowrap로 숨기지 않는다.
- [x] 기존 loading/error와 역할·명단 상태 gate/API payload·등록별 Back 동작을 유지한다.
- [ ] 초점 테스트·lint·필수검사·committed-tree/원격 결과를 기록하고 실제 alpha 전체 AC 충족 전 #1549 OPEN/Refs로 유지한다.

## Tech Debt Resolved
- 다중 팀 운영자의 참가 명단에 사람에게 읽히는 대상 문맥이 빠진 부분을 기존 조회 결과로 보강한다.

## Security Notes
이름 표시만 추가한다. API/권한/저장 gate를 변경하지 않고 새 요청·서버 데이터 쓰기·QA179·완료 결과 변경0회다. 환경 파일·자격증명을 읽거나 공개하지 않는다.

## Risks & Dependencies
- 실제 alpha before7장은 commit `6e06b8a4f2e63e543f01e049e344e69d6d8d4623`, `docs/qa/2026-10-02-roster-team-context/`. CSS C402×606/787×505/1180×757,B402×606. 작업UTC2026-10-02 17:26:14.226–17:34:45.769. 모바일JPEG402×605.
- B/C 모바일 본문/이미지는 같은 바이트지만 실제 URL/UTC/Back 기록은 각 등록과 연결된다. 모든 폭이 byte-identical하다고 확대하지 않는다.
- 추가 dialog·선수 입력·서버 저장은 원본 QA에서 미실행. serving SHA·브라우저 버전·실물 기기·스크린리더·전체 console/network는 미확보, after는 승인된 배포 대기.
- 초기 base 날짜 의존 테스트 때문에 PR1548/1550 Web CI가 실패했다. 기존 PR1545가 dev에 병합된 뒤 이 작업 브랜치는 겹치는 WIP 경로가 없음을 확인하고 최신 dev로 FF했다. 해당 수정은 복제하거나 편집하지 않았다. 이번 PR 자신의 exact head CI를 별도로 확인한다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | 이름 출처 | registration 단건 API teamName은 null일 수 있으므로 이미 조회하는 current team detail.name 사용. 권한/추가 API 변경 없음 |
| 2026-10-02 | Codex | UI 접근 | 사용자 고정 요구인 최소 문맥을 기존 기간·상태 카드 두 줄로 보강하며 셸 헤더를 반복하지 않음 |

## Progress Snapshot
- base `be228ba1b6dc92ec7e4222d8f8e4e7e9a8e5e14d`; worktree `/tmp/teameet-issue-1549-20261002`; branch `fix/issue-1549-roster-team-context`.
- 기존 동일 헤더 수정 PR를 최종 검색했고 PR1363/1454/1210/1504 등은 기간·상태·권한/행 표시다. PR1545는 별도 admin 작업이며 날짜 테스트 fix 포함을 확인했다. 신규 문맥과 중복되는 열린 PR는 미발견이다.
- 실제 source registration get은 assertTeamMember와 해당 tournamentId+registrationId를 조회하고 team name join 없이 serialize한다. 팀명은 기존 useV1TeamDetail(registration.teamId)의 name을 쓰며 현재 ID를 대조한다.

- 2026-10-02: 최신 base `d4c7cfd990370f7af7e175849e69db4a9ca9406c`로 FF(기존 own WIP와 dev 변경 교집합0). 원래 base에서 초점4suite121개를 확인: 최초 RED18 중 missing context10 FAIL + 기존 ErrorState 버튼명을 잘못 적은 테스트1 FAIL/7 PASS. 제품 수정 후3기존suite103 PASS와 새17 PASS/1fixture FAIL, 버튼명을 실제 `다시 시도하기`로 고친 새suite18 PASS. 이 내역을 단일121 GREEN 실행으로 오표기하지 않는다.
- 현재 base의 frontend lint(typecheck+pattern), 6aggregate gates, patch Changeset, diff whitespace, touched markers PASS. host12cores/load66.65/60.36/80.97, swap7498.88MB, Node152/browser46; Docker 읽기4s timeout, alphaHEAD200. 사용자 계속 진행 지시에 따라 직렬 최소worker, 전체test/build 재실행 없음.
- 독립 before7/7 bytes/SHA256/Gitblob/raster/픽셀 대조 PASS. proof18,864B/blob38d75d13…; `/tmp/teameet-1549-evidence-agent-w184vja1/{integrity-report.json,independent-review.md}`. C/B402 이미지 byte-identical20,000B이며 두 URL/각 캡처시각의 연결은 proof attribution에 의존한다.
- 실제 alpha after/반응형·키보드·추가dialog·입력·저장·취소/Escape·console/network는 승인된 배포 뒤 재검증 대기. 이슈는 Refs #1549/OPEN, PR Ready/base dev. 정확한 commit/원격 CI/독립 code review는 PR 기록에서 보충한다.
