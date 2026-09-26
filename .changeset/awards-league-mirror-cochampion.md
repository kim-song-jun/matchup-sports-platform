---
"v1_web": patch
---

정규 리그 시즌이 끝나도 시상 페이지 시상대가 계속 비어 있던 것과, 공동 우승 시 상금란에
한쪽 팀 이름이 사라지던 것을 고친다.

- **원인 1 (시상대가 항상 빔)**: 정규 리그 거울 행(`kind: 'regular_league'`)은
  `groups`·`fixtures`가 항상 빈 배열이다 — 순위는 `V1League` 축에서 계산되고 대회 행에는
  미러링되지 않기 때문이다(단일 시즌·다조 무관). `awards-page-client.tsx`는 다조 리그일
  때만(`tournament.groups.length > 1`) 통합 순위 API(`GET /tournaments/:id/standings
  /overall`)를 별도로 조회하는 `useMultiGroupLeagueTopThree`를 태웠는데, 거울 행은 이
  조건이 항상 거짓이라 이 override를 못 타고, 그 결과 `getTopThree`가 groups·fixtures
  기반으로 계산해 항상 빈 배열을 돌려준다. 완결된 단일 시즌 리그도 시상대가 계속 비어
  있었다(실사용자 발견, 2026-09-16 — 결과 페이지는 같은 원인을 이미 수정했었다).
- **수정 1**: `tournament.kind === 'regular_league'`(거울 행) 여부를 별도로 판정해, 조
  개수와 무관하게 이 경우엔 항상 통합 순위 API로 top3를 가져오게 한다.
- **원인 2 (공동 우승 시 팀 하나가 사라짐)**: 위 라우팅이 뚫리면 동점 처리 기준을 전부
  소진해도 안 갈리는 공동 우승(`champions.length > 1`)이 그대로 노출되는데, 시상대
  (`AwardsPodium`)는 `top3.find(t => t.pos === 1)`로 1위를 하나만 집어 나머지 공동 우승
  팀을 조용히 버렸고, 상금란(`PrizeSection`)의 `teamByPos`도 `Object.fromEntries`로
  구성해 같은 `pos`(=1) 키를 마지막 팀 이름이 덮어써 한쪽이 사라졌다.
- **수정 2**: `AwardsPodium`은 `.find()` 대신 `.filter()`로 1위 팀을 전부 모아 금메달
  슬롯에 이름을 `·`로 이어붙이고, 공동 우승 전용 안내("OO · OO, 공동 우승이에요.")를
  보여준다. `PrizeSection`의 `teamByPos`도 같은 `pos`를 가진 팀 이름을 이어붙이도록
  바꿔, 1위 상금 행에 공동 우승 팀 전부가 표시된다. 결과 페이지(`results-page-client
  .tsx`)가 이미 같은 이유로 적용한 패턴과 동일하다.
