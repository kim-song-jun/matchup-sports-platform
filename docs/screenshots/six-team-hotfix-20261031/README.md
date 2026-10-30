# 6강 대진표 · 승부차기 정정 배포 검증

Status: Production and initial alpha deployed; latest dev metadata rollout pending

## 변경과 배포

- main 핫픽스 #2104: source/app1.12.3, 공개 release1.12.4, serving SHA `b50074f90ff602eff47b21b0d2577bcc0377c57b`.
- alpha 반영 #2105: initial serving `a7c520c2f3f359b89cf50d26160ceba392c29e2e`, 실제 공개 화면 검증 완료.
- main→dev 릴리스 이력 동기화 #2106: `696bb15336ec6a985088cbd40aa023a6481f4b37`. app source/Prisma/deploy/workflow diff0. 최종 alpha rollout은 진행 중이다.
- 사용자가 이번 핫픽스의 자체 리뷰와 main까지 모두 처리를 명시 승인했다. GitHub 환경 보호 정책을 유지하고 production 현재계정 승인 가능을 확인해 정상 승인했다. Copilot clean으로 표시하지 않는다.

## 실제 검증 범위

| 대상 | Persona | 390 | 768 | 1440 | 근거 |
|---|---|---|---|---|---|
| 공개 대진표 | 비로그인 방문자 | PASS | PASS | PASS | 링크0·결선탭0·넘침0·실제 결승 연결선2/오차0 |
| 공개 일정 | 비로그인 방문자 | PASS | PASS | PASS | 실제 API fixture ID와 클릭 필터 결과가 전체5/6강3/준결승1/결승1로 일치 |
| 어드민 대진표 | 관리자 | 미실행 | 미실행 | 미실행 | 로그인 수단 없음 |
| 결과 정정/저장/공식화 | 관리자 | 미실행 | 미실행 | 미실행 | 로그인 수단 없음; 원격 결과를 임의 수정하지 않음 |

공개 6/6 surface-viewport PASS, protected6/6은 인증 준비 전 미실행이다. Alpha 초기 AFTER의 실제46개 검사 PASS, console/network/pageerror0. 로컬 미리보기나 mock 렌더로 alpha 검증을 대체하지 않았다.

- 부전승 배경 `rgb(232,243,255)`, 팀명 `rgb(27,100,218)`, 이미지 로드 성공.
- 설명 제목/본문 왼쪽 오차0px, 결승 연결선 두 개의 팀 행 오차0px. 의도한6강→다음 단계 연결선 생략 유지.
- 모바일/태블릿은 내부 가로 스크롤 후 결승 카드까지 확인했고 document 가로 넘침은 없었다.
- before는 기존 alpha2708c614993e에서 캡처했다. 각 viewport의 대진표·일정과 우측 끝 캡처를 보존한다.

## 테스트와 운영 확인

- 관련 로컬 frontend318/backend61 =379 PASS, frontend type/pattern gate PASS. 최초 CI stale 링크 기대2건을 실제카드5/링크0 계약으로 고치고 해당 파일38개 PASS를 확인했다.
- #2104/#2105/#2106 각각 API/Web/Gates CI 통과, main CodeQL 통과. 실제 PostgreSQL 통합 검증을 포함한다.
- Production workflow SUCCESS, landing serving SHA/release 일치, health DB true, 공개 대회 목록HTTP200. 실제 보호 경로 저장·공식화의 성공을 주장하지 않는다.
- alpha 첫 배포는 CI 대기35분 제한에서 실패했으며 이후 AWS/서버 단계는 모두 skipped였다. exact SHA CI SUCCESS 확인 뒤 failed deploy job만 재실행해 배포에 성공했다.
- 모든 캡처는 headed Chromium. baseline PID8510/parent8413, initial AFTER PID16257/parent16204이며 각각 browser/context 종료 및 profile 정리를 확인했다. 계정·비밀번호·쿠키는 저장하지 않았다.
- 원본 로컬 WIP는 보존했다. `.env*`, seed/reset, 실제 경기 결과 변경은 실행하지 않았다.

## 증거

- [before](./before/evidence.json)
- [initial after](./after-initial/evidence.json)
- [release evidence](./release-evidence.json)

최신 dev SHA의 배포 완료 뒤 final AFTER 캡처와 실제 serving release/SHA를 추가한다.
