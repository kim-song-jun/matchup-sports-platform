# Task 182 — 승격 보류 후 Alpha QA와 기록 정리

Status: In Progress
**Owner**: Codex (단일 실행)
**Created**: 2026-10-02

## Context

사용자는 main 승격을 보류하고 dev·Alpha 개선과 검증을 이어가도록 요청했다. 이전 인계의 완료 항목은 당시 후보의 기록이며, 이후 후보의 승인 근거로 재사용하지 않는다.

## Goal

Alpha의 실제 응답과 저장 지속성을 검증하고, 실행하지 못한 사용자 흐름과 필요한 실행 조건을 명확히 남긴다.

## Original Conditions

- [x] main 머지, Production 승인·DB 변경, 유료 리소스 생성 없이 진행.
- [x] 기존 팀·경기를 수정하지 않고 전용 QA 대상을 사용.
- [x] 계정·비밀번호·쿠키를 저장소와 보고서에 기록하지 않음.
- [x] 관리자 경기 명단 저장 및 전용 경기 시작·득점·종료·공식 결과 확정 API 검증.
- [ ] 실제 Kakao OAuth와 Android Alpha 앱 검증.
- [ ] 최신 clean 리뷰 확보.
- [ ] 이전 로컬 보고서·QA 도구 위치 확인 및 dev 반영 범위 정리.

## User Scenarios

1. 공개 사용자는 공개 대회의 경기 상세를 조회할 수 있다.
2. 테스트 선수는 로그인 후 자신의 팀과 명단을 조회할 수 있다.
3. 테스트 팀장은 별도 QA 팀의 소개·등번호를 저장하고 재조회한 값이 일치한다.
4. 운영자는 전용 경기에서 경기 진행과 공식 결과 반영을 확인한다. 관리자 API 검증과 종료·확정 브라우저 화면 확인 완료. 경기 진행 전체를 브라우저로 다시 실행한 것은 아님.

## Test Scenarios

- [x] Alpha 릴리스 헤더 및 DB health 확인.
- [x] 공개 목록의 모든 대회 상세 및 노출된 경기 상세 조회: 21개 대회, 44/44 경기.
- [x] 대표 계정 4/4 로그인·본인 조회·팀·명단 접근. 제공된 24개 계정 전수 재검증은 아님.
- [x] 전용 팀 생성 → 소개 수정 → GET 값 비교.
- [x] 전용 팀의 팀장 등번호 저장 → 명단 GET 값 비교.
- [ ] 팀장/매니저/일반 팀원 권한 경계, 경기 명단 조정 저장.
- [x] 관리자 경기 명단 제외·복원·변경 이력·중복 제외 멱등 처리.
- [x] 경기 시작 후 관리자 명단 변경 409 및 명단 불변.
- [x] 경기 시작·득점·전후반 전환·종료·공식 결과 확정 및 공개 경기 1:0 반영.
- [x] 동일 득점 요청 재전송에서 sequence/version 불변.
- [ ] 실제 OAuth, Android 실기기.
- 저장소 mock/fixture 변경: 없음. Alpha 전용 팀 1개와 전용 대회 1개(2팀·1경기)를 실제 API로 생성하고 유지. 경기 생성에는 Alpha 전용 mock-seed API를 사용했고, 경기 결과는 실제 운영 커맨드와 officialize로 생성했다.

## Parallel Work Breakdown

- 에이전트 병렬화 없음. 읽기 검증 → 전용 대상 저장 검증 → 기록 정리 순서로 수행.
- Owned: 이 파일, `docs/scenarios/alpha-qa-continuation-2026-10-02.md`; 별도 작업트리의 `apps/v1_web/src/components/teams/teams-form-client.tsx` 및 `teams-form-client.test.tsx`, `.changeset/alpha-team-capacity-minimum.md`(정원 최소값 회귀 수정).
- Forbidden: 기존 WIP, Production, main, PR #1325 변경.
- 기존 `docs/scenarios/index.md`는 시작 전부터 dirty여서 직접 편집하지 않음. 별도 증거 문서를 이 task에서 연결.

## Acceptance Criteria

- [x] 실행한 검증과 이전 인계의 주장을 구분.
- [x] API 성공 응답뿐 아니라 저장 후 GET 값 대조 수행.
- [x] 생성한 대상과 세션 폐기 상태 기록.
- [x] 인증된 브라우저 클릭 QA, 390/768/1440 viewport·console/network 증거. 전용 팀 저장 오류 발견; 전체 잔여 QA 완료를 뜻하지 않음.
- [ ] 미완 사용자 흐름과 clean 리뷰 완료.
- [ ] 검토된 문서·QA 도구를 dev에 반영. 현재 산출물은 로컬 미커밋.

## Tech Debt Resolved

이전 검증 SHA와 현재 로컬 HEAD를 혼동하지 않도록 증거 기준을 구분했다. 팀 편집 초깃값의 최소 정원 불일치를 별도 작업트리에서 수정했다. Alpha에는 미배포.

## Security Notes

비밀번호는 비표시 터미널 입력으로만 전달했다. 쿠키는 프로세스 메모리에서만 사용하고 폐기했다. 로그인은 테스트 계정의 마지막 로그인 시각을 갱신한다. 전용 QA 팀은 가입 정책을 closed로 설정했다.

