# Task 142 — 대회 어드민 통계 탭

## Scope

- Target: frontend
- Route: `apps/v1_web/src/app/admin/tournaments/[id]`
- Out of scope: 새 API/DB 스키마, 공개 대회 화면, 어워드 자동 선정

## Acceptance Criteria

- [x] 개인 어워드 옆에 `통계` 탭이 보인다.
- [x] 공식 결과가 있는 경기의 기록된 득점자를 합산해 TOP 10을 보여준다.
- [x] 공식 결과가 있는 경기 기준 팀 최소 실점 순위를 보여준다.
- [x] 공식 결과가 있는 경기 기준 팀 최다 득점 순위를 보여준다.
- [x] 로딩, 조회 실패, 집계할 결과가 없는 상태를 숨기지 않는다.
- [x] 동률 정렬과 미등록 득점자 집계가 결정적으로 동작한다.

## Progress Snapshot

- [x] 2026-08-16: 운영 대회에서 경기별 `V1GameParticipant.id`로 동일 득점자가 분리되던 회귀를 재현하고, 팀 등록 ID + 정규화된 선수명 기준으로 대회 전체 득점을 합산하도록 수정

- [x] 기존 어드민 대진 응답이 공식 점수와 득점자 목록을 제공함을 확인
- [x] 통계 집계 모델 및 탭 UI 구현
- [x] 타깃 테스트 3개 통과
- [ ] 전체 타입 검사 — 공유 WIP인 `public-game-records.test.tsx`의 `cardColor` 누락 3건으로 차단

## Ambiguity Log

- 최소 실점은 경기당 평균이 아니라 대회 누적 실점 오름차순으로 해석한다. 경기 수를 함께 노출해 비교 맥락을 제공한다.
- 득점자 순위는 점수와 이름 없는 득점을 임의로 맞추지 않고, 경기 결과에 실제로 저장된 득점자 레코드만 합산한다.


## 2026-10-24 추가 요청 — 어드민 전용 경기별 득점자와 GK

Status: PR / Alpha Deployment

### Context / Goal / Original Conditions
- 기존 득점 TOP 10, 최소 실점팀, 최다 득점팀 통계를 유지한다.
- 결승전·3·4위전 득점자 이름/팀/골 수를 추가한다.
- 최소 실점 공동 1위 팀의 등록 명단 GK를 표시한다.
- 사용자 화면은 수정하지 않는다. API/DB 계약 변경 없음.

### User Scenarios / Test Scenarios
- 어드민이 기존 통계와 추가한 두 득점자 표를 함께 본다.
- group.phase로 결승/3·4위전을 구분하고, 조 없는 수동 경기만 지원 round 라벨을 사용한다.
- 기존 집계와 같이 공식 정상 종료 경기만 합산한다. 자책골은 개인 득점에서 제외한다.
- 추가 득점자 표는 TOP 10 제한 없이 모두 표시한다.
- 최소 실점 동률 팀을 모두 표시하고, GK 여러 명/미등록/조회 실패/재시도를 처리한다.
- GK는 현재 등록 명단 기준이며 개인별 실점이나 경기 출전 이력을 뜻하지 않는다.

### Parallel Work Breakdown / Owned Scope
- 단일 세션: tournament-statistics-tab.tsx, 관련 두 테스트, 본 task 문서, changeset.
- Forbidden: 공개 대회 화면, API/DB, 그 밖의 기존 WIP.

### Acceptance Criteria / Progress Snapshot
- [x] A/B/C 비교 및 A안 추천 후 사용자가 기존 유지·추가·어드민 전용 구현을 요청함.
- [x] 기존 세 통계를 보존하고 두 득점자 표와 공동 최소 실점팀 GK를 추가함.
- [x] 타깃 테스트 2개 파일, 20개 테스트 통과 (단일 worker, 48.91초).
- [ ] alpha 390/768/1440 시각 검증 — 미배포 및 실제 어드민 로그인 세션 부재로 대기.

### Tech Debt Resolved / Security Notes
- 기존 어드민 전용 명단 조회 훅과 권한을 재사용한다. 공개 API에 개인정보를 추가하지 않는다.
- 등록 명단 조회 오류를 GK 미등록으로 숨기지 않고 오류와 재시도를 표시한다.

### Risks & Dependencies / Ambiguity Log
- 누적 실점은 기존 기준을 유지한다. 공동 최소 실점팀은 정렬상 첫 번째 팀만 고르지 않는다.
- 개인별 GK 실점의 집계나 어워드 자동 선정은 요청 범위에 포함하지 않는다.
- 작업 트리의 기존 diff는 두 기존 소스 파일에서 줄바꿈 차이뿐임을 확인했다.
- .git은 읽기 전용이므로 fetch는 FETCH_HEAD 쓰기에 실패했다. 브랜치/커밋/PR/배포는 변경하지 않았다.
- alpha 브라우저 도구와 실제 로그인 세션이 없어 라이브 시각 검증은 수행하지 못했다.

### Validation Evidence (2026-10-24)
- `node node_modules/vitest/vitest.mjs run tournament-statistics-tab --maxWorkers=1 --fileParallelism=false` (`apps/v1_web`): 20/20 PASS. 집계 회귀 17개 + 실제 통계 컴포넌트 렌더/오류/미등록 3개.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: 미변경 `src/app/admin/league-matches/page.tsx:299`의 `lifecycleStatus` prop TS2322 때문에 실패. 이번 변경 파일의 진단 없음.
- `node scripts/v1-pattern-check.mjs`: sandbox의 `spawnSync /bin/sh EPERM`으로 파일 목록 조회가 실패함. 통과로 간주하지 않음.
- 변경 경로 `TODO/FIXME/HACK/XXX` 없음. CRLF를 보존하고 `git -c core.whitespace=cr-at-eol diff --check` PASS.
- 외부 런타임 상태는 변경하지 않음. 테스트 프로세스 종료됨. 새 import는 기존 추적 모듈만 사용함.
- 커밋/배포/alpha 시각 검증 전이므로 PR-ready 또는 라이브 반영 완료로 표시하지 않음.

### PR 준비 (2026-10-24)
- 최신 origin/dev `a31de2c32d` 기준 `/tmp/teameet-admin-tournament-stats` 격리 worktree에 변경 5개 파일만 이식했다.
- 격리 트리 전체 타입 검사 PASS. 앞선 리그 목록 타입 오류는 공유 작업 트리의 미커밋 변경에만 존재했다.
- 격리 트리 패턴 검사 PASS. 이전 EPERM은 sandbox 실행 제한이었고, 승인된 실행으로 해소했다.
- alpha 3폭 갤러리는 저장소 정책대로 머지/배포 후 게시한다. 실제 어드민 로그인 세션 및 브라우저 도구가 없어 현재 미검증이다.
