# Task 20261081: 리그 상세 대표 이미지와 통합 순위 팀 마크

Status: Done
**Owner**: root
**Created**: 2026-10-14

## Context
사용자가 공개 리그 상세의 참가팀 명단 기준을 질문하고 저장된 이미지와 통합 순위 팀 마크 표시를 요청했다.

## Goal
참가 명단 기준을 설명하고 저장된 리그 대표 이미지와 팀 로고를 실제 상세에 표시한다.

## Original Conditions
- [x] 참가 명단의 조회 기준 확인과 설명.
- [x] 리그 상세의 저장된 대표 이미지 표시 구현.
- [x] 통합 순위 팀 이름 옆 마크 표시 구현.

## User Scenarios
방문자가 리그 상세에서 대표 이미지를 확인하고 순위표에서 로고로 팀을 구분한다.

## Test Scenarios
- Happy: 이미지 저장값 표시, 순위 API 로고 전달 및 렌더.
- Edge: 이미지 없음, 로고 없음, 로고 로딩 실패, 종료 리그.
- Error: 기존 데이터 오류/재시도 유지, 모집 중 팀 식별정보 숨김 유지.
- Mock: 관련 단위 fixture를 실제 로고 필드와 동기화.

## Parallel Work Breakdown
단일 에이전트 직렬. Owned: tournament-detail-client와 테스트, league-standings-table와 테스트, API types, tournaments-read.service와 테스트, docs/api 및 changeset. Forbidden: schema, 다른 세션의 task/scenario WIP.

## Acceptance Criteria
- [x] 원본 조건 구현 및 명단 설명.
- [x] 관련 회귀 검증 통과 및 diff check.
- [x] alpha desktop/tablet/mobile 실제 검증 6/6 통과.

## Tech Debt Resolved
상세에서 무시되던 coverImageUrl과 순위 API의 누락된 팀 로고 전달을 해결한다.

## Security Notes
기존 공개 신원 게이트 유지. 선수 실명/연락처 노출 없음. 스키마 및 인증 변경 없음.

## Risks & Dependencies
샌드박스 helper 초기화 실패로 승인된 shell 경로를 사용한다. 브라우저 REPL도 동일 오류가 발생한다.

## Ambiguity Log
- 사용자의 '싹 다 진행'은 앞서 요청한 명단 설명과 두 변경 전체 실행으로 해석한다. 기존 shared 미디어/아바타 패턴을 재사용한다.
- 제공 리그의 alpha GET 응답은 coverImageUrl=null. 화면 변경으로 미저장 이미지를 복구할 수는 없다.
- 기존 패턴 재사용안을 적용: 16:9 미디어 영역 안에서 원본 전체를 보존(object-contain), 순위는 공유 TeamAvatar 28px. 사용자 전체 진행 지시 범위 안에서 별도 재설계 없이 구현.

