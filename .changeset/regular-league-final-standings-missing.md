---
"v1_web": patch
---

정규 리그 시즌이 끝나도 "최종결과" 화면에 순위가 안 뜨던 것을 고친다.

- **원인**: 정규 리그 거울 행(`kind: 'regular_league'`)은 `groups`가 항상 빈 배열이다 —
  순위는 `V1League` 축에서 계산되고 대회 행에는 미러링되지 않기 때문이다(단일 시즌·다조
  무관). `results-page-client.tsx`는 "다조 리그인지"를 `tournament.groups.filter(g =>
  g.phase === 'group').length > 1`로 판정해 통합 순위 API(`GET /tournaments/:id/standings
  /overall`)를 부를지 결정하는데, 거울 행은 이 조건이 절대 참이 될 수 없다(0 > 1은 항상
  거짓). 그러면 이어지는 `buildSingleGroupLeagueRanking`(`groups[0].standings`를 직접
  읽는 단일 조 경로)도 `groups.length === 1`을 요구해 역시 항상 빈 배열을 돌려준다.
  결과적으로 정규 리그는 시즌이 완전히 끝나도(경기 전부 종료·확정) "최종 순위가 아직
  등록되지 않았어요"만 계속 뜬다 — alpha 실측(2026-09-13): 2팀·경기 1개짜리 완결 리그에서
  `GET .../standings/overall`은 200으로 정상 순위를 주는데 화면은 미등록 안내만 그렸다.
- **수정**: `tournament.kind === 'regular_league'`(거울 행) 여부를 별도로 판정해, 조
  개수와 무관하게 이 경우엔 항상 통합 순위 API로 최종 순위를 가져오게 한다. 이 API는
  이미 리그 축 응답(`V1LeagueOverallStandingRow`의 `teamId` 변형)도 반환하도록 설계돼
  있어 백엔드 변경은 필요 없다 — 프론트가 그 응답을 안 쓰고 있었을 뿐이다. `format:
  'league'`인 실제 대회(리그 방식으로 치르는 단발 대회, `kind: 'regular_tournament'`,
  `groups`가 실제로 채워짐)의 기존 단일/다조 처리 경로는 그대로 유지된다.
- **범위**: 다조(티어) 정규 리그의 경우 이번 수정으로 최종 순위 자체는 뜨지만, "1부/2부"
  같은 조 라벨은 붙이지 않는다(이 화면은 원래도 그런 라벨을 붙이지 않았다 — 단일
  "최종 순위" 표 하나). 조 라벨이 붙은 화면은 `bracket-page-client.tsx`의 "리그 순위"
  탭을 참고한다.
