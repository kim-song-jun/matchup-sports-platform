# Task 20261137: 개인정보 저장 보호 수준과 적용 계획

Status: In Progress
Owner: 단일 Codex 세션 (문서 작성)
Created: 2026-11-19
Scope: backend/frontend/infra/docs · base origin/dev fb9e768aa · branch feat/personal-data-protection

## Context
사용자가 “보통 어느정도까지 하는지랑 계획이랑 다 해서 문서로 정리부터할까” 요청. 어드민 PR #2447과 분리해 일반 권장 수준·현재 코드·목표·실행 계획을 먼저 정리한다.

## Goal
[보호 계획 정본](../../docs/security/personal-data-protection-plan.md)으로 구현 범위와 미확인 사항을 검토할 수 있게 한다. 이번 문서 작업의 완료와 후속 구현 완료를 구분한다.

## Original Conditions
- [x] 일반적인 권장 기준과 팀밋 적용 목표 구분
- [x] 현재 v1 저장 경로·모델과 미확인 인프라 명시
- [x] 범위·단계·예상 작업량·키/검색/백필/롤백·검증 기준 작성
- [x] 현재 단계에서 DB/API/키/운영 설정 변경 없음

## User Scenarios
- 운영자가 기본 보호와 강화 목표를 비교하고 적용 범위를 결정한다.
- 개발자가 이메일/전화번호 부분 검색과 계정 연결 계약 영향을 알고 구현 계획을 세운다.
- 검토자가 미확인 인프라·복사본과 단계별 승인/검증 게이트를 확인한다.

## Test Scenarios
- 문서 상대링크·기준 SHA·관련 소스 경로 확인, diff check 및 신규 debt marker 확인.
- 코드/스키마/실데이터 변경 없음. 앱 테스트·빌드·브라우저 QA는 이번 문서 작성에서 실행하지 않는다.
- 이후 구현 검증은 정본 §8에 정의. 현재 통과한 것으로 표시하지 않는다.

