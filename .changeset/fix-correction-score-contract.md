---
'v1_web': patch
---

결과 정정/재입력 화면이 서버 스코어 계약을 어겨 저장이 아예 되지 않던 문제를 고쳤다 (#380)

`GET /games/:id/result-revisions`가 돌려주는 스코어는 두 형태의 union이다 -- 백필된 경기는 최상위에 `home`/`away`가 없고 `regulation: {home,away}|null` 안에 중첩돼 있다. 결과 정정 모달(`result-edit-modal.tsx`)이 이 형태를 평평하게 읽어 초기값이 `undefined`로 뜨고, 제출 시에는 스냅샷 전체(`goals`/`penalty`/`incomplete`/`provenance`/`regulation` 포함)를 그대로 보내 서버 `GameScoreDto`의 `forbidNonWhitelisted`에 걸려 `400 VALIDATION_ERROR`가 났다(알파 실측: 프론트가 실제로 보낸 payload는 400, `changes.score`만 `{home,away}`로 바꾸면 201) -- 결과 정정·무효 후 재입력을 UI로 저장할 수 없었다. "처리 이력" 타임라인과 확정 확인 모달도 같은 방식으로 읽어 `undefined:undefined`를 보여줬다.

`lib/game-result-score.ts`의 기존 정규화 헬퍼(`readGameResultScore`/`formatGameResultScore`)를 확장해(승부차기 필드명 통일 포함) 모든 읽는 지점(모달 초기값·점수 변경 diff·리비전 타임라인·정정/확정 확인 문구)에서 재사용하고, 제출 경로는 항상 평평한 `{home, away}`만 보내도록 고쳤다. `use-tournament-result-review.ts`의 `GameResultScore`(읽기)/`GameResultScoreInput`(쓰기) 타입을 분리해, 스냅샷을 그대로(또는 spread해서) 제출에 넘기면 컴파일이 깨지도록 만들었다 -- 이전에는 두 방향이 같은(항상 평평한) 타입을 공유해서 틀린 채로 컴파일을 통과했다.
