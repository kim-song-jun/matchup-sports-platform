# Alpha 기존 팀·선수 기반 20팀 12강 테스트 대회 5개

Status: Done
Owner: Codex (단일 실행)
Created: 2026-10-18

## Context
사용자가 실제 alpha의 기존 팀·선수로 대회 5개, 각20팀×8명·4팀씩5조·12강, 각 조 마지막1경기만 남긴 상태를 요청했다.

## Goal
기존 팀·계정을 새로 만들거나 변경하지 않고 명확한 (테스트) 대회5개를 alpha에 생성하고 URL·명단·경기 상태를 검증한다.

## Original Conditions
- [x] 실제 alpha 기존20팀, 팀당 기존 활성선수8명.
- [x] 대회5개, 각4팀×5조, 조마다6경기 중5완료·1예정.
- [x] 12강4경기·부전승4자리·8강4·4강2·결승1 준비. 조별 마지막 경기가 남으므로 결선 팀은 미정.

## User Scenarios
운영자가 조별 마지막 결과를 입력한 뒤5개 조 성적을 비교해12팀을 진출시킨다. 실제8명 명단으로 선수별 결과를 입력·수정할 수 있다.

## Test Scenarios / Acceptance Criteria
- [x] 5/5 대회별20등록·160선수·조별25완료/5예정·11결선예정·4BYE·10진출edge 확인.
- [x] 팀 간 중복 선수 없이 기존 멤버만 등록. 기존 대회/팀/회원 변경0.
- [x] canonical TeamMatch/Game/OFFICIAL 결과와 그룹·통합순위 일치. 공개/관리자 UI 확인.

## Parallel Work Breakdown
병렬화 없음. Owned: scoped scripts/qa 생성·검증 도구, 이문서·QA 증거. Forbidden: schema/migration·기존팀/사용자/대회 변경·전체seed/reset·main승격.

## Tech Debt Resolved
운영 연습용 불완전 조별 데이터 부족을 새 데이터5개로 보완한다. 런타임 코드 변경 없음.

## Security Notes
사용자 명시적 alpha 데이터 생성 승인. AWS account851725525576·SSM instance i-07344f6ccf3f53c53·actualDB teameet_alpha 검증. env파일 읽기/출력 없음. 기존160명의 실명·생년월일은 명단에만 복사하고 로그/문서에 출력하지 않는다. 신규Tournament ID만 생성; 재실행은 기존 생성 ID를 보존한다.

## Risks & Dependencies
기존팀의 실제 활성선수/실명이 충분한지와 대회 내 중복선수 제약을 먼저 확인한다. 이미 사용 중인 대회는 수정하지 않는다. 운영 정보·결과는 테스트임을 제목과 안내에 표시한다.

## Ambiguity Log
대회 간 같은20팀·160명 재사용은 허용, 한 대회 안에서는 중복 선수를 배제한다. 조별 단판라운드로빈6경기 중각5완료로 해석. 나머지1경기는 조마다 다른팀쌍으로 두고5개 대회 결과를 변형한다. 3위전은 요청 없으므로 생성하지 않는다.

## Progress Snapshot
origin/dev d276dcd72e 기준격리작업. alpha 컨테이너 teameet_v1_api 확인. 기존선수8명이상팀 조사 중. 아직 신규대회 쓰기 없음.

- 생성 SSM5820cb94-1d09-4230-9b0d-62df600527b1 SUCCESS. 기존 일반 풋살20팀·중복없는160명을5개 대회에서 재사용. 각20등록/160명·조별25OFFICIAL/5SCHEDULED·결선11미정·BYE4·승자edge10·그룹순위20·통합순위20 확인.
- canonical seed helper와 배포된 template plan/standings 함수만 사용. 기존 사용자/팀/멤버십 fingerprint 변화0, 신규 회원/팀 생성0. 신청·미디어 동의를 대신 승인하지 않고 seeded 및 합성 결과로 명시했다. 자격은 기존 명단 값을 복사하고 미확인은 needs_review 유지.
- 공개 API5/5 PASS. 관리자 인증 후 실제 화면5/5 및100등록의 playerCount8, 각대회 샘플8명 실명·남은경기 양쪽라인업8명 확인. 공개12강과BYE4선 확인.
- Headed1440x1000 PID60126/PPID60105 정상종료, pageerror0. 기존팀 로고 최적화 /_next/image400 3건·해당console3건 잔존하므로 무오류QA PASS로 표시하지 않는다. 팀/선수/결과 요구사항은5/5 충족. 기존팀 로고 데이터는 수정하지 않았다.
- 저장소 제품코드/DB schema/migration 변경 없음. private 자격증명 파일 삭제, session/browser 미보존. 증거 docs/screenshots/alpha-five-round12/.
