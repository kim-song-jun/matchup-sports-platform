# Task 158 — 팀 전적·후기·개인 기록 쇼케이스

## Objective

Alpha 앱에서 `내 팀 → 팀 상세 → 팀 전적(전체/대회/리그/친선) → 받은 후기 → 개인 카드·기록`을 한 팀과 선수의 일관된 실제 DB 데이터로 확인할 수 있게 한다.

## Scope

- Backend/data: `apps/v1_api/prisma/`의 alpha 전용 멱등 시드와 필요한 검증
- Frontend: `apps/v1_web`의 위 여정 진입점·탭 순서·표현 정합성
- QA/docs: 관련 시나리오, 모바일 스크린샷 증거

## Constraints

- v1 소스만 사용한다.
- production DB에서는 실행될 수 없는 기존 alpha 4중 가드를 유지한다.
- 기존 경기·감사 로그를 삭제하거나 reset하지 않는다.
- 전적과 개인 기록은 공식 결과 revision/fact 및 participant identity/consent 계약을 통과한 데이터로 만든다.
- 샘플 데이터는 자연스러운 가상 팀·선수 이름을 사용하되, 팀/선수 소개에서 Alpha 쇼케이스임을 명확히 표시한다.
- 결제·신뢰·실사용 실적으로 오인될 표현은 만들지 않는다.

## Acceptance Criteria

- [x] Alpha QA 페르소나가 로그인하면 `내 팀`에서 쇼케이스 팀을 찾고 팀 상세로 진입할 수 있다.
- [x] 팀 상세에 팀 기본 정보, 팀원, 팀 전적, 받은 후기 진입점이 실제 건수와 함께 보인다.
- [x] 팀 전적 탭은 `전체 → 대회 → 리그 → 친선` 순서이며 각 탭에 최소 1건의 공식 경기가 보인다.
- [x] 전체 전적에 승/무/패와 득실, 상대 팀, 대회/리그 이름, 주요 이벤트가 일관되게 보인다.
- [x] 받은 후기 화면에 해당 팀 및 대표 선수에 대한 공개 가능한 후기가 보인다.
- [x] 대표 선수 카드와 개인 기록에 출전·득점·도움 등 공식 경기 기반 기록이 보인다.
- [x] 시드는 재실행해도 중복 데이터가 생기지 않고 기존 사용자의 공개 설정 선택을 덮어쓰지 않는다.
- [x] 변경 계약을 검증하는 좁은 테스트와 committed-tree 검증이 통과한다.
- [x] 모바일 앱 기준 주요 화면 스크린샷을 남긴다.
- [x] 쇼케이스 팀 로고는 생성 폼과 동일한 10개 번들 프리셋 중 재현 가능한 무작위 순서로 DB에 저장한다.

## Work Plan

- [x] 기존 tournament/league alpha 시드와 game backfill 결과를 조사해 재사용 경계를 고정한다.
- [x] 쇼케이스 팀·선수·경기·후기 시드를 구현한다.
- [x] 요청 여정에 맞게 프론트 진입점과 전적 탭을 정리한다.
- [x] 단위/통합 검증 후 alpha에 배포한다.
- [x] 390px 모바일 화면에서 전 여정을 확인하고 스크린샷을 캡처한다.

## Progress Snapshot

