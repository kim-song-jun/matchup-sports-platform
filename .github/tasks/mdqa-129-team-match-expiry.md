# MD-QA #129: 팀매치 신청 마감 자동 처리

상태: 진행 중  
담당: API 동작·문서와 팀매치 조회 갱신 구현  
작성일: 2026-10-12

## 배경

기존에는 일반 미매칭 팀매치의 경기 시작 시각이나 신청 마감 시각이 지나면 `on_hold`로 표시했어요. 사용자는 신청 마감 시각(`deadlineAt`)에 모집을 자동 마감하고, 이미 접수된 신청은 검토할 수 있도록 결정했어요.

## 목표

일반 미매칭 모집은 `deadlineAt <= now`부터 목록·상세·검색·상태 필터에서 `closed`로 표시해요. 이미 접수된 `requested` 신청은 유지하고 경기 시작 전까지 검토·승인할 수 있게 해요.

## 사용자 시나리오

팀 관리자는 신청 마감 전에 접수된 신청을 마감 뒤에도 검토하고, 경기가 시작되기 전이면 승인할 수 있어요. 마감 시각부터 새 신청은 받지 않아요.

## 범위와 조건

- [x] 일반 미매칭 모집은 `deadlineAt <= now`부터 `closed`로 표시해요.
- [x] 신청 마감만 지난 경우 `on_hold`로 바뀌지 않아요. 마감 뒤 경기 시작 시각이 지나도 raw `recruiting`은 파생 `closed`를 유지해요.
- [x] `requested` 신청을 보존하고 경기 시작 전 승인 가능 상태를 유지해요.
- [x] 새 신청은 마감 시각과 같아지는 순간부터 거부해요.
- [x] 저장된 `closed`·수동 마감, 마감 시각이 없는 모집, 리그·대회·상대팀 확정 모집, terminal 상태의 범위 밖 동작을 보존해요.
- [x] 목록·상세·검색·`closed`/`recruiting` 상태 필터의 결과를 맞춰요.
- [x] 신청 가능 목록·추천순·모집 중 집계도 마감 시각과 같아지는 순간부터 제외해요.
- [x] 재개는 raw `closed`, 경기 시작 전, 신청 마감 시각 전일 때만 허용해요. 마감 시각이 지나면 마감 시각을 수정한 뒤 재개해야 해요.
- [x] 상세 응답의 `canCloseRecruitment`·`canReopenRecruitment`이 실제 권한과 서비스 가드를 반영해요.
- [x] 팀매치 목록·상세 조회는 열린 동안 15초마다 갱신하고, 탭으로 돌아오면 캐시가 최신이어도 다시 조회해요.
- [x] 취소·환불·상대팀 알림 정책은 추가하지 않아요.

## 검증 시나리오

### 단위 테스트

- [x] 마감 시각과 같은 순간, 미래 마감, 마감 시각 없음의 상태를 확인해요.
- [x] 마감이 지난 뒤 경기 시작 시각이 지나도 `closed`가 유지되는지 확인해요.
- [x] 수동 마감의 시작 후 `on_hold`와 리그·대회·상대팀 확정 모집의 기존 `displayState=closed`를 대조군으로 확인해요.
- [x] 마감 경계에서 새 신청을 거부하고, 이미 접수된 신청은 승인할 수 있는지 확인해요.
- [x] 마감 경계의 재개 거부와 상세 액션 가능 여부를 확인해요.
- [x] 추천순 필터의 마감 경계가 엄격한지 확인해요.

### API 통합 테스트(CI)

- [ ] 실제 DB·HTTP 요청으로 마감 경계에 도달한 모집과 이미 시작된 만료 모집을 `closed` 목록·상세에서 확인해야 해요. 테스트를 작성했고 CI 실행을 기다려요.
- [ ] 두 모집이 `recruiting`, 모집 가능, 추천순 결과에서 제외되는지 CI에서 확인해야 해요.
- [ ] 통합 테스트는 CI에서 실행해요. 로컬에서는 실행하지 않았어요.

### 화면 조회 갱신 테스트

- [x] 실제 React Query hook·QueryClient·MSW로 캐시가 신선한 탭의 복귀 재조회를 확인해요.
- [x] 실제 15초 타이머로 목록과 상세가 새 `closed` 응답을 소비하는지 확인해요.
- [x] 자동 마감의 대기 신청 종료·수정 링크, 수동 마감의 재개, capability 없는 상태의 취소·삭제 보존을 컴포넌트 테스트로 확인했어요.
- [ ] alpha에서 실제 화면·역할·폭별 검증이 남아 있어요.

## 소유·금지 범위

