# 선수 카드 점수·원본 기록 구분

## Context / Goal
- Task 155 후속. 사용자가 alpha 카드의 `골 62`, `도움 30`, `성실 출석`, `골 결정력`을 실제 기록/검증된 평가로 읽을 수 있음을 지적했다.
- 본인 마이페이지, 타인이 조회하는 공개 프로필, 공유 카드 모두에서 점수와 실제 골·도움·명단 경기 수를 구분한다.
- 최신 `origin/dev` 기반 독립 worktree `/tmp/teameet-card-records`, 단일 에이전트. 공유 작업트리 WIP는 수정하지 않는다.

## Original Conditions / Acceptance Criteria
- [x] 공통 카드 뒷면에서 점수에 `점`, 항목에 `능력치`를 표시하고 공개 가능한 원본 기록을 함께 표시한다.
- [x] `성실 출석`·`골 결정력` 등 점수에서 추정한 성향 태그를 실제 지표 이름/점수로 대체한다.
- [x] 본인/타인/공유 카드에 같은 표시 계약을 적용한다.
- [x] 기록 공개 동의가 없으면 새 원본 집계도 null이며 원본 수치를 노출하지 않는다.
- [x] 기존 점수 산식, 총점, 등급, 기록 게이트는 유지한다. DB migration 없음.
- [x] 구 API가 새 집계를 아직 반환하지 않으면 원본 기록을 추정하거나 0으로 채우지 않는다.
- [x] 좁은 backend/frontend tests, typecheck, desktop/tablet/mobile before/after·console/network 증거를 남긴다.

## Owned / Forbidden
- Owned: `profile/player-card.ts`, 관련 unit spec, web `types/api.ts`, 공통 `users/player-card.tsx`/spec, 공유 OG 이미지, 필요한 카드 CSS, users API contract, changeset, 본 task.
- Forbidden: 다른 세션 WIP, Prisma schema/migrations, 선수 기록·후기 데이터 변경, main 승격.

## User / Test Scenarios
- 17경기/10골/0도움: 골 62점·도움 30점·엔트리 87점과 실제 집계가 함께 보인다.
- 공개 동의 OFF: 원본 집계와 기록 점수는 공개하지 않는다. 후기 잠금/총점 계약 유지.
- 1경기: 골·도움 점수는 표본 부족으로 잠겨도 동의한 공개 원본 집계를 구분해 볼 수 있다.
- 구 응답/사진 없음/후기 없음/모든 능력치 열림/rect·shield의 공간과 뒤집기 확인.

## Security / Risks / Ambiguity Log
- 새 원본 집계는 카드의 기존 공개 동의 및 공식 기록 로더가 허용한 입력만 사용한다. 점수로 원본 수치를 역산하지 않는다.
- 원본은 경기별 행이 아니라 gameId로 중복 제거한 카드 집계. 공개 기록 목록의 행 수와 다를 수 있다.
- 후기 캐시 최신성 및 프로필 생년월일 저장 문제는 이번 표시 수정 범위 밖이다.
- 사용자 요청이 구체적인 표시 방향을 승인했으므로 추가 디자인 선택 요청 없이 기존 카드 레이아웃을 유지한다.

## Progress Snapshot
- [x] 최신 dev fetch 및 별도 작업트리 준비, 공통 카드 3개 진입점 확인.
- [x] 구현/검증/시각 QA.
- [ ] dev PR/리뷰/alpha 배포 후 실제 신규 API 재조회/최종 보고. PR #1490, 1차 CI Gates/API/Web 모두 통과.
- [x] 자동 리뷰의 OG 점 단위 누락 및 PR 제목 형식 수정. OG 렌더/라우트 설정 8개 통과. 실제 OG 시각 판정은 alpha 배포 후 수행한다.

