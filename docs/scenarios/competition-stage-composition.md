# 단계형 대회 구성

Status: In Progress — 구현/로컬 검증 중, Alpha 미배포
Task: [20261130](../../.github/tasks/20261130-competition-stage-composition.md)

## 범위와 진입
플랫폼 운영자: 기존 `/admin/tournaments/new` 유지. 새 버튼 `/admin/tournaments/new-staged`에서 기본 정보·단계/편성·일정·참가조건·공개 확인을 거쳐 실제 초안을 저장한다.
관리자는 대진 관리에서 미정 대진을 생성하고 편성별 참가팀을 확정하며, 경기 운영은 기존 보드/콘솔을 쓴다.
공개 사용자는 같은 대회의 대진/결과에서 단계를 골라 독립 순위를 확인한다.

## 필수 시나리오
1. 예선 없이 본선 풀리그/토너먼트: 단계 하나로 생성·초안 재조회·참가팀 배정·경기 운영.
2. 20팀: 4팀×5개 예선(30경기) → 같은 순위끼리 5팀×4개 본선(40경기), 총70경기. 각 팀7경기·본선 승점0 시작.
3. 3단계 혼합: 2팀×2개 예선리그 → 상위리그+하위토너먼트 → 두 우승팀의 최종토너먼트. 실제팀 반복 참가·총5경기.
4. 공식 결과 미비/동률/중복 출처/같은 단계 중복 팀/타 대회 팀/낡은 버전의 거절과 실제 오류 표시.
5. 결과 정정 → stale 경고 → 시작 전 편성 재확정. 시작한 편성의 참가팀은 고정하고 무관한 다른 편성은 독립 확정.
6. 전체 단계 미완료 상태에서 대회 종료 거부. 마지막 단계의 편성별 순위와 시상만 표시.
7. 이전 생성·기존 대회·경기 ID/일정/결과·권한 유지. 기존 대회 자동 전환 거부.
8. 관리자/담당 디렉터/조회 스태프/비로그인 권한 확인, 화면390/768/1440 및 console/network 점검.

## 실행 증거
- 임시 PostgreSQL18.6에서 전체 migration replay PASS. 실제 사용자 DB에는 접속하지 않았다.
- API planner+기존 대진·슬롯·일정·순위 projection 5 suites /271 tests PASS.
- 실제 DB 단계 통합5 cases PASS: 20팀70경기, 3단계 혼합, 단일5팀 리그/토너먼트, 생성·구조 편집/종료 제약.
- 웹 기존 생성/모델·새 editor 131 tests PASS. manager 실제 payload/서버 오류3 tests PASS.
- 공개 분리순위·기존 상세/시상/스테퍼 등264 tests PASS, 추가 새 route 테스트는 helper의 모호한 버튼 선택 수정 후1건 PASS.
- API/Web typecheck, Web patterns 및 API surface PASS. 단계형 일정 순서 회귀3건 포함13건 PASS.
- rollback runtime epoch 3: 실제 git/manifest 9 cases PASS, release manifest self-test 및 migration gate/self-test PASS. 이전 epoch 2는 rollback·실패 후보 복구 대상에서 제외.
- PR [#2285](https://github.com/kim-song-jun/matchup-sports-platform/pull/2285): CI·Copilot 리뷰 진행 중.
- Alpha 기능0/8·viewport0/3: 아직 배포하지 않았다. 로컬 웹 서버는 실행하지 않았다.
- cleanup: 임시 DB/브라우저 등 이번 작업 소유 자원만 검증 종료 시 정리한다.
