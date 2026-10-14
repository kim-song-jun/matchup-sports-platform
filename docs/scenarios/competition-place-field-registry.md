# 리그·대회 경기 장소와 필드 연결

Task: [20261082](../../.github/tasks/20261082-competition-place-field-registry.md)
Status: local validation PASS; DB integration / alpha browser PENDING

## 검증 흐름
1. platform_ops로 스태프 화면 진입: 스태프 배정 아래 경기장 등록 영역, 목록 로딩/오류/재시도 확인.
2. 기존 경기 장소 추가: 공백·대소문자 정규화, 같은 대회 이름 중복 방지, 다른 대회 독립, 미정 제외. 재실행과 같은 Idempotency-Key 재전송 확인.
3. 같은 이름에 다른 주소: 공용 핀은 비우고 기존 경기 주소·좌표·이미 배정된 필드 ID는 유지. 종료 경기의 결과는 불변이며 미배정 경기만 연결한다.
4. 리그/대회 데스크톱 경기 설정 및 모바일 필드 설정: 활성 등록 필드를 선택해 장소와 필드가 함께 저장되고 공개 일정/상세에 즉시 반영되는지 확인.
5. 현재 필드 유지·시간만 수정: 기존 장소 보존. 직접 장소 변경과 새 경기 생성은 필드 등록·배정까지 같은 트랜잭션. 같은 이름의 등록 필드와 다른 주소는 FIELD_PLACE_CONFLICT로 거절. 장소가 남은 배정 해제는 FIELD_PLACE_LINK_REQUIRED로 거절하고 주소/배정 보존.
6. 다른 대회 필드, 비활성 필드, fieldId+별도 장소 충돌 payload 거절. director에게 platform_ops 등록 권한이 추가되지 않는지 확인.
7. API 실패 시 성공 안내/화면 이동 없음. 목록 실패를 빈 목록으로 숨기지 않음.

## 실행 증거
- fields 서비스/공통 장소 helper 및 경기 수정 unit tests: 로컬 검증. 실제 캐시 invalidation MSW transport 테스트 포함.
- 후속 “싹 다 해줘” 승인: 미배정 경기 migration/import 연결, 신규 경기·장소 수정 자동 등록, 필드 이름 단일 표시. API 좁은 173개 + 최종 fields/helper 24개 PASS. Web 단일 이름/길찾기·모바일·picker·캐시·일정 URL 복귀 103개 PASS.
- 자동 승인 검토가 과거 장소 이름 일괄 덮어쓰기/주소 삭제를 거절해 제외. 미배정 연결은 fieldId만 쓰며 저장된 장소는 보존한다.
- 프론트 staff, 공용 picker, 리그/대회 설정, 모바일, 공개 장소 표시 unit tests 및 양쪽 TypeScript/패턴 검증: 로컬 검증.
- 실제 DB migration DML·서비스·공개 일정 round-trip 시나리오: `apps/v1_api/test/tournament-operations/league-operations-board.integration-spec.ts`. 트랜잭션 rollback으로 테스트 데이터 보존. **미실행**: Docker daemon/DB 환경 없음.
- alpha QA: platform_ops / tournament_admin / director, 390/768/1440 viewport, before/after screenshot 및 console/network verdict **미실행**. 기능 미배포 및 브라우저 sandbox 초기화 실패.
- 운영 DB 변경·seed/reset·배포·main 승격 없음. 생성한 브라우저/서비스 프로세스 없음.
