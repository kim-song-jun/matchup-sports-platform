# Task 20261005: 관리자 신청 상태 필터의 빈 안내

Status: Review
**Owner**: Codex bug-fix session
**Created**: 2026-10-03

## Context
Refs #1565. 실제 alpha 대회의 전체 신청2/확정2에서 대기 필터0을 ‘아직 신청한 팀이 없어요’로 잘못 안내한다. 실제 client 필터 결과는 정상이며 AdminCardList에 넘기는 empty copy가 무조건 전체 빈 안내다. 리그도 같은 RegistrationsTab을 사용하지만 리그 live 재현은 미검증이다. 최신 origin/dev `dbb6468d81809649026e6a9c193d5a982f8a57b6`에서 독립 시작하며 #1564/PR1566 미병합 모달 코드와 섞지 않는다.

## Goal
선택 상태의 정상 빈 결과와 실제 전체 신청0을 구분하고 기존 전체 복귀·상태 숫자·오류·로딩 계약을 유지한다.

## Original Conditions (must all be satisfied)
- [ ] 전체 신청이 있으나 선택 상태0인 경우 필터 결과의 빈 상태로 안내한다.
- [ ] 실제 전체 신청0의 안내와 다음 행동을 구분한다.
- [ ] 전체로 돌아오면 기존2건과 상태별 숫자/선택 필터를 유지한다.
- [ ] API 오류를 정상 빈 결과로 숨기지 않는다.
- [ ] 배포 후 같은 대회 fixture CSS405/789/1183 실제 alpha 이미지·DOM을 검증한다.

## User Scenarios
관리자가 전체2건을 본 뒤 대기를 고르면 선택 상태의 빈 결과와 다른 상태/전체를 보라는 안내를 읽는다. 전체 칩을 다시 고르면 기존2건이 복원된다. 연속 상태 전환과 읽기 전용·리그 공용 옵션에서도 저장 요청을 하지 않는다.

## Test Scenarios
- 실제 RegistrationsTab/AdminCardList/AdminEmpty 렌더의 전체2→대기0→전체2 RED→GREEN.
- 모든 공용 상태 칩의 빈 결과, 실제 전체0, 읽기 전용/리그 requireCancelReason props, 연속 필터 전환.
- loading/error/refetch 성공 전환과 truncated 부분 조회 경고 유지. 실제 훅 반환은 `{items,truncated}`로 fixture를 맞춘다.
- 기존 상태/명단/미저장 guard 회귀를 같은 suite에서 확인한다. 게임별 명단 표는 기존 suite의 mock 범위이며 이번에 실저장/전체 게임 표 QA로 확대하지 않는다.

## Parallel Work Breakdown
- Frontend: root가 RegistrationsTab의 empty copy와 해당 실제 component 테스트만 변경한다. 이슈의 명시 기대 문구와 기존 AdminEmpty를 재사용하고 레이아웃/신규 행동 디자인을 추가하지 않는다.
- Review: 별도 에이전트의 committed-head 읽기 전용 검토; self-commit 금지.
- Sequential: 초점 테스트 → lint/typecheck → 필수6gates/Changeset → 명시 pathspec 커밋/feature push → Ready/dev PR → 정확한 head CI. alpha after는 별도 승인 배포 대기.

## Acceptance Criteria
- [x] RED→GREEN 및 기존 해당 suite 통과
- [x] frontend lint/typecheck·aggregate6/6·Changeset policy·diff scope 확인
- [ ] committed-head 독립 리뷰, Ready/dev 및 정확한 head CI 확인
- [ ] alpha 수정 after 및 원 수용 조건 전체 실제 검증(현재 미완료)

## Tech Debt Resolved
무조건 전체 없음으로 표시하던 문구를 선택 상태별 안내로 맞추고 새 query fixture는 현재 전량 집계 훅의 `{items,truncated}` 계약을 사용한다. 같은 touched suite의 기존 리그 사유 성공 callback은 act 안에서 실행해 수정 전/후 모두 나오던 React state-update 경고를 정리한다. 제품 저장/거부 계약은 그대로다.

## Security Notes
신청 삭제/유실이나 backend 집계 오류를 주장하거나 수정하지 않는다. API/DTO/schema·status/권한·필터 저장/요청 계약은 변경하지 않는다. 실제 신청/명단/완료 결과/QA179/결제/다른 세션 데이터 쓰기0.

## Risks & Dependencies
대회3폭 before만 실제 관측이며 다른 상태·전체0·리그 live는 미검증이다. 실제 query는 cursor limit50×최대20페이지=1000건을 모으고 truncated 경고를 표시한다. 부분 조회 경고를 유지하며 선택 상태0을 전체 DB 부재로 해석하지 않는다. alpha 배포를 이번 세션이 실행하지 않는다.

## Ambiguity Log
| Date | Question | Resolution |
| --- | --- | --- |
| 2026-10-03 | 전체 복원은 각3폭에서 반복됐는가 | DOM에는02:53:01.620 UTC 단일 복원 기록이 있고 viewport 미기록. 세 폭 전체 복원 PASS로 확대하지 않는다. |
| 2026-10-03 | 캡처 시간/배포SHA | captureUTC=null, DOM시각과 구별한다. 자산SHA는 servingSHA가 아니다. |

## Evidence / Progress Snapshot
- 실제 alpha 고정 before: `d8b6e25c275201af3ff8bab3d336b3be9af585b1/docs/qa/2026-10-03-admin-registration-empty/`. 공개7파일 HTTP200/Gitblob/bytes, manifest6항목 SHA256/bytes와3사진 실제 픽셀 확인.
- CSS405×606/789×505/1183×758; raster405×606/788×505/927×758. 데스크톱은 글로벌 sidebar 제외 crop. 모바일·태블릿 확장자png지만 실제 bytes는JPEG이며 재인코딩하지 않는다.
- DOM관측2026-10-03 02:52:29.747/02:52:50.770/02:52:50.997 UTC와 전체 복원02:53:01.620 UTC. screenshotUTC/servingSHA 직접 미관측.
- 전용 worktree `/tmp/teameet-issue-1565-20261003`, branch `fix/issue-1565-admin-registration-empty-filter`, origin/dev에서 준비.
- 수정 전 실제 component suite **12 FAIL / 21 PASS** → 수정 후 **33/33 PASS**(새15 + 기존18). 기존 act 경고1건을 최소 test-harness 수정 후 최종33/33 PASS·경고0을 확인한다. 최소 worker1이며 새로운 행·empty·필터 component는 mock하지 않고 API hook 경계만 합성한다.
- frontend lint/typecheck·v1 patterns, 필수 aggregate6/6, Changeset policy, diff check·touched debt grep PASS. 마지막 test-harness 수정 후 lint도 다시 PASS. 제품 변경은 empty props의 문구 조건뿐이다.
- committed-head 독립 리뷰·정확한 원격 head CI와 실제 alpha after는 아직 대기다.

## Owned / Forbidden Files
Owned: 이 task, `.changeset/admin-registration-filter-empty.md`, `apps/v1_web/src/app/admin/tournaments/[id]/registrations-tab.tsx`와 `tournament-detail-registrations-tab.test.tsx`.
Forbidden: PR1566 공용 모달 코드 및 다른 미병합 PR/다른 세션 worktree, API/hooks/DTO/schema, 실제 QA 데이터와 레이아웃 재설계.
