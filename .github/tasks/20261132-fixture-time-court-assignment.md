# 대진 시간·구장 독립 배정

Status: In Progress
Owner: Codex
Created: 2026-11-12

## Context
리그 + N개 토너먼트에서 시간·구장을 미리 등록하고 각 항목에 경기를 배정한다. 사용자가 로컬 A안 목업을 검수하고 실제 구현·PR을 요청했다.

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
새 시간 목록 테이블은 additive migration. 실제 일정은 기존 V1TeamMatch.startAt/fieldId/장소가 정본. 시간 preset 수정이 기존 경기를 자동 변경하지 않는다. 새 항목 등록만 제공하고 일괄 이동·삭제는 범위 밖. 단계형 대회는 기존 관리 화면 유지.

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
