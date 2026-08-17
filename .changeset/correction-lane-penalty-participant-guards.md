---
"v1_api": patch
---

대회 경기 결과 **정정·재제출** 레인에 정본 종료(`end`) 레인과 같은 승부차기·참가자 가드를 적용합니다. 정정 한 번으로 선수 개개인 기록이 사라지거나 브래킷이 조용히 멈추던 서버측 결함 4건을 닫습니다.

- **참가자 목록 전멸 방지**: `actualParticipants`가 비어 있으면 새 리비전의 `v1_game_result_participants`가 0행이 되어 그 경기의 개인 기록이 전멸했습니다. base 리비전에 개인기록이 있었던 경우에만 422 `PARTICIPANT_INVALID`로 거부합니다 — 정본 프로듀서가 정당하게 0행으로 만든 경기(선발 미표시·이벤트 없음, 로스터가 빈 등록, TBD 브래킷 픽스처)의 점수 정정은 계속 가능합니다.
- **결선 경기 정정으로 브래킷이 멈추던 문제 해결**: 정정 폼이 평평한 `{home, away}`만 보내 승부차기가 탈락하면 결선 무승부가 그대로 공식이 되고, 아웃박스의 브래킷 프로젝션이 `BRACKET_RESULT_DRAW_UNSUPPORTED`로 6회 재시도 끝에 POISONED로 남았습니다(운영자에게는 "성공"만 보임). 이제 서버가 base 리비전의 승부차기를 승계하고, 승계로도 승자를 만들 수 없으면 커맨드 자리에서 409로 돌려줍니다.
- **남의 경기 participantId 차단**: `participant_id`에 FK가 없어 다른 경기의 참가자 UUID가 이 경기의 공식 기록에 들어가고 그 선수 개인 통계에 남의 경기 성적이 더해졌습니다. 이제 소속과 진영까지 대조합니다(정정·재제출 양쪽).
- **`missingScorer` 정직화**: 정정 경로만 `false`를 하드코딩해 "득점자 미상 골이 있다"는 경고가 정정 한 번으로 사라졌습니다. 재제출 경로 선례대로 이벤트 스트림에서 계산합니다.
- **승부차기 DTO 강타입화**: `penalties`가 `@IsObject()`뿐이라 `{}`·`{home:'a'}`·`{home:1}`·음수·`null`이 통과해 저장 후 `parseOfficialPenalties`가 throw하며 POISONED가 됐습니다. `PenaltyScoreDto` 중첩 검증 + `@ValidateIf`로 HTTP 경계에서 거부합니다(`null` 포함). 이 DTO를 공유하는 팀 매치 레인에도 같은 방어가 적용됩니다.
- 판정 규칙을 `src/games/core/knockout-penalties.ts`(순수 함수)와 `src/tournaments/knockout-fixture.ts`(사실 읽기)로 분리해 네 레인(`end`/복구/정정/재제출)이 규칙을 복제하지 않고 공유합니다. 복구 레인도 `end`와 같은 `extractEndPenalties`를 통과하도록 정리했습니다.

스키마 변경 0, 엔드포인트·응답 형태 변경 0, API 파괴적 변경 0 — 잘못된 입력을 거부하는 검증만 조입니다. 프론트엔드 변경은 후속 PR입니다(새로 도달 가능해진 `TOURNAMENT_PENALTY_*` 세 코드가 아직 `result-review-copy.ts`의 한국어 문구 맵에 없어 영문 원문이 노출됩니다). 그래서 patch입니다.
