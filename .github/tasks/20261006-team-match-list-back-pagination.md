# Task 20261006: 팀매치 상세 Back 후 누적 페이지 보존 (#1568)

Status: Review
**Owner**: Codex issue fixer
**Created**: 2026-10-03

## Context
[이슈 #1568](https://github.com/kim-song-jun/matchup-sports-platform/issues/1568)의 실제 alpha 6조합에서 더보기로 받은 목록이 상세→Back 뒤 첫 20건으로 초기화된다. 기준 dev는 `dbb6468d81809649026e6a9c193d5a982f8a57b6`이다. 기존 client의 cursor/accumulated는 remount 때 초기화되며, API hook은 페이지별 캐시만 보관한다. #1420/PR1467의 URL 필터 보존과 구분한다.

## Goal
동일 목록 조건에서 상세를 거쳐 돌아오면 마지막으로 성공한 누적 카드와 더보기 상태를 복원하고, 필터 변경에는 다른 조건의 cursor를 보내지 않는다.

## Original Conditions (must all be satisfied)
- [ ] 앱/브라우저 Back에서 성공적으로 로드한 카드와 hasNext를 보존한다.
- [ ] 카드 중복 없이 더보기 다음 페이지를 계속 받을 수 있다.
- [ ] 검색/종목/성별/레벨/kind/sort/view 변경 시 이전 조건의 cursor·카드를 섞지 않는다.
- [ ] 기존 URL/from 및 직접 상세의 기본 복귀 계약을 유지한다.
- [ ] 승인된 alpha 배포 후 405×606 → 789×505 → 1183×758의 앱/브라우저 6조합을 실측한다.
- [ ] Refs #1568을 유지하고 전체 원 수용 조건의 실제 alpha 증거가 확보된 뒤에만 이슈 종료를 검토한다.

## User Scenarios
1. 목록 더보기→상세→Back: 마지막 성공 카드 수와 더보기 상태로 복귀한다.
2. 복귀 후 더보기/반복 상세/Forward: 중복 없이 같은 cursor 흐름을 유지한다.
3. 필터 전환/빠른 연속 입력: 새 조건 첫 페이지이며 이전 cursor를 사용하지 않는다.
4. 요청 중 이동/실패/재시도: 미완료 페이지를 성공 목록으로 보존하지 않는다.
5. cold entry/새 QueryClient/identity clear/캐시 만료: 첫 페이지로 시작한다.

## Test Scenarios
### Happy path
- [x] 실제 목록 client+view+API query cache로 20→40→69 및 상세 복귀를 검증한다.
- [x] 실제 상세 client의 모바일 Link/데스크톱 AppBackLink, browser Back/Forward와 URL을 jsdom 탐색 경계에서 검증한다.
### Edge cases
- [x] 필터 변경, pending placeholder, 중복 카드, 더보기 연타, cold/direct return, identity clear, 마지막 flat page 제거/무효화.
### Error paths
- [x] API 실패 표시, 동일 cursor 재시도, 요청 중 이동은 마지막 성공 상태 유지.
### Mock data updates needed
- Inline 합성 fixture/API 전송 경계만 사용한다. 실제 client/view/hook/QueryClient는 mock하지 않는다. jsdom의 Next navigation만 history harness로 대체한다. API/DTO/schema/MSW 공유 계약 변경은 없다.

## Parallel Work Breakdown
- 읽기 전용 조사 에이전트: 원인·API cursor·기존 URL/Back 경계 조사. 수정/테스트/커밋 금지.
- 메인: 독립 worktree에서 구현·실제 컴포넌트 회귀·lint/gates·명시 pathspec 커밋·feature push·Ready/dev PR·정확한 head CI.
- 후속 독립 리뷰: 커밋된 이슈 전용 diff만 검토.
- Owned: team-matches client, 전용 회귀 테스트, 기존 client test의 필요한 Provider 동기화, 본 task, Changeset.
- Forbidden: API/DTO/schema/정렬/공용 Back/스크롤/CSS/다른 미병합 PR/실제 데이터/권한/경기 상태.
- 논리 전용 상태 복원이며 화면 디자인·정보구조 변경은 없다. CLAUDE.md의 로직 전용 변경 예외로 3안 선택 대상이 아니다.

## Acceptance Criteria
- [x] 초점 회귀 RED→GREEN, 기존 관련 테스트 PASS.
- [x] frontend lint/typecheck, 필수 aggregate 6개, Changeset, diff/debt 확인 PASS. pathspec 확인은 커밋 직후 수행한다.
- [ ] Ready for review / base dev / 정확한 원격 head CI Gates/API/Web 결과 확인.
- [ ] 독립 코드 리뷰의 유효한 범위 내 지적 처리.
- [ ] 실제 alpha after 3폭/6조합·console/network·원 이슈 조건은 별도 승인된 배포 뒤 검증.

## Tech Debt Resolved
컴포넌트 수명에만 묶인 pagination state를 제한된 메모리 query cache로 보존한다. flat API 페이지 캐시를 누적 배열로 덮어쓰거나 localStorage 허용 범위를 넓히지 않는다.

## Security Notes
v1 identity clear 및 기존 cache GC 범위를 따른다. 인증정보·개인 데이터 영구 저장을 추가하지 않는다. QA179 명단/완료 QA 결과/실제 팀·가입·권한 변경0. 병합·자동병합·배포·유료 리뷰 재요청0.

## Risks & Dependencies
alpha after는 별도 승인된 배포 대기다. 자동 테스트는 jsdom 계약 검증이며 물리기기·실제 배포 QA가 아니다. scrollY는 원 증거에서 미관측이므로 이번 수정의 PASS 범위에 넣지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-03 | 이슈 증거 | tablet/desktop 앱 Back의 실제 baseline | 40→20이며 공개 이미지는 별도 69→20 세 조합이다. |
| 2026-10-03 | 코드 조사 | 모바일 Link와 데스크톱 AppBackLink 차이 | 기존 동작을 교체하지 않고 목록 remount에서 공통 복원한다. |

## Progress Snapshot
- 2026-10-03: 최신 dev에서 독립 `/tmp/teameet-issue-1568-20261003`, `fix/issue-1568-team-match-list-back-pagination` 생성. 공유 root와 다른 작업 변경0.
- 실제 증거 고정 SHA `f83dc91ea01123f0fc1472f234eb859189e0211e`, `docs/qa/2026-10-03-match-sort-pagination/`: 공개 13/13 파일 HTTP/Git blob/byte, manifest12/12 SHA256 및 6 PNG 픽셀/원본 raster/provenance 대조 PASS.
- 수정 전 이미지 두 열은 상세 진입 전/결함 Back 후이며 수정 after가 아니다. CSS 405×606/789×505/1183×758, crop405×260/561×260/1072×290. 배포 run37091460871 성공03:09:59 UTC, 개별 캡처 serving SHA 미관측. DOM 시각과 screenshot 호출 구간을 구분한다.
- 구현/초점 검증 진행 중. 이슈 OPEN 및 수정 after 승인 배포 대기.

- 초점 수정 전19계약 회귀9FAIL/10PASS(40·69복귀/URL복귀/중복/재시도 후 복귀 실제 실패). 초기 fixture 남성 코드/레벨 경로2오류를 v1 정본으로 고친 뒤 RED를 재확인했다.
- 최종 새24 + 기존client87 + 기존view124 =235/235 PASS, worker1/직렬, React warning·Unhandled0. 실제client/view/hook/cache, HTTP+Next 경계 통제; 실제 alpha QA와 구분한다.
- 캐시 항목은 마지막 성공 cursor/이전 페이지이며 현재 APIpage가 success·not-invalidated일 때만 remount 복원한다. 필터 변경은 현 mount에서 reset, placeholder·실패는 저장하지 않는다. API flat items/keys, 공용Back/CSS/정렬 계약 불변.
- 추가 댓글5965444079: q=리그&kind=competition 35→20 두 관찰. 고정SHA8a460f9c03fbd5b5d9ecb13a96c4bc9163bcc296 공개5/5 Gitblob/bytes·manifest4/4 SHA256 확인. 별도 이미지0. 목록상태·URL 35건 대조2사례 포함, SSR league redirect/fixture 상세 전부는 로컬 실행했다고 주장하지 않는다. alpha after는 기존6+추가2, 관찰8흐름으로 대기한다.
- 첫lint의 새 Provider helper overload 타입오류를 구체적 ReactElement/RenderOptions로 수정하고 최종 lint/typecheck/v1-pattern PASS. 필수 aggregate6/6 및 Changeset 정책 PASS.
- 사전 독립 정적 리뷰: 제품 P1/P2 미발견. Provider 수명과 마지막 flat page 제거/무효화의 remount 회귀 보강 제안을 반영했다. 독립 테스트/alpha 실행0이며 committed-tree 리뷰/CI는 후속 확인한다.
- 호스트12CPU, load11.35/7.68/8.13, swap5737.56/7168MB 및 Node173/browser19를 확인하고 고병렬/full local suite 없이 worker1/직렬로 실행했다. alpha read-only health DB=true. 소유 테스트·lint 종료, dependency symlink는 커밋 전 제거한다.
