---
"v1_api": patch
---

Task 168 M11 최종 수렴: 저장소 정본을 post-M11 스키마로 전환했습니다. M11(대회 대진 legacy 테이블 퇴역) 마이그레이션을 정식 `prisma/migrations`로 옮기고, `schema.prisma`를 최종 스키마로 교체했습니다. dev push 배포는 이제 StageA 러너 대신 ledger/영수증을 확인하는 final-steady 경로를 타며, M11 이후 마이그레이션도 정상 배포됩니다. prod 배포에는 M11이 prod DB에 이미 적용되어 있는지 먼저 확인하는 가드를 추가했습니다.
