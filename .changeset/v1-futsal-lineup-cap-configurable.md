---
"v1_api": patch
---

풋살 팀매치의 라인업 상한(`futsal-v1` 경기 설정의 `lineup.maxPlayers`)을 5에서 6으로 올려, 이미 선택 가능했던 '6:6' 경기방식 프리셋(`team-match-conditions.constants.ts`)으로 만든 매치에서도 6명 선발 라인업을 저장할 수 있게 한다. 지금까지는 6:6으로 매치를 만들어도 라인업 저장이 항상 `LINEUP_SIZE_INVALID`로 거부됐다.

이 상한은 코드에 새로 하드코딩한 것이 아니다 — `V1CompetitionConfigVersion.lineup.maxPlayers`가 이미 검증(`team-match-lineup.service.ts`/`games.service.ts`)의 유일한 출처였고, 이번 변경은 그 값 자체(그리고 이미 존재하던 `FUTSAL_FORMATIONS`의 `outfield: 5` 대형 — 2-2-1/1-3-1/3-1-1)만 바꾼 것이다. 관리자가 이후 다른 인원수로 조정하고 싶다면 이미 있는 `POST /admin/competition-configs/:configId/versions`로 새 버전을 발행하면 된다(새로 만든 버전은 스키마 기본값으로 즉시 ACTIVE라 team-match는 자동으로 따라가고, tournament는 `PATCH /admin/tournaments/:id/competition-config`로 특정 버전에 pin할 수 있다) — 다만 이 API를 호출할 관리자 화면은 아직 없다.

**배포 시 운영 조치 필요(자동 반영 아님):** 이 커밋만으로는 이미 배포된 환경(alpha 등)의 `futsal-v1` ACTIVE 행이 바뀌지 않는다 — `competition-config-backfill.cli.ts`의 `seedCompetitionConfigVersions()`는 DB 행과 코드 상수의 content hash가 다르면 기존 행을 조용히 덮어쓰지 않고 `COMPETITION_CONFIG_SEED_DRIFT`로 하드 실패한다(완료된 경기의 채점 규칙을 소급 변경하지 않기 위한 의도된 가드 — `deploy-alpha.sh`가 이 CLI를 배포 스크립트에 자동으로 넣지 않는 이유이기도 하다. 2026-08-09에 lineup.positions/formations 추가 때 실제로 이 드리프트로 alpha가 막혔던 전례가 있다). 이 변경을 alpha/prod에 실제로 반영하려면 배포 후 운영자가 한 번:

```
DATABASE_URL=<target> pnpm --filter v1_api exec ts-node --transpile-only \
  src/tournaments/competition-config/competition-config-version-repoint.cli.ts \
  --actor-email <owner/ops 관리자 이메일>
```

를 돌려 futsal-v1의 canonical 후속 버전을 발행하고 아직 완료되지 않은 team match/tournament를 그 버전으로 리포인트해야 한다(`--dry-run`으로 먼저 확인 가능). 돌리기 전까지는 새로 만드는 팀매치도 여전히 5명 상한을 본다.
