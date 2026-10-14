# Task 20261082: 경기 명단 선수별 골키퍼 지정

Status: Review
**Owner**: Codex
**Created**: 2026-10-14

## Context
리그 팀장의 경기 명단 화면에는 출전·등번호 조작만 있어 골키퍼를 지정할 수 없다.
## Goal
기존 대회 명단의 선수별 GK 선택 패턴으로 여러 골키퍼를 지정하고 실제 경기 기록까지 반영한다.
## Original Conditions
- [ ] 요청한 팀·경기 명단에 선수별 골키퍼 선택을 제공한다.
- [ ] 여러 선수의 동시 지정과 개별 해제를 허용한다.
## User Scenarios
팀장이 두 선수를 골키퍼로 선택하고 저장한 뒤 다시 열면 두 선수의 선택이 유지된다.
출전 제외·복귀와 등번호 변경은 골키퍼 지정을 지우지 않는다.
## Test Scenarios
- [ ] 복수 선택·해제·저장·재조회 및 실패 시 초안 보존.
- [ ] 권한·시작 마감·다른 팀·명단 밖 선수 거절.
- [ ] 동기화 리비전과 종목별 GK 코드 반영.
## Parallel Work Breakdown
단일 에이전트 순차 작업. Owned: v1 경기 명단 서비스/DTO/뷰/동기화, Prisma 모델·migration,
경기 명단 훅·화면·MSW·관련 테스트, API 문서, 이 task와 changeset.
Forbidden: 다른 작업트리와 공유 트리 WIP, 레거시 소스.
## Acceptance Criteria
- [ ] API 및 UI 계약 검증 통과.
- [ ] dev PR 및 alpha 실제 390/768/1440 QA 완료.
## Tech Debt Resolved
경기 명단 자동 재계산 뒤 GK 선택이 유실되지 않도록 경기·사이드·팀·선수별 역할을 독립 보관한다.
## Security Notes
기존 사이드 팀 인가·경기 잠금·시작 마감 계약을 사용한다. 계정 정보 노출 범위는 그대로다.
## Risks & Dependencies
새 역할 테이블 migration 필요. 기록 참가자의 position에는 해당 경기 규칙의 GK 코드를 쓴다.
## Ambiguity Log
사용자의 "골레이"는 골키퍼/골레이로로 해석. "대회처럼"이라는 명시 패턴을 적용한다.
이번 경기 지정이며 참가 신청의 모든 경기 공통 변경은 아니다.
## Progress Snapshot
최신 origin/dev dde8964ca에서 격리 브랜치 feat/league-roster-goalkeepers로 시작.
기존 대회 GK는 경기 라인업 position으로 저장하며, 참가 신청 등번호 API에는 GK 필드가 없다.

## Validation Evidence
- Web: 관련 59 tests PASS, tsc PASS, v1 pattern check PASS.
- API: 관련 67 unique tests PASS, tsc PASS, v1 surface check PASS.
- DB guardrails PASS. DB 통합 검증은 CI에서 실행(로컬 Docker 없음).
- UI: headed alpha Chrome PID 34820, launcher Node PID 9520. 인증은 사용자 제공 fixture 계정만 사용.
- alpha 3폭 before/after, console/network, 저장·재조회는 배포 후 실측 대기.

- CI 38507178317: Web 전체 검사/빌드 PASS. API 복수 GK 저장·종목 코드·제외/복귀 통합 시나리오 PASS; 문자열 Boolean 자동 변환 거절과 스키마 guard 재핀 필요를 발견해 수정.
- 추가 Owned: Dockerfile.v1-api, alpha manifest 공통 검증, release schema binder/manifest fixture와 game-schema fixture의 해시 고정값. 새 schema SHA 427caa0a…be40a, M11은 그대로 유지.

- 실제 전역 ValidationPipe에서 JSON true/false 보존 및 문자열/숫자/null/누락 거절 8 tests PASS.
- 실제 release schema binder를 committed LF schema/M11 입력으로 실행해 새 schema SHA 출력 확인.
- baseline은 실제 ADMIN 편집 화면 390/768/1440으로 확보. 제공된 이게팀이야 선수 계정은 TEAM_MEMBER로 별도 확인한다.

- 한강 로버스(동일 경기 상대팀) 제공 계정의 TEAM_MANAGER/수정 가능/등번호 수정 가능 상태에서 baseline 3폭도 확보.
- 새 테이블에 기존 GK만 복사하는 INSERT는 보수 SQL 분류기가 거절하여, 기존 reviewed non-additive 방식으로 정확한 migration 경로·SQL 문장 한 쌍에 보존 근거를 추가. 이전 테이블은 읽기만 하고 새 테이블에 ON CONFLICT DO NOTHING으로 채운다.
