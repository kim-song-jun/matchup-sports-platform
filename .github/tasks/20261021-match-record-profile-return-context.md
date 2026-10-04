# Task 20261021: 경기 기록 선수 프로필의 복귀 문맥 (#1418)

Status: Review (local contract checks passed; committed head CI and alpha QA pending)
**Owner**: Codex root → independent product review → parent alpha QA
**Created**: 2026-10-04

## Context

[#1418](https://github.com/kim-song-jun/matchup-sports-platform/issues/1418)은 대회 득점자 프로필의 페이지 뒤로가기가 원래 대회 대신 /teams로 가는 결함이다. [PR1467](https://github.com/kim-song-jun/matchup-sports-platform/pull/1467)은2026-10-01 14:43:18 UTC에 bracket 순위 링크만 해결했으며 shared MatchDetailContent는 수정하지 않았다. 시상·현재 bracket 정상 대조와 대회/리그 경기 기록 잔여를 구분한다.

Fresh origin/dev951a67e3423dec502697f8bab2d78696d9374cc5에서도 실제 shared 컴포넌트가 from을 받지만 선수 ProfileLink는 raw href를 사용한다. 라인업·득점자·도움·MVP 네 군이 출처를 누락한다. 현재 열린 dev PR0이며 동일 수정 중복0이다.

원래 실제 alpha 증거는 [대회 기록1180](https://github.com/kim-song-jun/matchup-sports-platform/issues/1418#issuecomment-5944838362), [리그 기록390/768/1440](https://github.com/kim-song-jun/matchup-sports-platform/issues/1418#issuecomment-5944873604), [awards/bracket 정상 대조](https://github.com/kim-song-jun/matchup-sports-platform/issues/1418#issuecomment-5945079055)다. 캡처는2026-10-02, serving SHA unknown이다. 부모가 완료 console의 live 접근을 거절한 범위를 우회하지 않고 현재 실행의 alpha 재현/after는 미검증으로 남긴다.

## Goal

서버가 공개를 허용한 선수 프로필 링크에 현재 경기 기록의 안전한 from을 전달해 실제 AppBackLink가 원래 기록으로 복귀하도록 한다.

## Original Conditions (must all be satisfied)

- [x] actual MatchDetailContent from 링크 RED→GREEN 후 shared1제품파일만 최소 수정.
- [x] 라인업 홈/원정·득점·도움·MVP와 period/unknown period 모두 출처 보존.
- [x] 공개동의 profileHref:null 평문 gate, 외부 from 제외, 직접 진입 fallback 및 URL query/hash 계약 유지.
- [x] 원 이슈 전체 조건·기존 정상 경로·미검증 원래 필터/탭/scroll을 구분.
- [ ] 회귀/lint/typecheck/6guard·명시 pathspec·전용 branch·Ready/dev PR·정확 head CI.
- [x] 보호된 완료 결과/QA179/권한/실제 데이터/다른 세션 변경 및 병합·배포·자동승인0.

## User Scenarios

대회 또는 리그 경기 기록에서 공개된 선수 이름을 눌러 프로필을 연다. 페이지의 뒤로가기는 현재 경기 기록의 query/hash와 앞선 내부 from 체인을 유지한다. 공개 프로필 링크가 null인 이름은 평문을 유지한다. 출처 없는 직접 프로필 진입은 기존 /teams fallback을 유지한다.

## Test Scenarios

### Happy path
- [x] 실제 shared renderer의 여섯 link(네 군/두 lineup side/known·unknown period)와 대회·리그 nested source.
- [x] 실제 AppBackLink 클릭 + 실제 jsdom navigation history로 바로 앞 경기 복귀; Next router/search 경계만 대체.
### Edge cases
- [x] target profile query/hash 보존, source nested query/hash 보존.
- [x] from 없음 control, 외부/protocol-relative/backslash/정규화 외부/script 출처 제외.
### Error paths
- [x] profileHref:null의 여섯 이름은 출처가 있어도 link0. 직접/unsafe profile 진입 fallback control.
### Mock data updates needed
- [x] local synthetic PublicMatchDetail fixture만 추가. 실제 응답/schema/API/DB/seed 변경0.

## Parallel Work Breakdown

Root owns product/test/task/changeset 및 git/CI. child는 v1 호출부·서버 공개 gate·기존 정상 경로와 root 제품 patch를 읽기 전용 검토한다. 테스트·린트는 root가1worker 직렬, full suite/build는 CI 소유. 별도 parent browser는 건드리지 않는다.

### Owned files

`apps/v1_web/src/components/public-game-records/match-detail-content.tsx`, `match-detail-profile-return.test.tsx`, 이 task, `.changeset/match-record-profile-return-context.md`.

### Forbidden files

shared withFromPath/sanitizeRedirectPath/AppBackLink, 팀 명단/bracket/awards 기존 정상 코드, backend/API/DTO/schema/공개동의/권한/status gate, 다른 WIP/미병합 코드/완료 경기 및 QA179 데이터. live 완료 console 접근·서버 저장·브라우저 우회·merge/deploy/paid review0.

## Acceptance Criteria

- [x] 이 잔여의 source/실제 컴포넌트 계약·검증과 원 이슈 전체 수용 조건을 구분.
- [ ] exact committed scope4/clean/diff check/debt markers0 및 정확 CI/독립 검토 기록.
- [x] 공개 actual before 원본/시간/폭을 정확 인용하고 after는 승인 alpha 배포 후 부모 QA.
- [x] Refs #1418 유지. 전체 원래 bracket/팀명단/직접/탭/scroll·실제 이미지 QA 전에는 이슈 종료하지 않음.

## Tech Debt Resolved

한 shared 선수 링크 helper와 from 전달로 네 군의 동일 누락을 함께 정리한다. 서버 공개 gate나 새 navigation helper를 중복하지 않는다.

## Security Notes

서버의 nullable profileHref gate를 그대로 신뢰하고 null에 임의 링크를 만들지 않는다. 기존 withFromPath의 same-origin redirect 검증·chain bound를 사용한다. 외부 from을 허용하거나 숨은 선수 정보를 생성하지 않는다. 실제 동의/명단/권한/성적/운영 데이터 변경0.

## Risks & Dependencies

actual renderer/jsdom history는 실제 alpha Next 런타임·물리 기기·scroll 복원 증거가 아니다. 부모의 완료 console 접근 거절을 우회하지 않는다. 원본 screenshots는 이미 공개된2026-10-02 before이며 현재 새 before 촬영0, serving SHA unknown이다. query/hash는 코드 계약으로 보존하나 actual 원탭/scroll 완전 복원은 승인된 alpha QA까지 대기한다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-04 | Root | 기존 PR1467의 Fixes1418 의미 | bracket만 해결. 이슈는 OPEN이며 댓글의 shared 대회/리그 기록 경로는951에서도 잔여. 전체 완료로 세지 않음. |
| 2026-10-04 | Parent | live 완료 console 접근 제한 | 우회0. local synthetic/source 검증과 기존 공개 before만 사용하고 actual after 대기. |
| 2026-10-04 | Parent | 이미지 상세 개선 목업 | 기존 /tmp/teameet-team-match-photo-contrast-options-20261004.html 존재/동일hash 확인. 이번 구현 범위에 섞지 않음. |

## Progress Snapshot

- Fresh fetch origin/dev951a67e, WT `/tmp/teameet-issue-1418-profile-return-20261004`, branch `fix/issue-1418-match-profile-return-context`.
- 원격 dev를 2026-10-04 10:43 UTC에 다시 읽어 같은 SHA와 열린 dev PR 0을 확인했다. main 및 기존 feature WT 변경0.
- 수정 전 actual component 신규26사례에서 RED **16 FAIL / 10 PASS**. 최초 테스트의 null 도움 이름 exact-text matcher는 표시 래퍼 때문에 실패해 제품 수정 전에 보정했고, 보정 후 위 RED를 확보했다.
- 최소 제품 diff는 shared `ProfileLink`의 기존 `withFromPath` 적용 및 네 군/양쪽 lineup/known·unknown period의 from threading뿐이다. null 평문 분기는 그대로다.
- GREEN **6파일 / 128 PASS**, 신규26 + 기존 shared 상세·AppBackLink·navigation history·session storage·대회 caller 회귀. 단일 worker/직렬, 23.03s. 실제 Next route 클릭이나 alpha/scroll QA로 세지 않는다.
- 독립 child는 actual v1 호출부·server consent gate와 제품/신규 테스트 2/2를 정적 검토했다. 신규 P1/P2 지적0, 자체 실행/수정0. 검토 제품 diff SHA256 `5ec9c348ff3de5641ada9685e0a35f0ad66de6be896772601afa3a8416eb7c05`; 외부 4라운드 clean 리뷰로 확대하지 않는다.
- 공개 before 리그9이미지/3폭을 정상 TLS curl로 다시 내려받아 HTTP200, 원 manifest SHA256 **9/9 일치**, 실제 이미지 **9/9 열람**. Python 로컬 CA 실패는 curl의 정상 인증으로 해결했다. 캡처일 2026-10-02, 앱 serving SHA unknown, 이미지 commit은 `219ac7df75a6ace6d29ffc25ee5192ba4cc13b9f`다.
- 호스트 preflight: 12코어, load33~66, swap약7GB, Node113~115/browser28~30, Docker29.8.1. 사용자가 명시한 검증만 최소 worker로 직렬 실행하며 전체 test/build는 CI 소유. target 로컬 서비스는 띄우지 않았고 live 완료 console 접근0이다.
- 최초 lint에서 신규 fixture 필수 `position` 누락 및 ByRoleOptions의 `exact` 타입 오류를 발견해 테스트에서만 보정했다. 변경된 신규 파일만 **26 PASS (8.01s)** 재검증, 최종 lint/typecheck·v1 pattern PASS. 제품은 독립 검토 이후 동일 바이트다.
- 필수 aggregate6guard(Android policy, v1 DB, production deploy security, compose parity, alpha seed runtime, alpha immutable deploy) **6/6 PASS**. 커밋/정확 head CI 결과는 PR 기록에 추가해 소스 SHA와 구분한다. actual alpha after·원래 bracket/팀명단/직접 진입·탭/scroll·3폭 전체 수용 조건은 부모 QA까지 대기한다.
- 기존 이미지 목업3,029,708bytes/SHA2564e46f9987fc48e5ad3e6f6970633736f4fe6f3d3f7ea1a0052a1168f4f833d57 유지. 이번 정적 HTML parse/JS syntax/unique ID5·중복0/외부 자동 로드 attribute0 PASS. 출처 GitHub anchor2개는 자동 로드가 아니며 최초 검사 오분류를 바로잡았다. 이전 Mac open exit0는 과거 결과이며 새 browser/alpha 검증이 아니다. 사진 아래 summary B안은 비교 목업이며 제품 구현0이다.
