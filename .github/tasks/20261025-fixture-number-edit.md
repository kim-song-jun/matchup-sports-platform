# 대진 번호 수정

Status: Complete
**Owner**: Codex (단일 실행)
**Created**: 2026-10-05

## Context
사용자가 기존에 생성한 대진 번호도 수정할 수 있도록 요청했다. 현재 PATCH /admin/fixtures/:id의 UpdateFixtureDto와 수정 모달에는 번호 필드가 없다. 번호는 V1TournamentMatchDetails의 기존 필드이며 대회/round/number/leg 유일성이 있다.

## Goal
관리자가 대진 번호를 수정하고 관리자·공개 대진표에서 저장된 새 번호를 확인한다. 경기 ID·팀·진출 관계·결과를 유지한다.

## Original Conditions
- [x] 1..2147483647 정수만 저장, 생략은 기존 번호 유지.
- [x] 같은 대회/round/leg의 다른 경기 번호와 충돌하면409 및 명확한 사유, 부분 저장0.
- [x] 연결과 결과는 UUID 기준으로 유지하며 번호만 바꿔도 기존 관계가 끊기지 않음.
- [x] 기존 번호를 변경한 후 빈 옛 번호로 새 경기를 만들면 이전 경기가 replay되지 않음.
- [x] 기존 관리자 권한 및 팀 변경 결과잠금 유지.

## User Scenarios
운영자 → 선택된 수정 방식에서 현재 번호 확인 → 새 번호 입력 → 저장 → 새 번호 표시. 중복/빈값/0/소수는 실제 오류를 보여주고 수정 상태 보존.

## Test Scenarios
- [x] DTO: 실제 whitelist/forbidNonWhitelisted 옵션에서 번호 입력 허용, null/0/소수/범위초과 거절.
- [x] 서비스/정본 updater: 저장·응답·감사, 중복거절, 생략/동일값 유지, Game→Details→TeamMatch 잠금 유지.
- [x] 번호 변경 시 TeamMatch/팀 일정 title 동기화 및 출전정지 순서에 따른 관련 팀 후속 재계산.
- [x] 번호 이동 후 옛 좌표 생성에 새 immutable creation generation, 기존 멱등 기록 보존.
- [x] 프론트 실제 클릭: 번호 hydrate/유효성/저장 성공 뒤 목록 반영, 서버중복 오류에서 모달 보존.
- [x] Alpha 관리자 실제 로그인·3폭 before/after·console/network 확인. 기존 대회 데이터 mutation0.

## Parallel Work Breakdown
병렬 에이전트 없음. 순차: API/정본 저장 → 사용자가 선택한 UI → 타입·mock·문서 → 검증 → dev/Alpha.
Owned: apps/v1_api/src/tournaments/dto/admin-bracket.dto.ts/.spec.ts, tournament-bracket.service.ts/.spec.ts, tournament-match-update.ts/.spec.ts, 필요한 creation generation helper/test, test/tournaments/tournament-round12-quarter.integration-spec.ts; apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx/.test.tsx, types/api.ts, 필요한 hook/mock scoped 변경; docs/api/README.md, global-contract.md, domains/tournaments.md, 이 문서, scoped changeset.
Forbidden: schema/migration, 다른 WIP, 기존 실제대회 번호/팀/결과 변경, main 배포.

## Acceptance Criteria
- [x] A·B·C 제시 → 사용자 A 선택(기존 경기 수정 모달) 확인.
- [x] 새 번호가 실제 저장 계약과 일치하고 연결/결과 유지.
- [x] 좁은 RED→GREEN, committed diff/typecheck, 실제 Alpha 검증.
- [x] dev 머지 및 alpha 배포. 실제 관리자 로그인 화면 검증 완료.

## Tech Debt Resolved
create에서만 받는 번호를 update 계약으로 연결. 기존 생성 멱등키가 좌표 기반이므로 번호 이동으로 빈 옛 좌표를 재사용할 때 이전 게임을 잘못 replay하지 않도록 세대 관리.

