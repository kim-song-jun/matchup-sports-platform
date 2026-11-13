# 대진 시간·구장 독립 배정

Status: In Progress
Owner: Codex
Created: 2026-11-12

## Context
리그 + N개 토너먼트에서 시간·구장을 미리 등록하고 각 항목에 경기를 배정한다. 사용자가 로컬 A안 목업을 검수하고 실제 구현·PR을 요청했다.

## 2026-11-13 후속 — 등록 항목 수정

- Scope: backend + frontend + docs. 브랜치 `feat/edit-assignment-options-20261113`, base `974ac541b7a2`. 기존 1.19.1 고정 승격 후보에 자동 포함하지 않는다.
- 사용자 선택: A 항목 안에서 수정. B 별도 창/C 목록 관리 화면과 장단점·규모 비교 후 명시 선택 받음.
- 시간 항목의 기존 시각 → 새 시각 변경은 같은 항목에 배정된 경기에도 원자적으로 반영한다. 구장·팀·경기 길이·팀 일정 정본을 보존한다. 등록 항목 없는 기존 직접 입력 시각도 지원한다.
- 등록 구장 이름 변경은 기존 fieldId와 주소·좌표·시간을 보존하고 연결된 경기의 이름도 동기화한다. 구장 관리 권한과 expectedVersion/멱등 계약을 유지한다. 등록되지 않은 레거시 직접 입력 장소는 기존 개별 경기 편집 경로를 유지한다.
- 시간 이동에 시작/종료된 경기가 섞이면 전체 거부한다. 중복 시간/구장 이름과 stale source/version은 실제 오류를 보여주며 부분 성공·자동 합치기를 하지 않는다.
- UI: 항목 제목의 접기와 별도 수정 버튼, label/input + 저장/취소, 반영 경기 수 안내, 저장 중 중복 조작 차단, 실패 시 입력 유지. shared Button/tm-input과 기존 BottomSheet/aside 재사용.
- Owned: scheduling controller/DTO/service/tests, 내부 schedule-order helper 및 회귀, field DTO/service/tests, Web hooks/types/panel/tests/MSW, API/scenario/task 문서, Changeset. Forbidden: schema/migration/seed, 팀·결과·진출 정책, 운영 main, 기존 고정 릴리스 문서/lock, 타 세션 WIP.
- 순차 Phase 1 계약·기획 [x] → Phase 2 API/데이터 [x] → Phase 3 훅/UI [x] → Phase 4 좁은 검증/리뷰 [ ] → Phase 5 dev PR/CI/Alpha QA/정리 [ ]. 에이전트 병렬화 없음.
- Acceptance: [x] A/B/C → A 선택; [ ] 실제 저장·배정 경기 동기화; [ ] 권한/중복/stale/상태/단계 순서/rollback 회귀; [ ] 390/768/1440 before/after 및 오류/console/network; [ ] API·fixture/MSW 문서 sync; [ ] committed diff 확인.
- DB impact: V1TournamentScheduleTime, V1TournamentField, V1TeamMatch와 기존 일정 정본. 현재 schema 그대로 사용하며 migration 불필요.
- Security: 시간은 기존 대회 총괄 mutation 권한, 구장 이름은 기존 platform ops 관리 권한. 인증/감사/동시 수정 방어 유지. 이전 PR별 리뷰/QA 예외를 새 PR에 자동 확대하지 않는다.
- Progress Snapshot: 최신 dev fetch 후 전용 worktree 생성, 실제 canonical match update/schedule helper와 field CRUD 확인. UI A 승인, 구현 시작. 기존 #2348 핵심 Alpha QA 근거는 PR #2356 댓글 6845422443 및 QA evidence 브랜치에 있으며, 이 후속 변경의 after 근거는 별도 수집한다.
- 2026-11-13 구현 cursor: API 항목 PATCH/기존 field CAS+명시 동기화, A안 inline 편집/실패 입력 보존/외부 변경 draft 보호/키보드 focus 구현. 좁은 API 50 PASS, Web 기존+새 흐름 12 PASS와 정밀 시각·접근성 추가 2 PASS. API 타입 PASS. Web 타입에서 테스트 ByRole 옵션 오류 7건 발견 후 수정, 최신 좁은 회귀/타입/정책을 직렬 확인 중. 실제 DB 원자성 spec 추가(로컬 Docker 미가동, CI 필요). 자체 의존성은 lockfile대로 worktree에만 설치, shared client/의존성 유지.
- 원격 drift: 작업 도중 dev a346b246c(#2361), main 6675a8a00(#2362 별도 핫픽스) 확인. 새 dev 경로 5개는 이번 변경과 겹치지 않음. 검증·내 파일 커밋 뒤 최신 origin/dev를 이 브랜치에 merge해 통합하고 새 PR CI를 기준으로 확인한다. 기존 1.19.1 후보의 scope lock/운영 승격에는 손대지 않는다.

## Goal
실제 대진 화면에서 시간·구장 독립 배정과 항목별 접기/펼치기를 기존 경기 데이터에 연결해 dev 대상 PR을 제공한다.

## Original Conditions
- [x] 시간 배정/구장 배정 독립 버튼과 패널.
- [x] 항목 제목을 접으면 하위 경기·선택란이 숨겨지고 배정 수 유지.
- [x] 시간 수정/해제는 장소·fieldId 보존, 장소 수정/해제는 scheduledAt 보존.
- [x] 기존 수동 입력 유지, 기존 입력값·목록·그림·새 패널은 동일 canonical 경기 데이터를 참조.
- [x] 미배정 시간 목록도 서버 저장. 구장은 기존 등록 필드와 장소 경로 재사용.
- [x] API 실패·권한 오류 노출. 실제 저장 전 성공 처리 금지.

## User Scenarios
시간 여러 개 등록 → 경기 배정 → 구장 등록/배정 → 경기 편집에서 수동 변경 → 패널·목록·그림에서 같은 값 확인 → 시간/구장 각각 해제 → 항목 접기/펼치기.

## Test Scenarios
Happy: 시간 등록/재시도 멱등, 기존 일정 통합, 시간/구장 독립 PATCH, 직접 입력 후 갱신, 접힘 보존.
Edge/error: 중복 시간, 잘못된 날짜, 타 대회·support·철회 권한, 서버 4xx/5xx, 최신 조회 실패, 장소 스냅샷 보존, 모바일 접근.
Mock updates: 시간 목록 MSW와 컴포넌트 fixture, Prisma 새 모델 generate.

## Parallel Work Breakdown
에이전트 병렬화 없음. API/DB → hooks/model → panel/editor/page → tests/review → docs/PR 순차.
Owned: tournaments/scheduling 새 모듈, Prisma 추가 모델·migration, Web 배정 관련 새 컴포넌트·hooks·model, bracket page, fixture metadata editor, API/scenario/task 문서와 changeset.
Forbidden: 결과·팀·진출 연결·순위·운영 승격·기존 공유 WIP.

## Acceptance Criteria
- [x] A/B/C 제시 → 사용자 A안 및 항목별 접기 확정.
- [x] 원본 조건 및 API259/Web33 좁은 회귀·양쪽 타입/규칙 검사 통과.
- [x] diff/새 debt marker/커밋 트리 확인.
- [ ] dev 대상 PR 및 CI/리뷰 상태 기록.
- [ ] alpha 390/768/1440 화면 증거 (머지·배포 후, 자격증명 필요).

## Tech Debt Resolved
일정 복사본을 만들지 않는다. 수동 편집의 pristine 장소 hydrate 누락을 관련 변경에서 보완한다.

## Security Notes
시간 목록도 활성 관리자/해당 대회 총괄 범위를 서버에서 검증한다. support는 읽기만, 필드 등록은 기존 플랫폼 운영 권한 유지. 경기 배정은 기존 PATCH의 권한·상태·필드 검사를 사용한다. 입력 DTO 검증, 등록 감사 로그.

## Risks & Dependencies
새 시간 목록 테이블은 additive migration. 실제 일정은 기존 V1TeamMatch.startAt/fieldId/장소가 정본. 최초 구현은 새 항목 등록만 제공했다. 2026-11-13 후속 PATCH는 시간 항목과 배정 경기를 함께 이동하며 구장 이름 동기화를 명시 옵션으로 추가한다. 삭제는 범위 밖이며 단계형 대회는 기존 관리 화면을 유지한다.

## Ambiguity Log
승인된 최종안: 별도 시간/구장 버튼, 각 항목별 접기/펼치기. 잘못 추가했던 시간별/구장별 보기 토글은 포함하지 않음. 같은 시간에 여러 경기 허용하되 동일 구장 중복은 경고. 실제 구장 등록 권한은 기존 서버 정책 유지.

## Progress Snapshot
최신 origin/dev 4a53b95b1 격리 worktree. 구현 및 API259/Web33 회귀 통과. 양쪽 tsc와 API surface/Web pattern PASS. Prisma from-empty 생성 SQL의 새 테이블·unique·FK가 migration과 일치함을 확인했다(실제 replay 아님). 로컬 Docker CLI/Windows daemon이 미가동이라 PostgreSQL integration은 실행하지 못했고 CI용 동시성/권한/cascade 통합 spec을 추가했다. 변경 경로 debt marker 없음, diff check PASS. PR 제출 단계. alpha 기능0/8·3폭0/3, console/network는 미검증이며 관리자 로그인·머지·배포 필요. 로컬 목업의 screenshot을 실제 서비스 완료 증거로 사용하지 않는다.

## PR #2348 마무리 (2026-11-12)
- Phase 1 — 완료: 원격 PR/CI 확인 및 격리 worktree `/tmp/teameet-pr2348` 생성. 기준 dev `4a53b95b12`, 최초 head `b79eade6f9`. 공유 작업 트리 변경은 보존.
- Phase 2 — 완료: API 실패는 `SOURCE_SNAPSHOT_DRIFT`, Gates 실패는 final schema binding 4건. 새 additive 시간 테이블의 SHA256 `5c1f131cad5acefe13408405bdd222141cfaffdcf53de6a1599ed6a7008baf7d`를 Docker 클라이언트 증명/manifest writer·validator/source binder/game fixture에 동기화. 기존 릴리스 허용 해시는 유지.
- Phase 3 — 진행: CI·Copilot 최신 head 검토 후 dev 머지. alpha 실제 로그인 및 3폭 갤러리는 자격증명 대기.
- 좁은 검증: final binding RED 4실패 → GREEN 9/9; manifest self-test, production deploy security, DB guardrails, API build boundary PASS. API 시간 목록·source snapshot 15/15, Web 배정/편집 회귀 15/15 PASS. API/Web tsc PASS, surface/pattern 검사 PASS(하위 셸의 sandbox 제한 때문에 규칙 검사만 승격 실행).
- 최초 CI는 새 시간 목록 PostgreSQL integration을 포함해 205 suite/1561 case 통과했으며 유일한 API 실패가 schema snapshot이었다. 실제 통합/마이그레이션 최종 판정은 수정 head의 CI에서 확인한다.
- 모바일 보정: 새 패널에 기존 BottomSheet 손잡이가 없어 본문 pointerdown을 드래그로 잡고 CSS가 `touch-action:none`이 됨. 공통 손잡이를 연결. 실제 컴포넌트 회귀 RED 1실패 → GREEN 5/5(본문 capture 없음·summary 접기·dialog 유지). alpha 시각 검증과 구별되는 단위 근거.
- 통합 갱신: 첫 수정 head `efeacd317`의 CI 43229169805는 API/Gates/Web 모두 PASS(API integration 206 suite/1562 PASS + 3 skip, API unit 547 suite/9010 PASS, Web 982 files PASS). 직후 dev에 #2350(`13c70d7db`)이 머지되어 공통 MSW import와 API 문서 append 2곳을 양쪽 보존으로 해결했다. Prisma schema에는 동시 변경 없음. 새 merge head의 CI 재확인 필요.
- Copilot 차단 확정: 공식 `POST /repos/kim-song-jun/matchup-sports-platform/pulls/2348/copilot-code-review`가 HTTP 422 `ACTOR_INELIGIBLE`(연결 계정 라이선스 또는 조직 정책상 코드 리뷰 불가)을 반환했다. reviewer 요청의 HTTP 성공은 실제 실행이 아니었다. 최신 리뷰 0/스레드 0이며 clean으로 대체하지 않음. 이 PR에 대한 사용자 예외 지시 없이는 머지 보류.
- 최신 통합 로컬 회귀: 배정 패널·회원 대진 미리보기 버튼·공개 소스 계약 12/12 PASS. 관리자 owner 실제 UI 로그인 및 alpha 변경 전 390/768/1440 캡처 PASS(가로 넘침/console/API 오류 없음), 브라우저 종료 확인. 기존 대회 데이터 변경 없음. 캡처는 /tmp/pr2348-alpha/, 계정/세션은 저장하지 않았다.

- 2026-11-13 검증 cursor: API 3 suites/53 tests PASS, Web inline 편집 HTTP 계약 14 tests PASS. preset UUID와 legacy 경기 ID 목록을 편집 시작 시 고정해 동일 시각에 재생성된 다른 항목을 수정하지 않도록 ABA 회귀 추가. API/Web 최종 타입 검사 모두 PASS, API surface 규칙 PASS. 실제 PostgreSQL rollback/일정 동기화 spec은 Docker 미가동으로 CI에서 실행한다. check-api-contract-tree는 Task127의 별도 frozen plan 검증기이며 이 기능의 실행 계약이 아니므로 해당 명령의 인자 누락을 기능 실패로 집계하지 않는다. API 문서는 실제 controller/DTO/service/hooks와 교차 확인했다.

- PR cursor: dev 대상 #2364, head ef407d929156e8c820b2545da77d003757a59fb5. 최신 dev bc1d92475를 충돌 없이 통합했고 diff는 이번 소유 25개 파일뿐이다. API/Web 타입 및 두 패턴 검사 PASS. Copilot 전용 API는 422 ACTOR_INELIGIBLE, 새 PR 한정 사용자 예외 답변 대기. Alpha 테스트 생성·수정·취소/숨김도 구체 범위로 승인 요청했고 미응답이므로 아직 실행하지 않았다. CI 43385977285 진행 중. 접은 편집 항목을 다시 수정할 때 draft/포커스 복원 회귀 1 PASS 보완 후 최신 head CI로 재검증한다.