## Parallel Work Breakdown
- 단일 세션. 현재 owned: 본 task / docs/security/personal-data*.md·sql / docs/README.md / apps/v1_api/src/privacy / src/auth/password-hash*·auth.service* / API package·pnpm-lock / Changeset.
- forbidden: deploy/**, .env*, 기존 admin PR 브랜치·다른 worktree의 변경. 중앙 PrismaService 연결은 자동 승인 검토 거부 후 미적용.
- 후속 P0→P2→P3→P4→P5는 공유 계약 의존 관계에 따라 순차 진행, P1은 P0 후 진행 가능.
- 병렬 에이전트 실행 요청 없음. 후속 구현 분해는 정본 §6을 따른다.

## Acceptance Criteria
- [x] 업계 도입률 통계·법적 최소 의무·제품 권고를 혼동하지 않음
- [x] 비밀번호 해시/복호화 암호화/저장장치 암호화 구분
- [x] 계정 유일성·검색·키 회전·장애·복사본·삭제·백업 복구 포함
- [x] 실제 구현/운영 실측 미완료와 남은 결정 목록 명시
- [x] 문서 링크/범위 최종 검증 (상대 링크16개 정상, diff/공백 확인, 신규 debt marker 없음)
- [ ] 구현 착수 시 P0 인벤토리·검색 계약·담당자 확정 (후속)

## Tech Debt Resolved
이번에는 문서 공백을 해소한다. 실제 평문 저장·검색 계약·암호 비용 점검은 해결된 것으로 표시하지 않는다.

## Security Notes
외부 1차 자료(OWASP/국가법령정보센터)와 현행 v1 소스만 사용한다. 실제 회원정보·운영 키·.env·DB 덤프 미조회. 디스크/백업 암호화·연결 TLS는 코드만으로 적용 완료라 판단하지 않는다.

## Risks & Dependencies
부분 검색 선택, 키·권한 구성, 복사본 범위, 법적 보유정책과 인프라 실측에 따라 작업량 변동. 초기 20–33작업일은 승인/관찰 대기 제외한 추정이며 확약 아님.

## Ambiguity Log
| Date | Question | Resolution |
|---|---|---|
| 2026-11-19 | 문서화/구현 경계 | 문서부터 작성. 암호화 구현/운영 데이터 변환 미착수 |
| 2026-11-19 | 일반 수준의 의미 | 도입률 근거 없는 “대부분 업체” 단정 없이 공개 가이드 기반 비교 |
| 2026-11-19 | 부분 검색과 생년월일 정밀도 | 권장 초안 명시, P0에서 확정 |

## Progress Snapshot
- 최신 dev fb9e768aa에서 /tmp/teameet-personal-data-security-plan 격리 worktree 생성. 기존 admin PR #2447 변경과 원래 shared tree의 _worktrees/ 미추적 변경은 보존.
- 현행 schema/auth/admin 검색/로그/최종 삭제 코드와 기존 보안 문서를 확인. 오래된 문서의 파기 미구현 주장은 현행 근거로 재사용하지 않음.
- 정본174행·작업 문서·문서 지도 작성 완료. 상대 링크16개, 공백/diff check와 변경 범위 확인 완료. 문서 산출물 검증이며 실제 암호화/권한 계약 테스트를 실행한 것은 아님. commit/push/PR/머지/배포는 이번 요청에서 실행하지 않음.

## 2026-11-19 Implementation request
사용자가 전체 계획 구현·검증·PR 생성을 요청했다. PR 브랜치 수정·머지를 seeungmin만 허용하길 선택했다. 연결 계정은 admin=false/maintain=false/push=true로 보호 설정 권한이 없으며, dev 전역 권한은 변경하지 않는다. 보호 완료로 표시하지 않는다.

### Execution board
- [ ] P0: 전체 개인정보 원본·복사본과 검색/권한/배포 경로 인벤토리
- [ ] P1: 관리자 최소 응답·열람 감사 및 로그 보호
- [ ] P2: 키 관리·암호 경계·검색 HMAC·비밀번호 버전/비용
- [ ] P3: 계정/인증 경로와 schema/migration/이관 도구
- [ ] P4: 명단/문의/감사/캐시 등 복사본 처리
- [ ] P5: 관련 테스트·타입/규칙·문서·dev 대상 PR·CI
- [ ] 보호: 현재 권한으로 가능한 설정 및 관리자가 적용할 설정 검증

현재 owned scope는 v1 관련 개인정보 경로·Prisma migration·배포 설정·문서·시나리오·검증이며 구현 파일은 각 Phase 진행 때 추가 기록한다. 계획의 정확 일치 검색을 기본안으로 적용한다. 운영 데이터 변환/키 발급/운영 승격을 실행한 것으로 간주하지 않는다.

## Implementation checkpoint — reviewable Draft
- 구현 현황 정본: [personal-data-implementation-status.md](../../docs/security/personal-data-implementation-status.md). 전체 구현 미완료.
- P2 일부: 버전 scrypt·일반 로그인 시 legacy CAS 업그레이드, 별도 행 바인딩 AES-GCM/KMS/정확 일치 변환 후보. 기존 PrismaService는 수정하지 않음.
- 초기13모델/23필드 후보를 고정했으나 P0 전수 인벤토리·P1 관리자 열람·P3 데이터 전환·P4 복사본 적용은 미완료.
- 자동 승인 검토가 전체 API 중앙 Prisma 경계 변경 명령을 서비스 전체 장애/데이터 접근 차단 위험으로 거부했다. 그 명령은 실행되지 않았고 중앙 연결을 우회하지 않음. 잠정 schema 변경은 본 작업의 추가분만 회수하고 docs/security/personal-data-expand-proposal.sql로 이동, 실행 migration 없음.
- auth177/177 + privacy/password15/15 + 인증/복구214/214 = 406개 로컬 단위 PASS. 안정적 행 ID 없는 변환은 거부. 실제 DB/KMS·Alpha 검증 아님.
- 개인 fork의 쓰기 사용자 seeungmin 단독을 확인. PR은 fork head·maintainer 수정 허용 false·Draft로 생성하고 실제 설정을 확인할 예정. upstream PR merge 본인 한정은 관리자 권한 부족으로 미적용.
- 전체 구현과 보호 완료를 선언하거나 merge/배포하지 않음. 차단된 중앙 연결·데이터 전환은 명시적 승인 후에만 재개.
