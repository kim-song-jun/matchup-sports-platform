# 팀매치 공동 기록 서브매치 화면 증거 — Task 173

PR #1243의 양 팀 라인업 참가자 공동 점수판에 선택적인 서브매치를 추가한 전체 흐름이다. 서브매치는 득점 묶음이며 최상단 점수와 공식 결과는 팀매치 한 경기로 합산된다.

## 검증 결과

- 실제 PostgreSQL + v1 API + production Web 빌드
- headed Chromium, 390 / 768 / 1440px
- 화면별 가로 넘침 0건
- page error 0건, console error 0건, 실패 API 요청 0건
- 원본 실행 기록: [`evidence.json`](../screenshots/team-match-shared-record-submatches/after/evidence.json)
- 기존 공동 기록 기준 화면: [PR #1243 갤러리](team-match-shared-record-gallery.md)

## 390px 모바일

| 단계 | 화면 |
|---|---|
| 서브매치 없는 기존 공동 점수판 | ![](../screenshots/team-match-shared-record-submatches/after/390-01-shared-scoreboard-without-submatches.png) |
| 첫 서브매치 생성 | ![](../screenshots/team-match-shared-record-submatches/after/390-02-first-submatch-created.png) |
| 2개 서브매치와 합산 점수 | ![](../screenshots/team-match-shared-record-submatches/after/390-03-aggregate-and-submatch-scores.png) |
| 상대 팀 참가자 동기화 | ![](../screenshots/team-match-shared-record-submatches/after/390-04-other-team-participant-synced.png) |
| 일반 사용자 상세의 서브매치 점수 | ![](../screenshots/team-match-shared-record-submatches/after/390-05-public-detail-breakdown.png) |
| 팀매치 한 경기 종료 확인 | ![](../screenshots/team-match-shared-record-submatches/after/390-06-one-game-confirmation.png) |
| 양 팀 확인 후 공식 잠금 | ![](../screenshots/team-match-shared-record-submatches/after/390-07-official-one-game-locked.png) |
| 공식 결과 이후 팀매치 리스트 | ![](../screenshots/team-match-shared-record-submatches/after/390-08-team-match-list-after-official.png) |

## 768px 태블릿

| 단계 | 화면 |
|---|---|
| 서브매치 없는 기존 공동 점수판 | ![](../screenshots/team-match-shared-record-submatches/after/768-01-shared-scoreboard-without-submatches.png) |
| 첫 서브매치 생성 | ![](../screenshots/team-match-shared-record-submatches/after/768-02-first-submatch-created.png) |
| 2개 서브매치와 합산 점수 | ![](../screenshots/team-match-shared-record-submatches/after/768-03-aggregate-and-submatch-scores.png) |
| 상대 팀 참가자 동기화 | ![](../screenshots/team-match-shared-record-submatches/after/768-04-other-team-participant-synced.png) |
| 일반 사용자 상세의 서브매치 점수 | ![](../screenshots/team-match-shared-record-submatches/after/768-05-public-detail-breakdown.png) |
| 팀매치 한 경기 종료 확인 | ![](../screenshots/team-match-shared-record-submatches/after/768-06-one-game-confirmation.png) |
| 양 팀 확인 후 공식 잠금 | ![](../screenshots/team-match-shared-record-submatches/after/768-07-official-one-game-locked.png) |
| 공식 결과 이후 팀매치 리스트 | ![](../screenshots/team-match-shared-record-submatches/after/768-08-team-match-list-after-official.png) |

## 1440px 데스크톱

| 단계 | 화면 |
|---|---|
| 서브매치 없는 기존 공동 점수판 | ![](../screenshots/team-match-shared-record-submatches/after/1440-01-shared-scoreboard-without-submatches.png) |
| 첫 서브매치 생성 | ![](../screenshots/team-match-shared-record-submatches/after/1440-02-first-submatch-created.png) |
| 2개 서브매치와 합산 점수 | ![](../screenshots/team-match-shared-record-submatches/after/1440-03-aggregate-and-submatch-scores.png) |
| 상대 팀 참가자 동기화 | ![](../screenshots/team-match-shared-record-submatches/after/1440-04-other-team-participant-synced.png) |
| 일반 사용자 상세의 서브매치 점수 | ![](../screenshots/team-match-shared-record-submatches/after/1440-05-public-detail-breakdown.png) |
| 팀매치 한 경기 종료 확인 | ![](../screenshots/team-match-shared-record-submatches/after/1440-06-one-game-confirmation.png) |
| 양 팀 확인 후 공식 잠금 | ![](../screenshots/team-match-shared-record-submatches/after/1440-07-official-one-game-locked.png) |
| 공식 결과 이후 팀매치 리스트 | ![](../screenshots/team-match-shared-record-submatches/after/1440-08-team-match-list-after-official.png) |

## 판정

서브매치가 없을 때 PR #1243의 직접 득점 입력이 유지된다. 서브매치를 만들면 각 카드에서 득점을 입력하고 최상단 합계가 자동으로 갱신된다. 상대 팀 라인업 참가자에게 같은 기록이 반영되며, 일반 상세에도 공개 정책에 맞는 서브매치별 점수가 보인다. 종료 확인은 서브매치별이 아니라 팀매치 전체에 한 번씩 수행하고 양 팀 확인 후 모든 편집이 잠긴다.