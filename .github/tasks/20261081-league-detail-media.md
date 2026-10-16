# Task 20261081: 리그 상세 대표 이미지와 통합 순위 팀 마크

Status: Review
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
- [ ] alpha desktop/tablet/mobile 검증 또는 정확한 blocker 기록.

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


## 2026-10-16 — 목록/상세 이미지 분리 (후속 요청)
Status: Review. Canonical task는 이 문서이며 같은 번호의 schedule/standings task는 별개다.
- Original conditions: 리그 목록/상세 이미지를 각각 저장; 기존 이미지가 있으면 두 저장값을 동일하게 전환.
- Scope: v1 API/DB, admin 이미지 편집, 공개 목록/상세, 타입/mock, API 문서.
- UI: A 두 업로더(추천), B 탭 전환, C 상세 별도 지정 옵션 제시. 사용자가 “지금 팀매치 참고”로 기존 두 이미지 패턴 재사용을 선택. TeamMatchImagesField 직접 재사용.
- Owned: V1Tournament 이미지 필드/추가 migration, league-cover-image DTO/service/tests, league read/season inheritance, tournament card/detail presenters, 관련 web control/types/tests, docs/api.
- Forbidden: 다른 worktree/WIP, main 승격, seed/reset, 사용자 이미지 파일 삭제.
- Plan: 저장 계약·기존값 backfill → UI 선택/편집·노출 → 회귀 검증/타입 검사 → 증거 기록.
- Acceptance: [x] UI 선택 [x] 두 필드 독립 저장/제거 [x] 기존값 backfill SQL 구현 [x] 목록/상세 각 이미지 [x] 다음 시즌 상속 [x] 권한·오류·감사 보존 [x] 관련 단위 테스트 [x] alpha blocker 기록 [ ] 실제 DB 통합 검증 [ ] alpha 3폭 시각 검증.
- Data contract: 기존 coverImageUrl은 상세 이미지로 유지하고 listImageUrl을 추가. 한 필드 변경이 다른 필드를 덮어쓰지 않도록 PATCH한다.
- Risks: DB migration 필요. 현재 세션 브라우저 도구 미제공; 배포/실측 완료로 간주하지 않는다.
- Progress Snapshot: 최신 origin/dev a8bd190a9 기반 feat/league-list-detail-images, _worktrees/league-list-detail-images. 기존 공유 트리 WIP 보존.

- 사용자 선택: 팀매치 패턴과 동일하게 한 장만 있으면 두 표면에서 함께 사용. 저장값은 독립 보존하며 admin은 raw 값을, 공개 응답은 해당 표면의 유효 이미지를 반환한다.

### PR 준비 검증 (2026-10-16)
- Phase 1 복원/리뷰: 완료. 기존 27개 수정 파일과 migration/changeset을 보존하고 최신 origin/dev와 동일 기준임을 확인.
- Phase 2 보완: 완료. 공개 상세 MSW의 한 장 이미지 공유 동작을 실제 API와 일치시킴. 상세 우선/목록 대체/둘 다 없음/일반 대회 비영향 4개 회귀 추가.
- Phase 3 로컬 검증: API 관련 4 suites 85 tests, Web 관련 2 files 10 tests 통과. API/Web tsc 및 surface/pattern 검사 통과. diff check 통과, touched paths의 새 debt marker 없음.
- Windows 패턴 검사는 임시 실행기에서 child_process shell만 Git Bash로 지정. 저장소 검사 코드/환경 파일 변경 없음. 새 서버나 브라우저 실행 없음.
- DB: V1Tournament / v1_tournaments.list_image_url nullable TEXT 추가. 기존 regular_league.cover_image_url을 복사하는 additive migration. Docker daemon 미실행으로 HTTP/DB integration 및 migration replay는 미실행이며 CI 확인 필요.
- Alpha: 아직 feature branch로 미배포. 저장소 규칙상 dev 머지/alpha 배포 후 admin 이미지 변경·제거, 공개 목록/상세를 390/768/1440에서 확인하고 PR에 갤러리를 게시해야 함. 로컬 검증은 화면 PASS가 아님.
- Phase 4 PR: dev 대상 PR 생성/리뷰 진행. 사용자 요청 범위는 PR 게시이며 머지/배포하지 않음.

