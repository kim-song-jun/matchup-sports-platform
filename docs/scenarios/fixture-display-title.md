# 경기별 제목 수정 — 2026-11-11

Task: [.github/tasks/20261057-admin-bracket-canvas.md](../../.github/tasks/20261057-admin-bracket-canvas.md)

## 실행 시나리오
1. 관리자 대회 대진의 경기 일정 전체보기에서 경기 A의 수정 버튼을 누른다.
2. 경기 제목에 `A조 2차전`을 입력하고 저장한다.
3. 목록과 그림(모바일 포함)에 같은 제목이 나오고 경기 B는 바뀌지 않는지 확인한다.
4. 새로고침 후 제목 유지, 수정창 기존 값 hydration을 확인한다.
5. 제목을 비우고 저장하면 자동 문구로 돌아오는지 확인한다.
6. API 실패 시 입력 유지·실제 오류 표시, 미권한 사용자의 PATCH 거절을 확인한다.

## 검증 결과
- API DTO/표시 저장/공용 조회 및 bracket service: 고유267개 PASS(조회4개 재실행 포함 총 실행271개).
- Web 공유 편집/그림/리그 격자/모바일 모델: 60/60 PASS.
- API 최종 TypeScript PASS. Web TypeScript는 기존 `admin/league-matches/page.tsx:299`의 LeagueStateChip props 불일치1개로 실패(이번 변경과 무관, 미수정).
- 실제 PostgreSQL: 한글 제목 trim/저장/공용 bracket 조회·경기별 격리·생략 보존·빈 값 복원·실제 감사2개 저장 PASS. `scripts/qa/verify-fixture-display-title.cjs` 실행 후 전체 transaction rollback, 검증 데이터 잔존0.
- 로컬 `/login` HTTP200, API 직접 및 Web rewrite `/api/v1/health`의 db=true.
- 로컬 Web3013, Docker API8121. 기존 DB는 보존, 별도 빈 `teameet_v1_title_preview` 사용(계정/대회 데이터 없음). 기존 migration 전체 재생은 정책 prerequisite 자료 누락으로 실패하여 이 빈 preview DB만 schema push 사용; shipping용 additive migration은 별도 제공.
- Alpha 클릭/스크린샷/console-network QA 0/3 viewport(390/768/1440): 배포하지 않았으며 브라우저 도구 미제공. 실제 관리자 UI 저장 round-trip은 미검증; 단위·DB·HTTP 검증과 구분한다.
- 커밋/PR/머지/원격 데이터 변경 없음. 요청된 로컬 서버·DB만 계속 실행한다.

## 로컬 관리자 화면 오류 후속
- 이전 HTTP200은 브라우저 실행 성공을 증명하지 못했다. 실제 Chrome에서 React/SWC 모듈 exports 오류를 확인했다.
- 이 작업에서 실행한 Next 프로세스만 종료하고 생성된 `.next` 캐시만 삭제한 뒤 같은3013 포트로 재실행했다. 앱 소스/auth gate 우회 변경은 없다.
- 사용자의 관리자 화면 표시 요청에 따라 별도 local preview DB에 전용 관리자1개를 생성했다. 기본/운영 DB와 원격 계정은 변경하지 않았다.
- 격리된 headed Chrome 프로필에서 기존 개발용 헤더 인증 경로로 실제 `/admin` 진입: 최고운영자 shell·대시보드 렌더 PASS, pageerror0/API400+0. 1440×1000 스크린샷 `tmp/local-admin-preview/admin.png`.
- `scripts/qa/local-admin-preview.cjs`는 localhost에서만 신원 힌트를 적용하고 독립 Chrome CDP에 연결한다. 사용자가 화면을 볼 수 있도록 요청된 창과 로컬 서버는 유지한다.
- 이는 로컬 관리자 대시보드 검증이며 제목 수정 화면/alpha 3폭 QA를 대체하지 않는다.

## 최신 dev 배포 브랜치 검증
최신 dev817d4fb88a 기준 API338/Web124 및 API TypeScript PASS, schema binding5 PASS. 기존 로컬 버전의 Web 타입 오류는 최신 dev에서 재평가한다. 사용자 지시로 리뷰 요청/대기 생략, 필수 CI 유지. 로컬 전용 계정/Chrome 자동화 도구는 배포하지 않는다.

최신 배포 브랜치 Web TypeScript도 PASS(이전 로컬 버전의 타입 오류는 해당 없음).

## 운영 핫픽스 배포 완료 — PR #2329
- 사용자 일회성 예외 승인으로 main PR 생성·머지 및 기존 production 승인 경로를 진행했다. 별도 리뷰 요청/대기는 생략했고 CI·보안·이미지·환경 보호 규칙은 유지했다.
- main merge95198fb649a0f41086a762d416cab83d6f73f03f. PR CI43005571659·운영 CI/Build/Deploy43007633057·main CodeQL43007633745 모두 성공.
- 실제 운영 release1.16.2/위 commit 서빙, health db=true. 공개 상세21개·일정20개·경기 상세에 displayTitle 필드 반영. 샘플 경기 수21→21, 검증 중 운영 데이터 수동 변경0. 운영 엔티티 식별자나 계정 정보는 문서에 기록하지 않는다.
- main→dev는 PR#2333으로 완료, 조상 관계 확인. 중복 본인 PR#2332는 종료했다. 로컬 dev fast-forward 및 공유 WIP/로컬 실행 서비스 보존.
- title metadata/nullable migration만 배포하며 실제 조·라운드·번호·점수·순위·진출/자동 배정 알고리즘은 변경하지 않는다. 기존 API394/Web124·양쪽 타입·실제 로컬 저장/감사 및 alpha 공개3폭 증거는 #2327 갤러리를 따른다.
- 운영 검증은 공개 읽기 계약과 상태 확인에 한정한다. 관리자 인증 편집/저장 UI 실측은 미실행이다.