## Progress Snapshot
- 최신 origin/dev 792042b7d 기반 격리 worktree 생성.
- 명단은 v1_tournament_players의 해당 registration_id 및 removed_at IS NULL 조회. 등번호·닉네임만 공개.
- Web 회귀 49/49, API 서비스 40/40. Web/API tsc 통과. Windows 기본 shell의 find/grep 실패는 Git Bash shell로 패턴 검사만 실행하여 Web/API 모두 통과.
- 변경 전 headed Chrome 390/768/1440 3/3: 순위 로고0, 대표 이미지 없음, 명단 클릭 정상, overflow0. 비로그인 auth/me401만 있고 업무 API 실패 없음. QA PID17656, 브라우저8764 종료 확인.
- Alpha 원본 참가팀 명단 수 6/6/5. 공개 상세와 리그 전용 상세 모두 coverImageUrl=null. 별도 이미지/실데이터 변경 없음.
- RED 실행은 기존 Windows 의존성 shim/링크 문제로 못 했고 격리 설치 후 GREEN을 확인했다. 기존 공유 node_modules/Prisma 산출물 변경 없음.
- 대표 이미지가 실제 저장된 완료 리그 `85a7c32f-17c7-485c-9d27-128406ebaa91`에서 before 3폭 재현: savedCover=true, coverVisible=false, overflow0. 이 리그를 이미지 after QA 대상으로 사용한다.
- PR #1914, head f5e1d02bdd1ff30d404659868de27ea9e726dd24. CI run 38488218703의 Gates/Web/API 모두 SUCCESS, MERGEABLE/CLEAN. 제품 코드·테스트·타입·문서는 커밋된 PR 트리 기준으로 검증했다.
- 00:20 UTC 기준 Copilot 요청/재요청 후 review 0, unresolved findings도 0이지만 이를 clean 리뷰로 간주하지 않는다. CLAUDE.md 운영 워크플로의 Copilot clean 조건 때문에 dev 머지/alpha after QA는 대기한다. 사용자에게 이번 변경의 수동 검토 대체 승인 또는 리뷰 대기 선택을 요청했다.
- 현재 이 마지막 checkpoint 문서 수정만 로컬에 남겼다. 통과한 PR head를 문서 업데이트로 바꿔 CI를 반복 실행하지 않는다.
- 사용자 2026-10-14: 명단 정책 변경은 취소하고 이미지·팀 마크 수정만 dev 배포 요청. 자동 승인 검토의 Copilot 예외 승인 질문에 '진행해줘'로 명시 승인함.
- PR #1914 dev 머지 완료: 1220f8102b5ee30530fdc53b6d16c7a68b5a82eb, 00:51:43 UTC. Deploy Alpha run 38492538724 진행 중. 기존 synced-dev-20261012의 WSL gitdir 경로를 repair한 뒤 --ff-only 동기화 완료(소스 WIP 변경/삭제 없음).
- dev push CI 38492538707의 API 통합 검증에서 기존 `games/game-projection.integration-spec.ts:200`의 expired lease takeover가 null로 반환되어 1건 실패(163 suites/1192 tests PASS). 이 변경은 worker/test/schema 파일을 수정하지 않으며 PR 전체 CI는 동일 테스트가 PASS였다. 성공한 작업은 유지하고 실패 API 작업만 재실행할 예정. 전체 run이 진행 중일 때 GitHub가 job 재실행을 거부하여 Web 종료를 기다린다.
- 이후 별도 PR #1915(`league-standings-expand`)가 dev에 머지되어 기존 CI가 취소됨. 재실행하지 않고 최신 dev 3e8007a2f89b649c0204224b6f007d26baba92b9의 push CI 38493462018 / Deploy Alpha 38493462223을 추적한다. `git merge-base --is-ancestor 1220f8102 origin/dev` PASS로 이번 수정 포함을 확인했다.
- 최종: push CI 38493462018 Gates/API/Web 모두 SUCCESS, Deploy Alpha 38493462223 SUCCESS. 실제 HTTP200, 릴리스 `1.9.0-alpha.20261014.g3e8007a2f89b`, SHA `3e8007a2f89b649c0204224b6f007d26baba92b9` 확인.
- Alpha after 6/6: 진행 리그 390/768/1440에서 순위 로고 3개 모두 로드, 완료 리그 390/768/1440에서 저장 이미지 원본 전체 표시·로드. 가로 넘침0, 업무 API/이미지 실패0, pageerror0. 비로그인 auth/me401은 기존 공개 방문자의 예상 인증 조회로 별도 기록.
- 실제 순위 API 모든 행에 teamLogoUrl 필드 존재, 로고3. 참가 명단 6/6/5 유지. 명단 정책/실데이터 변경 없음.
- QA PID24816/24448, browser20864/27316 모두 finally 종료. before/after 증거는 `docs/screenshots/league-detail-media/` 및 PR #1914 갤러리로 보존한다.