### PR #1955 순차 수정 (2026-10-16)
- #1957 수정 push 후 착수. 최신 `origin/dev=ebfac9aee`와 기존 PR head를 격리 작업트리에 통합했다. 기존 공유 트리의 WIP/Prisma 생성물은 보존했다.
- RED: CI API의 game-schema source snapshot 불일치와 Gates의 current/historical binding 실패를 확인했다. Git 정본 LF 스키마 해시 `1f217e10790894fd23fb206aa4b8693c9fb8c35ceadd2e99e60a4a5731b33970`가 fixture/배포의 기존 `d54fe0...` pin과 다른 것을 로컬에서도 재현했다.
- Fix: Docker 생성 클라이언트 증명, final 릴리스 바인더, 매니페스트 생성/검증 및 game-schema fixture를 새 해시로 동기화했다. 기존 manifest 허용 해시와 역사 migration은 유지했다. 추가 schema/migration/API/UI 변경은 없다.
- GREEN: API 이미지·공개 조회·시즌 상속 86/86, Web 이미지 컨트롤 10/10; API/Web tsc 및 surface/pattern PASS. 실제 fixture snapshot 검증 PASS. LF 임시 복사본에서 바인딩 7/7(현재·과거 manifest 허용, 변조·클라이언트 불일치 거절) 및 manifest self-test PASS. jq는 공식 1.8.1 checksum 검증한 임시 바이너리만 사용했다.
- 실DB: Docker 미가동으로 migration replay/HTTP integration은 새 PR CI 확인 대상이다. Alpha 3폭과 관리자 쓰기 QA는 feature 미배포로 기존 미완료 상태를 유지한다.
- 두 PR은 독립적으로 같은 dev를 기반으로 한다. #1957의 byeSortOrder와 #1955의 listImageUrl이 모두 포함된 최종 스키마는 다른 해시이므로, 첫 PR 머지 후 두 번째 PR에서 최신 dev 통합과 결합 LF 해시 재계산이 필요하다. 서로의 스키마 pin을 그대로 채택하면 안 된다.

### PR #1955 후속 Gates 수정 (2026-10-16)
- CI `38907223065`의 API/Web은 SUCCESS: migration replay+drift, API/Web unit/type/build, HTTP/DB evidence 단계를 통과했다. 앞 절에서 대기했던 실DB 검증은 이 CI 증거로 갱신한다.
- 남은 Gates 실패는 `Expand-contract migration gate (PR)`였다. 실제 PR diff를 로컬 게이트에 넣어 `20261016070000_league_list_image/migration.sql`의 이미지 복사 UPDATE 거절을 재현했다. 스키마 바인딩 검사는 이미 통과한 상태다.
- 새 nullable 컬럼만 채우고 원본 이미지·업로드·일반 대회·다른 컬럼은 보존하는 기존 SQL을 검토했다. 정확한 (파일, 정규화 SQL) 한 쌍에만 롤링 배포/애플리케이션 롤백 호환 근거를 등록했다. migration SQL과 일반 additivity 판정은 변경하지 않았다.
- self-test에 실제 migration 승인 및 다른 파일/리그 종류/목적 컬럼의 거절 대조군을 추가했다. self-test 전체 PASS, 실제 origin/dev→PR head 게이트 RED→GREEN, diff check PASS, 새 debt marker 0. 제품 코드는 변경하지 않아 이미 green인 API/Web 전체 검증을 로컬에서 반복하지 않았다.
- #1957 확인: 최신 head `7f618a2d6`의 Gates/API/Web SUCCESS, PR open·미머지, 제출된 리뷰 0건, 자동 리뷰 작업 failure. Alpha health의 실제 commit=`ebfac9aeecbcca0a33b435d514d828aa76052dc9`, release=`1.9.5-alpha.20261016.gebfac9aeecbc`, DB=true. #1957 미배포이므로 새 홈·어웨이 관리자 저장 및 390/768/1440 after QA를 현재 alpha에서 완료했다고 주장하지 않는다.

### 사용자 승인 순차 dev/alpha 반영 (2026-10-16)
- 사용자 “그렇게 진행해줘” 승인: #1957 dev 반영/alpha 확인 → #1955 최신 dev 통합·결합 스키마 검증 → CI 후 두 번째 반영 → alpha QA. main 승격은 범위 밖이다. 자동 Copilot 실행 실패는 계속 기록하며 clean 리뷰로 표시하지 않는다.
- #1957: 승인된 head와 같은 Git tree의 dev 병합 커밋 `9cd5777aad24981262e4d67fa2fabc249c1f4586`; GitHub PR Merged 확인. dev CI=`38913930851`, alpha=`38913931180` 실행 중. 로컬 dev를 내용 원복 없이 stat refresh 후 ff-only 동기화했으며 원본 바이트는 `tmp/dev-sync-1957-backup`에 보존했다.
- #1955: 위 dev를 통합하며 충돌 6개 해소. listImageUrl/byeSortOrder와 두 migration의 검토 기록을 모두 보존했다. 결합 LF schema SHA=`889825d76c637af8da4caa57542578363b8d08c6bec6a0eb43813c2416445f78`를 Docker/fixture/binder/manifest에 반영하고 이전 두 PR 해시의 manifest 허용도 유지했다.
- 결합 검증: API6 suites300 tests, Web3 files24 tests, API/Web tsc PASS. 안전 게이트 self-test(실제 이미지 migration·부정 대조군 포함), LF 바인딩7개 및 실제 manifest 생성 self-test PASS. 자동 생성 클라이언트는 격리 작업트리에서만 갱신했다.
- 사용자 로그인 후 별도 headed Chrome에서 `/api/v1/admin/me`200·ops 확인. 브라우저 helper PID20016/parent10548, Chrome8648. alpha after QA는 실제 배포 SHA 확인 후 실행한다.
- 남은 단계: 결합 head PR CI → #1957 alpha 성공/실측 → #1955 dev 반영·로컬 동기화 → 두 번째 alpha/관리자 저장·제거 및 공개 화면390/768/1440 QA → owned 브라우저 cleanup.
