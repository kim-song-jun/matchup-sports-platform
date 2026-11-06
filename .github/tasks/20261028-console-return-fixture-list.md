# 경기 운영 콘솔 목록 복귀

## Scope / Request
- Frontend: 담당 경기에서 들어온 관리자와 스태프 모두 담당 경기 목록으로 복귀한다.
- 어드민 콘솔은 운영 경기 목록으로 복귀한다.
- 기존 경기 운영 데이터/API/권한은 변경하지 않는다.

## Acceptance Criteria
- [x] 담당 경기 링크가 `from=staff` 진입 출처를 전달한다.
- [x] 이전 admin 출처보다 새 staff 진입이 우선하고 콘솔 내 이동에도 유지된다.
- [x] 담당 경기 출처는 `/my/tournament-staff/:id`로 복귀한다.
- [x] 어드민 경기 콘솔은 `/admin/live/:id/operations`로 복귀한다.
- [ ] 관련 테스트 실행 및 alpha 390/768/1440 화면 확인.

## Owned / Forbidden
- Owned: 담당 경기 링크, 운영 게이트·셸, 출처 저장 유틸리티 및 관련 테스트와 changeset.
- Forbidden: API, 권한 정책, 다른 작업의 WIP.

## Ambiguity Log
- 브라우저 history 대신 명시적 목록 URL로 복귀한다. 직접 진입한 경기 콘솔도 목록을 제공한다.

## Progress Snapshot
- 구현과 회귀 테스트 추가 완료. 로컬 Vitest 실행 파일 부재로 테스트 실행 불가.
- 아직 커밋·배포하지 않아 alpha 시각 검증은 미실행.
