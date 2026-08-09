---
"v1_web": patch
---

대회 경기 라인업 화면(`tournaments/[id]/matches/[fixtureId]/lineup`)에서 조회 실패 시 빠져나올 길이 없던 문제를 고쳤다. (1) 게임/라인업 조회(`useV1GameLineups`는 `retry:false`, `useV1Game`은 전역 기본값 `retry:1`)가 재시도까지 소진하고 실패하면 hydrate useEffect가 아무것도 하지 않아 `state`가 계속 null로 남고 `PageSkeleton`이 무한 렌더됐다 — 이제 조회 실패를 명시적으로 감지해 재시도 버튼이 있는 에러 화면을 보여준다. (2) 접근권한 조회(`useV1FixtureLineupAccess`) 실패를 원인 불문 "매니저·오너만 관리 가능" 문구로 표시했다 — 이제 `V1ApiError.code`로 진짜 `PERMISSION_DENIED`와 대상 없음(`GAME_NOT_FOUND`/`TOURNAMENT_FIXTURE_GAME_NOT_FOUND`)과 그 외 네트워크·서버 오류를 구분해, 후자에는 재시도 버튼이 있는 에러 화면을 보여준다. (3) 라인업 편집 중(dirty) 제출 버튼이 이유 없이 비활성됐던 것을, "저장하지 않은 변경사항이 있어요 — 먼저 저장해 주세요" 인라인 문구로 항상 이유를 설명하도록 고쳤다.