## Security Notes
mutation admin와 기존 서비스 권한을 유지. DB migration 없음. 번호 충돌은 transaction과 기존 유일성으로 보호. .env/인증 쿠키/storageState 읽지 않음, alpha 임의 신원 주입 없음.

## Risks & Dependencies
번호는 표시·정렬 메타데이터이지만 동일 시각 경기의 출전정지 순서에도 쓰이므로 후속 명단 재계산 필요. 제목은 대회/조/round/leg 정본으로 다시 조합하고 팀 일정 제목만 변경하며 상태를 복원하지 않음. 번호만 변경할 때 결과를 삭제하지 않음.

## Ambiguity Log
- UI A 기존 경기 수정 모달 필드(추천), B 번호 전용 버튼/모달, C 조별 일괄 화면을 제시했으며 사용자가 A를 선택함. CLAUDE.md:330의 UI 착수 규칙에 따라 선택 전에 UI 구현하지 않음.
- 범위는 대진 경기번호(fixtureNumber)이며 선수 등번호/부전승 위치가 아님.

## Progress Snapshot
- 기준 origin/dev ed0a4e85a, fetch 직후 격리 /tmp/teameet-fixture-number-edit, branch feat/fixture-number-edit.
- backend/frontend/docs 변경, 기존 field 재사용으로 schema/migration 불필요. 서비스 updater는 Game→Details→TeamMatch 잠금과 league-fixture-generation advisory lock을 사용.
- 기존 같은phase 부전승과 진출은 UUID/registrationId를 사용해 번호 추정으로 선을 만들지 않음.

- Backend RED: 번호 입력 whitelist 실패, updater가 새 번호를 무시·중복을 허용하는 3개 실제 실패 확인(19개 중3실패).
- Frontend RED: 기존 모달에 번호 label이 없어 신규6개 실패. GREEN: bracket-tab 전체21개 통과, frontend tsc 및 패턴 검사 통과.
- Backend GREEN: DTO/updater/creation generation/대진 서비스4suite110개 통과. 로컬 공유 Prisma client가 이전 bye 스키마여서 격리 임시 schema/output으로 실제 현재 Prisma client를 생성해 의존 링크만 교체함. 원본 스키마·공유 의존성 변경 없음.
- Creation generation 조회는 actorUserId로 범위를 제한해 기존 멱등 복합 인덱스를 활용한다. 최종 해당 경로 회귀6개와 API tsc/surface 검사 통과.
- 실제 alpha QA 브라우저 PID12180 / parent33892 열림. 직접 로그인 요청 상태, 인증정보/쿠키 읽거나 저장하지 않음. 기존 실제대회 데이터 mutation0. 화면 갤러리는 dev 머지·alpha 배포 뒤 수행(정책상 로컬 서버 검증 안 함).
- 적대 검증: DTO strict 숫자/null/범위, tournament/round/leg 유일성·원자적 rollback, 동일 번호 no-op, Game→Details→TeamMatch 잠금, UUID edge/결과 유지, 일정 취소 상태 보존, 명단 재계산, 생성 키 세대·오류 전파, 모바일 모달 스크롤 정적 점검. 발견된 creation query의 전역 조회 범위를 actor로 줄임.
- touched paths TODO/FIXME/HACK/XXX 신규 marker0, diff check 통과. DB 통합 테스트는 로컬 Docker/DB가 없어 NOT RUN; CI/실제 alpha 범위를 별도 기록한다.
- API 정본 문서의 생성 Game source가 TOURNAMENT_FIXTURE로 남은 drift도 실제 TEAM_MATCH 계약으로 동기화. README/global-contract에서 번호 수정 도메인 계약으로 연결함.
- Unit 검증과 별개로 실제 Postgres에서 번호 저장·중복 시 장소 rollback·공개 재조회·일정 title·진출 UUID 유지·옛 좌표 신규 Game 생성 및 재시도를 검증하는 기존 integration suite 케이스 추가. 로컬 DB 부재로 실행 증거는 CI에 남긴다. 임시 fixture는 이 테스트 DB 안에서만 생성/삭제한다.
- PR 최신 backend 계약 SHA3d32c72e 기준 CI37310340763 Gates/API/Web SUCCESS. 실제 Postgres integration122suite839passed(3skipped), API unit339suite4595passed. 새 tournament-round12-quarter suite PASS 로그 확인.
- Copilot 요청은 실제 실패: GitHub Advanced Security37310346316 로그의 SessionModelError/monthly quota/402 quota. clean review가 도착한 것으로 표시하지 않는다. 직접 적대 검토의 권한/DTO/충돌/locking/결과·UUID/일정/명단/생성 세대/캐시9항목에서 blocking finding0.
- 사용자가 직접 로그인 완료. baseline1440/768/390 actual screenshot + console/exception/network 오류0, remote mutation0. 결과 확정된12강2번 경기의 수정 창, 팀 picker 잠금 확인.
- 첫 시각 검사 helper는768에서 숨겨진 모바일 메뉴 dialog를 잘못 골라 FAIL. 경기 수정 aria-labelledby를 기준으로 좁히고 재측정 PASS, 실패 로그 보존. 앱 상태나 오류를 숨기는 retry 없음.
- baseline 모바일에서 긴 팀 chip이 수정 창 오른쪽으로 잘리는 기존 layout defect를 발견. 같은 수정 폼의 팀 입력을 모바일 세로/태블릿 이상 가로로 재배치하고 min-w-0로 폭을 제한. 마지막 이 수정은 CI 재검증 후 alpha에서 확인한다.

