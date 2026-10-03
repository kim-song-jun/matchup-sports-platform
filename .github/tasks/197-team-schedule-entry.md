# Task 197: 소속 팀 상세의 모바일·태블릿 일정 진입 (#1546)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
실제 alpha402/787px에서 일정 anchor는 raw DOM1개지만 desktop 조상의 display:none 때문에 rect0/visible false/AX 없음/Tab skip이다.1180px에서는 실제 클릭이 정상이다. 목적지/API 권한 문제가 아니라 상세의 반응형 진입 누락이다.

## Goal
기존 팀 기록 링크 카드 패턴으로 모바일·태블릿 일정 진입을 제공하고 desktop 및 기존 역할·관리·채팅 동선을 유지한다.

## Original Conditions (must all be satisfied)
- [x] fetch 직후 origin/dev의 독립 worktree/브랜치, 다른 미병합 PR를 섞지 않는다.
- [x] 소속 팀의 mobile/tablet 블록에 현재 팀 일정 링크를 제공한다.
- [x] desktop 기존 일정 목적지와 owner/manager/member 노출, 비소속 비노출·관리/채팅을 유지한다.
- [ ] 초점 RED→GREEN·keyboard·lint·필수 검사·명시 pathspec·Ready/base dev PR·exact head CI/독립 리뷰를 기록한다.
- [x] 공개 actual before3장과 DOM 정정 proof, 승인된 배포 대기 after/전체 AC를 구분하고 이슈를 Refs/OPEN으로 유지한다.

## User Scenarios
- 소속 팀원이 상세의 팀 기록·받은 후기 다음에서 일정 링크를 발견하고 현재 팀의 일정으로 이동한다.
- 키보드로 받은 후기 다음의 일정 링크에 접근하고 Enter로 활성화한다.
- 비소속/신청 대기/가입 닫힘에는 기존 소속 회원용 일정 진입을 노출하지 않는다.

## Test Scenarios
### Happy path
- [x] 실제 detail client→role model→desktop/mobile view의 현재 팀 일정 href와 기존관리·채팅.
### Edge cases
- [x] owner/manager/member, 비소속3mode 및 기록/후기/일정/기본 정보의 DOM 순서.
### Error paths
- [x] 기존 상세 로딩·오류·인증 seed·가입 실패 테스트 회귀.
### Mock data updates needed
- schema/API 변경 없음. 기존 actual client test의 경계 fixture로 역할만 설정한다.

## Parallel Work Breakdown
### Frontend
- [x] 사용자 고정 최소 요구를 기존 TeamRecordLinkCard 재사용으로 구현한다. 새 레이아웃/컨트롤/스타일 선택을 만들지 않는다.
### Read-only evidence
- [x] 독립 담당자가 fixed commit의 원본9장+proof 중 이슈3장·DOM/AX/Tab attribution과 v1 계약을 대조한다.
### Sequential
- [ ] 초점·관련client/page·lint·6gates·Changeset·4pathspec commit/push·Ready PR·exact head CI/실제 리뷰.
- [ ] 승인된 alpha 배포 뒤402→787→1180 visible/AX/Tab·실제 클릭·관리/채팅·scroll/focus 및 console/network/after 재검증.
### Owned / Forbidden files
- Owned: `apps/v1_web/src/components/teams/teams-page.tsx`, `teams-client.test.tsx`, 이 문서, `.changeset/team-schedule-entry.md`.
- Forbidden: shared styles/shell/hooks/types/API/DTO/schema, 다른 worktree/PR, 실제 팀·가입/명단/공식 결과/배포.

## Acceptance Criteria
- [x] 기존 문구·현재 teamId href를 mobile 블록의 공용 카드로 제공하고 기존 desktop 링크 및 mobile 기록 묶음 gap을 유지한다.
- [x] existing mode=mine 소속 조건만 유지하며 관리 권한으로 목록 조회를 좁히지 않는다.
- [x] 실제 client 역할 및 DOM/Tab/Enter 계약을 증명하고 JSDOM을 alpha pixel/AX/3폭 실측 PASS로 표현하지 않는다.
- [ ] committed tree/정확 head 원격검사와 잔여 alpha 범위를 PR에 기록한다.

