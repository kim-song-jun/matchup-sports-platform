---
'v1_api': patch
---

대회 공개 기록의 기본 표시를 닉네임으로 고친다. `V1UserProfile.displayName` 은 닉네임이 아니라 실명의 레거시 미러(가입 시 `realName = displayName`)라, 실명 표시 토글이 꺼져 있어도 실명이 그대로 공개되고 있었다.