API Luna는 팀매치 서비스·단위 테스트·목록 통합 테스트, 팀매치 조회 hook과 전용 MSW 테스트, `docs/api/domains/team-matches.md`, 이 task 문서, `.changeset/mdqa-129-expiry-close.md`를 맡았어요. UI Luna는 팀매치 lifecycle 타입과 client·next-step helper 및 관련 client·next-step·page 테스트만 맡았어요. 독립 Sol은 읽기 전용 리뷰, root는 최종 검증·커밋·게시를 맡아요. DB 스키마·migration, 전역 QueryClient, 타 이슈 코드, 실 DB 변경, 통합 테스트 로컬 실행은 범위 밖이에요.

## 진행 기록

- worktree/branch: `.claude/worktrees/mdqa-129` / `fix/mdqa-129-expiry-close`; 기준 커밋 `769ca9d81`.
- 최초 API 회귀 검증은 exact `deadlineAt === now`에서 기대 `closed`, 실제 `on_hold`로 실패했어요(Jest PID 5707, exit 1). 이후 해당 단위 검증은 통과했어요(Jest PID 31654, exit 0; 9 passed, 116 skipped).
- 추가 검토 테스트는 첫 실행에서 신규 lifecycle 타입 필드 부재로 TypeScript 컴파일 오류가 났어요(Jest child PID 13009, exit 1). 이 8개 추가 반례의 런타임 RED는 확보하지 못했어요.
- 추가 API 단위 테스트는 수정 뒤 통과했어요(Jest child PID 23918, exit 0; 19 passed, 117 skipped). 테스트 프로세스는 종료됐어요.
- 웹 hook/MSW 테스트는 탭 복귀와 실제 15초 갱신을 통과했어요(Vitest PID 49374, worker PID 49421, esbuild PID 49396; exit 0, 2 passed). 프로세스는 감독 셸 종료와 함께 종료됐어요.
- fake timer와 MSW 조합은 두 번 timeout되어 사용하지 않았어요. 실제 타이머 검증으로 바꿨어요.
- UI는 자동 마감 후 `canEdit=true`인데 수정 링크가 잠기는 반례를 RED로 확인하고 capability 기반 판정으로 수정했어요. 관리 액션 변경 중 취소 버튼 누락도 타깃 테스트가 잡아 복구했어요. 최종 client·next-step·page 3개 파일의 관련 테스트는 8 passed, 236 skipped, exit 0, worker 1이며 PID 37411 종료를 확인했어요.
- 공용 MSW 상세 응답은 기존에도 lifecycle을 제공하지 않는 축약 fixture예요. 이번 관리 동작 검증은 실제 컴포넌트에 명시적인 API 계약 응답을 전달했으며, 해당 공용 fixture 전체 정정은 포함하지 않았어요.
- `git diff --check` 통과, 수정 경로의 `TODO`·`FIXME`·`HACK`·`XXX` 표식 없음.
- root는 최종 API/Web 소스의 `tsc --noEmit`, API surface 검사, Web pattern 검사를 직렬 실행해 모두 exit 0을 확인했어요. 감독 PID 78776, API tsc 78910·surface 80468, Web tsc 80515·pattern 82604는 종료됐어요. 독립 gpt-6-sol 최종 소스 리뷰에서 잔여 P1/P2 없이 코드 PASS를 확인했어요.
- API 통합 테스트·전체 빌드·현재 커밋 CI와 alpha 브라우저 검증은 남아 있어요. UI 3폭 갤러리는 dev 머지 및 alpha 포함을 확인한 뒤 실제 화면으로 게시해요.
- 마지막 UI 반례는 자동 마감 하단 안내의 기대값 `신청 마감` 대신 `매치 수정`이 나오는 RED를 확인했어요. client와 실제 page를 대상으로 수정 뒤 2 passed, 232 skipped, exit 0을 확인했어요. page의 데스크톱·모바일 CTA가 함께 렌더되는 fixture 특성으로 첫 검사에서 cardinality 오류가 나서 모든 버튼의 disabled 상태를 검사하도록 고쳤어요. supervisor 74909·runner 74911·Vitest 74955는 종료됐어요.
- 후속 Sol 리뷰의 시작 후 수동 마감 반례를 반영했어요. 자동 마감으로 파생 `closed`인 raw `recruiting`도 `startAt`이 지난 뒤에는 `close()`가 409로 거절하고, `canCloseRecruitment`도 false로 응답해 대기 신청을 종료하거나 알림을 보내지 않아요. 기존 null `startAt` 예외는 유지해요. 두 targeted unit test는 GREEN 2 passed, 136 skipped, exit 0 (supervisor PID 65801, Jest child PID 65808)예요. lifecycle 테스트는 RED에서 true 반환을 확인했어요. close 테스트는 fixture/transaction 경로의 `undefined.id` 오류가 2회 발생해 behavioral RED로 세지 않았고, 안전 guard를 구현한 뒤 통과했어요.
