---
"v1_api": patch
---

정규 리그 시즌을 통합 축(`V1Tournament`, `kind=regular_league`)으로 백필하는 CLI를 추가합니다. 리그와 같은 id를 쓰고 `status`는 `draft`로 두며, 미지원 종목이나 우리 것이 아닌 id 충돌을 만나면 아무것도 만들지 않고 멈춥니다. 기본은 dry-run이고 `--apply`를 붙여야 실제로 씁니다.
