# 팀매치 공동 경기 기록 — 화면별 플로우

Task 172 · 로컬 실제 API/독립 PostgreSQL · headed Chromium · 390×844 / 768×1000 / 1440×1000

권한 페르소나: 박지훈(홈팀 일반 라인업 참가자), 최도윤(상대팀 일반 라인업 참가자), 비로그인 관람자. 팀장 전용 계정으로 편집을 우회하지 않았다.

```mermaid
flowchart TD
 A[상대팀 승인·라인업 제출] --> B[경기 시작 시간 도달]
 B --> C[목록에 진행 중 표시]
 C --> D{라인업 참가자?}
 D -->|아니오| E[일반 매치 상세]
 D -->|예| F[공동 경기 기록]
 F --> G[득점 추가·수정·삭제·복구]
 G --> F
 F --> H[한 팀 종료 확인]
 H -->|기록 수정| F
 H --> I[상대팀 종료 확인]
 I --> J[공식 결과 확정·편집 잠금]
```

## 검증 결과

- 최종 흐름 36/36, 변경 전 비교 6/6. 가로 넘침 0.
- 시나리오 중 JavaScript 오류·API 실패·콘솔 오류 0. 신규 계정 약관 동의 전 설정 조회 403은 준비 단계로 별도 기록했다.
- 실제 DB 통합 11/11: 권한, 동시 수정, 요청 재전송, 이력 복구, 공개 정책, 양 팀 확정, 기존 API 경합, 공식 결과 projection의 중복 실행을 검증했다.
- 관련 API 단위 143/143, 웹 회귀 169/169. API/Web 타입 검사와 패턴 검사 통과. 마이그레이션 적용 후 Prisma schema drift 없음.
- [최종 브라우저 증거](../screenshots/team-match-shared-record/evidence.json) · [시나리오](05-team-match-flows.md) · [작업 문서](../../.github/tasks/172-team-match-shared-record.md)

## 변경 전

한 팀의 결과 입력과 상대팀 승인이 별도 화면으로 제공되던 흐름이다.

### 390px

매치 상세

![변경 전 390px 매치 상세](../screenshots/team-match-shared-record/before/390-detail.png)

기존 결과 입력

![변경 전 390px 기존 결과 입력](../screenshots/team-match-shared-record/before/390-result.png)

### 768px

매치 상세

![변경 전 768px 매치 상세](../screenshots/team-match-shared-record/before/768-detail.png)

기존 결과 입력

![변경 전 768px 기존 결과 입력](../screenshots/team-match-shared-record/before/768-result.png)

### 1440px

매치 상세

![변경 전 1440px 매치 상세](../screenshots/team-match-shared-record/before/1440-detail.png)

기존 결과 입력

![변경 전 1440px 기존 결과 입력](../screenshots/team-match-shared-record/before/1440-result.png)

## 변경 후 — 단계별 3개 화면 폭

### 01. 경기 전 상세

확정된 매치여도 시작 전에는 공동 기록을 편집할 수 없다.

<details><summary>390px — 경기 전 상세</summary>

![390px 경기 전 상세](../screenshots/team-match-shared-record/after/390-01-before-start.png)

</details>

<details><summary>768px — 경기 전 상세</summary>

![768px 경기 전 상세](../screenshots/team-match-shared-record/after/768-01-before-start.png)

</details>

<details><summary>1440px — 경기 전 상세</summary>

![1440px 경기 전 상세](../screenshots/team-match-shared-record/after/1440-01-before-start.png)

</details>

### 02. 진행 중 목록

서버 시간 기준으로 시작된 확정 매치를 진행 중으로 표시하고 목록에 유지한다.

<details><summary>390px — 진행 중 목록</summary>

![390px 진행 중 목록](../screenshots/team-match-shared-record/after/390-02-live-list.png)

</details>

<details><summary>768px — 진행 중 목록</summary>

![768px 진행 중 목록](../screenshots/team-match-shared-record/after/768-02-live-list.png)

</details>

<details><summary>1440px — 진행 중 목록</summary>

![1440px 진행 중 목록](../screenshots/team-match-shared-record/after/1440-02-live-list.png)

</details>

### 03. 일반 사용자 상세

일반 상세를 유지한다. 공개 정책에 따라 점수를 표시하며 편집·라인업·이력은 노출하지 않는다.

