# 정규리그 + N개 토너먼트: 대진 생성과 진출팀 배정 분리

Status: Implementation verified locally; alpha manual QA pending.

관련 [task](../../.github/tasks/20261057-admin-bracket-canvas.md) · [API 계약](../api/domains/tournaments.md#정규리그--n개-토너먼트-league_knockouts).

사용자 선택 B안. 대상은 `kind=regular_tournament`, `format=league_knockouts`의 관리자 대진 화면이다.

## 실제 사용자 검증 시나리오

Persona: mutation 권한 운영 관리자. Route: `/admin/tournaments/:id/bracket`.

1. 대진 생성 진입 → 예선 조 편성 → 다음 → 토너먼트별 순위 규칙 → 미리보기. 스크롤이 이전 단계 하단에 남지 않고 다음 제목/검증 오류가 보인다.
2. 실제 진출팀을 선택하지 않고 생성한다. 규칙 수만큼 미정 시드가 표시되며 실제 부전승 수와 구분한다.
3. 진출팀 배정 진입. 예선 진행 중에는 공식 순위 반영 대기 안내와 비활성 배정 컨트롤을 확인한다.
4. 전체 조별 경기를 공식 종료하고 순위가 반영되면 조별 전체 순위와 승점·득실차·승/무/패를 확인한다.
5. 순위대로 자동 선택한다. 모든 기준이 같은 경우 동률 후보가 표시되며, 운영자가 팀을 직접 선택한다. 다른 토너먼트 중복과 자리 수 불일치를 방지한다.
6. 기존 결선에 팀을 배정한다. 경기 ID·일정·장소·승자/패자 연결 및 예선 결과가 유지된다. 이후 수동 교체를 해도 같은 구조는 보존된다.
7. 시작/공식 기록이 있는 결선, support 권한, stale preview, 중복 팀, API 실패에서 성공 안내가 나오지 않는다.

## 로컬 증거

- API 단위 생성기/서비스: 15/15 PASS.
- PostgreSQL 통합: 10/10 PASS. 실제 미정 생성→공식 순위→같은 경기 ID/일정 유지, 완전 동률→수동 선택→같은 대진 배정, CAS·권한·rollback·시작 보호 포함.
- Web 변경 흐름 및 기존 대진 회귀: 6 files / 146 tests PASS. 기존 node-panel 테스트의 React act 경고는 남아 있으며 실패를 숨기지 않았다.
- API/Web typecheck 0, API surface753 및 Web pattern PASS.
- DB는 loopback55484의 이번 runner 전용 임시 PostgreSQL만 사용했고 finally에서 종료했다. 운영/alpha DB 변경 없음. schema/migration 변경 없음.
- 빈 DB의 전체 migration 시도는 기존 Android privacy policy v1.2 materialization gate(20260831090000)에서 중단됐다. 이 변경의 migration 성공 근거로 집계하지 않는다. 기능 통합은 별도 새 임시 DB에 최신 schema를 준비해 검증했다.

## Alpha 수동 QA — 미실행

- 기능 0/7, viewport 0/3(390/768/1440), before/after 스크린샷 없음.
- `cua.getState()`가 브라우저 생성 전 `windows sandbox failed: helper_unknown_error: setup refresh had errors`로 종료됐다. 기본 터미널도 같은 초기화 오류이며 escalated CLI만 실행 가능했다.
- 변경 코드 미배포 상태다. 최신 serving SHA와 API health를 확인한 후 위 7개 흐름, console/network, 세 폭 screenshot을 검증해야 한다.
- 브라우저 프로세스는 생성되지 않았으며 소유 브라우저 정리 대상이 없다. 로컬 Next 서버를 대체 QA로 실행하지 않았다.
