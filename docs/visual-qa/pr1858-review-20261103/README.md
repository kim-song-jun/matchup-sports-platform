# PR #1858 재리뷰 및 alpha 기준 화면 — 2026-11-03

판정: HOLD. 검토 대상은 c67554fab57a3f4ecabba0529fa043a8761f274f이며 현재 dev는 b2b6920f317d4eae528f1cd6cd81336d9a20fe5c다. PR은 draft, base=dev, 미머지다.

## 재리뷰 범위

새 multi-finals DTO/controller/service/planner, 잠금·미리보기·명단 확정·재요청 경로, 관리 wizard 및 hooks, 시상 범위, 공개 결과, migration 및 alpha release/rollback 계약을 대조했다. 과거 5개 inline thread는 수정됐지만 과거 별도 리뷰 본문의 모든 finding이 해결된 것은 아니다. 전체 변경 파일에 대한 전수 QA를 주장하지 않는다.

## 남은 findings

1. **P1 — 구버전으로의 이미지 롤백을 여전히 호환 가능으로 기록한다.** `scripts/release/create-alpha-release-manifest.sh:355-359`는 이전 릴리스가 final이면 SHA를 무조건 rollbackCompatibleWith로 기록한다. `deploy/rollback-alpha.sh:73-77`은 이 값만 비교하고 구버전 이미지를 활성화한다. 새 format league_knockouts와 이름을 가진 scope를 저장한 뒤에는 이전 Prisma enum/client가 새 값을 읽지 못하거나 기존 시상 writer가 범위 없이 전체 데이터를 다시 저장할 수 있다. migration SQL gate의 re-scoping 주석은 실제 롤백 차단이 아니다. 신기능 데이터 작성 이후 구버전으로 넘어가는 롤백 경계를 manifest/rollback에서 강제해야 한다. 운영 롤백이나 데이터 손실을 실제로 발생시킨 것은 아니다.
2. **P2 — 토너먼트별 공식 3·4위가 최종 결과에서 빠진다.** `apps/v1_web/src/app/tournaments/[id]/results/results-page-client.tsx:78-94`는 final group만 선택하고 winner/runnerUp만 만든다. split 최종 순위 분기도 이 값만 렌더한다. 새 planner가 third_place fixture와 패자 진출선을 생성하므로 공식 3·4위전이 있어도 완료 결과에 반영되지 않는다. 각 track의 3·4위 및 승부차기 승패를 반영해야 한다.
3. **P2 — 공용 MSW 시상 저장·재조회 계약 검증이 누락돼 있다.** `use-v1-api.ts:4365-4383`의 award-sets GET/PUT 및 multi-finals hook에 대응하는 공용 handler/fixture가 없다. wizard 전용 테스트의 inline MSW는 그 테스트 안에서만 작동한다. 공용 mock을 통한 저장→재조회·빈 배열 초기화·공개 응답 동기화 증거가 필요하다. production API 장애로 분류한 finding은 아니다.

## CI 및 검증 범위

최신 head의 Gates/Web SUCCESS, API는 확인 시점 migration replay + drift gate 진행 중이었다(run41552813281). 직전 수정의 API134 + web46 tests 및 양쪽 typecheck PASS는 기존 증거이며 이번에 재실행하지 않았다. 최신 head Copilot 재리뷰를 요청했으나 새로운 리뷰 결과는 아직 확인되지 않았다.

## 실제 alpha 스크린샷

- URL: https://alpha.teameet.co.kr/admin/tournaments/new
- Persona: 제공받은 alpha 관리자 테스트 계정(자격 증명 미기록). 실제 이메일 로그인 UI 사용, auth/me HTTP200 확인.
- Serving SHA: b2b6920f317d4eae528f1cd6cd81336d9a20fe5c, landing HEAD HTTP200의 x-teameet-commit으로 확인.
- Headed Chromium, WSLg, 브라우저 PID68476/부모68456. 내 세션만 종료 완료. 최초 실행의 누락된 라이브러리는 시스템 설치 없이 /tmp/teameet-browser-runtime에서만 공급했다.
- Viewports: 390×1000 / 768×1000 / 1440×1000, 각 full-page screenshot. 3/3 가로 overflow 없음. 세 폭 이미지를 직접 확인했다. 기존 생성 화면 baseline이고 새 카테고리·새 wizard가 배포됐다는 증거가 아니다.
- console/network: observations의 401 및 resource console error는 로그인 전 auth/me 확인에서 생긴 2건이다. 로그인 후 대상 route에서는 추가 오류가 관측되지 않았다. 입력 저장·대회 생성 등 alpha 데이터 mutation은 하지 않았다.
- 신규 기능 after screenshots 0/3, 기능 수동 QA 0/10. PR 미배포와 위 P1 때문에 새 화면 촬영을 완료로 표시하지 않는다.

| 390 | 768 | 1440 |
| --- | --- | --- |
| [모바일](before-create-390.png) | [태블릿](before-create-768.png) | [데스크톱](before-create-1440.png) |

재현 도구는 scripts/qa/pr1858-alpha-gallery.cjs다. credentials를 파일·스크린샷·PR에 기록하지 않는다. 로그인을 포함한 캡처 과정은 mocked UI나 로컬 Next 서버를 사용하지 않았다.
