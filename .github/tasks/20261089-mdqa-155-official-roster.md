# MD-QA #155: 공식 결과 정정을 팀 경기 출전에 반영

Status: In Progress
**Owner**: QA root → dedicated backend owner
**Created**: 2026-10-16

## Context
https://teameet.jmandu.kr/issues/155/ 의 실제 설명·재현·최근 댓글을 읽었다. 공식 결과 revision2에서 출전 선수를 바꿔도 팀장 경기 출전 탭은 정정 전 lineup을 표시한다. 기존 #1924 이전 증상이며 #146의 친선 기본 명단 작업과 다른 계약이다. 전체 열린 dev PR5건과 canonical 작업·워크트리를 대조했고 중복 수정 PR은 없다. root가 실제 UI에서 김성준 담당·확인 중 저장을 확인했다.

## Goal
종료된 경기의 팀 경기 출전 조회가 실제 최신 공식 결과(정정 포함)의 출전을 일관되게 표시한다.

## Original Conditions
- [x] 인증된 UI에서 선점 저장과 실제 담당·상태 확인.
- [x] fetch 직후 managed origin/dev57c6097 기반 전용 worktree/feature branch.
- [ ] 실제 결함 → 좁은 실패 회귀 → 최소 수정 → committed GREEN → 독립 리뷰 → dev PR → 기존 리포트 댓글.

## User Scenarios
리그 경기를 공식 확정한 뒤 운영자가 출전 선수 A를 빼고 B를 추가해 공식 정정을 확정하면, 팀장 경기 출전 탭도 정정된 공식 출전 A 제외/B 포함을 표시한다. 미확정 정정 초안은 공식 출전을 덮지 않는다.

## Test Scenarios
- 실제 roster service/API consumer에서 공식 revision 교체 전후 출전 반영 RED/GREEN.
- 미확정 초안, 공식 결과 없음, 시작 전/진행 중, 다른 팀/권한 거부 대조군.
- 다른 side의 개인정보·편집 권한을 넓히지 않고 과거 lineup/결과 이력을 변경하지 않는다.

## Parallel Work Breakdown
Phase A: dedicated owner reads v1 rules/source and proposes exact owned production/test paths, then prepares tests only. Root runs RED and authorizes smallest production fix. Shared hooks/types/MSW/DTO/schema are forbidden unless root assigns a single owner first. Root owns serial tests, Git, review integration, PR, browser and SSOT. No worker self-commit or heavy validation. Other agents are working; preserve their changes.

## Acceptance Criteria
- [x] 최신 공식 결과 기준 출전 반영과 초안/권한/미시작 대조군.
- [x] 실제 실패/수정/committed 통과 근거와 독립 C0/W0.
- [x] API 문서·필요 fixture·Changeset 동기화, diff/debt/untracked import 검수.
- [ ] dev PR 실제 CI/스레드 확인, 배포 SHA 실제 alpha 검증과 기존 댓글·이미지 저장 확인.

## Tech Debt Resolved
조사 후 범위 내 projection drift만 기록한다.

## Security Notes
인가·팀 범위·개인정보 보호 유지. .env/비밀 읽기 금지. GET 쓰기·공식 결과 조작·과거 이력 재작성 금지.

## Risks & Dependencies
#146과 인접 파일 가능: 독립 worktree이며 기능 중복으로 간주하지 않는다. 원 checkout main은 변경하지 않는다. Attachment100 등록 제한은 보존하고 checkout을 중복 생성하지 않는다. 브라우저/검증 root 단일 슬롯.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
| --- | --- | --- | --- |
| 2026-10-16 | root | 정정 초안도 반영하는가 | 최신 공식 결과만 반영; 실제 v1 계약과 대조 |

## Progress Snapshot
- root: report155-claimed.png에 실제 선점 표시 보존. base57c6097, branch fix/mdqa-155-official-roster. 최초 fixture 타입 컴파일 실패는 동작 RED와 분리해 보존했다. 타입 수정 뒤 실제 서비스 회귀 RED는 13건 중 6 FAIL / 7 PASS(16.653s, mdqa155-official-result-real-red.log).
- backend: root의 RED 확인·승인 뒤 game-roster.service.ts의 종료 경기 조회만 현재 OFFICIAL 리비전 출전자와 같은 경기·사이드의 보존 참가자 스냅샷으로 투영하도록 수정했다. 전용 회귀 스펙과 함께 동결했으며 후속 GREEN·Git·PR·alpha 검증은 root 담당으로 아직 NOTRUN. 스키마·DTO·권한·쓰기·과거 이력 변경 없음.

### 2026-10-16 root 검증 갱신

- 실제 RED는 13건 중 6 FAIL / 7 PASS(16.653초)이며 최초 fixture 타입 컴파일 실패와 구분한다. 제품 커밋 `8864005f14993c6c0718a57d370777e754ebe8f6`의 좁은 회귀는 13/13 PASS(83.417초), 종료 코드 0이다. Jest 지연 종료 경고는 원인 미확인으로 보존하며 forceExit를 사용하지 않았다.
- 최신 dev `a2647c89982bfc6acfbdaa209b80f8d11601a6f2`를 일반 merge한 검증 HEAD는 `ee98d9be20a6e1c957069d5590233a4833c06490`이다. 관련 제품·회귀 소스는 검증한 커밋과 동일하며 다른 작성자의 SEO/기간 데이터 변경과 소유 파일이 겹치지 않는다.
- 해당 committed 통합본 API TypeScript `--noEmit --incremental false` 종료 코드 0, API surface PASS: 683파일, 원시 대회 단건 조회 0/baseline0, raw SQL32/baseline32, 리그 허용34/baseline34, v1League 쓰기0, 목록 표면1/baseline1. 로그는 root git 제외 QA 증거 `mdqa155-ee98-api-tsc.log`, `mdqa155-ee98-surface.log`에 보존한다.
- 독립 구현자 외 리뷰 C0/W0, 전체 PR 범위 5파일 검토 C0. API 문서·Changeset 포함, diff/check·신규 debt marker·미추적 import 검수 완료. PR 게시 직전 최신 dev drift와 committed path 범위를 다시 확인한다.
- dev PR·최신 head CI·정식 리뷰·머지·배포·실제 alpha 390/768/1440 및 console/network는 아직 대기다. 원 리포트의 재현 화면과 코드 테스트를 수정 후 실제 alpha PASS로 간주하지 않는다. 이전 snapshot은 이력으로 보존한다.
