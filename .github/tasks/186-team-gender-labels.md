# Task 186: 팀 목록·상세 성별 조건 표시 정규화 (#1522)

Status: Review
**Owner**: Codex 수정·검증 세션
**Created**: 2026-10-02

## Context
alpha 공개 팀 목록과 합성 팀 상세에 내부 값 `male`이 노출된다. #1522의 guest 390/768/1440 실제 원본 6장이 근거다. SSR/클라이언트 목록 매퍼 `toTeam`과 상세 매퍼/실제 client override가 API 문자열을 표시 모델에 그대로 전달한다.

## Goal
목록과 상세의 알려진 성별 조건은 일관된 한국어로, 알 수 없는 값은 안전한 미정 상태로 표시하고 데이터·작성/필터 계약을 유지해 Ready/dev PR로 전달한다.

## Original Conditions (must all be satisfied)
- [x] 최신 origin/dev의 독립 worktree·이슈 브랜치, 중복 PR/동시 shared 파일 소유권 확인
- [x] 모든 알려진 영어 enum/한국어 정본·동의어와 알 수 없는 값의 표시 정책 검증
- [x] 데이터/API/DTO/schema·작성/편집 payload·필터/eligibility 계약은 변경하지 않음
- [ ] 초점 RED/GREEN·frontend lint·aggregate·pathspec 커밋·푸시·정확한 head CI·Sonnet 결과 기록
- [ ] 실제 alpha before 6장 공개 게시, 동일 조건 after는 별도 승인된 배포 대기
- [x] QA179/완료 QA 결과·다른 세션·명단·권한·가입/통신/운영 mutation 및 병합·배포·유료 리뷰 재요청 금지

## User Scenarios
guest는 팀 목록의 성별 배지와 같은 팀 상세 성별 조건을 같은 의미로 읽는다. 기존 한국어 정본은 유지한다. 알려지지 않은 값을 원문이나 성별 무관으로 추정하지 않는다.

## Test Scenarios
### Happy path
- [x] actual API→SSR 공용 목록 매퍼→카드와 실제 detail client→정보 행의 표시를 함께 검증
- [x] 남/여/성별 무관, 무관/남성/여성/혼성, male/female/any/mixed, 대소문자·공백
### Edge cases
- [x] null/undefined/빈 값/unknown은 목록 배지 생략·상세 '성별 미정'
- [x] 기존 strict genderRuleLabel의 canonical-only 컨트롤 계약 유지
### Error paths
- [x] 기존 목록/상세 오류·로그인·가입 eligibility와 작성·편집/필터 테스트 회귀
### Mock data updates needed
schema/API 변경 없음. 기존 실제 route 테스트의 synthetic API fixture에서 성별 문자열만 표별로 지정한다. alpha 팀/API 원본·DB를 수정하지 않는다.

## Parallel Work Breakdown
### Frontend
- [x] 중앙 라벨 모듈의 팀 표시 전용 helper와 목록/상세 표시 매퍼 연결
- 영어 코드의 기계적 라벨 변환 및 미정 fallback이며 새 UI/레이아웃/컨트롤 설계 없음. 사용자 표시만 수정 지시 적용.
### Sequential
- [ ] 최소 worker 초점 검증 → frontend lint/aggregate → pathspec 커밋·Ready/dev PR → 정확한 head CI/Sonnet
- [ ] 별도 승인된 alpha 배포 뒤 같은 팀·폭·scroll 위치 after/회귀
### Owned / Forbidden files
- Owned: `lib/v1-status-labels.ts`와 팀 라벨 테스트, `teams.card-model.ts`, `teams-client.tsx`/관련 test, `teams-page.tsx`의 성별 정보 행, 이 문서, 이슈 changeset.
- Forbidden: shared API hooks/types/MSW·다른 진행 PR의 파일, backend/schema/seed, form hydrate/save·query filter/eligibility, 실제 QA 데이터·권한·통신.

## Acceptance Criteria
- [x] 목록·상세 실제 렌더에 내부 코드가 노출되지 않고 같은 성별 의미를 제공
- [x] unknown을 성별 무관/실제 가입 조건으로 추정하지 않음
- [x] 기존 정본 컨트롤·payload·필터/가입 판단 보존
- [x] 초점 검증과 전체 alpha QA 완료를 구분하고 before/after·review 한계를 기록

## Tech Debt Resolved
SSR/클라이언트 목록과 상세의 raw 성별 표시 및 상세 client의 raw 재덮어쓰기를 같은 중앙 표시 helper로 맞춘다.

## Security Notes
쓰기 DTO는 최대20자 문자열을 받아 저장하고 목록 query는 한국어 조건을 사용한다. 표시 helper는 API 원본을 변경하지 않는다. 알려진 값만 라벨링하고 unknown은 배지 생략/성별 미정으로 처리한다. 기존 strict `genderRuleLabel`와 form/filter 계약은 유지한다. 환경·자격증명·개인 데이터 원본을 읽거나 공개하지 않는다.

