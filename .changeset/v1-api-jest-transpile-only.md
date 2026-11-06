---
"v1_api": patch
---

API 통합 테스트가 스위트마다 TypeScript 타입체크를 다시 하던 것을 없애 CI 와 alpha 배포 대기 시간을 줄여요. 타입체크는 테스트 파일까지 포함해 CI 에서 한 번 해요.
