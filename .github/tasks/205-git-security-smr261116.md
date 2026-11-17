# Task 205: Git SMR261116 보안 검증

Status: In Progress
Owner: Codex
Created: 2026-11-17

## Context
Git 권고의 수정 버전은 2.50.2/2.51.3/2.52.1/2.53.1/2.54.1/2.55.1/2.56.1이다. 개발 PC는 2.56.1.windows.1이지만 기존 서버는 미확인이다.

## Goal
Node.js PR과 분리하여 실제 Git 실행 버전을 검증하고 CI·초기 설치에서 미달 상태를 차단한다.

## Original Conditions
- [x] 별도 dev PR.
- [x] 실제 실행 버전 검사 및 업데이트 절차 제공.
- [ ] CI·리뷰·Alpha 검증과 기존 서버 현황 기록.

## User Scenarios
운영자가 서버 초기 설정을 실행하면 Git 설치 후 기준을 검증하고, 미달 시 clone/배포 전에 원인과 조치를 안내하며 실패한다.

## Test Scenarios
- Happy: 유지보수 계열별 패치 버전 및 Windows 빌드 통과.
- Edge: 다음 계열의 안정 버전 통과; prerelease와 해석 불가 출력 차단.
- Error: 모든 직전 취약 버전과 Git 실행 실패 차단.
- Mock updates: shell PATH mock은 실제 CLI 종료 상태를 확인. 앱 fixture 변경 없음.

## Parallel Work Breakdown
단일 에이전트 순차 수행. Owned: Git 검사·테스트, CI Git step, 서버 Git 설치 직후 검사, ops 문서, changeset, 본 task. Forbidden: Node 버전 및 앱 로직.

## Acceptance Criteria
- [x] 취약 버전이 silent success로 통과하지 않음.
- [ ] 실제 CLI 및 경계 테스트 통과.
- [ ] CI·리뷰 통과와 dev 머지.
- [ ] 기존 서버 증거 또는 정확한 접근 blocker 기록.

## Tech Debt Resolved
Git 설치 성공을 보안 패치 완료로 간주하던 초기 설정의 공백을 제거한다.

## Security Notes
backport는 공급자 근거가 필요하며 자동 예외를 두지 않는다. 신뢰하지 않는 재귀 submodule clone을 피한다. 기존 서버 OS를 이 변경에서 임의 업데이트하지 않는다.

## Risks & Dependencies
배포판이 패치되지 않은 낮은 버전을 제공하면 초기 설정이 의도대로 중단된다. 기존 서버 점검에는 운영 권한이 필요하다.

## Ambiguity Log
GHSA의 patched none과 공식 릴리스 노트가 상충하므로 공식 릴리스 노트와 설치 바이너리를 기준으로 판단한다.

## Progress Snapshot
origin/dev 9f157aa57에서 별도 worktree 생성. 개발 PC Git은 패치 기준 충족. 기존 서버 현황은 미확인.
- 실제 CLI PASS: git version 2.56.1.windows.1. Git 경계·실행 실패 계약 20개 통과. DB guardrail 통과.
- production security guard는 Windows CRLF checkout에서 기존 compose 키를 미탐하여 LF committed-tree로 재검증한다.
- LF committed-tree에서 production security guard와 20개 shell 계약 통과.
- Alpha 읽기 전용 SSM 실측: Git 2.50.1, RPM git-2.50.1-1.amzn2023.0.1.x86_64. 설치 패키지 changelog에서 두 CVE/2.50.2 수정 근거를 찾지 못했다. 캐시된 업데이트 목록에도 후보가 없었다(실시간 공급자 업데이트 확인은 별도). 기존 호스트의 패치 완료로 표시하지 않는다.
- Amazon 공식 ALAS2023-2026-3445에서 수정 backport `2.50.1-1.amzn2023.0.2`, release snapshot `2023.12.20261112` 확인. 실제 실행 파일 RPM 소유자·공급자·release·파일 무결성을 모두 검증하는 좁은 backport 허용과 26개 계약 테스트를 추가했다. Alpha의 `.0.1`은 기준 미달이다.
