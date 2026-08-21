# Task 150 — 실시간 경기 이벤트·결과 정정 정합성

## Scope

- Backend: `apps/v1_api` 경기 이벤트, 결과 리비전, 공식 대회 결과 projection
- Frontend: `apps/v1_web` 대회 운영 콘솔, 결과 정정 모달, 공개 경기 기록
- Docs/QA: API 계약, 경기 시나리오, 스크린샷 증거

## Reported gaps

- [x] 실시간 골·카드·파울 기록을 잘못 입력한 뒤 수정할 수 있다.
- [x] 자책골을 별도 유형으로 기록하고, 상대 팀 점수에는 반영하되 개인 득점에는 합산하지 않는다. 공개 경기 기록에서는 행위 선수를 실제 소속팀 영역에 표시한다.
- [x] 승부차기 선축 HOME/AWAY를 운영 콘솔에서 선택할 수 있다.
- [x] 승부차기 기본 3회, 역전 불가 조기 종료, 무제한 서든데스 판정을 복원한다.
- [x] 기본 구간 조기 종료는 양 팀 킥 수가 달라도 허용하고, 서든데스만 응답 킥 한 쌍을 요구한다.
- [x] 장시간 열린 운영 화면은 takeover token 만료를 자동 갱신하고 재동기화한다.
- [x] 결과 정정의 선수별 합계가 공식화 후 개인·대회 통계에 반영된다.
- [x] 결과 정정에서 득점자·득점 순서·분을 고치고 공식 타임라인에 반영할 수 있다.
- [x] 결과 정정에서 승부차기 점수와 선축을 고칠 수 있다.
- [x] 라인업을 다시 불러올 때 저장 등번호와 최근 등번호가 복원된다.
- [x] 공개 경기 기록 시간은 초를 노출하지 않고 다음 분으로 올림한다 (`2:04` → `3분`).
- [x] 골과 자책골은 선수를 지정하지 않고 명시적 익명 이벤트로 등록할 수 있으며, 공개 기록은 각각 `익명`과 `OG`로 표시한다.

## Acceptance criteria

1. 라이브 이벤트 수정은 원본을 보존하는 reverse 명령으로 취소한 뒤 재입력하며 version/idempotency/takeover/audit 계약을 유지한다.
2. 기존 공식 결과는 정정 DRAFT가 확정되기 전까지 공개 화면과 통계에서 그대로 유지된다.
3. 정정 OFFICIAL 전환 후 score, penalties, participant aggregates, goal timeline이 같은 리비전을 기준으로 노출된다.
4. 기존 리비전은 goal timeline이 없더라도 원본 이벤트 fallback으로 계속 표시된다.
5. 관련 단위·통합 테스트와 headed 브라우저 QA, 데스크톱·모바일 스크린샷을 남긴다.

## Progress Snapshot

- 2026-08-19: `origin/dev` `6631d4b2` 기준 재현 경로 감사.
- 이미 구현 확인: 승부차기 선축 선택, takeover token 자동 갱신/재요청, 등번호 저장·recent fallback.
- 확인된 결함: generic event amend 부재, own-goal 부재, correction penalty 편집 부재, official goal timeline이 원본 이벤트에 고정, 공개 시각이 `mm:ss`/내림 분으로 표시.

## Ambiguity log

- 자책골은 득점 팀(side)과 행위 선수(participant)의 소속 팀이 반대다. 이벤트 타입을 `OWN_GOAL`로 분리하고 이 예외만 명시적으로 허용한다.
- 정정 타임라인은 원본 이벤트를 즉시 변경하지 않는다. 리비전 스냅샷으로 저장해 OFFICIAL pointer 전환 시에만 공개 projection이 바뀌게 한다.
- 2026-08-19 구현 완료: OWN_GOAL, 라이브 reverse/re-entry, goalEvents 리비전 스냅샷, 점수·개인 득점 서버 정합성 검증, 승부차기 정정, 공개 올림 분 표시를 반영했다.
- 2026-08-20 자책골 표시 계약 보완: 득점 귀속 side는 점수 계산에만 사용하고, 일정·상세·팀 전적의 이벤트 행은 자책골 선수 소속팀 영역에 표시한다. 대회 득점자 집계에서도 자책골을 제외한다.
- 2026-08-21 익명 득점 계약 보완: 라이브 운영·결과 입력에서 GOAL/OWN_GOAL의 선수 미지정 등록을 허용하고 `payload.anonymous=true`로 의도적인 익명과 누락을 구분한다. 익명 GOAL은 `익명`, OWN_GOAL은 `OG`로 표시한다.
- 2026-08-19 자동 검증: API target suite 103/103 + 신규 정합성 suite, Web target suite 124/124 + 신규 UI 회귀.
- 2026-08-19 최종 검증: API 결과 정정/승부차기 통합 테스트 20/20 통과. headed Chromium에서 데스크톱 1440×900, 모바일 390×844 정정 모달과 LIVE 운영 콘솔을 캡처했으며 console/network 오류와 가로 넘침은 0건이었다.
- Screenshot evidence: `output/playwright/task150/desktop-result-edit-modal.png`, `output/playwright/task150/mobile-result-edit-modal.png`, `output/playwright/task150/desktop-operate-console-live-events.png`.
