# 2026-10-29 — 배포된 alpha 기반 main 승격 준비

## 판정

**릴리스 메타데이터 후보 생성 및 승격 게이트 사전 검증 PASS. main 승격은 아직 실행하지 않았다.**

이 문서는 2026-10-29 현재 배포된 alpha를 기준으로 한 준비 기록이다. 버전 PR을 dev에 반영한 뒤 그 새 SHA의 CI·alpha 배포·승격 게이트를 다시 확인해야 한다. main 대상 PR 개설·머지 및 production 환경 승인은 사용자만 한다(`CLAUDE.md` 브랜치 정책).

## 고정한 기준

| 항목 | 확인 값 |
| --- | --- |
| main | `852290b7f01a8e25bc842b1d19fe99467f174037` / PR #2058 |
| alpha 검증 기준 dev | `c7d185fa414672b02d49b2a443e8044b83648e2a` / PR #2093 |
| 현재 production 공개 릴리스 | `1.11.10`, main SHA 일치, DB health=true |
| 현재 alpha 공개 릴리스 | `1.12.0-alpha.20261029.gc7d185fa4146`, dev SHA 일치, DB health=true |
| 저장소 manifest 버전 | 양쪽 앱 `1.11.9` → 후보 `1.12.0` |
| 소비한 changeset | 33개, v1_api/v1_web fixed group |
| 기준 기능 차이 | main 이후 dev 120커밋, first-parent 승격 대상 PR 33개, 456개 파일 |
| main-only 이력 | 이전 승격 머지 `852290b7f` 1개. dev와 비교한 main측 추가 트리 차이는 0 |

공개 런타임 버전과 package.json 버전은 현재 resolver 정책상 구분된다. changeset 소비 후 manifest가 1.12.0이면 다음 alpha 라벨은 `1.12.1-alpha.<date>.g<sha12>`로 계산된다. 패키지 버전과 공개 릴리스 라벨을 임의로 동일하다고 표시하지 않는다.

## 포함되는 주요 변경

- **대진 설정 확장:** 4~64팀 짝수 대진, 조별 인원·진출 수, 단계별 미리보기와 초안 저장. 운영자 대진 생성 팝업·레이어·스크롤 및 이미지의 스키마 증명도 보강한다.
- **6팀 토너먼트:** 6강 성적 기반 결승 직행, 운영자 진출 조정, 준결승 부전승과 결승 연결을 포함한 사용자·운영 대진표.
- **조별·결선 정보:** 조별 1회전/2회전 설정, 결선 조 이름과 단계 필터, 경기 일정의 조별/결선 필터, 결과/운영의 결승·3위전 표시 순서 및 단판 합산 수정.
- **경기 운영·실시간:** 현재 경기 기준 운영 주체와 권한 경계, 운영권 전환과 경기 명단/시작 조건, 경기별 서버 권한 버전 및 연결 준비 이후 구독, 운영 콘솔 목록 복귀 개선.
- **상품·시상:** 분류를 저장하는 팀/개인/기타 시상과 자유 입력 이름, 동일 시상 상품/수상팀 묶음, 팀 상품 기본 전체 표시와 개인·기타 펼치기, 짧은 칩 우선/긴 상품 줄바꿈 및 분류 구분선.
- **이미지·모바일·팀 목록:** 업로드 입력/미리보기와 공개 안내, 대회 제목·이미지 도움말·경기 정보 줄바꿈, 태블릿 팀 생성 CTA와 불필요한 하단 여백 정리.
- **관리자 회원 목록:** 가입 상태와 연결 로그인 수단별 집계·복수 선택 필터.

항목별 원문은 두 앱의 `CHANGELOG.md` 1.12.0 절이다. 전체 PR 목록은 `git log --first-parent origin/main..c7d185fa --format='%h %s'`로 재현한다. 최근 포함 PR은 #2059–#2093 중 이 기준 범위에 머지된 33개이며 번호 범위 전체가 포함됐다는 뜻은 아니다.

## DB 및 설정 영향