## Validation / Evidence
- Host preflight: 24 cores, load 0.53~0.86, available memory 13~14GB, swap 0. 검증은 최소 worker로 실행했다.
- RED: 새 본인/타인 원본 표시 및 구 응답 구분 테스트 3개가 변경 전 실제 렌더에서 실패했다.
- GREEN: `player-card.test.tsx` 26 + `my-player-card-section.test.tsx` 17 + `player-card-share-client.test.tsx` 7 = **50개**. 첫 47개 통과 후 새 privacy/소표본/공유 표시 3개만 추가 실행해 통과했다. API `player-card.spec.ts` + `player-card-stats.spec.ts` **34개** 통과.
- Web/API typecheck 0. 공유 node_modules가 최신 dev보다 오래되어 Web TanStack 5.102.8 5개 패키지를 독립 overlay에만 설치했다. API는 현재 v1 schema에서 `/tmp`에 생성한 engine-free Prisma Client를 임시 tsconfig로 지정해 검증했다. 초기 stale dependency typecheck 오류 4/38건은 이 준비 후 0건이다. 공유 node_modules·DB/schema/lockfile 변경 없음.
- Headed Chrome: 공개 프로필·공유 화면 × 390/768/1440 = before 6/6, after 6/6. DOM 값과 실제 조회 API를 대조하고 screenshot/console/network 확인. after 모두 원본 집계 및 점 단위 표시, 주관적 성향 태그 없음, document overflow 0, 카드 scrollHeight=clientHeight 및 마지막 설명 포함. 런타임 exception 0. guest `/auth/me` 401은 정상 인증 상태 판별이며 카드 조회 오류가 아니다.
- 추가 layout fixture: 후기 능력치 세 항목을 99점으로 설정해 모든 6행을 펼친 rect/shield × 390/1440 **4/4**. 스크롤/문구 잘림/exception 없음. 이는 레이아웃 검사용 응답 override이며 실제 후기 평가나 DB 변경이 아니다.
- before는 alpha 실배포, after는 수정한 실제 v1 Next 페이지 + **QA 전용 GET projection bridge**다. bridge는 alpha 공개 profile/records 원본 집계로 새 `records` 필드만 채웠다. 신규 backend 실제 배포의 E2E 성공으로 확대하지 않는다. backend 새 필드/공개 게이트는 위 unit 검증으로 분리했다.
- 검증 중 alpha 원본 골이 10→11로 변했다. 고정된 예전 숫자 대신 각 실제 응답과 표시 값을 비교해, 최신 11골/17경기도 원본 11골·능력치 66점으로 표시되는 것을 확인했다. 사용자에게 설명한 10골/17경기 산식은 API unit에서 별도로 고정 검증했다.
- Raw: `output/playwright/visual-audit/player-card-record-labels/{before-route-results,route-results,stress-results,browser-owner}.json` 및 screenshot-set. Canonical: 아래 공유 카드 before/after 6장.

| 상태 | Mobile 390 | Tablet 768 | Desktop 1440 |
|---|---|---|---|
| Before | [이미지](../../docs/screenshots/player-card-record-labels/before-share-390-back.png) | [이미지](../../docs/screenshots/player-card-record-labels/before-share-768-back.png) | [이미지](../../docs/screenshots/player-card-record-labels/before-share-1440-back.png) |
| After | [이미지](../../docs/screenshots/player-card-record-labels/after-share-390-back.png) | [이미지](../../docs/screenshots/player-card-record-labels/after-share-768-back.png) | [이미지](../../docs/screenshots/player-card-record-labels/after-share-1440-back.png) |

## Review / Tech Debt / Cleanup
- 수동 diff review: 새로운 auth/쓰기 경로 없음. `records`는 공개 동의 + 공식 결과 존재 시에만 반환하며 기존 공식/신원/개별 숨김 로더 게이트를 재사용한다. 본인 조회 우회 없음. 점수 산식/버전 변경 없음.
- API 문서의 stale 공개 필드 목록을 현재 v1 service 반환값에 맞춰 sync했다. 성향 추정 태그/100점 환산 설명을 실제 점수 계약으로 교체했다. 신규 TODO/FIXME/HACK/XXX 없음.
- 각 headed 브라우저는 finally에서 종료했다. 크롬의 누락된 shared library는 `/tmp`에만 압축 해제해 사용했다. 로컬 Next/QA bridge와 임시 schema/tsconfig는 종료 시 제거한다.

- OG local Next dev는 font URL 로딩 실패로 브랜드 이미지가 반환되어 실제 카드 시각 근거로 사용하지 않는다. 로컬 서버 종료; alpha 원본 OG와 배포 후 OG를 비교한다.

- 배포 전 실제 alpha 추가 확인: QA fixture 강현우로 세션 API 로그인 → /home 인증 UI hydrate → /my. 본인/공개/공유 × 390/768/1440 before 9/9에서 기존 단위 없는 점수·성향 태그를 재현했다. 본인은 인증 오류 없음. 공개 guest 401은 정상. 이후 각 QA 세션 로그아웃 및 headed 브라우저 종료. QA 스크립트는 optional CSV로 본인 시나리오를 지원하며 자격 증명은 메모리에서만 사용한다.
- PR #1490 최신 runtime 수정 CI Gates/API/Web 모두 성공. Copilot 리뷰는 두 차례 요청 성공 응답을 받았으나 실제 리뷰/요청 이벤트가 아직 0건이다. 자동 Sonnet 리뷰의 실제 minor 2건은 수정 완료; 이를 Copilot clean으로 간주하지 않는다.
