# Task 20261094: 대회·리그 선수 추가 성별·골레이

Status: In Progress
**Owner**: Codex
**Created**: 2026-10-20

## Context
선수 추가에서 선택한 선수 성별과 골레이 등록 여부를 확인·저장한다.

## Goal
공통 선수 추가 폼에서 성별은 프로필 자동 표시, 골레이는 사용자 선택으로 한 요청에 저장한다.

## Original Conditions
- [x] A·B·C 비교 후 사용자가 A(기존 폼 확장)를 선택했다.
- [x] 성별은 실명 다음에 읽기 전용으로 표시, 값이 없으면 미입력.
- [x] 등번호 다음에 '골레이로 등록해요' 체크박스, 기본 해제.
- [x] 이름 검색은 기존처럼 팀원 8명 이상일 때만 표시.
- [ ] 검증 후 dev 대상 PR 생성.

## User Scenarios
팀장·매니저가 대회/리그 신청 명단에서 선수 추가 → 팀원 선택 → 프로필 성별 확인 → 골레이 선택 → 등록 → 저장값 유지.

## Test Scenarios
- 성별 남성/여성/미입력 전환과 readOnly.
- 기본 false / 선택 true의 실제 페이지→훅→POST payload.
- 서버 create/복원 update 및 반환값, 재계산 이벤트.
- 3명은 검색 숨김, 8명은 검색 표시.
- 잠금·마감·권한 기존 gate 유지.

## Parallel Work Breakdown
서브에이전트 없이 순차 처리. Owned: 참가 명단 client/test, DTO/service/test, payload type, 상태 라벨, 관련 API 문서/changeset. Forbidden: 다른 세션 WIP, DB 운영 데이터, 배포·main 승격.

## Acceptance Criteria
- [x] 사용자 A안 선택 이후 구현.
- [x] 기존 V1TournamentPlayer.goalkeeper와 경기 재계산 경로 재사용(신규 migration 불필요).
- [x] 관련 테스트 및 타입 검사.
- [x] API 문서·changeset 동기화. PR 생성 진행 중.
- [ ] 머지 후 alpha 390/768/1440 화면·console/network 확인(이번 요청은 PR 생성까지).

## Tech Debt Resolved
선수 추가 시 골레이를 별도 수정 요청 없이 원자적으로 저장한다.

## Security Notes
성별은 클라이언트 입력으로 받지 않고 서버 프로필 snapshot 유지. 기존 팀장·매니저/명단 잠금/마감/성별·정원 검증 보존. bool은 DTO 검증.

## Risks & Dependencies
실제 alpha 화면은 미머지 변경을 볼 수 없어 머지 후 확인 필요. DB가 없는 환경에서는 통합 DB 검증 미실행을 명시한다.

## Ambiguity Log
사용자 표기는 골레이. API 기존 필드명 goalkeeper 유지. 성별 미입력 표시는 기존 등록 자격을 완화하지 않는다.

## Progress Snapshot
- origin/dev c613469b4에서 /tmp/teameet-roster-goalie 작업트리 생성.
- 기존 schema GK 및 outbox 동기화 지원 확인. 신규 migration 없음.
- 구현 후 좁은 검증 진행 중. 공유 작업트리 무수정.

## Validation Evidence
- Web actual page + useV1AddPlayer → MSW POST, 성별/검색/명단 마감·권한/문맥 테스트 통과. API DTO 8/8, 서비스 125/125 통과.
- Web/API tsc --noEmit --incremental false exit 0. Web pattern gate PASS.
- Mutation: 페이지의 goalkeeper payload 전달만 제거하면 관련 POST 2건 FAIL(exit1), 원복 후 GREEN. selector-only 검증 아님.
- 기존 schema column·migration을 재사용해 DB 변경 없음. 실 DB 통합 테스트는 미실행(Docker 미설치).
- alpha before/after 및 390/768/1440 console/network는 미실행: 변경은 PR 단계여서 미배포. PR에 머지 후 확인 필요를 명시하며 머지를 실행하지 않는다.
- touched source debt marker 없음, git diff --check 통과. node_modules는 임시 의존성 symlink로 커밋에서 제외.
