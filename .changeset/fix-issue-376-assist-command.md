---
"v1_api": patch
"v1_web": patch
---

골에 어시스트를 붙일 때 오류·중복 표시·검토 기록 불일치가 나던 문제를 고쳤다 (#376)

`operate-console.tsx`의 `attachAssist`가 원본 GOAL 이벤트를 `reverseEvent`(REST)로 되돌린 뒤 어시스트가 채워진 새 GOAL을 `submitEvent`(오프라인 큐)로 재제출하는 "reverse-then-resubmit" 2단계 흐름이었다. 같은 `ops` 클로저에서 두 호출이 순서대로 실행되다 보니 `submitEvent`가 참조하는 `expectedVersion`이 `reverseEvent`의 버전 증가를 반영하지 못한 구버전으로 박제돼 구조적으로 `VERSION_CONFLICT`가 났다(운이 나쁠 때가 아니라 매번). 또 `reverseEvent`는 원본 행을 지우지 않고 CORRECTION 행만 추가하므로 목록엔 원본·정정·신규 GOAL 세 행이 그대로 남았고, 대회 경기 종료 시 공식 결과를 만드는 `deriveTournamentRevision`의 골/카드/파울/어시스트 집계 루프는 되돌려진 이벤트를 걸러내지 않아(같은 파일의 `scoreFromEvents`/`resultInvariantInput`은 이미 걸러냄) 원본과 재제출된 GOAL이 둘 다 득점자의 골 수에 더해져 총점과 개인 골 합계가 어긋났다.

되돌리기·정정행·재제출 패턴 자체를 없애고 원자적 전용 커맨드로 교체했다. 백엔드에 `POST /games/:gameId/events/:eventId/assist`(`GamesService.assignGoalAssist`)를 새로 추가해 원본 GOAL의 `assistParticipantId`를 in-place로 채우거나(null이면 해제) 한 번의 버전 증가로 원자적으로 갱신한다 — `reverseEvent`와 동일한 가드(대상이 GOAL이 아니면 거부, 이미 되돌려진 이벤트면 거부, 어시스트 참가자가 득점 팀 소속이 아니거나 득점자 본인이면 거부)와 감사 로그·Idempotency-Key 처리를 그대로 따른다. `deriveTournamentRevision`도 `scoreFromEvents`와 같은 `reversesEventId` 기반 필터를 추가해 되돌려진 이벤트가 골/카드/파울/어시스트 집계에서 빠지도록 고쳤다. 프론트는 `use-v1-game-operations-console.ts`에 `assignAssist`(온라인 전용 REST, 큐 미사용 — `reverseEvent`와 동일한 이유)를 추가하고 `attachAssist`를 이 한 번의 호출로 단순화했다 — 버전 레이스가 원인 단계에서 사라지고, 새 이벤트를 만들지 않으므로 목록엔 한 행만 남는다.
