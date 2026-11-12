# 리그 + N개 토너먼트 시간·구장 배정

Status: Implementation / PR validation
Task: [20261132](../../.github/tasks/20261132-fixture-time-court-assignment.md)

## Persona / route
플랫폼 운영자(owner/ops), 담당 대회 총괄, 조회 전용. `/admin/tournaments/:id/bracket`, format `league_knockouts`.

## Scenarios
1. 기존 시간/구장이 있는 경기에서 시간 배정 패널 열기. 기존 값 확인, 새 한국시간 등록 및 새로고침 복원.
2. 시간 항목에 경기 배정. 그림·목록·수동 편집이 같은 값을 보이고 기존 구장은 유지.
3. 구장 패널에서 기존 구장 배정. 기존 시간 유지. 플랫폼 운영자만 새 구장 등록 가능.
4. 단일 경기에서 시간/장소 직접 수정. 패널에 실제 값 반영. 다른 미저장 표시 문구가 있어도 수정하지 않은 일정/장소는 최신 서버 값을 반영.
5. 시간/구장 각각 해제. 반대 필드는 보존.
6. 제목 접기/펼치기. 하위 경기·선택란만 숨기고 배정 수 표시. 다른 배정/패널 전환 후 접힘 유지.
7. 같은 시간 다른 구장은 경고 없음. 같은 시간 같은 구장 중복은 경고. 실패 응답은 기존 배정과 실제 오류 유지.
8. support/철회/타 대회 총괄의 쓰기 차단. 비활성 구장 새 배정 차단, 기존 배정 해제 가능.

## Evidence
API 단위/DTO 및 기존 경기 수정·구장 서비스 259 PASS. Web API 연결·수동 편집·라우트 회귀 33 PASS. 양쪽 tsc 및 규칙 검사 PASS. 새 테이블 생성 SQL 모델 대조 PASS(실제 DB replay 아님).
새 migration 실제 PostgreSQL 재생/동시성 검증은 로컬 Docker daemon 부재로 미실행. CI에 integration spec 추가.
Alpha 변경 후 기능 0/8, viewport 0/3 (390/768/1440), console/network 미검증. 머지·배포와 관리자 로그인 필요. 로컬 목업 결과를 실제 서비스 QA로 대체하지 않는다.

## Cleanup
기능 QA를 위해 생성하는 대진은 영구 데이터가 될 수 있어 사용자 대회에 쓰지 않는다. 실제 QA 데이터/브라우저의 소유 범위와 cleanup 결과를 후속 기록한다.
