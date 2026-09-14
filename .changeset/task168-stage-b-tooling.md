---
"v1_api": patch
---

Task 168 M11(대회 대진 레거시 테이블 정리) 최종 이관을 준비하는 도구 3종을 저장소에 들였어요. 아직 어떤 배포 경로에도 연결돼 있지 않아서, 이번 변경만으로는 alpha·prod 배포 동작이 전혀 바뀌지 않습니다.

- `scripts/release/prepare-task168-final-stage-inputs.sh`: 검토된 최종 스키마와 M11 마이그레이션을 지정된 커밋의 마이그레이션 이력에 얹어 하나의 입력 묶음으로 만들어요.
- `scripts/release/package-task168-final-source.sh`: 그 입력 묶음을 결정적인(umask·시간대와 무관하게 항상 같은 바이트가 나오는) 아카이브로 패키징하고, 위조를 막기 위한 외부 sidecar 인증서를 함께 만들어요.
- `scripts/release/task168-final-image-preflight.sh`: 그 아카이브와 sidecar 가 실제로 서로를 인증하는지, 아카이브 안 파일 목록이 조작되지 않았는지 먼저 확인하고, 그다음 격리된 임시 데이터베이스를 띄워 마이그레이션을 한 번 리허설해 봐요. 실제 서비스 데이터베이스는 건드리지 않아요.

`deploy/task168-final-drop/schema.prisma`(검토된 최종 스키마)도 함께 추가했습니다. `apps/v1_api/prisma/`는 그대로예요 — 최종 스키마를 그 경로에 두면 CI 의 드리프트 검사가 오작동할 수 있어서, 별도 경로에 둡니다.

세 스크립트 모두 합성 테스트 저장소로 실행되는 계약 테스트(`scripts/qa/test-task168-stage-b-package.sh`, `scripts/qa/test-task168-stage-b-preflight-sidecar.sh`)를 CI 게이트에 추가했어요 — Docker 없이 몇 초 안에 끝납니다.
