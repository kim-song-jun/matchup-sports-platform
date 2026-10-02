# Task 187 — 팀 편집에서 미변경 레벨 원본 보존

Status: Review
**Owner**: Codex 수정 세션
**Created**: 2026-10-02

## Context
- [이슈 #1528](https://github.com/kim-song-jun/matchup-sports-platform/issues/1528): Task 182 Alpha QA에서 C팀의 소개만 수정했는데 미설정 레벨이 입문–고수로 저장됐다. 소개 복구 후에도 레벨 변경이 남았다.
- 공개된 실제 결함 증거: [원본 5장·메타데이터](https://github.com/kim-song-jun/matchup-sports-platform/tree/a5dff2e740ded6c4bbd6603c087667e7db9fe63d/docs/qa/2026-10-02-team-level-intro). 이 이미지들은 결함 재현 과정이며 수정 before/after가 아니다.
- 최신 dev `66aac6dedd3c5dd0aeec0399b06ca52da3680302`에서 독립 worktree를 만들고 이슈 번호 확정 후 `/tmp/teameet-issue-1528-20261002`, `fix/issue-1528-team-edit-level-preservation`으로 맞췄다. PR1527의 정원 최소값 수정은 이미 base에 있고, 레벨 정규화 문제는 그 이전부터 있었다.
- 다른 미병합 PR의 코드는 포함하지 않는다. 현재 dev의 최대 task 번호는 182지만 다른 이슈의 미병합 task183–186과 충돌하지 않도록 187을 사용한다.

## Goal
팀 편집에서 레벨을 바꾸지 않은 저장은 기존 레벨 코드·텍스트·null을 보존하고, 명시적 전체 레벨 선택은 기존 전체 범위로 저장한다.

## Original Conditions (must all be satisfied)
- [x] 소개만 수정하면 원본 min/max/skillLevelText를 보존한다.
- [x] 미설정과 명시적 전체 레벨을 기존 레벨 컨트롤에서 구분한다.
- [x] 작성 기본값·API/DTO·필터·가입 가능 여부·권한 계약은 바꾸지 않는다.
- [ ] 명시 pathspec 커밋, Ready for review, base dev, 정확한 원격 head CI 확인.
- [ ] 실제 alpha 원본 증거를 사용하며 수정 after는 별도 승인된 배포까지 대기한다.

## User Scenarios
1. 팀장·매니저가 레벨 미설정 팀의 소개만 수정하고 저장한다. 레벨은 계속 미설정이다.
2. 편집자가 전체 레벨을 직접 고른다. 입문–고수 코드 범위가 저장된다.
3. 기존 범위나 자유 텍스트를 그대로 둔 채 다른 정보를 수정한다. 원본 코드·텍스트가 바뀌지 않는다.
4. 레벨을 바꾸고 취소한다. 저장 요청 없이 편집 상태를 유지하거나 기존 취소 경로를 따른다.

## Test Scenarios
### Happy path
- [x] 실제 TeamEditPageClient + TeamFormPageView를 렌더해 소개 편집과 제출 payload를 검증한다.
- [x] null·기존 범위·자유 텍스트 보존 및 전체/단일/범위/미설정 명시 선택.
- [x] 실제 select와 미리보기에서 미설정이 전체로 보이지 않는다.
### Edge cases
- [x] 알려진 범위가 기본 선택지에 없어도 원본 표시·저장 유지.
- [x] 연속 레벨 변경, 실패 후 재시도, 반복 제출의 원본 보존.
- [x] 만들기의 기본 전체 레벨은 기존 전체 범위 계약 유지.
### Error paths
- [x] 저장 실패 시 성공 이동 없음; 취소 시 저장 없음.
### Mock data updates needed
- [x] 테스트 fixture에 상세 API의 minLevel/maxLevel/skillLevelText를 명시한다. API/MSW 계약 변경은 없다.

## Parallel Work Breakdown
- QA 세션: 실제 alpha 이미지와 이슈. 수정 세션: 독립 브랜치의 최소 편집 로직·회귀 테스트·PR/CI.
- Owned: `apps/v1_web/src/components/teams/teams-form-client.tsx`, `teams-page.tsx`, 레벨 회귀 테스트, 이 문서, 해당 Changeset.
- Forbidden: 다른 이슈 worktree/PR, API/DTO/schema, 실제 팀 데이터·가입·권한, QA179 명단, 완료 QA 결과, Task182·시나리오 상태 허브.
- UI 방향은 기존 select·미리보기의 원본 상태 표시 교정이다. 사용자 승인된 null 보존/명시적 전체 구분을 적용하며 레이아웃·디자인 대안은 만들지 않는다.
- [ ] 초점 검증 → scope lint/aggregate → 커밋/푸시 → Ready PR/CI. alpha 재검증은 승인된 배포 후 별도.

## Acceptance Criteria
- [ ] 위 원본 조건과 초점 테스트 통과.
- [x] touched-path debt grep, diff check, untracked import 확인. 커밋/PR diff 확인은 게시 시 수행한다.
- [ ] Sonnet 리뷰와 정확한 head CI를 실제 결과로 구분해 기록.
- [ ] PR 증거에 실제 결함 과정과 수정 after 대기를 분명히 표시.

## Tech Debt Resolved
- 미설정 표시를 전체로 숨긴 뒤 전체 범위 코드로 저장하는 편집 경로의 값 손실.
- 기존 범위를 표시 라벨로 역변환하면서 원본 텍스트를 덮는 편집 경로.

## Security Notes
- 권한/서버 gate와 업데이트 버전 계약 유지. 인증 정보·프로필 ID·가입일을 증거에 추가하지 않는다.
- 로컬 fixture와 읽기 전용 공개 증거만 사용하며 실제 팀 데이터나 보호 QA 결과를 변경하지 않는다.

## Risks & Dependencies
- 수정 후 alpha 화면·저장/새로고침·3폭 console/network 실측은 별도 승인된 배포 대기. 초점 테스트를 전체 QA 완료로 표현하지 않는다.
- 필터 영향은 현재 API 코드에서 null 범위가 선택 레벨 필터에 포함되지 않고 전체 범위가 포함됨을 확인한 정적 분석이다. 필터 정책은 수정하지 않는다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-02 | 부모·QA | null을 전체 범위로 정규화하는 것이 의도인가 | 소개만 저장한 값 손실로 분류. 편집 원본 보존과 명시적 전체 선택을 구분; 서버의 기존 nullable 계약 유지. |

## Progress Snapshot
- 실제 client + 공용 폼의 회귀 RED: 13개 중 10 실패/3 통과. 수정 후 기존 폼 포함 100/100 통과. 단일 레벨 원본 보존·즉시 중복 제출을 추가한 최종 레벨 회귀는 14/14 통과. 기존 폼 client31 + 공용 폼56을 합쳐 고유 101개를 검증했다.
- 첫 lint는 새 테스트의 잘못된 Testing Library `exact` 옵션 두 곳만 TypeScript 오류로 실패했다. 옵션을 제거한 뒤 scope lint(typecheck + 패턴) 통과. 필수 aggregate guardrail 6/6 통과.
- API 훅 경계는 mock이며 실제 API/DB 저장 검증을 수행한 것으로 표현하지 않는다. 모바일/데스크톱 공개 이미지 두 장을 픽셀 확인하고 원본 SHA256 일치를 확인했다. 태블릿 before와 캡처 시 배포 SHA는 미확보다.
- 명시 pathspec 커밋/푸시·Ready PR·정확한 head CI 확인으로 이어간다. 실제 Sonnet 리뷰와 승인된 배포 후 alpha after는 대기다.
- 사용자 확정 이슈 종료 기준: alpha 배포 후 실제 재검증과 원 이슈 전체 수용 조건을 만족할 때만 증거·시간·폭·PASS 범위를 남겨 종료. 현재는 `Refs #1528`로 연결하고 이슈를 열어 둔다.
