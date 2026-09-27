---
"v1_api": patch
---

프로덕션 배포 워크플로에 Task168 단계 전환(Stage A/B) 진입점을 추가했어요. 운영자가 `workflow_dispatch`로 `task168_stage`(none/stageA/stageB)와 리허설 근거를 넣으면 릴리스 매니페스트에 `database.task168` 블록(마이그레이션 이름·해시·리허설 근거)과 Stage A 전환 도구 이미지 정보가 함께 실립니다. 일반 push 배포는 항상 `none`으로 고정되어 있어 동작이 그대로예요 — 이번 변경은 승인 게이트 뒤에 새 진입 경로 하나를 여는 것뿐, 기존 배포 흐름·조건·순서는 바꾸지 않았습니다.
