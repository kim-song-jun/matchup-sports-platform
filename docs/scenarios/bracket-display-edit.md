# 대진 표시 문구·경기 정보 편집 — 2026-10-17

Task: [20261057](../../.github/tasks/20261057-admin-bracket-canvas.md).
Persona: owner/ops 쓰기, support 읽기, 일반 사용자 쓰기 거절.
브라우저 대상: alpha, 1440×1000 / 768×1024 / 390×844.

## 실행 시나리오

1. 기존 시각·등록 경기장이 있는 대회의 목록과 그림을 연다. 같은 경기 ID의 번호·시각·경기장을 재입력 없이 확인한다.
2. 목록 수정에서 번호, 홈·어웨이 문구, 시각, 등록 경기장을 저장한다. 그림 카드/상세 패널과 새로고침 뒤 값이 일치하는지 확인한다.
3. 그림 상세에서 같은 항목을 다시 변경한다. 목록과 새로고침 뒤 같은 값을 확인한다. 모바일 BottomSheet에서도 반복한다.
4. 자동 문구를 확인하고 직접 입력한 뒤 출처 경기 번호를 변경한다. 자동 미리보기만 갱신되고 직접 입력은 유지되는지 확인한다. 문구 복원/빈 문자열 저장 시 최신 자동 문구가 표시되어야 한다.
5. 시각 비우기·경기장 비우기를 저장한다. 목록/그림에 시간 미정·경기장 미정이 표시되고 재조회 응답도 null이어야 한다.
6. 팀이 없는 12강 부전승 타일을 누른다. 문구/자동 복원, 팀 선택, 연결된 8강 번호·홈/어웨이 안내를 확인한다. 부전승 자체에는 번호·시각·경기장 입력이 없어야 한다.
7. 부전승 문구·팀 저장 후 연결된 8강 목록/그림/새로고침에 동일한 값이 나타나는지 확인한다. 팀 이름이 우선 표시되고 부전승 문구는 보조로 남아야 한다.
8. 저장 실패를 유발해 입력과 오류가 유지되는지 확인한다. 슬롯 배정 후 다른 저장이 실패한 경우 부분 성공을 명시해야 한다.
9. 번호·문구 변경 전후 TeamMatch ID, 슬롯 ID, 진출 edge가 유지되는지 확인한다. 실제 12강 결과 확정→8강 및 승자/패자 후속 경기 진출도 확인한다.
10. support는 읽기 전용, 일반 사용자는 관리자 PATCH 거절인지 확인한다. 시작/결과가 있는 경기의 슬롯 팀 변경 잠금을 유지해야 한다.

## 검증 기록

- main/dev 모두 `serializeTournamentTeamMatchBracket`에서 TeamMatch.startAt/placeName/fieldId를 조회한다. 별도 canvas 저장소는 없다.
- 원인: 그림 카드의 일정 footer 누락, 목록·desktop panel의 빈 시각 PATCH 누락. 하나의 canonical 값을 표시하고 null을 명시적으로 저장하도록 수정했다.
- API DTO/문구 저장·슬롯 직렬화 44/44 PASS. API 합계 269개, Web 대진 관련 566개 계약 검증 PASS(중간 실패를 수정하고 해당 파일 재실행). 양쪽 타입, Web pattern, API surface PASS. 상세 실행 범위는 task의 Progress Snapshot 참고.
- committed-tree expand-contract gate PASS, 릴리스 해시·historical manifest 회귀 7/7 PASS.
- 실제 DB integration: 로컬 Docker daemon 미가동으로 미실행. additive migration은 CI DB integration 대상이다.
- 실제 alpha 변경 후 UI QA: 0/3, PR 미배포. 스크린샷/console/network/실제 결과 진출 검증 및 cleanup 기록은 alpha 배포 후 이 문서에 추가한다. 컴포넌트 테스트는 실제 브라우저 QA로 계산하지 않는다.
- 기존 사용자 데이터·결과를 변경하거나 seed/reset을 실행하지 않았다.

## 2026-10-18 — alpha 후속: 조별 ENTRY 팀의 부전승 후보

- PR #1960 배포 SHA `5444656fac`에서 metadata 1440/768/390 3/3 PASS, 실제 승자·패자 및 12강→8강 진출 PASS.
- 빈 BYE의 팀 선택은 조별 ENTRY 20팀을 이미 배정된 팀으로 모두 제외해 실패했다. 문구는 검증 직전 값으로 복원했다. 이 실패를 완료로 표시하지 않는다.
- 공통 후보 계산을 서버 `assertPlaceable`의 kind별 예외와 맞춘다. BYE는 조별 ENTRY 팀을 선택할 수 있고 결선 ENTRY/BYE/GROUP_RANK 중복은 제외한다. 목록 8강·desktop panel·mobile picker·독립 BYE 편집기가 같은 계산을 사용한다.
- 실제 후보 선택 회귀 RED 2건 → 관련 170 tests GREEN. 후속 PR/alpha 배포 후 BYE 3폭 저장과 원복을 다시 실행한다.


