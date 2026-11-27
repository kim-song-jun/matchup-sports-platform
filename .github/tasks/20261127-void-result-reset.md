# 결과 무효 후 대진 시작 전 복구

- 요청: 무효 결과의 기존 기록을 보존하고 대진을 시작 전으로 복구한다. `결과 무효` 정확 입력과 별도 사유를 필수로 받는다.
- 기준: origin/dev `96372a766`, `fix/void-result-reset`, `_worktrees/void-result-reset`. backend/frontend/docs, 단일 에이전트.
- Owned: result-review DTO/service와 무효 복구 helper/tests, void projection, result-review source resolver, 공통 ReasonModal·무효 UI/hooks/tests, API 문서·scenario·Changeset. Forbidden: main, 다른 세션 WIP, 실제 사용자 경기 변조, schema/마이그레이션 없이 기존 보관/재경기 계약 재사용.
- Responsibilities: 기존 Game/이벤트/리비전은 보존하고, 같은 자리·번호·시간·구장·팀·진출 연결의 새 SCHEDULED Game을 갖는 대진으로 교체한다. 공식 집계 보상과 교체·감사를 같은 트랜잭션으로 처리한다. 일반 리그의 기존 무효 동작은 보존한다.
- Errors: 확인 문구 불일치400, 이후 경기 진행409, 버전/CAS·중복 요청은 기존 멱등 경계, 감사/생성/보상 실패는 전체 rollback.
- Acceptance: [ ] 입력/취소 쓰기0 [ ] 서버 정확 문구 검증 [ ] 이전 경기/결과 보존 [ ] 새 경기 예정/빈 결과/편집 가능 [ ] 배정/연결/일정 보존 [ ] 다음 경기 시작 차단 [ ] 동일 요청 재전송 한 번만 교체 [ ] 실패 rollback [ ] 문서·PR·CI [ ] Alpha QA.
- Phase 1 계약 조사 [x] → Phase 2 구현 [x] → Phase 3 회귀/타입 [x] → Phase 4 PR/리뷰/CI/Alpha [ ].
- Ambiguity: “전 상태”는 일시정지/진행 중 복구가 아닌 시작 전 대진으로 확정했다. 기존 무효 데이터는 요청만으로 자동 변조하지 않는다. 실제 복구는 확인 액션에서만 실행한다.
- Progress Snapshot: Web은 무효 입력 확인 후 `resetToScheduled: true`를 보낸다. OFFICIAL과 기존 VOID 복구를 지원하며 정규 리그/미전송의 결과-only 계약은 보존한다. 기존 Game·이벤트·결과를 보관하고 새 SCHEDULED 경기로 바꾼다. BYE 슬롯/팀/라운드/번호/일정/구장/공개방식/스태프 범위/진출 연결을 승계한다. 하류 전이·6강·단계 의존 진행을 차단한다. 단계 과거 삭제 메타데이터는 보존하고 활성 replacement 참조만 바꾼다.
- 감사: RESULT_REVISION_VOID에 사유/교체 ID, TOURNAMENT_FIXTURE_RESET에 이전 대진 좌표·자리·팀·일정 및 새 경기 ID를 같은 tx에서 기록한다. inline VOID compensation의 정확한 revision/sourceHash APPLIED watermark로 지연 worker의 보관 경기 재처리를 멱등 처리한다. archived 조회는 void 재전송에만 열고, 현재 권한 확인 뒤 동일 요청의 캐시 응답만 허용한다.
- 검증: API109/Web138 회귀 PASS, API/Web 타입·surface/pattern PASS, diff whitespace와 touched debt marker 검사 PASS. 동일 lockfile 의존성 junction을 재사용했고 공유 Prisma Client가 최신 dev 필드보다 오래되어 전용 임시 Client를 생성했다. 초기 generator 경로/프로젝트 추론 오류와 임시 tsconfig 타입 탐색 오류를 바로잡았고, 공유 Client/설치 파일은 변경하지 않았다. 최종 설정·임시 schema는 정리했으며 생성 Client는 검증용 임시 경로에만 있다. PostgreSQL3건(새 무효 복구·다음경기 차단/연결보존, 감사실패 rollback, 기존 VOID BYE/이력/멱등/worker재처리) 추가, Docker daemon 미가동으로 실제 DB는 CI gate.
- Alpha 기준선: 사용자 제공 대회를 GET/패널 열기로만 조사,390/768/1440 캡처. 모바일은 별도 카드 이름을 쓰므로 첫2회 캡처 대기는 harness 오류였으며 저장 요청0이다. 최종3폭 캡처 성공. 머지 후 실제 동작/갤러리는 소유 비공개 QA 대회에서 검증해야 한다. 사용자 제공 데이터 수정0.
- PR [#2573](https://github.com/kim-song-jun/matchup-sports-platform/pull/2573), 초기40b8c6646. CI Web은 성공 안내에 교체 ID를 사용하도록 최종 보완한 뒤 `types/api.ts`의 별도 응답 계약 누락을 발견했다. canonical 타입에도 replacement를 추가하고 새 head로 다시 검사한다. API 실DB와 Copilot 실제 리뷰는 진행/접수 확인 중이다. 이전 PR 한정 리뷰 예외는 이 PR에 자동 적용하지 않는다.
- 1593c21e0 CI46015288104: Gates PASS, API 타입/surface PASS, 실제 PostgreSQL226 suites 중225 PASS·1727 tests PASS(신규 복구3건 포함). 실패1은 기존 quick-result integration의 `as never` 무효 요청이 필수 confirmationText를 누락한 fixture drift였다. 확인 문구를 추가하고 불필요한 cast를 제거해 다음 계약 누락이 타입에서도 잡히게 했다. 구현 계약을 약화하지 않는다. 사용자에게 #2573 한정 Copilot 예외를 명시 승인받았으며 최종 head의 전체 CI 통과 후 dev 머지/Alpha를 진행한다.
