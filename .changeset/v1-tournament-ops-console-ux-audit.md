---
"v1_api": patch
"v1_web": patch
---

경기장에서 한 손으로 급박하게 조작한다는 실사용 맥락을 기준으로 대회 운영 콘솔(`tournament-ops` 경기 운영 화면)의 UX 감사 결과를 반영했다. (이벤트 전송 'sending' 고착 + alpha `VALIDATION_ERROR` 근본 원인은 별도 changeset — `v1-tournament-ops-clock-integer-fix` — 으로 분리했다.)

**라인업 없이 경기를 시작할 수 있던 막다른 길을 막았다(클라이언트).** `operate-console.tsx`는 양 사이드 모두 SUBMITTED/LOCKED 라인업이 있어야 "경기 시작" 버튼을 활성화하고, 없으면 버튼을 숨기지 않고 비활성 + 사유 배너 + 라인업 화면 링크를 항상 함께 보여준다. 이미 라인업 없이 LIVE가 된 기존 경기도 `LineupGrid`의 빈 상태에 같은 링크가 생겨 그 자리에서 복구할 수 있다. (서버 측 `games.service.ts`의 `executeCommand` `start` 분기 검증은 별도 PR로 이어간다 — 기존 라이프사이클 통합테스트 다수가 라인업 미제출 상태로 경기를 시작시키고 있어, 이번 alpha 긴급 배포를 지연시키지 않도록 영향 범위 조율을 다음으로 미뤘다.)

**"경기 종료"에 확인 단계를 추가하고 위험 버튼을 분리했다.** 되돌릴 수 없는 동작인데 확인 없이 즉시 실행됐다 — 기존 `useConfirm`/`ConfirmModal`을 재사용해 확인 다이얼로그를 붙이고, 헤더 명령 버튼 그룹에서 구분선으로 시각적·물리적으로 떼어냈다.

**운영 권한 요청 중(`requesting`/`none`) 배너를 추가했다.** 콘솔을 열 때마다 거치는 구간인데 명령 버튼·라인업 그리드가 전부 비활성인 이유가 화면에 없었다.

**모바일(390px)에서 원정팀 명단에 탭으로 바로 닿게 했다.** `LineupGrid`가 두 사이드를 세로로 쌓아, 원정팀을 보려면 홈팀 전체를 스크롤해야 했다 — sm(640px) 미만에서만 팀 전환 탭을 보여주고, 좌우 분리 + 팀명 헤더로 만들던 "어느 팀 선수인지 헷갈리지 않는다"는 기존 보장은 그대로 유지했다.

**헤더에 실시간 점수를 추가했다.** 경과시간과 같은 위계(`text-2xl font-bold`)로, 확정된 GOAL 이벤트에서 파생하되 되돌려진(reversed) 이벤트는 제외한다(`games.service.ts`의 `scoreFromEvents`와 같은 정의).

(alpha `VALIDATION_ERROR`의 근본 원인 수정 + 게이트웨이 필드 수준 진단은 별도 changeset — `v1-tournament-ops-clock-integer-fix` — 에 있다.)

**사실 확인(수정 없음):** `text-2xs` 유틸리티는 Tailwind v4 기본 테마(`--text-xs`까지만 정의)에도, `globals.css`에도(`@theme`/`--text-2xs` 없음, 주석 언급뿐) 정의돼 있지 않다 — 무효한 클래스로 CSS가 생성되지 않아 캡션이 의도보다 크게 렌더된다. `tournament-ops/operate/*` 8개 파일(24곳) + `components/game-operations/team-foul-counter-bar.tsx`(2곳)가 영향받는다. `globals.css`는 다른 작업과 개행 혼재 위험이 있어 직접 고치지 않았다 — 토큰 정의를 소유한 쪽에서 처리해야 한다.
