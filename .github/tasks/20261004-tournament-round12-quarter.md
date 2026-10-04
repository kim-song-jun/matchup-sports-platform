# 12강·8강 대진 관리 확장

- Target: v1 backend + frontend + migration; dev → alpha only.
- Base: origin/dev 56581dc7b, isolated worktree `/tmp/teameet-round12`.
- Authorization: 기존 수동 대진 생성/팀 배정 흐름의 12강·8강 지원과 사용자 대진표, alpha 개발 배포.
- Design: 기존 TournamentBracket/TeamAvatar 카드와 가로 스크롤 유지. 12강의 부전승은 운영자가 명시하며 경기/점수와 구분한다.
- Out of scope: 예선 종료 자동 대진 생성, main 승격, 실제 대회 데이터 재편성.

## Acceptance / phases
- [x] DB/DTO에서 round12·quarter 단계 및 명시적 부전승 배정 저장
- [x] 관리자 단계 추가·수동 배정·대진 생성, 부전승팀 경기 생성 제외
- [x] 사용자 12강→8강→4강→결승 정렬과 부전승 표시, 모바일 단계 이동
- [x] 결과/일정/진행 표면의 단계 분류 일치
- [x] 좁은 회귀·타입 검사 및 migration/source-binding 검사
- [ ] dev PR CI·리뷰·alpha 배포
- [ ] alpha 390/768/1440 전후·console/network QA

## Progress Snapshot
- 최신 dev 조회 및 격리 완료. 공유 작업트리 변경을 포함하지 않는다.
- 네트워크 sandbox 밖 GitHub 인증 정상.
- 테스트 전 host: 24 CPU, load 0.94, free 14GB, swap 0, Linux Node/browser 0. Docker CLI WSL interop 오류로 실제 DB 미확인.

## Ambiguity Log
- UI 방향은 이전 메시지의 기존 대진표 확장안을 사용자 개발 요청으로 수락한 것으로 본다.
- 부전승팀은 12강에 명시하고 8강 슬롯은 기존 방식대로 관리자가 직접 배정한다. 불명확한 상대 미배정은 부전승으로 추정하지 않는다.

- Local evidence: API 128/128, Web 64/64; 양쪽 tsc 0. Web pattern + API surface + DB guardrails PASS. Expand-contract self-test PASS. 실제 DB 통합은 신규 integration suite를 CI에서 실행한다.
- Alpha schema binding: `1eea17ce17f1150aa031cb3ef9cb492e4242375c98a4ad85ff2657a1c6e5d31d`; Dockerfile/alpha validator/manifest/steady-input producer 동기화. 기존 스키마 검증값은 validator에 유지. Alpha manifest self-test PASS.
- 10/05 사용자 추가 요청으로 단계 화살표안을 경기별 진출 연결 그래프로 대체한다. 기존 persisted advancement edge를 관리자가 명시하며 화면도 해당 관계만 그린다.


## 검증 및 배포 보류 (2026-10-04)

- PostgreSQL 16.15를 `/tmp`에서 포트 15432로 실행, **192 migration 전체 재생 PASS**, `prisma migrate diff --exit-code` **No difference detected**.
- `tournament-round12-quarter.integration-spec.ts`: 실제 DB 저장/관리자 재조회, 부전승=true/기본false, 부전승팀 경기 생성 거절, 허구 TeamMatch 생성 없음 **1/1 PASS**. 격리 clone은 테스트 환경에서 삭제, 소유 PostgreSQL PID 7772 종료.
- Unit: API 128/128, Web 64/64. 양쪽 tsc PASS. Pattern/surface/db-guardrails/expand-contract(커밋본) PASS. Alpha manifest self-test PASS.
- 변경 전 alpha 공개 화면 390/768/1440 캡처. 비로그인 `my-fixtures` 401은 현재 배포본에서 관찰된 기존 상태이며 성공으로 숨기지 않는다. 변경 후 alpha 화면은 아직 **0/3**이다.
- **배포 blocker:** `git push -u origin feat/tournament-round12-quarter`를 자동 승인 검토가 거절했다. 사유: private 저장소 코드의 외부 GitHub 전송이며 원격 신뢰/소유 및 명시적인 push 승인이 확인되지 않았다는 판단. 우회/간접 업로드/재시도하지 않았다.
- 사용자 승인 대상: `https://github.com/kim-song-jun/matchup-sports-platform`에 이번 feature 브랜치 push → base `dev` PR → CI/Copilot review 통과 후 dev merge → alpha 자동 배포/390·768·1440 실제 QA. main은 이번 대상이 아니다.
- 공유 원본 트리(`/mnt/c/...`)는 수정·stage·commit하지 않았다. 모든 작업은 `/tmp/teameet-round12`에 보존한다.