<details><summary>390px — 일반 사용자 상세</summary>

![390px 일반 사용자 상세](../screenshots/team-match-shared-record/after/390-03-public-detail.png)

</details>

<details><summary>768px — 일반 사용자 상세</summary>

![768px 일반 사용자 상세](../screenshots/team-match-shared-record/after/768-03-public-detail.png)

</details>

<details><summary>1440px — 일반 사용자 상세</summary>

![1440px 일반 사용자 상세](../screenshots/team-match-shared-record/after/1440-03-public-detail.png)

</details>

### 04. 참가자 공동 점수판

양 팀의 제출된 라인업 참가자는 상세 클릭 시 같은 공동 기록 화면으로 진입한다.

<details><summary>390px — 참가자 공동 점수판</summary>

![390px 참가자 공동 점수판](../screenshots/team-match-shared-record/after/390-04-participant-scoreboard.png)

</details>

<details><summary>768px — 참가자 공동 점수판</summary>

![768px 참가자 공동 점수판](../screenshots/team-match-shared-record/after/768-04-participant-scoreboard.png)

</details>

<details><summary>1440px — 참가자 공동 점수판</summary>

![1440px 참가자 공동 점수판](../screenshots/team-match-shared-record/after/1440-04-participant-scoreboard.png)

</details>

### 05. 득점 입력

득점 팀·선수·시간을 입력한다. 득점자 미상과 자책골도 지원한다.

<details><summary>390px — 득점 입력</summary>

![390px 득점 입력](../screenshots/team-match-shared-record/after/390-05-add-goal.png)

</details>

<details><summary>768px — 득점 입력</summary>

![768px 득점 입력](../screenshots/team-match-shared-record/after/768-05-add-goal.png)

</details>

<details><summary>1440px — 득점 입력</summary>

![1440px 득점 입력](../screenshots/team-match-shared-record/after/1440-05-add-goal.png)

</details>

### 06. 상대 참가자 반영

한 팀 일반 참가자가 등록한 골을 상대팀 일반 참가자 화면에서 확인한다. 2초마다 조회한다.

<details><summary>390px — 상대 참가자 반영</summary>

![390px 상대 참가자 반영](../screenshots/team-match-shared-record/after/390-06-other-player-synced.png)

</details>

<details><summary>768px — 상대 참가자 반영</summary>

![768px 상대 참가자 반영](../screenshots/team-match-shared-record/after/768-06-other-player-synced.png)

</details>

<details><summary>1440px — 상대 참가자 반영</summary>

![1440px 상대 참가자 반영](../screenshots/team-match-shared-record/after/1440-06-other-player-synced.png)

</details>

### 07. 상대방 기록 수정

상대팀 참가자가 기존 골의 득점자를 수정하고, 양쪽 점수판에 반영한다.

<details><summary>390px — 상대방 기록 수정</summary>

![390px 상대방 기록 수정](../screenshots/team-match-shared-record/after/390-07-edited-scorer.png)

</details>

<details><summary>768px — 상대방 기록 수정</summary>

![768px 상대방 기록 수정](../screenshots/team-match-shared-record/after/768-07-edited-scorer.png)

</details>

<details><summary>1440px — 상대방 기록 수정</summary>

![1440px 상대방 기록 수정](../screenshots/team-match-shared-record/after/1440-07-edited-scorer.png)

</details>

### 08. 삭제·복구와 변경 이력

골 삭제 후 해당 변경을 되돌린다. 누가 언제 어떤 내용을 바꿨는지 확인한다.

<details><summary>390px — 삭제·복구와 변경 이력</summary>

![390px 삭제·복구와 변경 이력](../screenshots/team-match-shared-record/after/390-08-restored-history.png)

</details>

<details><summary>768px — 삭제·복구와 변경 이력</summary>

![768px 삭제·복구와 변경 이력](../screenshots/team-match-shared-record/after/768-08-restored-history.png)

</details>

<details><summary>1440px — 삭제·복구와 변경 이력</summary>

![1440px 삭제·복구와 변경 이력](../screenshots/team-match-shared-record/after/1440-08-restored-history.png)

</details>

### 09. 작성 중 원격 변경

다른 참가자가 기록을 바꾸면 작성 중 입력을 보존하고 저장을 막는다. 최신 기록 확인 후 다시 입력한다.

