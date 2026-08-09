---
"v1_api": minor
"v1_web": minor
---

라이브 운영 콘솔에서 선수 교체를 기록할 수 있게 한다. 기존 액션 우선 흐름(액션 탭 → 시각 고정 → 대상 선택)을 그대로 따라 `교체` 액션 버튼을 추가하고, 나갈 선수(피치 위) → 들어올 선수(같은 팀 후보) 2단계로 커밋한다. "지금 피치 위" 는 저장된 컬럼이 아니라 `V1GameParticipant.started`와 확정 `SUBSTITUTION` 이벤트 로그를 `sequence` 순으로 접어 만든 파생값이다 — 정정(되돌리기)도 이 하나의 계산으로 자동 반영된다. 서버는 나가는/들어오는 두 참가자가 같은 팀 소속인지, 나가는 선수가 실제로 피치 위에 있는지, 들어오는 선수가 아직 피치 밖인지, `lineup.substitutions === 'limited'` 종목이면 팀별 `maxSubstitutions`를 넘지 않는지를 새 검증 경로(`GamesService#assertSubstitution`, 순수 로직은 `games/core/substitution.ts`)에서 강제하고, 위반 시 한국어 메시지가 붙은 전용 에러 코드(`SUBSTITUTION_INVALID`/`PARTICIPANT_SIDE_MISMATCH`/`SUBSTITUTION_OUT_NOT_ON_PITCH`/`SUBSTITUTION_IN_ALREADY_ON_PITCH`/`SUBSTITUTION_LIMIT_REACHED`)로 거부한다. 교체가 확정되면 들어온 선수는 나간 선수의 마지막 피치 좌표/포지션을 그대로 물려받는다.

`lineup.substitutions === 'rolling'`인 종목(풋살 등, 종목명이 아니라 config 값으로 판단)에는 "빠른 교체 모드"를 추가로 노출한다. "나갈 선수 지정"과 "들어올 선수 탭"을 서로 다른 의미의 두 조작으로 분리해, 아무것도 지정하지 않은 상태에서 후보를 잘못 눌러도 이벤트가 기록되지 않게 하고, 확정 즉시 지정을 자동 해제해 다음 실수 탭이 이어서 교체를 만들지 않게 했다. 확정 직후에는 되돌리기 액션이 달린 토스트를 띄우고, 기록된 이벤트 목록에도 되돌리지 않은 교체마다 되돌리기 버튼을 상시 노출한다 — 둘 다 기존 정정(`GamesService.reverseEvent`) 경로를 그대로 재사용한다(새 되돌리기 API 없음).
