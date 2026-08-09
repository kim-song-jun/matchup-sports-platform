---
"v1_api": patch
---

alpha 배포를 `MODULE_NOT_FOUND` 로 죽이던 시드의 cross-boundary import 를 제거한다.

`prisma/seed-alpha-tournament-qa.ts` 는 alpha 배포 중 **API 프로덕션 이미지 안에서**
`ts-node prisma/seed-alpha-tournament-qa.ts` 로 실행된다. 그 이미지에는 `src/` 가 들어있지
않다 — `deploy/Dockerfile.v1-api` 는 `dist/`·`prisma/`·`node_modules`·`package.json`·
`tsconfig.json` 만 COPY 한다. 그런데 직전 변경이 `../src/tournaments/competition-config/
competition-config-backfill` 에서 상수를 import 했고, 배포가 이렇게 죽었다:

```
Error: Cannot find module '../src/tournaments/competition-config/competition-config-backfill'
Require stack: /app/apps/v1_api/prisma/seed-alpha-tournament-qa.ts
```

**CI 는 이 결함을 구조적으로 못 잡는다** — `src/` 가 존재하는 레포에서 돌기 때문이다.
워커 entrypoint 가 `dist/jobs/…`(존재하지 않는 경로)를 가리킨 채 몇 달간 크래시 루프였던 것과
같은 계열이다: **이미지가 코드의 가정을 담지 않는데 아무 게이트도 그걸 보지 않는다.**

- 런타임 import 를 제거하고 canonical 풋살 config id 를 시드 안에 상수로 둔다.
- 그 복제본이 레지스트리 상수(`FUTSAL_COMPETITION_CONFIG_ID`)와 어긋나지 않는지 유닛 스펙이
  단언한다 — 그 스펙은 이미지 밖에서 돌아 양쪽을 모두 import 할 수 있다.
- **이 결함 계열 자체를 막는 가드 추가**: 이미지 안에서 실행되는 prisma 스크립트가
  `../src/` 를 import 하지 않는지 소스 텍스트로 검사한다. 배포를 죽인 그 import 를 되살려
  가드가 실제로 실패하는 것을 확인했다.