추가 migration은 다음 3개다. 삭제·TRUNCATE·컬럼 제거는 없으며, 해당 체인/스키마 드리프트와 DB 통합 테스트는 기준 dev CI에서 통과했다.

| Migration | 내용 |
| --- | --- |
| `20261027100000_flexible_bracket_rounds` | `V1TournamentGroupPhase`에 round64/round32 추가, v1_tournaments에 nullable bracket_draft JSONB와 bracket_draft_revision(default 0) 추가 |
| `20261028000000_six_team_bracket` | nullable six_team_bracket JSONB 추가 |
| `20261028000001_six_team_mode` | six_team_mode BOOLEAN NOT NULL DEFAULT false 추가 |

- alpha는 `V1_FLEXIBLE_BRACKETS_ENABLED=true`로 검증한다. production compose는 기본 false이며 `V1_FLEXIBLE_BRACKET_TOURNAMENT_IDS`로 개별 허용할 수 있다. 승격 자체를 전체 신규 대진 활성화로 오인하지 않는다. 필요한 활성 범위는 운영자가 결정한다.
- 필수 신규 비밀/환경 파일은 추가하지 않는다. 환경 파일·production DB를 읽거나 수정하지 않았다.
- API 이미지의 Prisma schema attestation과 final-steady source/manifest 허용 digest가 새 추가형 스키마에 맞춰 갱신된다. 기존 M11 SQL digest는 그대로다.
- Task168 전환을 새로 포함하는 릴리스가 아니다. 과거 NO-GO 문서만 보고 Stage A/B를 다시 실행하지 않는다. 현재 main의 정상 production 배포 이력과 실제 배포 가드 결과를 기준으로 운영한다. M11 미적용을 가드가 보고하면 `prod-task168-transition-runbook.md`를 따르고 강제로 우회하지 않는다.
- 추가형 migration이라도 새 형식의 대진 데이터를 쓰기 시작한 후 구버전으로 되돌리는 것은 별도 호환성 판단이 필요하다. 복구 시 migration을 임의 삭제/되돌리지 말고 이전 immutable release와 DB 백업·PITR 정책을 함께 검토한다.

## 확인한 검증 증거

- 기준 dev CI: [Gates·Web·API 모두 PASS](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40816373911).
- 기준 alpha 배포: [재시도 2회차 성공](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40816373906). 최초 실행은 API 통합 검사보다 짧은 CI 대기 35분 한도를 초과했다. API 검증을 생략하지 않고 재시도했다.
- 현재 production main 배포: [성공 실행](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/40104402237). 공개 main SHA와 릴리스 헤더·DB health를 별도로 대조했다.
- 상품 상세의 실제 alpha guest 390/768/1440: 5개 팀 상품 → 전체 9개 → 팀 상품 5개, 첫 분류 위 선 없음/개인·기타 위 1px 선, overflow 없음, page error 없음. 비로그인 auth/me 401은 정상 인증 경로다. 브라우저 종료 시 analytics 요청 abort는 기능 오류로 계산하지 않는다.
- 준비 스크립트: `CONFIRMATION=PROMOTE bash scripts/release/promote-main.sh --prepare-only` PASS. alpha SHA/계산 버전 일치, 양쪽 버전·CHANGELOG 생성, changeset 소비와 main 승격 게이트를 검증했다. 스크립트 자체는 stage/commit/push/dispatch를 하지 않았다.
- `docs/scenarios/index.md` 일부 항목은 아직 “미배포/after 0”로 남아 있으나 최신 누적 alpha 배포와 문서 상태를 구분해야 한다. 이번 준비에서 33개 PR의 모든 사용자 흐름을 새로 수동 재검증한 것은 아니다. 주요 신규 대진 생성·운영권 전환·권한·실시간 플로우의 최종 운영 수용 판단을 사용자 승인에 포함한다.

## 사용자 최종 승격 전 단계

