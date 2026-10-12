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
- [x] 경기 시작 시각과 같은 순간부터 재개와 상세 `canReopenRecruitment`를 거부해요.
- [x] 추천순 필터의 마감 경계가 엄격한지 확인해요.

### API 통합 테스트(CI)

- [ ] 실제 DB·HTTP 요청으로 마감 경계에 도달한 모집과 이미 시작된 만료 모집을 `closed` 목록·상세에서 확인해야 해요. 테스트를 작성했고 CI 실행을 기다려요.
- [ ] 두 모집이 `recruiting`, 모집 가능, 추천순 결과에서 제외되는지 CI에서 확인해야 해요.
- [x] 내 팀매치 `recruiting` 필터가 raw 상태도 recruiting인 항목만 반환하고, 저장된 closed·cancelled 항목을 제외하는 DB 대조군을 추가했어요.
- [ ] CI run 38236166629에서 위 HTTP 요청이 403을 반환했어요. 로그에는 응답 body/code가 없어요. `/me/team-matches`의 유일한 route guard는 `V1AuthGuard`이고 fixture 계정은 active/completed이며 GET은 휴대폰 인증 게이트 허용 경로예요. 필수 약관 동의 기록이 빠진 host fixture가 `signupCompliance`를 막았다고 guard 소스에서 좁혀, 공식 `ManagedTermsRuntimeService`로 필수 문서에 동의시키고 cleanup에서 consent event를 삭제하게 했어요. 서비스 gate는 우회하지 않았고 CI 재실행에서 200 확인이 남아 있어요.
- [ ] 통합 테스트는 CI에서 실행해요. 로컬에서는 실행하지 않았어요.

### 화면 조회 갱신 테스트

