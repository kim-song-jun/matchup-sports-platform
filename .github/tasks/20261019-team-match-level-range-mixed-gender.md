# Task 20261019: 팀매치 생성·편집의 실력 범위 선택

Status: Review
**Owner**: Codex root → independent review → parent alpha QA
**Created**: 2026-10-04

## Context

사용자는 팀매치 작성부터 실력을 범위로 선택하고 남·여 외 표시를 혼성으로 바꾸도록 요청했다. 이슈 [#1599](https://github.com/kim-song-jun/matchup-sports-platform/issues/1599). 일반 생성·편집은 단일 grade를 min/max에 반복 저장하고 편집 hydration은 max를 버렸다. v1 서버 resolveSportLevelRange와 관리자 편집은 이미 nullable 두 끝점 계약을 지원한다.

성별 의미는 사용자가 **기존 이름 변경 — 혼성·남·여 3개, 저장값 성별 무관 유지**로 확정했다. 별도 값 추가 제안은 폐기했다. [PR1600](https://github.com/kim-song-jun/matchup-sports-platform/pull/1600)이 그 표시를 소유하며 2026-10-04 08:09:37 UTC에 외부 병합됐다. 이 작업은 그 병합 이후 dev를 통합하고 실력 범위만 수정한다. genderRule/API/DTO/schema/필터/eligibility 계약 확장 0이다.

실제 alpha before는 [공개 증거 a678ea98](https://github.com/kim-song-jun/matchup-sports-platform/blob/a678ea98bc4b6d162921534892841214ca6fe07a/docs/qa/2026-10-04-team-skill-gender-before/README.md)의 생성 condition 3폭6장이다. CSS402×606,788×505,1182×757; 2026-10-04 07:49:30–07:51:14 UTC. 단일 실력 칩4개·성별3개를 관찰했으나 선택/저장/편집은 실행하지 않았다. runtime serving SHA는 unknown, 관련5372/45b9 소스 동일성은 별도 확인이다. evidence SHA를 serving SHA로 쓰지 않는다.

## Goal

일반 생성·편집과 관리자 생성에서 기존 디자인의 최소·최대 선택을 사용해 null/단일/연속 범위를 실제 payload에 보존한다.

## Original Conditions (must all be satisfied)

- [x] 생성부터 최소·최대 등급 입력. 미설정과4개 정본 레벨, 같은 등급도 지원.
- [x] 기존 편집 null/단일/범위의 두 끝점, 만료되지 않은 단일 grade draft 보존.
- [x] 사용자 성별 선택 A를 외부 PR1600과 대조해 중복 없이 유지. 저장값 성별 무관 유지.
- [ ] 정확한 committed-tree/원격 head CI와 독립 리뷰를 기록.
- [ ] 실제 alpha after는 별도 승인된 배포와 부모 QA 후에만 판정. 이슈를 자동 종료하지 않음.

## User Scenarios

생성 condition에서 최소 초보·최대 중수를 선택하고 다음/이전/새 문서에서 draft를 복원한 뒤 확인·저장한다. 기존 편집에서 다른 설명만 바꾸면 두 끝점이 유지된다. 범위를 연속 변경하거나 실패 후 재시도해도 최신 선택을 저장한다. 변경 취소·Escape·계속 작성은 저장하지 않으며 명시 나가기만 이동한다.

## Test Scenarios

### Happy path

- [x] 실제 create/edit client + 조건 폼 + payload builder를 실행하고 API/Next 경계만 대체.
- [x] null/null, 단일, 전체4단계, 부분 범위 편집과 관리자 생성의 서로 다른 끝점 저장.
- [x] 이미 병합된 혼성 표시에서 payload 성별 무관 유지.

### Edge cases

- [x] min>max 또는 max<min 입력은 양쪽을 한 번에 조정. 같은 draft 저장키 유지.
- [x] 이전 단일 등급·알려진 A/B/C는 보존, unknown/역순/불완전 값은 임의 입문으로 저장하지 않음.
- [x] 저장 초안의 null/숫자/객체/배열 등급은 실제 condition·confirm 화면에서 안전한 재선택 안내를 표시하고 저장을 막음. 등급 필드 누락은 기존 미설정 기본값 유지.
- [x] 단계 remount/확인/저장, 연속 입력, 실제 변경 취소·Escape·계속 작성·나가기, invalid grade focus.
- [ ] 물리 키보드/IME/native select/브라우저 Back·Forward 및 실제3폭 레이아웃은 alpha 후속 범위.

### Error paths

- [x] 실제 client의 실패 메시지와 선택 보존 후 재시도. 기존 권한·잠금·version·submission guards 유지.
- [ ] 즉시 동시 제출의 추가 ref 잠금은 이번 범위가 아님. 기존 isPending 보호를 전체 중복 방지로 표현하지 않음.

### Mock data updates needed

- [x] touched inline test의 실제 새 컨트롤과 payload 기대값만 갱신. 실제 팀/신청/경기/DB/seed 변경0.

## Parallel Work Breakdown

- Root owns level lib/field, 일반 create/edit/view/validation과 tests, admin new/tests, task/changeset.
- Child는 별도 FAB worktree 구현 후 이 실력 범위를 읽기 전용 독립 리뷰한다. 이 범위 구현자와 분리된다.
- User는 UI를 자율 결정하도록 명시했다. A: 기존 paired selects 선택, B: ordinal slider는 custom 조작 비용, C: multiselect는 지원하지 않는 비연속 집합을 뜻하므로 제외. 성별 A/B 비교 HTML은 문법 검증 후 Mac open exit0이며 alpha 증거가 아니다.
- [x] 초점 검증·scoped lint/typecheck·필수6개 guard.
- [ ] 명시 pathspec commit/push·Ready dev PR → 정확 head CI.
- [ ] 부모 전용 브라우저의 실제 alpha after, console/network와3폭 판정.

### Owned files

`apps/v1_web/src/lib/team-match-level-range.ts`, `components/team-matches/team-match-level-range-field.tsx`, `team-match-conditions.test.tsx`, `team-matches-create-client.tsx`, `team-matches-page.tsx`, `team-matches-page.test.tsx`, `team-matches.validation.ts`, `team-matches.validation.test.ts`, `app/admin/team-matches/new/page.tsx`, `page.test.tsx`, 이 task, `.changeset/team-match-create-level-range.md`.

### Forbidden scope

다른 WIP/worktree, PR1600 미병합 코드의 복사, API/DTO/schema/가입·필터·권한·상태 gate, globals/FAB 변경, QA179/완료 결과, 실제 data, browser/local Next/merge/deploy/유료 review.

## Acceptance Criteria

- [ ] 범위 안 client/form/payload·기존 회귀와 lint·6guard·CI PASS.
- [ ] 명시 pathspec의 정확한 commit/PR diff, Ready/dev, independent actionable finding0.
- [ ] 실제 alpha after는 조건·데이터·폭을 before와 대조한 승인 배포 후 검증으로 구분.
- [ ] 이슈 #1599는 Refs만 사용하고 전체 수용 조건/alpha 증거 전에는 닫지 않음.

## Tech Debt Resolved

일반 팀매치의 단일 등급 반복 직렬화와 편집 upper endpoint 손실을 정리했다. 새 UI-only payload 필드나 별도 저장 계약은 없다.

## Security Notes

인증·권한·가입·점수·결제·status gate 변경0. synthetic local fixtures와 공개 증거만 사용하고 .env/비밀을 읽지 않는다. 기존 DTO/server 검증 유지.

## Risks & Dependencies

최소·최대가 모두 미설정이면 null/null, 하나의 기존 끝점은 기존 서버처럼 같은 양끝으로 보완한다. 알 수 없는 structured grade는 오류 표시로 다시 선택하도록 한다. draftFromTeamMatchEdit의 기존 미백필 rulesText fallback은 유지된다. 테스트는 jsdom이며 CSS/실제 alpha/새 배포/physical device 검증이 아니다. 브라우저는 부모 작업자 소유다.

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-04 | Root/User | 혼성 별도 저장값인가 표시 이름인가? | 초기 별도 값 제안은 폐기. 사용자 A: 혼성·남·여3개, 성별 무관 저장값 유지; PR1600 소유. |
| 2026-10-04 | Root | 범위 UI 선택 | 관리자 편집의 기존 최소·최대 패턴 재사용. 사용자 자율 선택 위임. |
| 2026-10-04 | Root | 최신 dev와 내 변경 동시 통합 | own7path patch·hash를 /tmp에 보존, 그 patch만 reverse, 전용 branch FF 후3-way 적용. admin import 충돌은 양측 range parser와 이미 병합된 gender label을 함께 보존. stash/reset/restore/타 세션 변경0. |

## Progress Snapshot

- 최초 fresh origin/dev45b9f0756b70d3b80801d5f5f2b43c692e007d1a, 현재 통합 base4c81d071ede5bba14575f2aeb1097326797cbd08.
- Worktree `/tmp/teameet-team-match-level-gender-20261004`, branch `fix/team-match-level-range-mixed-gender`.
- 의미 결정 전 mixed product/API 변경0. 임시 mixed tests는 owned /tmp에만 보관하고 이번 제품 변경에 포함하지 않음.
- 실제 client/form RED8/8 실패(최소·최대 컨트롤 부재), GREEN8/8, 확장 scoped5file196/196 PASS(통합 전45base). 잘못된 pnpm options는 test 미실행이므로 RED로 세지 않음.
- independent base45 candidate read: 유효 P1/P2 지적0, 독립 test 실행0. 최종 exact SHA 판정은 아직 대기.
- 최신 병합 후 표시 혼성/저장 성별 무관 통합 재검증, lint/gates/commit/CI/actual after는 진행 중.

### Final local validation on integrated dev4c81

- 실제 create/edit/client/view/admin/validation/SSR mapper/common gender selector7files **235/235 PASS**, 최소1worker 직렬20.30초. 혼성 표시/성별 무관 payload를 함께 검증했다.
- 새 role query의 미지원 exact 옵션 때문에 첫 lint가 실패했다. 해당 옵션14개만 제거한 뒤 actual client10/10 재확인(2.96초) 및 lint(typecheck+v1-pattern) 재실행 PASS. 제품 소스는 이 수정에서 바뀌지 않았다.
- 필수 read-only6guard PASS: Android Play policy, v1 DB guardrails, production deploy security, compose parity, alpha seed runtime, alpha immutable deploy. 전체 CI 계약/단위/통합/build는 exact remote head CI 소유다. 로컬 전체 suite/build/브라우저는 실행하지 않음.
- Root가 공개 모바일 실력 before PNG를 직접 확인했다. SHA25635ac667810812a70d232ab52638088a94ee6060f31d2cbc12571735b21cbc209. 추가 새 after는0.
- Host preflight12cores/load33.39·37.83·46.25, swap11358.5/12288MB, Node226/browser44/Docker8up5healthy를 보고 최소 worker로 사용자 승인 검증만 직렬 실행. 타 세션 프로세스 종료0.
- Git diff check PASS, touched debt markers0, API/DB/permission/status source diff0. 최종 commit/CI와 독립 exact SHA 판정은 PR 기록에 남긴다.

### PR1602 P2 follow-up — 2026-10-04

- [외부 리뷰5405092940](https://github.com/kim-song-jun/matchup-sports-platform/pull/1602#pullrequestreview-5405092940)는 head516d2ae에서 저장 초안의 grade:null/7이 trim 예외를 내는 지적이다. 타당하며 이전 내부 검토의 finding0을 대체한다.
- 실제 create client + storage hydration + condition/confirm renderer로 null/숫자/객체/배열8사례 RED: 모두 trim TypeError로 실패. 필드가 없는 이전 초안 control1 PASS. 제품 수정 전 실행이다.
- 파서는 unknown 입력을 string 판정 후 처리하고, 복원 경계는 비문자열을 안전한 '등급을 다시 선택해 주세요' 표시로 바꾼다. 따라서 객체가 confirm의 React child로 전달되지 않으며 재선택 전 API 저장0이다. 유효한 문자열·단일·범위·A/B/C 및 누락 기본값은 유지한다.
- actual condition/client19/19 GREEN: invalid 화면 안내·저장 차단·두 끝점 재선택 복구·direct confirm과 기존 생성/편집/취소/실패 재시도 포함. API/DTO/schema/성별 계약 변경0.
- 검증 직전 호스트12cores/load161.007·137.059·91.862, swap9657.44/11264MB, Node251/browser42/Docker8up5healthy. 명시 승인된 검증만1worker 직렬, 타 세션 프로세스 종료0.
- 최종 scoped 회귀·lint/guard·pathspec commit·원격 새 head CI·외부 재리뷰는 다음 PR 기록으로 고정한다. 이전 head CI 성공을 새 head 성공으로 사용하지 않는다.
- P2 최종 candidate scoped5files205/205 PASS(28.54초,1worker 직렬), frontend lint(typecheck+v1-pattern) PASS, 필수6guard 재확인 PASS. 내부 독립 reviewer는 제품2+actual client test1 증분을 읽고 새 P1/P2 지적0이며 test/browser 실행0이다. reviewed git-diff SHA2564d8ab174d3cc1db95fa3cb83e6b4fbfa7f63937aae7884ffad9672226cbd8f79. 외부 exact 새 head 재리뷰는 별도로 대기한다.
- PR1603은 외부에서09:03:32 UTC에 merge117fa596으로 병합됐다. 기존 FAB 브랜치 수정0. 발견된 오래된 hero timer의 CI 안정화는 fresh origin/dev의 별도 후속 변경으로 분리한다.
