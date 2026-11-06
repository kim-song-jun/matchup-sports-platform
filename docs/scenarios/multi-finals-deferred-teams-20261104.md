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

## 사용자 공개 순위표 누락 후속 (2026-11-04)

- 사용자 요청: 어드민뿐 아니라 사용자 순위표에서 조별 정보와 결선이 모두 사라지는 문제 확인.
- 원인: `/tournaments/:id/bracket`의 조별/결선 칼럼 및 실제 조별 순위 렌더 조건 3개가 `group_knockout`만 지원했다. 공개 API·분류 helper·이름별 TournamentBracket은 이미 `league_knockouts` 데이터에 대응한다.
- 수정: 두 조별+결선 형식이 같은 기존 순위표·결선 컴포넌트를 사용하도록 gate만 확장. 팀 미정 대진과 N개 이름 범위·조 선택 유지. 새 레이아웃/패턴 도입 없음. 이 방식의 결선 준비 안내는 조별 종료가 아니라 대진 생성 여부를 설명한다.
- 실제 alpha 공개 API 읽기 증거: 대회 `73fad68e-3c54-414e-854b-50b997a02c37`는 공개 시각 존재, 전체11개 조/58경기, 예선3개 조/42경기, 결선8개 편성. 예선팀·순위행0개, 예선 홈/어웨이 팀 배정0개, 완료0개였다. 따라서 화면 복구 후에도 실제 순위 수치는 예선 팀 배정·성적 반영이 필요하다. 데이터를 만들거나 기존 대회를 수정하지 않았다.
- 회귀: 추가한 공개 UI3개가 기존 코드에서 조별 탭·순위·결선 누락으로 모두 RED. 수정 후 통과. 빈 예선에 허위 순위를 만들지 않는 경우와 공식 배정 후 이름별 진출 표시를 추가 검증한다.
- 최종 공개 후속 검증: 4개 파일177/177 PASS(순위표57, 상세 분류83, 결선 렌더21, 최종결과16). 신규5개 회귀 포함, Web typecheck0·pattern PASS. 기존 관리자/DB 검증 숫자와 합산하지 않는다.
- 실제 alpha 브라우저/390·768·1440 시각 증거는 앞서 기록한 초기화 오류와 미배포로 미검증이다. API 읽기 증거를 화면 PASS로 표기하지 않는다.

## 2026-11-06 — 토너먼트별 독립 확정과 교차 시드 배치

적용: `league_knockouts`만. 실제 alpha 대회의 명단/결과를 쓰지 않고 구현하며, QA용 저장은 독립 테스트 DB에서 수행한다.

1. 대진 생성에서 예선 및 토너먼트 이름·자리 수(capacity)·3/4위전만 정한다. 순위 목적지 없이 빈 결선이 생긴다.
2. 토너먼트 배정 규칙에서 각 조 몇 위의 목적지를 연결한다. 자리 수와 기존 승인 명단/실제 슬롯을 유지하며 preview/generate를 호출하지 않는다.
3. 진출팀 배정 모달에서 결선을 선택한다. 추천 순서는 공식 저장 순위와 일치한다. 다른 결선의 미확정/시작 상태는 선택한 결선의 확정을 막지 않는다.
4. 기본 시드/수동 방식과 적합한4개 조·1~3위12팀 결선의 교차 방식 중 선택한다. 1위는 부전승, 해당8강 상대 쪽의2위는 B/C/D/A 고정, 3위는12강·8강에서 같은 조를 피하도록 추첨한다.
5. 실제 기존 경기/승자 연결로 미리 보고 확정한 배열을 그대로 저장한다. 다른 결선과 예선·경기ID·일정은 유지한다.
6. 미완료/낡은 순위, 잘못된 자리 수·중복·미확정 팀, stale revision/sourceVersion, 대상 결선 시작/기록/결과, 교차 규칙과 다른 실제 그래프는 실패 원인을 노출한다.
7. alpha1440/768/390에서 생성/규칙/배정 진입, 결선 선택과 정책 표시, 추천→대진 확인→취소, console/network, 동일 DB snapshot을 확인한다. 기존 실대회에서는 확정 저장을 하지 않는다.

검증: API101/Web16 PASS; 양쪽 tsc·surface/pattern·committed diff PASS. 임시 PostgreSQL16.15의 최신 스키마에서 신규 통합2/2 및 실제 교차 배정/깨진 연결 거절 PASS. 마이그레이션 이력 검증은 원격 API CI로 구분한다. 임시 DB PID10171 종료. 변경 전 alpha3폭 캡처/console·network0오류·쓰기0, 브라우저5751/5763 종료. 코드364b5d071의 Web/Gates CI PASS; API CI와 Copilot 리뷰 결과는 대기. 변경 후 alpha기능0/7·viewport0/3, 미머지·미배포이며 전체 완료가 아니다. [PR2169](https://github.com/kim-song-jun/matchup-sports-platform/pull/2169).
