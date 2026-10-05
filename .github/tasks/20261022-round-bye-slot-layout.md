# 라운드별 부전승 입력과 대진 위치

Status: In Progress — TBD Bye / Pre-start Delete Follow-up
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

## Alpha deployment — 2026-10-05

- 사용자 alpha 배포 명시 승인. PR #1612, base dev, 최초 구현 09179e515. 원격 API/Web/Gates 전체 PASS.
- 배포 전 headed 공개 대진표 baseline: tmp/qa-round-bye-deploy/before-{1440,768,390}.png. 세 viewport 문서 폭 정상. 기존 부전승 명단 순번 10·11이 아래 배치되는 것을 실제 확인해 읽기 호환 추가. DB 데이터 수정 없음.
- 호환 보완: 그래프·폼 14 PASS, 부전승 서비스 8 PASS. 표시 위치는 12강/8강 1..8, 4강 1..4. 원래 명단 순번이 범위를 벗어나는 기존 bye는 읽기 렌더링에서 경기 사이 배치.
- 로그아웃 공개 접근의 /my-fixtures 401과 console resource error는 baseline에도 존재. 새 pageerror 없음. 브라우저 owned PID/parent 기록 및 종료 완료.
- 최종 원격 검증 후 dev 머지/alpha 배포 및 새 커밋 헤더·health·after 화면 확인 진행 중.

### 첫 배포 및 실제 화면 후속 보완

- #1612 merged dev 47d1e166112d104f8d32ceaad5466528c74151ff. CI/Gates/API/Web 및 Deploy Alpha(37278674143) PASS. API/Web HTTP 200, 동일 커밋 헤더, health db=true, byes 비인증 POST 401.
- after 1440/768/390 확인: 본문 가로 overflow 없음. 공개 실제 groupTeam 두 개는 둘 다 sortOrder=0임을 API로 확인했고 위쪽에 함께 표시됨. 앞선 10·11 예시는 일반 명단 호환 테스트였으며 해당 대회의 실제 값은 아니었음.
- 실제 기본값 중복의 읽기 배치를 이미지 순서로 보완 중. 기존 DB 값 및 팀/경기 배정 유지. 관리자 로그인 저장 검증은 계속 미실행.

- 중복 기본값 호환 최종 로컬 검증: 그래프 9 PASS, frontend tsc PASS, pattern-check PASS. 후속 커밋 dev 반영 후 배포 게이트와 after 화면 재확인 예정.

## Final alpha evidence — 2026-10-05 17:16 KST

- PR #1612와 #1613 dev 머지. 최종 서버 커밋 2e92d8afc1c256fc8d2709c455d247b947b1bbf3, release 1.2.1-alpha.20261005.g2e92d8afc1c2.
- 최종 dev CI 37281104345 SUCCESS, Deploy Alpha 37281104439 SUCCESS. API/Web 모두 HTTP 200 + 동일 X-Teameet-Commit. API health checks.db=true. 신규 byes 비인증 POST는 401로 보호.
- Headed 공개 시나리오: /tournaments/ad120000-0000-4000-8000-000000000001/bracket → 순위 · 대진표. after 1440/768/390 screenshot 확인: 기존 기본값 0 두 부전승이 일반 경기 전후로 나뉨. 본문 가로 overflow 없음. 현재 대회는 두 미정 경기와 두 부전승만 편성돼 있어 완성된 12팀 연결 트리의 실제 데이터 검증은 아님.
- 증거: tmp/qa-round-bye-deploy/before-*.png, first-after-*.png, after-*.png, before/after-evidence.json. 기존 /my-fixtures 401 + resource console error는 로그아웃 baseline과 동일. 새 pageerror 없음.
- Owned headed browser PID/PPID 기록 및 종료 완료. 로컬 웹 서버 실행 없음. 원래 alpha 팀/유저/대회/경기 데이터는 이 배포에서 변경하지 않음.
- 메인 작업트리 dev는 머지마다 FF 동기화 완료. 이전 같은 작업의 카드 overflow 변경은 배포 코드에 포함돼 있고 tmp/qa-round-bye-deploy/local-dev-backup/bracket-group-card.tsx에 원본 백업 보존. 기타 로컬 WIP 유지.
- 배포 완료. 관리자 로그인 후 실제 부전승 저장 클릭 및 완성된 12강 연결 데이터 검증은 인증 상태가 없어 미확인. 이 최종 evidence 갱신은 로컬 문서이며 추가 배포를 만들지 않음.

## TBD bye / pre-start deletion follow-up — 2026-10-05

Status: In Progress
- [x] Phase 1: nullable bye registration and same-slot reassignment, DB check, API/read contract.
- [x] Phase 2: TBD bye form, edit/delete and stable graph identity.
- [x] Phase 3: pre-start fixture soft deletion, preserve Game/audit, block started/results/downstream.
- [ ] Phase 4: focused tests, type/pattern/surface gates, dev PR and alpha deployment.
- User requested round12 4 matches +4 TBD byes; quarter4/semi2/final1/third_place1, teams assigned later. No auto pairing or alpha data edits.
- Owned scope extended to schema/migration, presenters/generator/standings nullable filtering. Existing WIP preserved.

- Implementation: nullable V1TournamentGroupTeam.registrationId with SQL CHECK permitting null only for byes. Persistent byeId allows assigning/clearing a team on the same slot; graph uses slot id and never connects null registrations.
- Pre-start delete: tournament draft/open/closed + Game SCHEDULED + matched TeamMatch, no result. Archive TeamMatch, cancel Game/visibility/schedules, disconnect empty downstream sources, release group and round-number key while retaining append-only history and original fields in audit.
- Focused backend bracket/read tests: 125 PASS; additional delete permission/downstream cases included. Frontend graph 10 + form 7 + tab 12 PASS. API/web type checks and web pattern PASS; API surface gate PASS after documented lock baseline.
- Headed alpha baseline: tmp/qa-round-bye-deploy/tbd-before-{1440,768,390}.png; all document widths equal viewport. Existing /my-fixtures 401 remains; no pageerror. Owned browser PID13944 / parent34652 closed.
- Admin save/delete live QA remains unverified because no authenticated admin browser is available. Docker is not running locally, so real DB migration/write integration is not claimed. No alpha tournament records changed.
Final follow-up: delete-only 12 PASS (83 bracket total including four new cases); read 46 PASS; graph 10/form7/tab12 PASS. Real DB adapter integration added for four null slots, assignment/clear/remove, CHECK rejection, canonical archive and number reuse; remote CI execution pending. Entirely TBD graph columns share a common canvas height without invented edges.
Recreation fix: archived Details round retains originalRound:deleted:id and creation command gains a revision count after deletion, preserving durable idempotency records while allowing original number reuse.

- Renderer 11 PASS. Final API/web type checks and pattern/surface gates PASS. Fresh DB scenarios will run in remote CI; local Docker unavailable.
Final bracket service 83 PASS; read 46 PASS; frontend graph10/form7/tab12/render11 PASS. Total focused contracts 169 PASS. Commit scope contains only this follow-up; no new TODO/FIXME/HACK/XXX markers.