1. 버전 준비 PR은 **base=dev**로 검토한다. 기능 소스 변경 없이 두 앱 버전/CHANGELOG·changeset 소비·이 문서와 작업 문서만 포함하는지 확인한다. main-only 이전 승격 머지는 준비 브랜치의 `d76365a64`에서 흡수했고 후보 파일 트리가 그대로임을 확인했다. dev PR 머지 시 이 조상 관계도 dev에 반영된다.
2. 준비 PR이 dev에 반영되면 새 dev SHA의 CI와 alpha 배포를 기다린다. 기존 c7d185fa의 CI/alpha를 새 SHA의 검증으로 대신하지 않는다.
3. 새 alpha 커밋/릴리스 및 DB health, 미소비 changeset 0개와 main 승격 게이트를 다시 확인한다. 준비 도중 새 기능/changeset이 dev에 들어오면 후보 범위를 다시 고정한다.
4. 사용자가 `https://github.com/kim-song-jun/matchup-sports-platform/compare/main...dev?expand=1`에서 **base=main, compare=dev**를 확인하고 승격 PR을 직접 연다. 에이전트는 main PR을 만들거나 머지하지 않는다.
5. 사용자가 해당 PR의 CI·Copilot 리뷰·변경 범위와 필요한 alpha 수용 판단을 확인한 뒤 직접 머지한다. main push의 production 환경 승인은 별도 사용자 단계다. 승인 전에는 공개 production main SHA가 바뀌었다고 표시하지 않는다.
6. production 배포 후 공개 `/landing`의 `x-teameet-commit/release`, `/api/v1/health`의 DB 정상 및 대회/운영/상품의 실제 동작을 확인한다.

## 남은 확인

- 버전 PR의 CI 및 새 dev 후보 alpha 재배포 상태.
- production의 flexible-bracket 활성 범위 결정(기본 false 유지 여부/개별 허용 ID).
- 사용자 최종 운영 수용·main PR 개설/머지·production 환경 승인.

## 2026-10-29 최종 준비 갱신

- 기존 준비 PR #2095는 06:41 UTC에 dev로 머지됐다. 해당 PR CI 40826372452의 Gates/API/Web 모두 성공했다.
- 이후 #2096이 추가되어 현재 dev는 `14d809045a3db5c5b44ec3b2fc17018688733097`이다. 해당 SHA CI 40839015755와 alpha 40839015809 모두 성공. 기존 #2095 직후 실패한 실행은 이 최신 성공 실행과 구분한다.
- 10:46 UTC 공개 alpha는 `1.12.1-alpha.20261029.g14d809045a3d`, 동일 dev SHA, API DB health=true. production은 `1.11.10` / `852290b7f01a8e25bc842b1d19fe99467f174037`이다.
- #2096의 미소비 Changeset 1개 때문에 앞선 1.12.0 준비만으로 현재 dev를 승격할 수 없다. 격리 worktree `_worktrees/release-finish-20261029`, branch `chore/release-finish-20261029`에서 정본 `--prepare-only`를 실행했다. API/Web 1.12.1, 양쪽 changelog 갱신, Changeset 소비, main 승격 게이트 PASS. 기능/DB/배포 소스 변경 없음.
- Owned: 릴리스 메타데이터 5개 경로와 기존 task/readiness 문서. 공유 루트 WIP는 그대로 유지. 사용자 후속 지시로 이 후보의 커밋·dev PR 게시·CI 후 dev 머지 및 alpha 검증을 진행한다. 사용자가 별도 리뷰는 생략하도록 승인했다. CI와 main 사용자 전용 단계는 유지한다.
- 다음: 이 후보를 dev 대상 준비 PR로 전달 → 새 dev SHA CI/alpha 성공과 공개 SHA/DB/버전 재확인 → 미소비 Changeset 0 확인 및 승격 게이트 재실행 → 사용자가 main 승격 PR 개설/머지 및 production 승인.
- 사용자용 비교 링크: https://github.com/kim-song-jun/matchup-sports-platform/compare/main...dev?expand=1 . 새 준비 PR 검증 전에는 최종 승인 준비 완료로 판정하지 않는다.
- production flexible-bracket 활성 범위 결정과 기존 문서의 수동 QA 잔여 사항은 계속 남는다. 이번 작업은 새 기능 QA를 대체하지 않는다.