## 2026-10-18 사용자 재현 후속 — 공개 문구·그림 장소

기존 완료 기록의 범위 공백: 관리자 3폭 검증 뒤 사용자 공개 projection의 side override 누락을 확인하지 못했다. alpha 원 대회31번 홈 `ddddd`·35번 BYE `dd`가 admin GET에는 있지만 public GET은 자동 문구였다. 동일42개 ID의 scheduledAt/venue는 양 API에서 모두 일치하며 관리자31번 카드도10/19 20:33이었다. 사용자 그림 MatchCard에는 venue 렌더가 없었다. 사용자 저장 데이터는 변경하지 않았다.

후속 AC: side/빈 BYE 문구→공개 상세/일정/그림, 팀명 우선·BYE 보조, 등록 경기장 이름·시각·미정 표시·3폭 간격, 새로고침. API label RED1 / Web 장소·BYE RED2 확보. 공개 projection 공용 해석과 그림 metadata 및 간격 수정, PR/alpha 재검증 진행 중. 기존 Copilot 예외는 이 후속 PR에 적용하지 않는다.


## 2026-10-18 공개 부전승 연결선 후속

- 빈 부전승 → 저장된 8강 HOME/AWAY 연결선 확인. 팀 배정/문구 수정/새로고침 후에도 같은 경기·자리로 연결된다.
- 명시적 슬롯 연결이 있으면 같은 팀이 들어간 다른 경기에 추정 선을 추가하지 않는다. 연결 없는 수동 대진은 선을 만들지 않는다.
- 팀명 우선·부전승 보조, 별도 경기 번호/시각/경기장 없음, 기존 승자/패자 연결 유지 확인.
- 1440/768/390 alpha after 및 console/network 검증은 PR 머지·배포 후 기록한다. 미배포 코드 테스트를 alpha PASS로 표시하지 않는다.

- 수정 전 alpha 실측: 1440/768/390 모두 부전승 카드 4개·BYE 선 0개, console/pageerror/HTTP 오류 0. [증거 JSON](../screenshots/public-bye-connectors/before/evidence.json). 변경 후 alpha는 미배포로 대기.
- 계약 검증: Web graph/renderer/label 50, API presenter 50 PASS. 빈 HOME/AWAY 연결 및 비공개 게이트 포함.


## 2026-10-18 PR #1976 — 공개 부전승 연결선 배포 검증 완료

- dev `d276dcd72e9ed5cadeb5ae7e00474b9a4993226d`, alpha `1.10.0-alpha.20261018.gd276dcd72e9e`. PR CI39127375238·dev CI39128404876·alpha39128404820 SUCCESS. 사용자 승인으로 이번 Copilot 모델 장애 리뷰만 예외 적용.
- 익명 원 대회 `/tournaments/ad200600-0000-4000-8000-000000000003/bracket`에서 1440/768/390 **3/3 PASS**. 각 부전승4자리→실제 8강 HOME4줄의 연결선4개, 총12끝점 오차0.5px 이내. 원 대회의 부전승은 모두 빈 HOME이며 AWAY는 API/renderer 회귀로 검증했다.
- 화면 이동: 일정 SSR의 숨김 대진 트리가 hydration 후 사라진 것을 확인 → 순위·대진표 탭 클릭 → 연결선 확인 → 내부 스크롤을 그림으로 이동 → 캡처. viewport별 새로고침으로 반복했다.
- console/pageerror/HTTP 실패0, document 가로 overflow0. 42개 경기 전체 응답을 배포 전후 비교해 ID·승자/패자 source·시각·경기장·문구 변화0. 원 대회 쓰기 없음, 브라우저 모두 종료.
- 초기 QA region timeout 및 networkidle timeout은 완료 증거로 계산하지 않았다. polling 화면의 networkidle 대신 실제 hydration/영역 준비 상태로 대기해 최종 재실행 PASS. [초기 실패](../screenshots/public-bye-connectors/after/first-attempt.json), [최종 UI 증거](../screenshots/public-bye-connectors/after/evidence.json), [데이터 비교](../screenshots/public-bye-connectors/after/comparison.json).
- before: desktop 그림 캡처 유효. tablet/mobile before는 앱 내부 스크롤의 초기 순위표만 담아 그림 영역의 before 비교 불가. after는 실제 그림이 보이도록 스크롤해 촬영했다. 원 배포를 되돌려 before를 재현하거나 합성 이미지를 사용하지 않았다.
- 공유 로컬 dev FF는 기존 WIP로 중단, `/tmp/pr1976-local-dev-sync-backup`에 보존. 원격 dev/alpha 배포 완료와 독립이다.
