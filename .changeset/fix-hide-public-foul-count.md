---
"v1_api": minor
"v1_web": patch
---

개인 공개 기록에서 파울 누적치를 노출하지 않는다 — 카드(경고/퇴장)는 그대로 공개한다.

**판단**: 카드는 경기의 서사로서 공개할 값이지만, 일반 파울 개수는 선수 개인 프로필에
"파울 N개"라는 낙인으로 남을 뿐 관전자에게 주는 정보가 없다. DB에는 계속 쌓되 공개
표면에서만 뺀다.

**감사 결과**: 공개 표면을 전수 확인했더니 파울이 새는 경로는 `GET /users/:id/records` 의
`summary.fouls` **한 곳뿐**이었다. 팀 공개 기록(`PublicTeamRecordsService`)에는 참조가 0건이고,
대회 공개 기록은 이벤트를 `GOAL` 만 집계하며 경기 상세 타임라인도 `GOAL`·`CARD` 만
통과시킨다(`public-tournament-records.service.ts` 의 `scoringTypes`) — 그쪽은 관전자 폴링
비용 때문에 이미 의도적으로 파울을 읽지 않고 있었다. 개인 기록만 그 정책에서 빠져 있었고,
심지어 **UI 는 이 값을 화면에 그리지도 않아 응답 JSON 에만 실려 나가던 상태**였다.

**수정**:
- `summary.fouls` 제거. 그로 인해 미사용이 되는 `EligibleResultRow.fouls`, Prisma
  `select { fouls: true }`, `fouls: row.fouls` 매핑까지 함께 삭제했다(dead code 미잔류).
- 웹 `PublicUserRecordsSummary` 에서 `fouls` 제거.
- 통합 테스트를 뒤집었다 — 기존 테스트가 `summary.fouls === 3` 을 계약으로 못박고 있어서,
  **"DB 에는 `fouls=3` 이 그대로 남아 있는데 공개 응답에는 실리지 않는다"** 를 검증하도록
  바꿨다(저장은 유지되고 노출만 사라졌음을 한 테스트가 동시에 증명한다).

**유지**: DB `V1GameResultParticipant.fouls`, `FOUL` 이벤트, 개인 기록의 `경고 N · 퇴장 N`,
경기 상세 타임라인의 `CARD`, 운영 콘솔의 팀 파울 카운터(`TeamFoulCounterBar`), 결과 검수
입력 폼, `game-invariants.ts` 의 `fouls ↔ FOUL` 이벤트 정합성 검증 — 전부 그대로다. 심판과
운영은 계속 파울을 보고 기록하며, 사라지는 것은 선수 개인의 공개 프로필에 붙던 꼬리표뿐이다.

**트레이드오프**: 공개 응답 계약이 바뀐다. 현재 `summary.fouls` 를 읽는 소비자는 웹 타입
정의뿐이라 영향이 없지만, 외부에서 이 필드를 읽던 곳이 있다면 깨진다.