## Risks & Dependencies
- 영어 저장값의 목록 필터 포함 여부·편집 저장 정규화는 별도 코드 경로이며 이번 표시 결함의 수정 범위가 아니다. 실제 저장·필터 오류를 주장하지 않는다.
- 실제 alpha after·다른 성별의 실제 데이터/물리 기기/스크린리더는 승인된 배포와 추가 실제 데이터 확보 뒤 가능하다.
- Sonnet 미도착은 검토 대기. Copilot 모델/HTTP429 오류는 clean review가 아니다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-02 | Codex | mixed/unknown을 무관으로 바꿀지 | mixed는 의미 그대로 혼성, unknown은 미정/배지 생략. 가입 조건을 추정하지 않음 |
| 2026-10-02 | Codex | strict genderRuleLabel 확장 여부 | 다른 도메인/컨트롤의 정본 검증은 유지하고 팀 표시 전용 helper를 중앙 라벨 모듈에 추가 |

## Progress Snapshot
- base bf47852a2; worktree `/tmp/teameet-issue-1522-20261002`; branch `fix/issue-1522-team-gender-labels`.
- 실제 before 원본6장 e2c96540311a20ada9f834aecebc9776eaba0c1e: 390×844/768×1024/1440×900 다운로드·픽셀 검토 완료. 이미지 commit은 앱 serving SHA가 아니며 캡처 당시 serving SHA 미기록.
- UTC 2026-10-02 목록03:05:04.724/03:05:05.030/03:05:05.397, 상세03:07:06.109/03:06:53.393/03:06:53.663. guest·CSS override이며 물리 기기 검증 아님. 기존 공개 증거를 재사용하고 중복 업로드하지 않는다.
- PR1521과 다른 열린 dev PR의 동일 수정/중앙 라벨 파일 변경을 발견하지 못했다. 다른 worktree는 건드리지 않는다.
- 부모 전달 도구 1회 transport 종료 오류 뒤 local worktree와 GitHub CLI의 실제 작동을 확인했다. 검증했다고 꾸미지 않는다.

- 수정 전 최초 실행은 17 FAIL/88 PASS 중 7개가 중복 모바일·데스크톱 행 selector 문제였다. 양쪽 행을 모두 검사하도록 보정한 실제 RED는 **13 FAIL/92 PASS (105 tests)**: 내부 코드/별칭 노출 10건과 빈 상세 행 3건.
- GREEN 5파일 첫 실행은 198 PASS/1 FAIL(199 tests): 보조 substring 단언이 정상 '성별 무관'의 '무관'을 오탐했다. 중복 단언을 제거하고 정확한 행 라벨 검증을 유지한 `teams-client.test.tsx` **91 PASS**(13.91s). 나머지 4파일 108 PASS와 합쳐 고유 검증 항목199개 통과. 실제 최종 5파일199 한 번 실행이라고 주장하지 않는다.
- 단일 worker/직렬만 사용했다. host preflight load75.98/12cores, swap21491.94/23552MB, Node143/browser36; 사용자의 명시 검증 지시와 최소 실행 기준을 적용했고 다른 프로세스를 종료하지 않았다.
- 수정은 팀 표시 전용 `teamGenderRuleLabel`, SSR/클라이언트 목록 매퍼와 상세 매퍼, 상세 raw override 제거, 정보 행의 성별 미정 안내뿐이다. strict genderRuleLabel·작성/편집 payload·filter·가입 계약은 그대로다.
- CUA와 부모 메시징 도구의 Transport closed가 지속된다. shell/GitHub CLI는 정상이다. 실제 공개 before 원본6장 다운로드·픽셀 검토는 완료했으나 이번 PR 본문을 브라우저로 재확인하지 못했다고 구분한다. after/실제 회귀는 승인된 alpha 배포 대기다.
- frontend lint/typecheck PASS: tsc와 v1 pattern checks 통과. 필수 aggregate6/6 PASS, 이 이슈 v1_web patch changeset accepted(behavior4files). diff --check PASS, touched TODO/FIXME/HACK/XXX 0, 새 런타임 의존성/미추적 import 없음.
- 임시 node_modules symlink2개는 이 worktree에서 만든 것만 제거한다. 명시8파일 커밋 뒤 committed-tree와 원격 PR diff로 범위를 다시 확인한다. 로컬 전체 build/test를 반복하지 않고 정확한 head CI에 맡긴다.
- PR는 항상 Ready/dev이고 정확한 head CI·Sonnet 결과는 원격 PR 본문에 갱신한다. 실제 alpha after/전체 QA는 대기이며 Done으로 표시하지 않는다.