## Completion Evidence
- PR [#1619](https://github.com/kim-song-jun/matchup-sports-platform/pull/1619) dev merge b734052aa51c861e6043d51edebbfa841087de87. 최신 feature CI37311986987 및 dev CI37313213758 SUCCESS. Alpha deploy37313213711 SUCCESS; 실제 document x-teameet-commit 동일 SHA.
- 운영자 persona: 사용자 직접 로그인한 headed Chromium에서 기존 결과 확정12강2번 경기 수정 창 검증. 1440×900 / 768×900 / 390×844 모두 PASS, mobile 긴 팀명 잘림 해결.
- 현재 번호2 hydrate, 결과잠금 팀 picker 비활성 유지·번호 입력 활성, 0 저장 클릭은 실제 오류 toast·모달 보존 및 API mutation0, 임시7 입력 후 취소·재열기2 유지, Tab 번호 focus·Escape close PASS.
- Before baseline04654d2974599c9da53656193ca001f18ab0797e, after b734052aa. [갤러리와 전체 측정](../../docs/visual-qa/fixture-number-edit/2026-10-05/README.md). 각 before/after 측정 구간 console/runtime/http 오류0, 기존 대회 write0.
- 장시간 열린 QA 세션의 전체 로그에는 로그인 전 auth401 및 alpha 재배포 중 socket.io500/503·client-error503·pending-count503이 있었다. 배포 완료 뒤 실제 after 측정 구간에는 발생하지 않음. 세션 전체를 오류0으로 보고하지 않는다.
- QA helper 첫 시도의 hidden mobile menu 선택 오류는 측정 selector를 실제 경기 수정 제목으로 좁혀 수정한 후 재검증. baseline 모바일 overflow는 알려진 기존 UI 결함으로 명시, after 모든 팀 입력 모달 안에 위치.
- 새 서비스 단위 테스트의 잘못된 FINAL mock을 실제 v1 Game 상태 ENDED·TeamMatch completed·동일 OFFICIAL revision으로 보정. 해당 계약 좁은 재검증1 PASS(84 unrelated skipped); 런타임 앱 코드 변경 없음.
- Cleanup: 전용 browser PID12180 / Node parent33892를 소유 세션 close로 종료. 각 inspector는 CDP detach·client 종료. 인증정보/쿠키/storageState export 없음.
- Copilot 자동 리뷰는 monthly quota HTTP402로 실패. 직접 Codex 정적/적대 검토 blocking0 및 실제 CI 증거를 기록하며 Copilot clean review로 대체하지 않음.
