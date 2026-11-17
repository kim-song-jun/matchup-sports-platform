# Task 204: Node.js SMR261116 보안 업데이트

Status: Review
Owner: Codex
Created: 2026-11-17

## Context
ICTIS 2026-11-16 권고와 Node.js 2026-11-11 보안 릴리스에 따라 22 계열의 최소 보안 버전은 22.23.5다. 기존 dev는 mutable 22 이미지와 오래된 검증 이미지 digest를 사용한다.

## Goal
v1 이미지·개발·CI에서 패치된 Node.js 22를 사용하고 dev PR과 Alpha 증거를 남긴다.

## Original Conditions
- [x] Git 권고와 별도 dev PR로 처리한다.
- [x] API·Web·worker가 공유하는 Node 기반 이미지를 패치한다.
- [ ] CI·리뷰·Alpha 검증을 완료한다.

## User Scenarios
운영자는 새 이미지를 배포하면 패치된 Node로 API·Web·worker를 실행한다. 개발자는 .nvmrc로 같은 버전을 선택하며 미달 버전은 CI 검사에서 거부된다.

## Test Scenarios
- Happy: 공식 Alpine/Bookworm 이미지 digest 조회, 실제 Node 버전, 저장소 설정 계약 통과.
- Edge: 이후 22 패치 허용, 다른 메이저 및 prerelease 거부.
- Error: 취약 런타임·Docker·CI·engine 설정 회귀가 실패한다.
- Mock updates: API/DB 계약 변경 없음.

## Parallel Work Breakdown
병렬 에이전트 없이 순차 수행. Owned: Node Dockerfiles, .nvmrc, package engines, Node CI 설정, Node 검사·테스트, 본 task, changeset. Forbidden: 앱 비즈니스 로직, Git PR 파일.

## Acceptance Criteria
- [x] 공식 22.23.5 multiarch digest 고정.
- [x] CI가 실제 실행 버전과 설정을 검증.
- [ ] 최소 계약 테스트, CI, 리뷰 통과.
- [ ] dev 머지 및 Alpha 실행 버전 확인.

## Tech Debt Resolved
검증 이미지의 오래된 digest, 20 계열을 설치하던 서버 초기 설정, 패치 버전 미지정 개발 환경을 정리한다.

## Security Notes
https://nodejs.org/en/blog/release/v22.23.5 및 https://nodejs.org/en/blog/vulnerability/november-2026-security-releases 기준. npm/npx 제거 및 기존 OpenSSL/zlib 보안 갱신은 유지한다. 운영 승격은 사용자 전용이다.

## Risks & Dependencies
공식 이미지 pull, GitHub CI/리뷰 및 Alpha 배포가 필요하다. 실제 서버 버전은 배포 후 확인하며 설정만으로 해결 완료라 하지 않는다.

## Ambiguity Log
없음. 메이저 업그레이드 없이 22 계열 유지.

## Progress Snapshot
- origin/dev 9f157aa57에서 격리 worktree 생성.
- 공식 registry에서 22.23.5 Alpine/Bookworm multiarch digest 존재 확인.
- 로컬 전체 앱 빌드는 반복하지 않고 좁은 보안 계약과 CI를 사용한다.
- 공식 Alpine/Bookworm digest 실행 결과 모두 v22.23.5. 패치된 Bookworm에서 보안 검사와 3개 계약 테스트 통과. 개발 PC 22.17.0은 실제 검사에서 거부됨.
- DB guardrail 통과. production security guard는 Windows CRLF checkout에서 기존 KAKAO_ADMIN_KEY를 미탐하므로 LF committed-tree로 재검증한다(원본 compose에 키 존재 확인).
- core.autocrlf=false archive의 Linux committed-tree에서 production security guard 통과.
- Alpha 사전 실측: API·Web·worker 모두 v22.23.5. 고정 버전 회귀 방지 PR로 진행한다.
- 보안 리뷰 지적에 따라 기존 remote curl-to-root 설치를 고정 커밋·SHA256 검증 후 실행으로 변경하고 변조 payload 차단 테스트 추가.
- PR #2425(dev). 보안 스캔의 mutable installer 지적 수정·답변·resolve 완료. 최신 head Copilot 제출 리뷰 및 전체 CI 결과는 확인 중이며 clean/merge 완료로 표시하지 않는다.
