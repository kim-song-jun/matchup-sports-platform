# 대회·리그 필터와 정렬 검증

Task: [182](../../.github/tasks/20261103-competition-discovery-filters.md)
Status: 로컬 구현·검증 완료, 실 DB·alpha 미검증

## 범위와 페르소나

일반 사용자, `/tournaments`의 전체·대회·리그 목록. 승인한 필터·정렬·카드 계약이 대상이다.
로컬 Next 서버는 실행하지 않았다. 최신 dev에서 별도 작업폴더로 구현한다. 공유 작업폴더의 기존 scenario index는 보존한다.

> **2026-11-05 갱신:** 정렬 선택(최신 등록순·마감 가까운 순·개최 가까운 순)과 "신청 접수 중만" 버튼은 없어졌다.
> 카드 오른쪽 위 배지는 상태 하나(준비 중·신청 접수 중·접수 마감·대회/시즌 진행 중·종료)이고 목록 순서는 하나로 고정이다.
> 필터의 모집 상태·진행 상태는 두 줄로 보이지만 하나만 고른다(`stage`). 결정 이력은
> [정본 6절](../design/competition-canonical-flow.md)의 "대회·리그 목록의 상태·정렬·필터" 행을 따르고, 아래 시나리오는 그 기준으로 고쳤다.

## 수동 alpha 시나리오 (0/8, 배포 전 미실행)

모든 항목은 390×844 / 768×1024 / 1440×900에서 화면·콘솔·네트워크를 확인해야 한다.

1. 전체 탭: 필터의 모집 상태에서 '신청 접수 중'을 고르고 대회와 리그의 신규 접수 여부 확인.
2. 대회 탭: 풋살·혼성·신청 접수 중·기간·방식·참가비를 선택하고 결과 보기 전 요청이 발생하지 않는지 확인. 진행 상태 줄에 '준비 중'이 없어야 한다.
3. 리그 탭: 모집 상태 줄에서 고르면 진행 상태 줄이 '전체'로 돌아가고 그 반대도 같아야 한다(안 나오는 조합 없음). 준비 중은 초안만이고(접수 없이 시작을 기다리는 리그 포함), 신청 접수 중은 open에서 마감·정원 조건을 충족할 때만이다(2026-10-27 정책). 진행 중 리그는 신청을 받지 않는다. 성별 필터 부재와 선택적 리그 참가팀 정원 판정을 확인한다.
4. 기간: 선택 월 이전에 시작해 이후에 끝나는 시즌 포함, 날짜 미정 제외.
5. 정렬: 정렬 드롭다운·모바일 정렬 시트가 없어야 한다. 진행 중 → 신청 접수 중 → 준비 중(리그만) → 접수 마감 → 종료 순서이고 그룹 안은 최근 등록순(종료는 최근 종료순)인지, 더 보기·페이지 이동에서도 순서가 이어지는지 확인.
6. 탭 전환·뒤로가기·공유 URL: 공통 필터 유지, 전용 필터 해제 안내, pagination 초기화 확인.
7. 실패·빈 결과: 503은 재시도 오류, 조건에 맞는 항목이 없으면 빈 결과와 필터 초기화 안내 확인.
8. 카드: 오른쪽 위 배지가 상태 하나인지(기한 경과·정원 점유 마감 대회는 '접수 마감', 초안 리그는 '준비 중', open 리그는 '신청 접수 중', 진행 중은 대회 '대회 진행 중'·리그 '시즌 진행 중'), 이름 아래 배지가 종목·리그 또는 대회·성별 조건인지 상세·제출 API와 대조한다. 마감 없는 open 리그는 정원이 남으면 신청 가능해야 한다.

배포와 로그인은 이번 요청에서 진행하지 않는다. 실제 화면의 spacing/overflow/focus/sticky footer
및 before/after verdict는 미확인이다. 테스트 통과를 화면 검증 완료로 취급하지 않는다.

