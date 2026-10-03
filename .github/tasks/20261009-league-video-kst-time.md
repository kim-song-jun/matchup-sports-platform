# Task 20261009: 관리자 리그 영상 경기 시각 KST 표시 (#1574)

Status: Review (alpha after pending)
**Owner**: Codex issue fixer
**Created**: 2026-10-03

## Context
[원 이슈 #1574](https://github.com/kim-song-jun/matchup-sports-platform/issues/1574): 같은 합성 리그·주차·팀 상세18:00/18:30과 영상02:00/02:30이 CSS405/789/1183 왕복에서 다르다. 상세는 KST, 영상은 local formatter다. 실제 browser TZ/영상UUID/두API값/DB정본/servingSHA는 미측정. backend 양쪽은 정적으로 v1TeamMatch.startAt을 소비한다.

## Goal
기존 경기 KST 표시 정책을 리그 영상에 적용하며 YYYY.M.D HH:mm과 다른 admin formatter 동작을 유지한다.

## Original Conditions (must all be satisfied)
- [ ] 같은 fixture ID의 두API 실측 timestamp/표시 정책 확인 후 대응 날짜·시각 일치.
- [ ] 실제 alpha CSS405/789/1183 상세→영상→상세 왕복 일관성.
- [ ] UTC/LA/KST·자정/연도 경계, 주차/팀/영상0/링크 유지.
- [ ] 실제 after/DOM/TZ 증거는 별도 승인된 배포 후 기록. OPEN/Refs 유지.

## User Scenarios
1. 두 경기 일시를 읽고 실제 상세 링크로 돌아간다.
2. 다른 로컬 TZ에서도 경기 KST 날짜·시각 유지.
3. null/invalid 일정은 기존 일정미정/원문 유지.

## Test Scenarios
### Happy path
- [x] 실제 LeagueVideosClient 두 경기18:00/18:30 및 주차/팀/영상0/상세링크.
### Edge cases
- [x] 실제 process TZ sanity UTC/LA/KST, 자정/연말/ISO offset/null/invalid.
- [x] 기존 local formatAdminDateTime 각 TZ 출력 유지.
### Error paths
조회/영상CRUD/권한 계약 변경0. 실제 영상 쓰기·재생은 별도 검증.
### Mock data updates needed
Inline 합성 fixture, actual client/카드/date utility 유지. API hook/Next link 경계만 mock. 실제 API·browser/TZ·3폭 증거로 세지 않는다.

## Parallel Work Breakdown
- Root owned: date-utils additive KST export, league-video import/호출, actual-client test, task, Changeset.
- Child read-only 원인·기존17파일/43호출·backend 및 후속 committed-tree 리뷰. 편집/실행/browser/data/commit0.
- Forbidden: 기존formatter기본/다른호출부/API/DTO/schema/저장/권한/영상CRUD/다른미병합PR/실데이터/QA179/완료결과.
- CLAUDE 날짜 helper 재사용 규칙에 맞춰 기존 private getTournamentKstParts를 재사용한다. 기존연도·형식·레이아웃의 기계적 표기 수정으로 새 UI 선택 대상이 아니다.

## Acceptance Criteria
- [x] 실제 client 초점 RED→GREEN 및 기존 date 회귀.
- [x] lint/typecheck/필수6gates/Changeset/diff/debt. 명시pathspec·최종clean tree는 PR 기록에서 확인.
- [ ] Ready/dev PR·exact head CI·독립 정적 리뷰를 PR에 기록.
- [ ] 실제 alpha 원 조건은 승인 배포 뒤 대기.

## Tech Debt Resolved
경기 표시 KST 정책의 영상 호출부 누락을 수정. 기존 local admin formatter 일괄전환0.

## Security Notes
실제 API/DB 조회·영상/명단/권한/결과 쓰기0, 코드/합성local테스트만. merge/automerge/deploy/유료리뷰재요청0.

## Risks & Dependencies
UI 주차/팀조합 대조와 API identity 실측을 구분한다. actual after/동일UUID API timestamp/TZ/servingSHA 확인은 승인배포 뒤 필요. 전체앱/영상CRUD PASS가 아니다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-03 | code review | private client formatter? | CLAUDE utility 재사용 규칙에 따라 기존 KST parts 재사용 additive export. 다른 기본formatter 유지. |
| 2026-10-03 | evidence | 영상UUID/API 정본? | 실제UI 주차/팀조합 대조만. UUID/두API값/browserTZ/servingSHA 미측정 유지. |

## Progress Snapshot
- fetch 직후 origin/dev dbb6468d에서 독립 /tmp/teameet-issue-1574-20261003, fix/issue-1574-league-video-kst-time 생성. 앞선미병합PR0, 열린중복PR검색2건0결과.
- 고정SHA316c1f25ad97eceff18cb8d1f523055650f56555 docs/qa/2026-10-03-league-video-time/:13HTTP/Gitblob/bytes,manifest12SHA256,actual6PNGpixels/raster/hash PASS. DOM9/main0/noOverflow·왕복3/표시6/복귀3 검산 PASS. 담당별도browser0.
- actualalpha2026-10-03 05:29:09.276–05:30:25.842UTC. CSS405×606/789×505/1183×758;PNGmobile405×606/tablet788×505/desktopcrop915×590·915×420. screenshot 호출UTC는provenance 링크하며DOM시간과구분.
- final-state05:42:35.162UTC 상세경로/입력0/dialog0은UI기록이고servingSHA증거가아니다. after승인배포대기.
- 신규actual client27계약 수정전14FAIL/13PASS→수정후27PASS. 실제process TZ별offset/localformatter sanity3PASS. 기존date-utils13 포함40PASS. APIhook/Next 경계만mock이며실제API/browser/3폭after는미검증.
- 제품은기존KSTparts 재사용 additive export8줄과영상import/호출2줄. 기존admin formatter17제품파일/43호출은동작변경0. 기본format/source contract 유지.
- frontend lint/typecheck·v1 patterns PASS. check-v1-db-guardrails / check-production-deploy-security / check-compose-service-parity / check-alpha-seed-runtime / check-android-play-policy / check-alpha-immutable-deploy 6/6 PASS. Changeset patch 정책 PASS. touched marker0·diff check PASS.
- 전용5파일만 명시pathspec 커밋·원격 feature push 후 Ready/dev PR과 정확한 head CI/정적 리뷰를 PR에 기록한다. alpha after·원래 실측 수용 조건은 대기한다.
