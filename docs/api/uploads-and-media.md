# Uploads & Media Contract

> 이 문서는 legacy 통합 문서의 호환 진입점일 뿐, 현재 Teameet v1 업로드 계약의 source of truth가 아니다.

현재 v1 계약은 [`docs/api/v1/domains/uploads.md`](./v1/domains/uploads.md)만 사용한다. 구현 근거도 `apps/v1_api`와 `apps/v1_web`으로 제한한다.

기존 문서가 안내하던 아래 동작은 현재 v1에 존재하지 않으므로 구현·QA·보안 판단의 근거로 사용하면 안 된다.

- `GET /api/v1/uploads/:id`
- `DELETE /api/v1/uploads/:id`
- GIF 업로드
- 이미지당 10MB 제품 한도
- WebP 자동 변환과 썸네일 생성
- 업로드 메타데이터 배열 응답

현재 v1은 인증된 이미지·영상 업로드만 제공하며, 성공 데이터는 `{ urls: string[] }`이다. 파일 종류·크기·서명·쿼터·보관 수명주기와 현재 삭제 경계는 canonical v1 문서를 확인한다.