## Tech Debt Resolved
mobile의 빠진 일정 진입은 기존 공용 링크 카드로 보강한다. desktop 클래스 교체로 기존 margin이 바뀌지 않도록 기존 링크 마크업은 유지한다.

## Security Notes
현재 mode=mine 노출과 서버 member 권한 gate를 유지한다. API/저장/가입 상태/QA179/완료 결과 변경0회, 환경 파일/비밀정보를 읽거나 공개하지 않는다.

## Risks & Dependencies
- 실제 before commit `f36abbb8838ae865b782698c0bd91910fe78fd24`, `docs/qa/2026-10-02-calendar-readonly`; 사진 UTC2026-10-02 11:00:02.643/29.454/55.058, 정정 DOM11:13:39.864/11:14:11.592/11:14:42.704.
- mobile402×606(JPEG402×605), tablet787×505, desktop1180×757. desktop direct AX=null을 PASS로 보간하지 않는다.
- serving SHA/브라우저 버전/실물 기기/스크린리더·전체keyboard·다른팀/역할 및 create/edit/delete/참석은 before에서 미검증. after 승인 배포 대기.
- #1547 빈 날짜 copy/#1456 날짜그룹화/PR1462 상대팀/PR1484 일정 상세 링크 높이는 별도 범위다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | DOM 누락 여부 | raw anchor1개는 유지되지만 숨겨진 desktop 조상 때문에 mobile/tablet 접근 불가. 실제 view의 mobile 블록 보강 |
| 2026-10-02 | Codex | 역할 | existing client owner/manager/member→mine, API member 조회 gate 그대로. 관리 권한으로 좁히지 않음 |

## Progress Snapshot
- base `d4c7cfd990370f7af7e175849e69db4a9ca9406c`; worktree `/tmp/teameet-issue-1546-20261002`; branch `fix/issue-1546-team-schedule-entry`.
- 열린 PR 검색/최신 일정 PR 검색으로 같은 누락 미발견. 최신 dev는 기존 PR1545 날짜 테스트 fix를 포함하며 그 코드를 복제·수정하지 않는다.

- 新7 tests RED4FAIL/3비소속PASS. 제품 mobile 카드 보강 후 기존147 PASS/새4PASS·잘못 적은 기본 정보 제목3FAIL; 실제 `팀 개요`를 참조하도록 test fixture assertion을 바로잡아 새7 PASS. 관련2suite154개 계약을 확인했으며 단일154 GREEN 실행으로 표현하지 않는다. desktop class 교체가 기존 margin24px을 적용하는 점을 발견해 그 교체는 되돌리고 기존 desktop 마크업을 유지했다. 최종 제품은 mobile7줄 추가뿐이다.
- lint(typecheck+pattern),6aggregate gates,patch Changeset,diff whitespace,markers PASS. host12cores/load49.38/50.86/65.28,swap6462.88MB/Node177/browser33; alphaHEAD200,Docker직전읽기4s timeout. 사용자 지시에 따라 직렬 최소worker·전체suite/build 중복 실행 없음.
- before9/9 SHA/bytes/Gitblob/raster·pixel 대조 및 해당3장 URL 매핑 PASS. proof31,316B/SHA ea15cda0…/blob7832dbde…; `/tmp/teameet-1546-1547-evidence-agent-fmrtfytt` artifacts. photo와 보정DOM은 별도 UTC 관측이다.
- 정확한 commit/원격 CI·독립 리뷰는 PR 기록에 보충한다. actual alpha3폭 visible/AX/Tab/클릭·관리/채팅·scroll/focus·after는 승인된 배포 뒤 대기. #1546 OPEN/Refs, Ready/base dev. 실제 데이터/가입/QA179/완료 결과 변경0회.
