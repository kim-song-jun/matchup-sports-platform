---
"v1_api": patch
---

Task 168 M11 최종 수렴: 저장소 정본을 post-M11 스키마로 전환했습니다. M11(대회 대진 legacy 테이블 퇴역) 마이그레이션을 정식 `prisma/migrations`로 옮기고, `schema.prisma`를 최종 스키마로 교체했습니다. dev push 배포는 이제 StageA 러너 대신 ledger/영수증을 확인하는 final-steady 경로를 타며, M11 이후 마이그레이션도 정상 배포됩니다. prod 배포에는 M11이 prod DB에 이미 적용되어 있는지 먼저 확인하는 가드를 추가했습니다.

추가 하드닝: final-steady check-only가 StageB MIGRATION_COMMITTED 영수증이 가리키는 manifest 파일의 checksum과, 그 manifest에 기록된 resolved(rolled-back) migration-attempt 스냅샷(M11 이하 이름만)을 DB 실측과 대조합니다. prod M11 가드는 소스 M11 파일 sha를 고정값과 직접 대조하고, DB URL을 `docker run` argv 대신 `--env-file`로 넘기며, 쿼리 오류를 fail-closed로 처리하고 원인을 로그에 남깁니다. `alpha-manifest-common.sh`의 `validate_stored_alpha_manifest`가 StageB가 활성화하는 `stage=stageBFinal` manifest도 인식합니다.