<details><summary>390px — 작성 중 원격 변경</summary>

![390px 작성 중 원격 변경](../screenshots/team-match-shared-record/after/390-09-concurrent-edit.png)

</details>

<details><summary>768px — 작성 중 원격 변경</summary>

![768px 작성 중 원격 변경](../screenshots/team-match-shared-record/after/768-09-concurrent-edit.png)

</details>

<details><summary>1440px — 작성 중 원격 변경</summary>

![1440px 작성 중 원격 변경](../screenshots/team-match-shared-record/after/1440-09-concurrent-edit.png)

</details>

### 10. 첫 팀 종료 확인

경기가 실제로 끝났는지, 현재 기록이 맞는지 확인한 뒤 팀 확인을 남긴다.

<details><summary>390px — 첫 팀 종료 확인</summary>

![390px 첫 팀 종료 확인](../screenshots/team-match-shared-record/after/390-10-end-confirm-dialog.png)

</details>

<details><summary>768px — 첫 팀 종료 확인</summary>

![768px 첫 팀 종료 확인](../screenshots/team-match-shared-record/after/768-10-end-confirm-dialog.png)

</details>

<details><summary>1440px — 첫 팀 종료 확인</summary>

![1440px 첫 팀 종료 확인](../screenshots/team-match-shared-record/after/1440-10-end-confirm-dialog.png)

</details>

### 11. 상대팀 종료 확인

한쪽 확인 상태가 상대팀에 반영된다. 다른 팀 참가자 한 명이 확인하면 최종 확정된다.

<details><summary>390px — 상대팀 종료 확인</summary>

![390px 상대팀 종료 확인](../screenshots/team-match-shared-record/after/390-11-other-team-confirmation.png)

</details>

<details><summary>768px — 상대팀 종료 확인</summary>

![768px 상대팀 종료 확인](../screenshots/team-match-shared-record/after/768-11-other-team-confirmation.png)

</details>

<details><summary>1440px — 상대팀 종료 확인</summary>

![1440px 상대팀 종료 확인](../screenshots/team-match-shared-record/after/1440-11-other-team-confirmation.png)

</details>

### 12. 최종 결과 잠금

양 팀 확인 후 편집 버튼을 제거한다. 기존 공식 결과·전적 집계 경로에 연결한다.

<details><summary>390px — 최종 결과 잠금</summary>

![390px 최종 결과 잠금](../screenshots/team-match-shared-record/after/390-12-official-locked.png)

</details>

<details><summary>768px — 최종 결과 잠금</summary>

![768px 최종 결과 잠금](../screenshots/team-match-shared-record/after/768-12-official-locked.png)

</details>

<details><summary>1440px — 최종 결과 잠금</summary>

![1440px 최종 결과 잠금](../screenshots/team-match-shared-record/after/1440-12-official-locked.png)

</details>

## 재현 및 정리

- 스크립트: `scripts/qa/team-match-shared-record-before.cjs`, `scripts/qa/team-match-shared-record-flow.cjs`. Playwright와 Chromium이 설치된 환경에서 실행한다.
- 자체 QA API `8122`, 웹 `3016`, DB `5547`을 사용했다. 운영/공유 DB reset·seed를 실행하지 않았다.
- `createSharedRecordFixture`로 만든 세 개의 독립 경기와 경기 전 픽스처를 `/tmp/teameet-record-fixtures.json`의 `{ fixtures: [...], scheduled }` 형태로 전달한다. 스크립트의 세션 서명 키는 이 전용 로컬 API용 테스트 상수다. 실제 서비스 키를 사용하지 않는다.
- 최초 확인한 headed Chromium PID/PPID `42330/42286`; 컨텍스트와 브라우저는 `finally`에서 종료한다. 최종 캡처 후 자체 API(PID 41811)·웹(PID 31865)·전용 DB를 정상 종료했다.
- 실시간 반영은 WebSocket이 아닌 2초 polling이다. 라인업에 계정 연결이 없는 외부 참가자는 직접 로그인 편집할 수 없으며, 이름만으로 권한을 부여하지 않는다.
- 새로운 공동 기록이 없는 기존 공식/제출 결과와 리그·대회는 기존 결과 화면을 유지한다. 최종 확정 후 참가자 편집은 잠기며 기존 관리자 정정 절차를 사용한다.
