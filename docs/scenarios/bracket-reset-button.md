# 대진 상단 초기화 버튼

Status: PR validation in progress; Alpha not verified
Task: [20261111](../../.github/tasks/20261111-preliminary-edit-reset.md)

## 범위와 선택

사용자 A안: 대회 대진 상단 독립 버튼 + 기존 danger 확인 모달. `/admin/tournaments/:id/bracket`의 그림/목록, 네 형식과 단계형 대회. 정규 리그 surface는 범위 밖이다.

## 검증 시나리오

1. 운영자/해당 대회 총괄로 상단 ‘대진 초기화’ 클릭 → 실제 preview 경기 수·보존 범위 확인 → 취소 → 기존 경기와 POST 0 확인.
2. 같은 상태에서 확인 → 실제 서버 초기화 → 대진 0과 공개 해제·참가 신청/규칙/등록 시간·구장 보존 확인. 경기와 Game은 물리 삭제하지 않고 보관·취소한다.
3. 확인 중 다른 운영자의 일정/자리/구성 변경 → stale 오류와 대진 보존.
4. 시작 경기·이벤트·초안 포함 결과 revision·시작한 피리어드·없는 정본 Game은 초기화 불가. 종료/취소/보관 대회 및 빈 대진도 사유 표시.
5. support는 버튼 없음/POST403, 담당이 아닌·철회/만료된 총괄도 거절. 비인증401/UUID·DTO400.
6. 초기화 후 조회만 실패하면 저장됨과 조회 실패를 구분. 서버 쓰기 실패는 기존 대진과 실제 오류 보존.
7. 복수 결선은 예선 편성·팀 선택·규칙 보존. 단계형은 단계 정의 보존 후 다시 생성해 새로운 경기 ID가 생기는지 확인.
8. 390/768/1440에서 버튼·모달·focus 복원/가로 넘침/콘솔·네트워크 확인. 기존 단계 관리·시간/구장 도구·그림/목록 전환 유지.

## 현재 증거

- Node22 단일 worker: API 신규+기존 reset 36 PASS, Web 버튼 HTTP/대진 페이지 31 PASS. API/Web 타입·surface/pattern PASS. TournamentsModule import·33개 constructor metadata unresolved0 확인(실제 앱/DB 부트스트랩 아님).
- 실제 PostgreSQL spec 11건은 일반 세 형식·단계형 재생성·복수 결선 보존·LIVE/결과 초안/피리어드 보호·stale/support·감사 rollback·진출 outcome만 변경된 CAS를 검증한다. 최초 CI45935098816은 group_knockout 준비에서 조당2팀 입력이 지원 최소3팀 계약에 막혀 실패했다. 2개 조×3팀/총6팀으로 수정했으며 planner RED→GREEN 및 API 타입 PASS. 실제 초기화까지의 수정 후 판정은 새 CI에서 확인하며 이전 실패를 성공으로 표시하지 않는다.
- Alpha 5유형 × 3폭 = 0/15. 현재 관리자 인증 자료가 확인되지 않았고 이 PR은 미배포다. before/after·console/network·실제 사용자 흐름을 통과로 표시하지 않는다. 로컬 next 서버는 실행하지 않았다.
- 사용자 대회 초기화·DB seed/reset 실행 없음. 테스트 외 사용자 데이터 변경 없음.
