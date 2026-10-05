# 대진 번호 수정

Status: In Progress
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
- [ ] Alpha 관리자 실제 로그인·3폭 before/after·console/network 확인. 인증 불가 시 미검증을 명시하고 성공으로 대체하지 않음.

## Parallel Work Breakdown
병렬 에이전트 없음. 순차: API/정본 저장 → 사용자가 선택한 UI → 타입·mock·문서 → 검증 → dev/Alpha.
Owned: apps/v1_api/src/tournaments/dto/admin-bracket.dto.ts/.spec.ts, tournament-bracket.service.ts/.spec.ts, tournament-match-update.ts/.spec.ts, 필요한 creation generation helper/test; apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx/.test.tsx, types/api.ts, 필요한 hook/mock scoped 변경; docs/api/README.md, global-contract.md, domains/tournaments.md, 이 문서, scoped changeset.
Forbidden: schema/migration, 다른 WIP, 기존 실제대회 번호/팀/결과 변경, main 배포.

## Acceptance Criteria
- [x] A·B·C 제시 → 사용자 A 선택(기존 경기 수정 모달) 확인.
- [x] 새 번호가 실제 저장 계약과 일치하고 연결/결과 유지.
- [ ] 좁은 RED→GREEN, committed diff/typecheck, 실제 Alpha 검증 또는 정확한 blocker 기록.
- [ ] dev 머지 및 alpha 배포. 관리자 인증 미검증은 분리 보고.

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
