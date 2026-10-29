# Task 20261120: 대회 상세 상품의 시상별 칩과 펼치기

Status: Review
Owner: Codex
Created: 2026-10-29

## Context
대회 상세의 상품 목록이 길어지는 문제를 줄인다. 대상 대회는 `a90df6d5-47e9-40f9-93ef-f679ce8da858`이며 사용자가 로컬 확인 및 dev PR 생성을 요청했다.

## Goal
팀 상품은 처음부터 모두 보여주고 개인/기타 상품은 펼쳐 확인하며, 같은 시상은 한 번만 표시한다.

## Original Conditions
- [x] 팀/개인/기타 제목을 반복하지 않고 그룹별로 한 번 표시한다.
- [x] 상품은 내용에 맞는 둥근 칩으로 표시한다. 강제로 가로 폭을 늘리지 않는다.
- [x] 같은 시상에서 짧은 상품을 먼저, 긴 상품을 마지막에 배치해 줄 수를 줄인다.
- [x] 긴 상품은 잘리지 않고 칩 내부에서 줄바꿈한다.
- [x] 팀 시상 전체는 접힌 상태에서도 표시한다.
- [x] 직접 입력한 개인 시상명도 프리셋과 같은 방식으로 분리한다.
- [x] 시상 분류 사이에 얇은 구분선을 표시한다. 첫 분류 위에는 표시하지 않는다.

## User Scenarios
대회 방문자가 팀 시상의 모든 상품을 확인하고 전체 보기로 개인/기타 시상을 펼친 후 다시 접는다. 하나의 순위/시상에 여러 상품이 있어도 시상명은 한 번만 보인다.

## Test Scenarios
- 팀 상품 5개 + 개인/기타의 최초 표시/펼치기/접기 및 aria 상태.
- 팀 전용 목록에 불필요한 펼치기 버튼 없음.
- 공용 그룹 파서의 순위 별칭 통합과 자유 입력 개인 시상 분류.
- 짧음/긴 상품/짧음 입력을 짧음/짧음/긴 상품 순서로 표시.
- 개인 전용 목록의 3개 미리보기, 빈 목록의 불필요한 제목/버튼 없음.
- 실제 대회 390/768/1440에서 5 -> 9 -> 5, 분류별 구분선, 가로 넘침 확인.
- 브라우저 전용 응답 fixture로 긴 상품 배치와 짧은 칩의 고유 폭 확인. DB/API 쓰기는 하지 않는다.

## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: 상세의 상품 컴포넌트 연결, 전용 컴포넌트/테스트, 이 문서. Forbidden: 공용 파서/API/DB/다른 화면 및 원래 작업트리의 WIP.

## Acceptance Criteria
- 위 사용자 요구사항을 충족한다.
- 공용 `parsePrizeRows` / `groupPrizeRows`를 재사용하고 새 JSON 파서를 복제하지 않는다.
- 기존 공용 `GroupedPrizes`의 시상 결과·어드민 미리보기 동작을 변경하지 않는다.
- 최신 origin/dev 기반 격리 작업트리의 명시 경로만 커밋하고 PR base=dev를 확인한다.

## Tech Debt Resolved
오래된 로컬 코드에서 임시로 작성했던 버전형 시상 파서를 PR에 복제하지 않고 최신 dev의 공용 파서로 통합한다. 저장된 분류/시상명/상품 값을 유지하므로 프리셋 정규식 때문에 사용자 정의 이름이 잘못 분리되지 않는다.

## Security Notes
공개 API 조회만 사용한다. 환경 파일/토큰을 읽거나 출력하지 않는다. PR은 dev 대상이며 main 승격/자동 머지는 수행하지 않는다.

## Risks & Dependencies
화면 검증은 사용자 명시 요청에 따라 로컬에서 수행한다. alpha에 이 변경이 배포됐다는 의미는 아니다. 기존 WSL/마운트 작업트리와 최신 dev 차이가 커 /tmp/teameet-prize-pr 격리 작업트리에서 PR을 준비했다. 로컬 의존성은 기존 워크스페이스의 node_modules를 링크하며 이 링크는 커밋하지 않는다.

## Ambiguity Log
사용자가 같은 대화에서 3개 미리보기 -> 팀 전체 표시, 가로 늘리기 -> 고유 크기/짧은 상품 우선 배치로 요구를 정정했다. 최종 사용자 요구를 적용했다. 전체 보기 문구의 개수는 표시 가능한 상품 수이며 긴 문구 정렬은 표시 문자열 길이 기반이다.

## Progress Snapshot
최신 dev 기준 상세 연결 2줄과 신규 전용 컴포넌트/테스트를 작성했다. 이전 로컬 수정은 원래 작업트리에 보존했다. PR 코드 로컬 서버는 port 3013 / exec session 84621에서 실행 중이다.

## Validation Evidence
- Unit: 새 상품 컴포넌트 4 + 기존 그룹 컴포넌트 3 + 공용 파서 33 = 40/40 PASS (single worker).
- PR과 같은 최신 dev 기반 소스에서 로컬 headed Chromium 390/768/1440 PASS. 실제 대회는 5 -> 9 -> 5, 가로 overflow false. 개인/기타 border-top=1px, 팀 첫 그룹 border-top=0px를 확인했다.
- 별도 브라우저 API 응답 fixture에 짧음/긴 문구/짧음 상품을 제공하여 짧은 두 칩이 같은 줄에 표시되고 긴 문구가 마지막에 배치됨을 확인했다. 짧은 칩의 폭은 45/55px로 유지되고 긴 문구는 내부 줄바꿈된다. fixture는 저장하지 않았다.
- Screenshots: /tmp/teameet-prize-pr-{390,768,1440}-{collapsed,expanded,packing}.png. Desktop expanded image visually inspected. Before evidence is earlier /tmp/teameet-prize-compact-*.png.
- New QA browser page errors: none. Guest auth/me 401, local image optimizer 400, Kakao SDK ORB remain environment limitations. Server logs also contain stale preexisting client/HMR errors after switching the runtime worktree; these are not counted as a clean global runtime verdict.
- Browsers closed; own local server remains for user review. node_modules symlinks and generated next-env.d.ts are excluded from the commit.
- Scoped diff whitespace/debt checks passed. No API/schema changes or new runtime dependencies.

- First full typecheck failed only on missing validator/isISO8601 and validator/isEmail links in the reused old local installation. The latest package.json already pins validator 13.15.26 and @types/validator 13.15.10. Replaced the PR worktree's app node_modules link with worktree-local dependency symlinks and linked these exact already-installed versions; no tracked dependencies or shared installations were modified. Rechecking after this environment correction.

- Final typecheck: tsc --noEmit --incremental false PASS after correcting worktree-local validator dependency links. Pattern gate initially required an unsandboxed shell and then caught the required tm-on-tint class; applied that shared tint class and reran successfully. Full v1-pattern-check PASS.