- [x] 실제 React Query hook·QueryClient·MSW로 캐시가 신선한 탭의 복귀 재조회를 확인해요.
- [x] 실제 15초 타이머로 목록과 상세가 새 `closed` 응답을 소비하는지 확인해요.
- [x] 추천순 목록의 실제 MSW 응답에서 만료 항목이 사라지고, 커서 누적 화면은 성공 페이지의 사라진 항목을 제거하며 실패 페이지의 카드는 보존하는지 확인해요.
- [x] 첫 페이지 갱신으로 `nextCursor`가 사라져도 실제 로드한 페이지 키를 따라 이전 페이지를 재조회해요. page2 실패 요청과 카드 보존, 다음 poll 성공 요청과 카드 제거, 임의 rerender에서 추가 요청이 없음을 확인해요.
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
- CI Web 실패 `team-matches-client.test.tsx:1797`은 `matched` fixture가 공통 `mockHost` 기본 lifecycle(`canEdit=true`)을 물려받아 실제 API capability와 달랐어요. `team-matches.service.ts`의 상세 계약은 `matched`에서 `canEdit=false`예요. matched 시나리오 fixture에 실제 lifecycle 값을 명시한 뒤 같은 단일 테스트가 1 passed, 89 skipped, exit 0으로 통과했어요. Vitest supervisor PID 49140은 종료됐고, parent PID 50452는 실행 중인 Codex 호스트라 정리 대상에서 제외했어요.
- Codex P1 리뷰에서 승인과 수동 마감이 겹치면 이미 확정된 상대팀을 `closed`로 덮는 경쟁 조건을 찾았어요. `close()`도 승인과 같은 팀매치 행 잠금을 얻고 트랜잭션 안에서 상태·상대팀·시작 시각을 다시 검사해, 승인이 먼저 끝났다면 409로 거절해요. 정상 마감과 경합 반례의 단위 검증은 2 passed, 137 skipped, exit 0이며 Jest PID 65923은 종료됐어요. 수정 전 성공 응답으로 확정 상태를 덮는 behavioral RED를 확인했고, 그 이전 fixture 설정 오류는 RED로 세지 않았어요.
- 실제 Prisma·서비스를 사용하는 승인/마감 경합 통합 테스트를 `team-match-schedule-link.integration-spec.ts`에 추가했어요. 확정 상대팀과 신청·로그를 보존하고 마감 알림을 보내지 않는지 검증하며, 실행은 CI에 맡겨요. 독립 gpt-6-sol 리뷰의 테스트 실패 시 정리 누락을 수정해 제한 시간과 barrier·트랜잭션·spy 정리를 보완했고, 재리뷰는 잔여 P1/P2 없이 PASS예요.
- PR #1862 2차 독립 리뷰에서 `myTeamMatches(recruiting)`의 terminal 상태 혼입, 성공적으로 다시 받은 이전 페이지에서 사라진 항목이 누적 카드에 남는 문제, `startAt === now` 재개 경계 불일치를 발견했어요. raw recruiting 조건과 closed/cancelled DB 대조군, 성공한 페이지 응답의 실제 membership으로 누적 목록을 재구성하는 회귀, `startAt <= now` 재개 거절 및 상세 capability 경계를 반영했어요. API/Web 회귀와 통합 테스트 파일 타입 검증은 worker 1로 최소 실행하고, DB 통합 자체는 CI에서 확인해요.
- 추가 Sol P2는 페이지 갱신이 반환한 새 `nextCursor`를 따라 이전 페이지를 찾으면서, 첫 페이지의 커서가 사라지면 이미 누적된 두 번째 페이지를 더는 조회하지 못하고 만료 카드가 남는 경우예요. 팀매치 화면은 실제 로드한 cursor 키를 별도 pagination metadata로 보존해 이전 페이지별 성공·실패를 처리하도록 수정했고, 첫 페이지 커서 제거·두 번째 페이지 실패 보존·다음 성공 제거 및 요청 cursor/outcome을 검사하는 UI 테스트를 추가했어요. `loadedPageCursorsKey`와 효과의 filter dependency를 각각 snapshot key와 직렬화한 `teamMatchFiltersKey`에 고정해 불필요한 렌더별 재요청을 막아요. 회귀 테스트는 임의 rerender에서 추가 fetch 없음, page2 rejected 요청 뒤 카드 보존, `dataUpdatedAt` 증가 후 page2 resolved 요청과 카드 제거를 확인했어요(단일 파일 1 passed, 91 skipped, worker 1). 독립 Sol 최종 리뷰는 PASS예요.
- 새 CI 결과에서 pagination-history 순서 계약이 깨지는 회귀를 확인했어요. 이전 페이지 최신 응답의 배열 순서로 누적 목록을 재구성해 기존 첫 페이지의 정렬 위치가 바뀌었어요. 기존 누적 순서를 유지하면서 성공 응답의 같은 ID 항목만 최신 객체로 교체하고, membership에서 사라진 ID를 제거하며, 실패 페이지는 보존하고 새 항목은 기존 누적 뒤에 추가하도록 수정했어요. CI 실패를 좁은 단일 테스트에서 재현한 뒤 history 순서 + 마감 상태 최신화 + 페이지 cursor retry 성공·실패 회귀가 3 passed, 116 skipped로 통과했어요(두 파일, worker 1). 독립 Sol 최종 코드는 PASS예요.
- 이번 서비스 수정 후 API `tsc --noEmit`, `v1-surface-check`를 직렬 실행해 둘 다 exit 0을 확인했어요(감독 PID 86896, tsc PID 87248, surface PID 90891). API tsconfig는 통합 테스트 경로를 포함하지 않으므로 이 결과를 통합 파일의 타입 검증으로 세지 않았어요. 최종 통합 파일 하나를 TypeScript rootNames로 지정한 noEmit 검증에서 diagnostics 0·exit 0을 확인했어요(감독 PID 10466, Node PID 10490). 해당 프로세스는 종료됐어요. 실제 DB 실행과 현재 head CI는 남아 있어요.
- Copilot 4247011104의 공용 focus 재조회 영향도 수정했어요. `useV1TeamMatches`는 기본 focus 재조회를 끄고 팀매치 목록의 all/filtered/count 호출만 명시적으로 켜요. 홈·검색·팀 목록의 기존 정책과 상세 훅의 재조회는 유지해요. 실제 React Query/MSW에서 수정 전 네 소비자 모두 재조회하는 RED와 수정 후 목록만 재조회하는 GREEN을 확인했어요(1 passed, 3 skipped, worker 1). 감독 PID 91444는 종료됐어요. 최종 커밋의 CI와 alpha QA는 별도로 확인해요.
- 최종 리뷰 본문의 상세 공유 훅 지적도 반영했어요. `useV1TeamMatch`의 polling·focus 재조회 기본값은 false로 돌리고 실제 `TeamMatchDetailPageClient`만 15초 polling·focus always를 명시해요. 결과·일정·공유 기록·라인업의 조회에는 추가 자동 요청이 생기지 않아요. 실제 Query/MSW에서 비옵트인 상세가 focus 뒤 재조회되는 RED를 확인하고, 수정 후 비옵트인은 focus·15초 경과 뒤에도 1회 요청을 유지하며 옵트인은 focus·polling 때 갱신되는 GREEN을 확인했어요(1 passed, 4 skipped, worker 1). 테스트 PID 52452는 종료됐어요.