- 2026-08-30: 최신 `origin/dev` (`917616ff2`) 기반 `feat/team-realistic-records` 작업 시작.
- 기존 공개 팀/개인 전적, 받은 후기, 선수 카드 화면과 API가 존재함을 확인했다.
- 기존 팀 전적 탭 순서는 `전체/정규 리그/대회/친선`으로 사용자 요청 순서와 다르다.
- alpha 배포가 tournament seed → league seed → fixture-game backfill → standings 재계산을 실행함을 확인했다.
- 2026-08-30: `팀밋fs` 7경기(4승 2무 1패, 19득점 12실점), 팀 후기 3건, `민준선수` 공식 3경기 4골 2도움과 선수 카드 OVR 78을 Alpha 실제 DB/API 경로로 배포했다.
- 공개 개인 기록과 마이페이지 활동이 동일한 `TOURNAMENT_FIXTURE + TEAM_MATCH` 공식 경기 모집단을 사용하도록 정합성을 보정했다.
- 개인 평판은 레거시 개인 매치와 공식 팀 매치의 개인 후기를 함께 집계하고, 쇼케이스 시드가 실제 후기 제출 경로와 같은 reputation projection을 만든다.
- 남은 작업은 로그인 세션에서 마이페이지를 포함한 10개 모바일 화면을 시각 검증하고 지정 폴더로 복사하는 것이다.
- 2026-08-30: 사용자 피드백에 따라 화면에 노출되던 `(테스트)`, `QA`, 번호형 선수명을 제거하고, 5개 팀·20명 선수로 구성된 자연스러운 서울 풋살 리그 데이터셋으로 확장한다. 팀/선수 소개에는 Alpha 쇼케이스 고지를 유지한다.
- Alpha 1차 배포 후 공개 프로필 `recentActivity.teamName`에 과거 side snapshot(`팀밋fs`)이 남은 것을 확인했다. 시드 소유 게임의 표시 스냅샷만 현재 팀명으로 동기화하고 공식 결과·fact는 유지한다.
- 2026-08-31: 로컬 스크린샷 재현을 시작했다. 기존 로컬 DB를 reset하지 않고 별도 `teameet_alpha` DB를 사용하며, 자연스러운 5개 팀에는 10개 번들 로고 후보를 고정 셔플 순서로 분산 저장한다.
- 2026-08-31: 완료 대회 7경기의 레거시 스코어를 로컬 전용 안전 가드 아래 `V1Game` OFFICIAL revision, team record fact, result participant, goal event로 투영했다. 팀 전체 전적 7건(대회 4·리그 1·친선 2)과 대표 사용자 개인 기록 7건을 실제 API로 확인했다.
- 2026-08-31: 390x844 headed Chromium 캡처 17/17, page/console/API 오류 0건을 확인하고 PNG 17개와 manifest를 요청한 바탕화면 폴더에 전달했다.
- 2026-09-01: 완료된 쇼케이스 게임의 `LIVE` 공개 정책이 public-live OFF 환경에서 `STATUS_ONLY`로 강등되어 `결과 비공개`가 되던 원인을 수정했다. 시드가 소유한 완료 대회·리그·친선 게임만 `OFFICIAL_ONLY`로 복구하고, 미완 경기와 사용자 기록 공개 동의 선택은 덮어쓰지 않는다.
- 2026-09-01: 실제 API에서 전체 7경기(4승 2무 1패), 대회 4경기, 리그 1경기, 친선 2경기와 누락 스코어 0건을 확인했다. 1주차 리그 상세는 공식 4:2, 이벤트 6건, 비공개 선수 0명이다.
- 2026-09-01: `output/playwright/task-158-local-showcase`에 headed Chromium 17/17(390x844, console/page/network/API 오류 0)과 `output/task158/android-emulator`에 API 36 Android 캡처 6장을 저장했다.

- 2026-09-01: Confirmed live Alpha had the featured team at 4/8 with seven completed records; expanded only the featured squad to 15/20 and added guarded result projection after game backfill and before standings recalculation.
- 2026-09-01 후속 실측: 로컬 캡처의 김민준 카드는 공식 7경기라 실버였지만 같은 Alpha 공개 API는 3경기·브론즈를 반환했다. 기존 Alpha 대회 게임에 이미 official revision이 있어 `seed-alpha-showcase-results.ts`가 `preserved`로 조기 종료하고 대표 선수 result participant를 보강하지 않은 것이 원인이다.
- 2026-09-01 Alpha 배포 실측: ECR 게이트 통과 후 기존 게임 한 건에 등록 명단 대표 선수의 `V1GameParticipant`가 없어 복구가 fail-closed로 중단됐다. 기존 공식 사실은 수정하지 않고 누락 참가자/라인업만 idempotent하게 보강한 뒤 superseding official revision을 추가하는 후속 복구를 적용한다.
- 기존 official revision/fact는 수정하지 않는다. 현재 공식 결과를 supersede하는 새 official revision에 양 팀 대표 참가자와 동일 스코어 facts를 append하고 current pointer를 옮기는 멱등 repair를 추가했다. 신규 DB 경로는 그대로 유지하며, 현재 revision에 두 대표 행이 있으면 재실행해도 새 revision을 만들지 않는다.
- 좁은 검증은 showcase seed/repair 2 suites, 22 tests와 v1 API `tsc --noEmit`이 통과했다. Alpha 배포 후 공개 API가 7경기·실버를 반환하는지 다시 확인하고 실서비스 선수 카드 캡처를 교체한다.
## Ambiguity Log

- “실데이터처럼”은 production 사용자의 실제 활동을 조작하는 뜻이 아니라, Alpha 전용임이 명확한 실제 관계형 DB 행과 공식 집계 경로를 사용하는 것으로 해석한다.
- 팀명·선수명은 실존 구단/인물을 복제하지 않는 자연스러운 가상 이름을 사용한다. 실제 데이터처럼 보이게 만드는 범위는 관계·기록·화면 정합성까지이며 실사용자 활동으로 오인시키는 사칭은 범위 밖이다.
- 로컬 Android 증거는 production Next 서버를 API 36 에뮬레이터 Chrome에서 열어 캡처한다. 앱 셸은 HTTPS 고정 origin을 fail-closed로 강제하므로, 아직 배포하지 않은 로컬 데이터를 임시 HTTP WebView로 우회하지 않는다. 서명된 Alpha WebView 최종 확인은 이 변경이 Alpha에 배포된 뒤 같은 경로로 반복한다.