## Risks & Dependencies

- `gh`, `ego-browser`, PATH의 `adb`는 미확보. Playwright 캐시 Chromium과 WSLg를 발견해 headed 브라우저 QA를 수행했다.
- 사용자 제공 관리자 계정으로 전용 경기 생성·운영·결과 확정 완료. 생성 API가 선택한 홈팀이 제공된 세 팀장 계정의 팀과 일치하지 않아 팀장·일반 팀원 권한 검증은 이번 실행에 포함되지 않음.
- 이전 인계 보고서·QA 도구는 현재 checkout의 조사 범위에서 찾지 못함. 삭제·유실로 단정하지 않음.
- Production 상태와 PR #1325의 현재 상태는 재조회하지 않음.

## Ambiguity Log

| Date | Question | Resolution |
|---|---|---|
| 2026-10-02 | 쓰기 QA 계정·대상 | 사용자가 테스트 선수 계정을 제공. 대표 계정 3명의 owner 역할 확인 후 별도 QA 팀 생성. 기존 경기의 상태 변경은 수행하지 않음. |
| 2026-10-02 | 이전 보고서·도구 위치 | 미확보. 이전 결과를 새 실행 결과로 대체하거나 완료 처리하지 않음. |
| 2026-10-02 | 관리자와 전용 경기 생성 | 사용자가 관리자 계정과 전용 경기 생성·테스트를 명시적으로 허용. 테스트 계정만 참가하는 새 대회 2팀·1경기에서 관리자 명단 및 운영 흐름 완료. |

## Progress Snapshot

- 2026-10-02 13:58–14:03 KST 실제 API 검증.
- fetch한 dev 및 Alpha 공개 SHA: `bf47852a26476a38ca538c07d7afb1d9f7654a15`.
- 로컬 HEAD: `f58fe862a099d8c43eb765842e366a44765da2f4`; 해당 HEAD의 배포 검증으로 간주하지 않음.
- 공개 경기 44/44, 대표 계정 4/4, 팀 소개·등번호 저장 재조회 2/2 통과.
- [실행 증거와 잔여 검증](../../docs/scenarios/alpha-qa-continuation-2026-10-02.md).
- 생성한 QA 팀은 유지. main·Production·PR 변경 없음. 문서 커밋·push·dev 반영은 미실행.
- 2026-10-02 14:15–14:19 KST 후속 관리자 QA: 전용 경기 생성, 명단 제외·복원·이력·중복 처리, 시작 후 명단 변경 거부, 실제 Socket.IO takeover, 득점 및 재전송, 전후반 전환, 종료·SUBMITTED 파생·OFFICIAL 확정·공개 1:0 대조 통과. 두 하네스 실패(응답 형태/피리어드 상태 판정)는 수정 후 같은 경기에서 재개. 최초 websocket-only 연결 실패는 별도 잔여 증거로 남김.

- 후속 headed 브라우저: 관리자 운영·공개 기록 390/768/1440 확인, 공식 1:0 일치, 팀장/관리자 UI 로그인·로그아웃 확인. 카카오 로그인 페이지 진입만 통과.
- 제품 오류: 1명 팀 편집 시 화면 정원 2/요청 정원 1로 HTTP 400. 별도 dev 기반 작업트리에서 수정 및 회귀 테스트 진행 중. 브라우저 증거와 하네스 hydration 보정은 실행 문서에 기록.

- 정원 수정안: RED 2/2 → 팀 폼 전체 GREEN 31/31. Changeset 포함, 분리 작업트리에 소스·문서 보존. 미커밋·미배포이며 최신 clean 리뷰와 Alpha 재검증은 여전히 필요.

- 사용자 지시로 정원 수정안 리뷰 → dev PR/반영 → Alpha 재배포·브라우저 저장 재검증 단계 진행. Windows gh 인증 확인, 최신 origin/dev와 기준 SHA 일치. 기존 31/31 결과를 재사용하고 커밋 전 v1_web 타입·패턴 검사 1회 수행. 분리 작업트리의 깨끗한 시나리오 허브에 기록 링크 추가.

- 커밋 전 타입 검사: 처음 공유 의존성(React Query 5.91)이 lockfile(5.102.8)보다 오래돼 실패. 별도 /tmp pnpm store에 frozen-lockfile/ignore-scripts 설치 후 tsc 통과. 패턴 검사는 샌드박스 spawnSync EPERM으로 실패했으나 같은 후보에서 제한 밖으로 해당 검사만 재실행해 통과. Changeset 정책 통과. 저장소 의존성·lockfile 변경 없음.

## 2026-10-02 PR review handoff

승인된 수정 PR 11/11 dev 병합, CI 및 alpha 배포 SUCCESS (SHA `9a35d05abd32`). 공개 QA 12개 조합에서 최초 11 PASS/1 hydration FAIL, 해당 desktop 재확인 3 PASS. 인증 흐름은 현재 세션 자격증명 없어 미검증. [리뷰·QA·릴리스 준비 기록](../../docs/ops/pr-review-2026-10-02.md). 이전 섹션의 실행/미실행 표시는 당시 스냅샷이며 이번 결과와 구분한다.
