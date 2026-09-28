---
"v1_api": patch
"v1_web": patch
---

dev→main 승격을 수동 GitHub Actions 워크플로 하나(`promote-main.yml`, "Promote to main")로 자동화합니다. alpha 검증(커밋·prereleaseVersion 일치) 후 미소비 changeset이 있으면 버전을 올려 dev에 커밋·push하고, 승격 게이트를 미리 확인한 뒤 dev→main PR을 열 링크를 job summary에 남깁니다(Actions의 PR 생성이 저장소 설정상 막혀 있어 PR 자체는 사람이 엽니다). 이 자동화가 늘 "GitHub Actions is not permitted to create or approve pull requests"로 실패하던 옛 `release-main.yml`을 대체합니다.
