# Task 20261025: 정규 리그 공개 여부 설정

Status: In Progress
**Owner**: Codex root; implementation GPT-6-luna; independent review GPT-6-sol
**Created**: 2026-10-07

## Context
운영의 `[수원] 수요일 여성부 리그전`이 무료 표기·대진 수정 완료 전에 공개되어 있다. 사용자 요청은 데이터와 운영을 보존한 비공개다. AWS/SSM 읽기 전용 조사에서 대상은 regular_league, in_progress, 참가팀 4개, 대진 24개다. 기존 공개 설정은 없으며 deletedAt은 관리자 운영까지 막는다.

## Goal
관리자가 공개 여부를 바꾸면 메인·공개 목록·검색·직접 공개 상세와 그 리그의 공개 경기 정보를 일관되게 숨기고 관리자 운영은 유지한다.

## Original Conditions
- [x] 사용자 A안 선택: 메인·목록·상세까지 비공개 기능 추가.
- [ ] 삭제·취소·진행 상태 변경 없이 공개 여부만 변경.
- [ ] 기존 대회/리그는 migration 후 공개 상태 유지.
- [ ] 운영 서비스 대상은 id 22cad756-211f-4438-9066-208efabd3a2e.
- [ ] 운영 반영은 사용자 main 승격 뒤 진행. 에이전트의 main 승격 금지.

## User Scenarios
관리자가 정규 리그 상세의 공개 설정에서 비공개를 저장한다. 일반 사용자는 목록·검색·직접 공개 상세에서 볼 수 없으며, 관리자는 같은 리그와 대진을 계속 운영한다. 다시 공개하면 기존 정보가 표시된다.

## Test Scenarios
- [ ] 비공개 리그의 공개 목록·상세·파생 공개 경기 차단; 공개 리그 유지.
- [ ] 일반 계정의 공개 설정 변경 거부; 관리자 저장 및 감사 기록.
- [ ] 공개/비공개 전환 시 기존 진행 상태·참가팀·대진 보존.
- [ ] 프론트 실제 payload/오류 처리와 mock 계약 일치.
- [ ] 변경 범위의 좁은 테스트·typecheck, 독립 리뷰.
- [ ] alpha 실제 화면 및 사용자 동선 검증. 배포 접근 제한 시 정확한 미검증 범위 기록.

## Parallel Work Breakdown
- Wave 0: backend implementer 단독 schema+additive migration, isPublic Boolean default true; 이 계약 확정 전 다른 구현 금지.
- Wave 1 backend: apps/v1_api 공개 조회·권한·관리자 endpoint·감사·테스트. frontend: apps/v1_web types/hooks/MSW 및 관리자 정규 리그 공개 설정 UI. root: task/API docs·회귀 경계 검토·검증 오케스트레이션.
- Wave 2: GPT-6-sol 독립 검토; 필요한 수정; 직렬 최소 검증.
- Forbidden: .env 조회, main 승격, 운영 schema/데이터를 배포 전 임의 변경, 취소/삭제/rollback, 다른 세션 WIP, self-commit.

## Acceptance Criteria
- [ ] public filtering을 클라이언트에만 의존하지 않음.
- [ ] 비공개 리그의 관리자 운영·데이터 보존.
- [ ] DB migration·API docs·frontend 계약·fixtures sync.
- [ ] 실제 검증 결과와 미검증/운영 반영 상태를 구분해서 보고.

## Tech Debt Resolved
- 공개 여부를 진행 상태와 삭제 여부로 우회하는 경로를 만들지 않는다.

## Security Notes
비공개 여부는 서버 조회 경계에서 적용한다. 관리자 변경은 기존 active admin/guard와 audit를 따른다. 공개 경기·영상·검색 등 parent league에서 파생되는 경로를 점검한다. 관리자 전용 조회는 공개 필터를 공유하지 않는다.

## Risks & Dependencies
스키마 변경은 migration 동반. production은 main 승격과 기존 승인 게이트가 필요하다. 비공개 콘텐츠의 우회 조회 누락과 관리자 공개 조회 재사용에 의한 운영 차단을 독립 검토한다.

## Ambiguity Log
- 2026-10-07 A안 선택 완료. 공개 범위: 메인·목록·검색·상세. 관리자 운영 보존. 새 디자인 대안/요금/정원/대진 수정은 범위 밖.
- 공개 설정 구현 계약: V1Tournament.isPublic(Boolean, DB is_public), default true; 정규 리그 관리에서 제어. DTO whitelist에 맞춘 별도 관리자 visibility endpoint를 우선 사용.

## Progress Snapshot
- 조사 완료: 운영 스키마에도 별도 비공개 필드 없음. 운영 쓰기 0건.
- Wave 0 completed: isPublic schema와 additive migration 추가, Prisma Client generate 성공(DB 쓰기 없음).
- Wave 1 in_progress: backend/frontend GPT-6-luna 구현; 공개 경계 GPT-6-sol 읽기 전용 점검 병렬.
- Wave 2 pending. 공유 작업트리 dev, 착수 시 clean. fetch 결과 origin/dev보다 66 commit 뒤: 구현 경로만 먼저 로컬 커밋으로 고정한 뒤 upstream을 통합하고 통합본을 검증한다.
- 로컬 Docker daemon은 꺼져 있음(기존 상태): DB integration을 시작하지 않았고 좁은 unit/typecheck와 배포 후 alpha 경로를 우선한다. load/swap은 기록 후 사용자 진행 지침에 따라 계속 작업한다.
- 문서 patch의 오래된 앵커가 일치하지 않아 최초 적용이 실패했으며, 정본 앵커로 다시 적용해 복구했다. 실패를 성공으로 보고하지 않는다.
