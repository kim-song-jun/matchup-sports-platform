# Task 172 — 팀매치 공동 경기 기록

## Scope / authorization
- 사용자 요청: 양 팀 라인업 참가자 모두가 같은 점수판에서 득점자 등록·수정·삭제, 실시간 동기화, 변경 이력/되돌리기, 양 팀 종료 확인 후 잠금. 화면별 플로우와 390/768/1440 스크린샷을 포함한 dev 대상 PR.
- Owned: v1 team-match record API/DTO/schema migration; web record route/component/hooks; related result entry points; focused tests; API docs/scenarios/changeset/screenshots.
- Forbidden: 기존 공유 작업트리 WIP, 대회·리그 운영 권한 변경, main 승격, 파괴적 DB reset/seed.

## Phases
- [x] 최신 origin/dev 독립 worktree 및 현재 계약 확인
- [x] 공동 기록 API, 라인업 권한, 버전 충돌/재시도, 이력 및 확정 구현
- [x] 참가자/일반 사용자 진입과 공동 기록 화면 구현
- [x] 좁은 API/UI 검증 및 실제 브라우저 전 흐름 3폭 검증
- [ ] 문서/스크린샷/changeset/PR 및 리뷰

## Acceptance criteria
- 상대 확정 + 시작 시간 도달 시 진행 중 표시. 미확정·취소·경기 전 편집 금지.
- 최신 유효 라인업의 계정 연결 참가자만 쓰기 가능. 이름 문자열·팀 소속만으로 허용하지 않음.
- 양 팀 참가자가 동일 기록을 편집. 득점 수로 점수 산출; 득점자 미상/자책골 지원.
- 서버 버전 검증으로 stale overwrite 방지. 요청 ID 재전송은 중복 추가되지 않음.
- 추가·수정·삭제·복구의 주체/시각/전후 값 저장. 확정 후 일반 수정 불가.
- 종료 확인은 팀별 1회, 서로 다른 양 팀에서 같은 기록 버전을 확인해야 확정. 편집 시 기존 확인 무효화.
- 기존 공식 결과/진행 중인 제출 결과 보존. 리그·대회 결과 운영 계약 유지.
- 확정은 기존 Game 결과 revision/outbox 전적 경로와 원자적으로 연결.
- 일반 사용자는 상세 조회; 참가자는 경기 시간 이후 공동 기록 화면 진입.
- API 오류·동기화 실패·충돌 표시. 가짜 성공 없음.

## Flow evidence
1. 경기 전 상세 2. 진행 중 목록 3. 일반 사용자 상세 4. 참가자 공동 점수판
5. 득점 입력 6. 다른 참가자 반영 7. 수정/삭제/복구·이력
8. 첫 팀 종료 확인 9. 상대 확인·확정 잠금 10. 충돌/권한/오류

## Ambiguity log
- 이 요청은 일반 친선 팀매치 범위. 리그/대회는 운영자 기록 계약을 유지.
- 팀당 라인업 참가자 한 명의 종료 확인을 팀 확인으로 취급; 전원 확인은 요구하지 않음.
- 예정 종료 시각은 자동 확정 조건으로 쓰지 않음.

## Progress snapshot
- 2026-09-21: origin/dev a02af4aff 기준 /tmp/teameet-shared-record, feat/team-match-shared-record.
- 기존 호스트 제출/상대 승인 결과 흐름과 리그 운영 흐름을 확인. 구현 완료. 실제 DB 통합 11/11, API 단위 143/143, 웹 관련 회귀 169/169, 타입/패턴 검사 통과. 3폭 36개 흐름 + 변경 전 6개 화면을 촬영했다.

- [화면별 전체 갤러리](../../docs/scenarios/team-match-shared-record-gallery.md). PR 생성과 원격 리뷰/CI 확인 진행 중.
