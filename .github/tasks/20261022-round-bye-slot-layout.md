# 라운드별 부전승 입력과 대진 위치

Status: Implementation Ready — Alpha QA Pending
**Owner**: Codex, 단일 실행
**Created**: 2026-10-05

## Context
사용자는 대진 추가에서 팀 하나만 선택해 라운드별 부전승을 등록하고, 제공한12강 이미지처럼 부전승이 연결된 경기 사이에 배치되도록 요청했다.

## Goal
12강·8강·4강의 부전승 단건 입력·저장과 라운드별 대진 노드 배치를 구현한다.

## Original Conditions
- [x] 라운드 → 일반경기/부전승 → 팀선택 → 추가.
- [x] 부전승에 홈/어웨이와 가짜경기·점수 불필요.
- [x] 12강 부전승을 아래에 묶지 않고 경기 사이에 표시.

## User Scenarios
운영자가12강 부전승팀 하나와 대진표 위치를 저장한다. 8강 홈 또는 어웨이에 그팀을 배정하면 선이 해당자리로 연결된다. 8강·4강에서도 같은 방식으로 처리한다.

## Test Scenarios
- [ ] 서비스: 관리자권한, 확정등록, phase·정원, 경기배정충돌, 기존배정변환, audit·원자성.
- [ ] 그래프: 이미지와같은bye/경기 혼합순서, 연결된상위경기중앙,8강·4강bye, 미정은bye아님.
- [ ] 폼: 단일팀·라운드·위치 실제payload, 일반경기유지, 오류시입력유지.
- [ ] alpha 화면·console/network·viewport별 검증. 배포/로그인 없으면 미확인 기록.

## Parallel Work Breakdown
병렬화 없음. API·계약 → 폼 → 그래프 → 좁은검증 → 문서.
Owned: v1 tournament bracket DTO/controller/service/tests, v1 web hooks/types/MSW와 bracket card/graph/render/tests, docs/api tournament 문서, 이task.
Forbidden: 기존 공유작업트리WIP, 환경파일, 프로덕션, 기존alpha데이터.

## Acceptance Criteria
- [ ] 요청한입력과이미지배치 충족.
- [ ] 저장·공개응답·관리자응답 계약일치.
- [ ] 좁은테스트와변경범위타입검사, 로컬/alpha검증구분.

## Tech Debt Resolved
12강으로고정된부전승라벨·가드·그래프 확장. 이전카드overflow잘림수정 함께 반영.

## Security Notes
V1AuthGuard + getMutationAdmin 유지. 대회소속·confirmed 상태·동시성lock·audit를보존. 실제경기생성없이groupTeam에isBye와sortOrder 저장.

## Risks & Dependencies
별도 작업트리 origin/dev ccabd36e8 기준. alpha배포와인증브라우저검증필요.
스키마변경없음. byeteam의sortOrder는 해당라운드 단독대진의0-based표시위치로 사용하며 일반팀seed와 구분.

## Ambiguity Log
사용자는 앞서 제시한 일반/부전승폼과업로드이미지배치를 명시선택해 구현승인했다. 대안선택 재요청없이 고정된안 구현.
결승·3위전·조별리그는 다음진출라운드없음 또는bye의미불일치로 제외.
진출연결이있는자리는 저장된HOME/AWAY순서가우선. 연결전에는명시표시위치로혼합배치,임의승자연결생성없음.

## Progress Snapshot
- 격리작업트리 tmp/worktrees/round-bye-slot-layout, branch feat/round-bye-slot-layout.
- 기존APIgroupTeam.isBye/sortOrder 재사용, 별도byes저장endpoint에서기존일반배정의변환지원.
- 구현 완료, 커밋/push/배포 없음. 로컬 변경만이며 alpha 미반영.
- Backend targeted service: 72 PASS. Frontend graph 7 / renderer 10 / bracket tab 12 / group card 6 PASS (총 107). 폼 기본 위치 추천과 저장 후 입력 초기화 추가 후 해당 6개 최종 PASS.
- API tsc PASS, web tsc PASS. 첫 검증은 공유 의존성의 Prisma 클라이언트가 오래되고 persist 패키지가 누락돼 막혔으며, 공유 파일을 변경하지 않고 tmp/qa의 최신 생성 클라이언트·lockfile 버전 패키지로 해결.
- byes는 자동 진출 배정하지 않는다. round12의 기본 위치는 1·4·5·8에서 아직 비어 있는 자리이며 운영자가 수정 가능.
- alpha 수동 QA: 새 코드 배포 없음, 앞선 headed alpha admin 세션 인증되지 않음. 1440/768/390 스크린샷·console/network·UI 실제 저장 검증은 모두 NOT RUN. QA 완료나 PR-ready 주장하지 않음. 테스트 프로세스 종료, 로컬 웹 서버/브라우저 실행 없음.
- MSW에는 기존 bracket 그룹/fixture handler가 없으며 새 가짜 성공 handler를 추가하지 않음. 저장은 실제 API hook 경로이고 폼·서비스 테스트는 명시 inline mock 사용.
- 새 TODO/FIXME/HACK/XXX 없음. 기존 공유 작업트리 WIP 및 alpha 대회 데이터 변경 없음.

- API surface-check PASS / web pattern-check PASS. git diff --check PASS. 신규 import 대상 tournament-bracket-rounds.ts는 현재 명시된 untracked 소스이며 커밋 시 포함 필요. 커밋되지 않은 작업트리 기준 검증이므로 committed-tree/PR 검증은 미실행.
