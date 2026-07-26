# Teameet Changesets

사용자 동작, API 계약, 배포 동작을 바꾸는 PR은 `.changeset/*.md` 파일 하나 이상을 포함한다.

```md
---
"v1_api": minor
"v1_web": minor
---

이 릴리스에서 사용자에게 달라지는 내용을 한 문단으로 적는다.
```

- `patch`: 호환되는 버그 수정, 운영·배포 안정화
- `minor`: 호환되는 신규 기능이나 사용자 플로우
- `major`: 호환되지 않는 공개 계약 변경
- `v1_api`와 `v1_web`은 하나의 제품 릴리스로 고정되어 같은 버전을 가진다.
- 테스트·문서만 바뀌는 PR은 Changeset 없이 통과한다.
- `dev` 배포는 다음 정식 버전에 `-alpha.YYYYMMDD.g<sha12>`를 붙인다.
- 정식 버전·태그는 alpha QA 승인 뒤 release PR이 `main`에 병합될 때만 만든다.
