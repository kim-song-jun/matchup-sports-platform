---
"v1_api": patch
---

alpha QA 시드가 대회·픽스처에 `competitionConfigVersionId` 를 직접 세팅하도록 고친다 —
배포마다 공개 대회 일정이 비어버리던 결함.

끊어졌던 사슬:

```
QA 시드가 매 배포마다 대회 리셋 → 새 픽스처에 competitionConfigVersionId 없음
→ fixture-game 백필이 그 픽스처를 CONFIG_MISSING 으로 격리
→ V1Game 이 안 생김 → 공개 대회 일정이 빈 목록
```

예전에는 `competition-config-backfill` CLI 가 나중에 그 값을 채워줬다. 그러나 그 CLI 는
canonical config 행이 코드 상수와 다르면 `COMPETITION_CONFIG_SEED_DRIFT` 로 **하드 실패**한다.
2026-08-09 alpha 가 정확히 그 상태였다 — #277 이 `lineup.positions`/`lineup.formations` 를
프리셋에 추가했는데 DB 의 canonical 행은 이전 내용이라 CLI 가 거부했고, 그 결과 공개 일정이
0건이었다(실측).

값을 아는 쪽(시드)이 픽스처를 만들 때 바로 넣으면 그 의존 자체가 사라진다. 드리프트 해소
(새 config 버전 발행 후 repoint)는 여전히 운영자의 판단으로 남지만, **더 이상 공개 일정을
막지 않는다.**

- `createScenario`/`createCompetitionData` 가 canonical 풋살 config id 를 인자로 받아
  대회 1곳 + 픽스처 2곳(조별·결선)에 세팅한다.
- `main()` 이 시작 시 canonical 행의 존재와 `ACTIVE` 여부를 확인하고, 없거나 retired 면
  무엇을 해야 하는지 밝히며 **명시적으로 실패**한다(조용히 null 로 진행하지 않는다).
- 통합 테스트 2건 + 기존 유닛 스펙 보강: 픽스처마다 config 가 박히는지, 그리고 **그래서
  fixture-game 백필이 하나도 격리하지 않고 실제로 `V1Game` 을 만드는지**. 두 번째가 핵심 —
  첫 번째만 있으면 "필드가 채워졌다" 만 보고 공개 일정이 실제로 채워지는지는 못 본다.
  `completed` 픽스처는 Task 10(`game-result-backfill`) 소유라 기대치에서 제외한다.