## 2026-10-05 경기별 연결선 확장

- 사용자 요청: 지정 상세 `/tournaments/d209a886-1a38-44ab-90a7-d08009aeee16`에서 4강·8강·12강 모두 경기별 선 연결. 이전에 결정한 카드/수평 대진표 구조를 확장하는 범위.
- 실제 target 공개 API: `0929테스트`, group_knockout, 결승 1경기뿐. 실대회 편성/결과는 변경하지 않는다.
- [x] 기존 V1TournamentMatchAdvancementEdge 저장·관리자 진출 연결 + public fixture sources 노출
- [x] 실제 DOM 카드/홈·어웨이 행의 좌표를 측정하는 SVG 연결선, 개별 분기 배치, 미정 슬롯 출처, 부전승 직행 선
- [x] 4강·8강·12강 같은 컴포넌트 예시 (scripts/qa/tournament-bracket-samples.ts, 런타임 route와 분리)
- [x] 좁은 최종 검증·타입·실제 DB public response
- [x] 지정 상세 390/768/1440 baseline 및 명시적 browser-local 예시 9/9 캡처·치수/console 검증
- [ ] alpha 실제 배포 후 동일 화면 검증 (push 명시 승인 blocker 유지)
- Preview workflow: `node scripts/qa/build-connected-bracket-preview.mjs` → `node scripts/qa/capture-connected-tournament-bracket.mjs`. 실제 alpha shell에서 브라우저 DOM에만 새 컴포넌트를 렌더하며 모든 예시에는 실제 대회 데이터가 아님을 표기. 배포된 화면이라고 주장하지 않는다.
- API sources는 같은 대회·인접 phase·중복/배정 상태·Game/Details/TeamMatch 락·이미 진행 중인 경기 보호·감사 로그 검증. 스키마 변경 없음.

### 10/05 검증 증거 / 남은 단계

- API unit: 변경 관련 3 suite 150/150 (bracket service 65, presenter/read 회귀 포함). Web 6 suite 116/116 (그래프 배치/부전승/미정 출처/관리자/상세 페이지). 양쪽 tsc PASS. Web lint:patterns 및 API lint:surface PASS.
- 실제 격리 PostgreSQL integration 2/2: 12→8→4→결승/3위전 LOSER 저장, admin/public 재조회, 인접 단계·중복·직접 슬롯 변경·진행 중 연결 변경 거절. 기존 결과 확정 시 downstream scheduled 검증에 저장된 관계를 실제 전달. 이번에는 schema/migration 변경 없음.
- Browser-local samples **9/9 PASS**: 실제 지정 alpha 상세 shell + 실제 수정 컴포넌트, 4/8/12 × 390/768/1440. 경기별 연결선 각각3/7/15, 카드 겹침0, page overflow0, desktop sticky aside overlap0, stage jump 동작. JS pageerror0. 비로그인 `/api/v1/auth/me`401 및 그 console resource error는 기존 alpha baseline으로 별도 기록.
- raw: `output/playwright/visual-audit/20261005-connected-bracket/{before,preview,graph}*` + evidence.json. Graph crop는 가로 폭은 유지하고 캡처 높이만 늘려 sticky chrome으로 내용이 가려지지 않게 내보냄. 실제 844/1024/1000 높이 측정은 evidence.json의 원래 viewport에서 수행.
- desktop 전체 행 배치 + 첫 행 aside boundary로 sticky가 그래프 위에 겹치지 않게 처리. 모바일은 기존 내부 수평 스크롤과 단계 이동.
- [4강 예시](../../docs/screenshots/tournament-connected-bracket/4-desktop.png) · [8강 예시](../../docs/screenshots/tournament-connected-bracket/8-desktop.png) · [12강 예시](../../docs/screenshots/tournament-connected-bracket/12-desktop.png) · [모바일](../../docs/screenshots/tournament-connected-bracket/12-mobile.png). 각 screenshot의 sample 문구는 실제 배포/실대진과 구분하기 위해 유지.
- cleanup: 모든 소유 headed browser context 종료, 테스트 PostgreSQL 종료.
- **미완:** 원격 push/PR/CI/Copilot/dev merge/alpha 배포 및 배포 후 실제 admin/public QA. 이전 자동 승인 검토의 remote push 차단에 대한 명시 승인 대기. 브라우저 로컬 예시는 alpha 배포 완료를 뜻하지 않음.