## 로컬 실행 명령과 결과

최종 결과는 Task 20261103 Progress Snapshot에 기록한다.

- Backend: `node node_modules/jest/bin/jest.js --selectProjects unit --runInBand --runTestsByPath src/tournaments/tournaments-read.service.spec.ts`
- Backend 신규: 같은 runner의 `src/tournaments/competition-list-query.spec.ts`
- Frontend: `node node_modules/vitest/vitest.mjs run ... --maxWorkers=1 --no-file-parallelism`
- Typecheck: 앱별 `typescript/bin/tsc --project <앱>/tsconfig.json --noEmit --incremental false`
- Real DB: `test/tournaments/competition-discovery.integration-spec.ts` 작성. DATABASE_URL 미설정·Docker 미제공으로 미실행.

기존 프론트 테스트의 누락된 persister 2종은 `/tmp/teameet-competition-test-deps`에 설치해
ignored node_modules에서 연결했다. package.json·lockfile은 수정하지 않았다. 앱 서버·브라우저·DB 프로세스를 시작하지 않았다.


## 결과 요약

최신 dev `c184cff23` 기준 구현. Web 고유111 PASS, API 고유81 PASS. 날짜·금액 검증과 리그 선택 정원·비공개·보류 fixture까지 포함한다.
양쪽 전체 타입 검사와 표면/패턴 검사 PASS. 실제 PostgreSQL 통합0/5, alpha0/8, after viewport0/3.
검증은 단위·SSR·MSW 계약 범위이며 실제 클릭/레이아웃 판정은 아직 없다. Task의 로그별 증거를 따른다.

## PR #2094 회귀 시나리오

2026-10-30 문서 대조로 추가한 현재 회귀 기준이다. 위 2026-10-22 실행 수치는 과거 증거로 유지한다.
수정 이유: 레벨 OR의 공개 조건 덮어쓰기, 개인 매치 지역 검색 누락, 지난 대회가 먼저 나오는 개최순, 보이지 않는 범위 오류와 잘못된 참가비 요약.

일반 사용자로 아래 7개를 alpha에서 실행하고 390/768/1440 화면·console/network를 함께 기록한다. 현재 실행 0/7, viewport 0/3이다.

1. 개인 매치 레벨 선택 전후: 레벨을 골라도 기존 공개 범위 밖의 종료·취소·보류 글이 다시 나타나지 않아야 한다. 팀매치도 레벨 선택으로 제외 대상 대회 경기가 노출되지 않아야 한다.
2. 개인 매치 지역 검색: 해당 지역에 공개 매치가 있을 때 지역명 일부로 조회할 수 있어야 한다. 다른 검색·레벨 조건도 함께 적용해야 한다.
3. ~~개최 가까운 순~~ — 정렬 선택을 없애면서(2026-11-05) 해당 없음. 지난 대회가 앞을 채우던 문제는 상태 그룹 순서(종료가 맨 뒤)로 풀렸다.
4. ~~하루 대회~~ — 위와 같은 이유로 해당 없음.
5. 종료 직접 선택: 진행 상태 줄에서 '종료'를 고르면 종료 항목을 보여 준다.
6. 필터 날짜·참가비 역전: 결과 보기를 눌러도 잘못된 요청은 보내지 않고, 오류는 해당 칸 바로 밑의 보이는 위치에 표시한다. 값 수정 후 다시 적용할 수 있어야 한다.
7. 최소 참가비만 입력: 요약·필터 링크 이름 모두 `100,000원 이상`처럼 표시하고 `전체원`이 나타나지 않아야 한다.

회귀 근거: API `matches.service.spec.ts`, `team-matches.service.spec.ts`, `test/tournaments/competition-discovery.integration-spec.ts`; Web `competition-discovery-controls.test.tsx`, `competition-discovery.test.ts`. API 계약은 [matches](../api/domains/matches.md)·[tournaments](../api/domains/tournaments.md)를 따른다.
