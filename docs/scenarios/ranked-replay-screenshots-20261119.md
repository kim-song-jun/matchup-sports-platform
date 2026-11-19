# 20팀 신청·수락 재실행 및 목업 카테고리 추가

Status: IN PROGRESS. 기존 PR #2453 연장. 기존 결과를 이번 성공으로 합산하지 않는다.

사용자 요청: 실제 버튼 조작을 다시 수행하고 중요 장면을 PR에 게시·최종 검증. 추가 요청은 대회 관리 상단의 기존 목업 패널에서 팀 수 선택과 상태·옵션을 유지하고 순위별 리그 카테고리만 확장하는 것이다.

## Owned / Forbidden

- Owned: 기존 mock-seed DTO/service와 관련 테스트·API 문서, 목업 패널·훅/타입 계약, 이 시나리오·기존 task/index·전용 evidence, 기존 PR.
- Forbidden: 실회원/기존 완료대회 수정, main 승격, 다른 WIP, destructive seed/reset, 회원가입/OTP 미검증을 UI 통과로 표시.
- 새 QA 대회: `21da8cb0-2138-431b-bc17-b5e3b6e8d326`, `(테스트) 캡처 재검증 20팀 순위리그 1119`.
- 기존 합성 테스트20팀·140명을 재사용한다. 신원/팀 준비는 fixture이며 이번 신청·명단·수락·결과는 실제 UI로 수행한다.

## Phases / Acceptance

- [x] A: 새 대회 구성·신청20/20·명단140/140·관리자 수락20/20. 팀별 신청/수락 주요 PNG와 액션 타임스탬프.
- [x] B: 예선30·순위별 결선40 공식 결과, 종료·산술·3폭 최종 화면, 실제 제한 실패 재검증.
- [ ] C: 기존 목업 형식 선택에 순위별 리그 추가. 팀 수/상태/옵션 흐름 유지,7명 등록·6명 config·20팀일 때70경기 생성.
- [ ] D: 관련 회귀·권한·실패·API 문서, PR 스크린샷 갤러리와 최종 판정. dev/Alpha gate는 실제 상태로 기록.

Progress: UI 신청20/20·명단140/140·수락20/20·예선30/30·결선40/40·완료 전환. 각9편성 산술·팀당7경기·동순위출처 대조PASS. 실제 첫 경기1:0의 정석09선수2 1골을 공개 개인 기록에서 확인. 390/768/1440 결과상단·최종순위 및 예선/본선탭 조작PASS, 문서가로넘침0·수집콘솔예외/HTTP4xx·5xx0. ego-browser 공간3. 증거 `docs/scenarios/evidence/ranked-replay-20261119/`.

## 현재 판정과 PR

- 신청/수락은 모두 실제 UI 버튼과 확인창을 거쳤고 `team-01~20-application-confirm/submitted.png`, `team-01~20-admin-accept-confirm/accepted.png`, 팀별 JSON에 기록했다. 운영자 검토는 선수7명을 읽은 것이며 선출 자격을 외부 검증했다고 주장하지 않는다.
- [PR 전체 팀 캡처 갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/2453#issuecomment-7011526051). 첫 이미지업로드 SHA18f88dc78에 고정했다.
- 첫 경기만 라이브 득점·전후반·종료·공식확정, 나머지69경기는 관리자 점수 입력·확인 UI. 결과 DB주입/쓰기API로 대체하지 않았다. 개인기록은 이번1골을 검증했으며 모든 경기의 개인이벤트를 검증한 것은 아니다.
- 전체 PASS 아님: 최대출전6명인데 양팀7명 전원 started=true로 LIVE 시작 허용을 새 경기에서도 재현. `six-player-limit.json`과10/11 PNG. 6명선발+벤치1/교체 계약은 여전히FAIL이고 목업 seed로 선발/후보를 조작해 숨기지 않는다.
- 신규가입/OTP·팀생성은 이번범위 밖이며 기존합성신원/팀만 재사용. 기존 완료대회는 보존. 날짜입력은 ego가 datetime-local fill을 지원하지 않아 폼의 native setter와input/change로입력했다. 신청/수락/점수는모두정식클릭.
- 재검산 `node scripts/qa/verify-ranked-replay.cjs` PASS. 목업카테고리 로컬API54·Web6 회귀 및API/Web타입 PASS. 수동검토에서후기가능옵션은종료상태를요구하고, 등록7명안내와자동경기명단설명을일치시켰다. 일반대회format/Prisma enum 변경·migration없음.
- 사용자 명시승인(2026-11-19): Copilot ACTOR_INELIGIBLE 차단은 이번PR에한해전체CI+수동검토로대체하고dev머지후Alpha까지진행. Copilot clean이라고표기하지않는다. 새 카테고리 Alpha3폭 갤러리·실제70경기목업생성은배포후진행하며PR댓글에최종결과를추가한다.

Ambiguity: 카테고리는 기존 상단 목업 패널의 형식 dropdown에 확장한다. 기존 팀 선택(팀 수), 상태·옵션을 제거하거나 별도 데모로 바꾸지 않는다. 순위별 리그는4팀씩 예선 조를 구성하므로 지원 팀 수 조건을 화면/서버에 일치시키며20팀이 핵심 승인 조건이다.
