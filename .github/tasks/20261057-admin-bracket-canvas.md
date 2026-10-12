# Task 20261057: 어드민 대진 그림 편집기 — 그림 먼저, 팀은 자리에, 결과는 칸에서

## 2026-10-12 후속 기획 — 5조·20팀에서 12강 진출팀 자동 배치

Status: Implemented / Validation in progress — Alpha 배포·실제 화면 검증 대기 (이 후속 범위만)

### Context / 현재 구현 근거

- 사용자 대상: alpha `/admin/tournaments/ad200600-0000-4000-8000-000000000003/overview`의 대회, 대진관리 **목록** 보기.
- 사용자는 팀 미정으로 경기들을 먼저 만들고, 조별리그 이후 결선 팀을 일괄 추천받아 수정한 뒤 저장하려 한다.
- 최신 origin/dev를 fetch했다(`a4b7c2d78`). 조사 작업트리 `3d7180ea2`와 비교해 관련 대진 소스 변경은 없음을 확인했다.
- `bracket/page.tsx`는 그림/목록을 분리한다. 목록은 `bracket-tab.tsx`와 `bracket-group-card.tsx`를 사용한다.
- 그림에는 `BracketStandingsFillButton/Dialog` 및 `slots/standings-preview`, `slots/fill-from-standings`가 이미 있다. 현 UI는 확정 후보를 표시하고 동률만 선택하게 한다.
- 기존 GROUP_RANK는 특정 조의 특정 순위다. `templates/group-rank-pairings.ts`는 2/4/8개 조의 정형 교차 대진만 지원하며, 5개 조 성적 비교·3위 와일드카드·12강 부전승 배치를 제공하지 않는다.
- 목록에서 만든 자리 없는 경기와 슬롯 연결 경기를 모두 지원해야 한다. 슬롯 API만 확장하면 사용자 경로가 빠진다.
- 기획 당시 alpha URL은 웹 도구로 열리지 않았다. 구현 후 headed 읽기 전용 접근은 로그인 화면으로 이동했다(auth/me401). 실제 관리자 화면·해당 대회의 조/경기/설정 상태는 미확인이고 실제 데이터 변경은 없다.

### Goal / 판단

목록의 12강 영역에서 **자동 팀 배정 → 추천 확인·수정 → 한 번에 저장**으로 진출 12팀의 배정을 끝낸다.
기존 경기의 시각·장소·경기번호·진출 연결은 유지한다. 팀 추천만으로는 저장하지 않는다.
12강 경기 8자리뿐 아니라 부전승 4자리와 연결된 8강 직행 자리도 같은 화면에서 확인한다.

### Original Conditions

- [x] 조별리그는 4팀씩 5개 조, 총 20팀이다.
- [x] 조 1위 5팀을 비교해 상위 4팀은 8강 직행, 나머지 1팀은 12강에 배정한다.
- [x] 조 2위 5팀은 성적순으로 12강에 배정한다.
- [x] 조 3위 중 상위 2팀만 추가 진출한다.
- [x] 진출한 3위 두 팀의 상대는 마지막 조 1위 팀과 최상위 조 2위 팀이다.
- [x] 팀 미정으로 만든 기존 대진에 적용하고, 팝업에서 팀을 수정한 뒤 저장할 수 있다.
- [x] 목록 보기에서 직접 진입한다.

### 화면 후보 / 선택안 (사용자 구현 승인)

| 안 | 구성 | 판단 |
|---|---|---|
| A | 12강 카드의 큰 팝업에 진출팀 비교표·부전승·4경기 편집 | 권고. 현재 목록 작업을 유지하며 한 번에 검수 가능 |
| B | 별도 전체 화면에서 순위 비교와 대진 편집 | 향후 다단계 규칙이 많아지면 유리하나 이번 범위엔 이동이 늘어남 |
| C | 목록의 각 경기 행에 추천팀 적용 버튼 | 전체 중복·진출선 검수가 어렵고 개별 작업이 남음 |

A안은 데스크톱 큰 팝업, 모바일 전체 높이 다이얼로그로 한다. 기존 공유 dialog 접근성/토큰을 재사용한다.
12강 조 생성 폼에는 형식 안내만 두고, 실제 적용 버튼은 생성된 12강 영역에 둔다.

### User Scenarios / A안 흐름

1. 운영자가 조별리그와 결선의 빈 경기를 미리 만든다.
2. 12강 영역의 `자동 팀 배정`을 누른다. 대상 조 5개, 12강 4경기, 부전승 4자리, 연결된 8강 자리를 확인한다.
3. 팝업 상단에 `20팀 → 12팀 진출 · 4팀 8강 직행 · 8팀 12강 경기`와 공식 결과 확정 현황을 표시한다.
4. `추천 근거`에는 조 1위 5팀·2위 5팀·3위 5팀의 비교표를 보여준다. 조/조 내 순위/승점/골득실/득점/적용된 후속 기준/진출 여부를 표시한다.
5. `배정 미리보기`에는 부전승 4팀과 12강 4경기의 홈·원정 팀 선택기를 보여준다. 현재값 → 변경값, 시드·원천 조·수동 수정 표시를 제공한다.
6. 이미 배정된 팀을 선택하면 두 자리 교환을 제안한다. 중복 저장은 불가하다. 진출 12팀 안에서의 자리 변경을 기본 범위로 권고한다.
7. 동률 때문에 진출 팀 자체가 미정이면 해당 동률 후보 중 선택한다. 그 밖의 탈락팀 임의 진출은 이번 기본 기능 범위에 포함하지 않는다.
8. `추천으로 되돌리기`는 편집 초안만 초기화한다. `다시 계산`은 새 결과로 추천을 재조회하며, 수정 중이면 초안 덮어쓰기를 확인한다.
9. `배정 저장`은 변경 개수와 기존 배정 교체를 확인한 뒤 전체를 원자적으로 저장한다. 취소하면 서버 변경이 없다.
10. 저장 후 재조회에서 같은 팀·부전승·8강 직행·공개 대진을 확인한다. 이미 저장한 동일안의 재저장은 추가 변경을 만들지 않는다.

### 추천 시드 / 대진 초안

| 시드 | 대상 | 배정 |
|---|---|---|
| 1~4 | 조 1위 상위 4팀 | 부전승, 8강 직행 |
| 5 | 조 1위 중 5번째 | 12강 12번 상대 |
| 6~10 | 조 2위 5팀 성적순 | 12강 |
| 11~12 | 조 3위 상위 2팀 성적순 | 12강 |

12강: **5–12 / 6–11 / 7–10 / 8–9**. 앞선 대화에서 제안한 정확한 시드 조합이며 사용자의 “그렇게 해서 수정 진행” 승인으로 적용했다.
8강 연결 권고: 1–(8/9 승자), 2–(7/10 승자), 3–(6/11 승자), 4–(5/12 승자).
기존 연결이 있으면 표시하고 호환성을 검증한다. 추천 배치를 이유로 연결을 몰래 재작성하지 않는다.
부전승 표기와 8강 실제 팀을 동기화하되 동일 팀의 정상적인 단계 간 반복은 중복 진출로 오판하지 않는다.

### 순위 비교 / 적용한 기준

- 조 내 순위는 해당 대회의 공식 순위 계약을 따른다. 여러 순위 계산기가 있으므로 구현에서 현재 대회의 competitionConfig와 실제 재계산 경로를 확인한다.
- 조 간 비교에는 서로 경기하지 않은 팀의 상대전적을 적용할 수 없다. 권고는 **승점 → 골득실 → 다득점 → 완전 동률이면 운영자 결정**이다. 대회의 다른 적용 가능한 기준이 있으면 확인 후 반영한다.
- 조별 모든 예정 경기의 공식 결과 확정 및 최신 순위 반영을 저장 전제조건으로 권고한다. 현재 진행 중 순위는 참고 표시만 하고 최종 배정 저장은 막는다.
- 잔여 동률은 팀 이름·ID·기존 배열 순서로 확정하지 않는다. 부전승 경계(4/5위), 3위 진출선(2/3위), 시드 순서 경계를 포함해 운영자 결정이 필요하다.
- 조별 경기 수가 같다는 전제를 검사한다. 다른 경기 수/몰수/취소로 비교가 달라지면 자동 보정하지 않고 사유를 표시한다.
- 같은 조 재대결은 기본적으로 경고만 하며 시드를 몰래 바꾸지 않는 안을 권고한다. 회피를 필수로 하면 대진 우선순위 규칙을 별도 확정한다.

### Backend / Frontend / Sequential Work Breakdown

- Backend: 조 간 비교·진출팀 선정 순수 함수 → 배정 preview → 전체 적용 트랜잭션 순서. 현재 직접 사이드/슬롯/부전승/8강 연동을 공통 배정 계획으로 묶는다.
- Frontend: 목록 12강 진입점 → 비교 근거·전체 배정 팝업 → 후보 교환·초안 검증 → 저장/재조회. 그림도 동일 추천 계약을 재사용할 수 있게 하되 첫 완료 범위는 목록이다.
- Infra: 신규 인프라 불필요. 영속 데이터 확장이 필요하다고 확인되면 migration을 포함한다.
- Sequential: 데이터 계약 확정 후 화면 구현, 좁은 계산/저장 검증 후 alpha 실제 관리자·공개 390/768/1440 확인. 현재 서브에이전트 dispatch 없음.
- API 계약 변경 시 `docs/api/`와 frontend hooks/types/MSW를 같은 변경에서 동기화한다. 특정 URL의 대회 ID는 구현 규칙에 하드코딩하지 않는다.

### Acceptance Criteria / Test Scenarios

- [x] 표준 5조×4팀 공식 결과에서 1위5 + 2위5 + 3위2, 중복 없는 12팀을 선정한다.
- [ ] 부전승4 + 12강4경기 + 8강 직행 배정이 저장/재조회/공개 화면에서 일치한다.
- [x] 목록에서 직접 생성한 슬롯 없는 대진과 슬롯 있는 대진 모두 동작한다.
- [ ] 미확정 결과/오래된 순위/진출선·부전승선 동률/경기수 차이/부족한 자리/잘못된 연결이 조용히 적용되지 않는다.
- [ ] 수동 교환, 추천 초기화, 취소, 기존 팀 교체, 동일안 재저장을 검증한다.
- [x] 열어 둔 사이 결과나 대진이 바뀌면 저장 시 conflict로 막고 재확인을 요구한다. 화면에서 본 것과 다른 추천을 조용히 저장하지 않는다.
- [ ] 비관리자·support 쓰기 거절, 다른 대회 팀·자리 참조 거절, 중복 배정 거절을 검증한다.
- [ ] 시작/제출/공식 결과가 있는 대상 경기나 영향 받는 후속 경기에는 이 일괄 배정을 적용하지 않는다. 실패하면 전체 미적용이다.
- [ ] 날짜/장소/경기번호/정상 진출 연결을 유지하고 기존 배정 경로의 명단·일정·팀매치 동기화를 수행한다.
- [ ] fixture/MSW에 20팀·5조·완전 동률·결과 변경·직접 사이드/슬롯 혼합·부전승 사례를 추가한다.
- [ ] alpha 실제 관리자 입력 및 공개 대진/순위/진출 표시 확인, desktop/tablet/mobile 증거를 남긴다.

### Tech Debt / Security / Risks

- 조별 ENTRY와 결선 BYE의 정상적인 단계 간 반복을 허용하고 결선 내부 중복은 차단했다. 무작위 채우기는 조별 ENTRY로 한정했다. 기존 조 내 순위 판정을 재사용하며 sourceGroupId 없는 진출 자리를 기존 조별 순위 채우기에서 제외했다.
- 저장은 admin 권한, 동일 대회 소유 관계, 진출 자격, 중복, 전체 영향 경기 잠금을 서버에서 검증한다.
- 미리보기 버전(결과·순위·대진) 검증과 기존 대회 잠금 안의 재검증을 결합한다. 감사에는 계산 근거, 전후 배정, 수동 선택과 사유를 남긴다.
- 시작된 경기 교체에 대한 기존 단건 예외를 이 일괄 기능에 자동 확대하지 않는다.
- 와일드카드가 있는 대회의 공개 진출 표시가 기존 advanceCount만으로 오표시되지 않도록 실제 선정팀과 교차 검증한다.

### Ambiguity Log / Progress Snapshot

| Date | Question | Resolution |
|---|---|---|
| 2026-10-12 | 팝업/별도 화면/행별 추천 | A 팝업 적용 (사용자 구현 승인) |
| 2026-10-12 | 조 간 순위 기준 | 상대전적 제외 + 완전 동률 직접 선택 적용 |
| 2026-10-12 | 같은 조 재대결 회피 | 시드 우선·경고 적용 |
| 2026-10-12 | 추천 후 수정 범위 | 진출팀 안의 자리 교환 + 동률 후보 선택 적용; 탈락팀 임의 추가 불가 |
| 2026-10-12 | 8강 직행 연결 | 표준 연결을 생성하고 기존 연결은 호환성 검증; 실제 Alpha 대상 구조는 미확인 |

- 구현 기준: `origin/dev` 37a06cea0, `feat/group-round12-seeding`, `_worktrees/feat-group-round12`. 조사용 작업트리와 분리했다.
- 구현: 목록 전체 템플릿 생성, 5조·20팀 프리셋, 조별 자리 직접/무작위 배정, 12강 자동 배정 팝업, 비교표·동률 선택·수동 교환·사유·저장, preview 버전 검증 및 원자적 저장/감사. 영속 스키마 변경 없음.
- 실제 DB: 개인 임시 PostgreSQL 16.2(127.0.0.1 전용), 현 migration 전체 재생 후 격리 clone 환경에서 신규 3 + 기존 슬롯 44 = **47/47 통과**. 자리 없는/있는 대진, 12팀·부전승4·8강 직행, 조별 ENTRY20 유지, 교환, 중복 거절, stale409, support403, 미확정409 검증. 정렬 안정화·결선 LIVE 차단·조별 20자리만 무작위 배정 및 재호출 no-op 추가 후 신규 3/3 재통과.
- Web: 프리셋/계산/조별 입력 60개 + 목록/조 카드/신규 HTTP 팝업 54개 = **114/114 통과**. 빈 목록에서 프리셋 생성 API, 12팀 교환 저장, 동률 확인, stale409 초안 유지 포함.
- API: 범위 단위 최초 105개 통과, narrowing 수정 후 서비스/선정 7개 재검증 통과(선정 4개는 중복). API 타입 검사 및 surface 검사 통과.
- Web 타입 검사: 변경 파일 오류 없음, 선재 `use-v1-api.leave-team.test.tsx:42,65`의 mutate 무인자 호출 오류 2개로 전체 타입 검사는 실패. 이번 범위에서 관련 없는 테스트는 변경하지 않았다. Web 패턴 검사 통과.
- 2026-10-12 Alpha 배포 요청: 최신 dev 37a06cea0과 동일 base 확인. 로컬 TanStack 5.91→lockfile 5.102.8 일치 후 기존 leave-team 타입 오류 2개가 사라졌다. 신규 테스트 role query의 지원하지 않는 exact 옵션을 앵커 정규식으로 수정했다. 수정 후 Web 전체 타입 검사 0, 배포 전 신규 HTTP/선정 회귀 재확인 및 dev PR 진행.
- 배포 진행: 구현 커밋 `332fa2efb`를 push하고 dev 대상 [PR #1855](https://github.com/kim-song-jun/matchup-sports-platform/pull/1855)를 생성했다. 웹/Gates CI 통과, API 전체 통합 1,167개 중 정규 리그 무작위 배정 2개 실패를 확인했다. `regular_league`에도 group_knockout format이 저장될 수 있으므로 조별 ENTRY 제한은 대회 kind에만 적용하도록 수정했다. 최신 dev `7570bd809`를 기능 브랜치에 merge했다. 새 임시 DB에 전체 migration + CI competition-config backfill을 적용하고 기존 리그 11 + 신규 12강 3 = **14/14 통과**(108.906초). 첫 로컬 재검증은 기존 임시 DB 데이터·미완료 초기화 때문에 실패해 새 DB로 교정했으며 통과 증거로 계산하지 않는다. CI 재확인 중이고 Copilot 요청 2회에도 리뷰는 아직 0건이다.
- 미실행: Alpha 로그인 후 실제 관리자/공개 화면 QA **0/3 폭**, 실제 대회 데이터 편성, dev 병합 및 해당 기능 Alpha 배포. 기존 Alpha 배포 성공은 이 기능 반영의 근거가 아니다.
- 브라우저: 초기 libnspr4/libnss3/libasound2 누락을 /tmp 추출 라이브러리로 해결했다(시스템 설치 없음). headed 합성 컴포넌트 **390/768/1440 3/3 PASS**, 각 폭 템플릿·팝업 상단·배정 하단 3장, 가로 overflow0·JS/console/network 오류0. 본문 스크롤과 저장 버튼 영역 분리, desktop 비교표 3열 확인. 실제 Alpha에서는 로그인 이동/auth/me401 확인, 기능 검증은 0/3이다. 변경 전 기능 화면은 인증 없어서 확보하지 못했다. 브라우저 트리는 모두 종료했고 임시 PostgreSQL도 `pg_ctl stop -m fast`로 종료했다.
- 결정은 `docs/design/competition-canonical-flow.md` §6에 반영했다. API README/global/domain 및 변경 기록을 함께 갱신했다.

### Headed 시각 증거 (합성 데이터, 실제 Alpha 기능 검증 아님)

| 폭 | 생성 프리셋 | 추천·비교 | 배정·저장 | 판정 |
|---|---|---|---|---|
| 390 | [생성](../../docs/screenshots/round12-list/template-390.png) | [상단](../../docs/screenshots/round12-list/round12-top-390.png) | [하단](../../docs/screenshots/round12-list/round12-bottom-390.png) | PASS: 전체 높이, 본문 스크롤, 분리된 저장 영역 |
| 768 | [생성](../../docs/screenshots/round12-list/template-768.png) | [상단](../../docs/screenshots/round12-list/round12-top-768.png) | [하단](../../docs/screenshots/round12-list/round12-bottom-768.png) | PASS: 모달 경계·3열 비교·2열 배정 |
| 1440 | [생성](../../docs/screenshots/round12-list/template-1440.png) | [상단](../../docs/screenshots/round12-list/round12-top-1440.png) | [하단](../../docs/screenshots/round12-list/round12-bottom-1440.png) | PASS: 모달 최대폭896·비교표·저장 영역 |

- [합성 화면 측정](../../docs/screenshots/round12-list/evidence.json), [Alpha 읽기 전용 접근 기록](../../docs/screenshots/round12-list/alpha-readonly.json), [로그인 이동 화면](../../docs/screenshots/round12-list/alpha-before-access.png).
- 명령: 현재 컴포넌트 esbuild 번들 + Tailwind compile + 임시 정적 서버(Next 서버 아님), Playwright `chromium.launch({ headless: false })`. 합성 20팀은 `src/test/msw/cross-group-round12-fixture.ts` 사용. PID/PPID 기록: 최종 정적 QA Node13088→Chrome13216, Alpha Node12871→Chrome12893. 모두 finally browser.close/server.close 후 종료.
- 남은 배포 후 시나리오: 관리자 목록에서 실제 전체 생성→20팀 편성→공식 결과→추천/동률/교환/저장→공개 대진·진출 표시를 3폭에서 확인. 이번 범위의 완료 상태는 코드·로컬 계약 검증까지다.

Status: Review — 2026-10-10 구현 PR 18개 dev 머지(마지막 #1766 `da879b17a`), #1771 로 C3 정정 테스트 고정, alpha E2E 6회 모두 통과. 남은 것: 동률 조의 공개 순위표 진출 표시(결정 A 구현 `fix/bracket-tie-standings` — 머지·alpha 재확인 대기), PR별 갤러리 일부 미게시, Copilot clean 미확인(장애) — 끝나거나 면제되면 Done
**Owner**: Planning(main) → backend-data-dev · backend-api-dev · frontend-data-dev · frontend-ui-dev
**Created**: 2026-10-08
**Base**: origin/dev `c62b5ec08`

## Context

운영자는 지금 어드민 「대진 관리」에서 경기를 목록에 한 줄씩 추가하고, 승자 연결을 경기마다 손으로 걸고,
조별·리그는 팀이 정해진 뒤에야 경기를 만들 수 있다. 결과 하나를 넣으려면 라이브 콘솔에서
시작 → 종료 → (고쳐서 제출) → 확인을 거쳐야 해서, 대회를 새로 만들거나 alpha 에서 "결승까지 한 바퀴"를
테스트하는 데 수십 번 클릭이 든다.

원요청(2026-10-08): "어드민에서 리그 / 토너먼트 등 대진 만들 때 그래픽으로 대진 먼저 만들고 이후에 팀 선택할
수 있는 기능 … 결과입력이나 그런 것도 잘 수정할 수 있는 거고 … 대회 만들거나 테스트할 때 좀 더 쉽게".

설계 검토(3안 + 세부 결정 D1~D8, production-fidelity 목업)는 HTML 결정 페이지로 진행했고 사용자가 아래로 확정했다
(UI 착수 규칙 "A·B·C 3안 → 선택" 충족):

| 결정 | 확정 |
|---|---|
| D1 접근 | **B — 실제 대진을 그림으로 편집** (칸 = 실제 경기, 템플릿으로 뼈대 생성) |
| D2 정규 리그 빈칸 | **b — 리그도 빈 경기를 실제로 만든다** (추천 a 와 다름) |
| D3 조별 → 결선 | **a — "A조 1위" 자리 + 「순위대로 채우기」** |
| D4 팀 넣기 | **a — 칸 누르기 + 끌어 놓기 + 「빈 자리 무작위 채우기」** |
| D5 빠른 입력 알림 | **a — 일반 확정과 똑같이 보낸다** |
| D6 결과 고치기 | **a — 점수 고치기·결과 무효는 그림에서, 득점 기록 있는 경기는 정정 화면으로** |
| D7 기존 카드 화면 | **a — 같은 탭에서 [그림 \| 목록] 전환, 기본 그림** |
| D8 모바일 | **a — 보기·팀 넣기·결과 입력, 구조 편집은 768px 이상** |

추가 회신: 대상은 토너먼트·조별+결선·리그 방식 대회·정규 리그 전부. 결과 입력은 점수만 넣고 바로 확정
(득점자는 라이브 콘솔에서 실시간으로 넣으므로 그림 입력은 테스트·비상용). 사용자는 플랫폼 어드민(/admin)만.

## Goal

플랫폼 어드민이 대회·정규 리그의 대진을 템플릿으로 한 번에 만들고, 그림 위에서 자리에 팀을 넣고, 칸에서 점수를
넣어 즉시 확정하고 고칠 수 있으며, 그 결과가 기존 공개 대진표·자동 진출·순위·전적·알림에 그대로 반영된다.

## 현재 코드 사실 (2026-10-08 실측 — 설계 근거)

- 대회 경기는 팀 없이 만들 수 있다: `createTournamentMatchInTx`(`tournaments/tournament-match-creation.ts:159`)가
  home/away 팀 null 을 허용하고 사이드 이름을 '홈 팀 미정'/'어웨이 팀 미정'으로 두며, 팀이 있을 때만 팀 일정을 만든다.
- 승자 연결은 `V1TournamentMatchAdvancementEdge`(WINNER/LOSER → HOME/AWAY), tx 헬퍼
  `createTournamentMatchAdvancementEdgeInTx`(같은 파일 :284). 결과 OFFICIAL 시 `projectCanonicalAdvancement` 가 다음 칸을 채운다.
  허용 인접표: quarter←round12, semi←quarter, final←semi, third_place←semi(LOSER) (`tournament-bracket.service.ts:851`).
- 팀 배정 tx 함수 `updateTournamentMatchInTx(tx, input)`(`tournaments/tournament-match-update.ts:28`)가 사이드·팀 일정·명단 무효화·
  재계산 이벤트를 처리한다. 서비스 `updateFixture` 의 선검증(확정 등록·같은 팀·결과·부전승)은 tx 밖에 있다.
- `createGroup`·`createFixture`·`updateBracketSources`·`deleteFixture`·`deleteGroup` 은 내부에서 `$transaction` 을 직접 연다
  → 템플릿 한 트랜잭션에 묶으려면 `…InTx` 추출이 선행돼야 한다. 대회 대진 변경은 advisory lock
  `league-fixture-generation:{tournamentId}` 을, 정규 리그 대진 변경은 `v1_tournaments` 행 `FOR UPDATE`(`league-match-admin.service.ts:585`)를
  먼저 잡는 것이 관례다(둘은 서로 직렬화되지 않는다). 경기 생성은 `competitionConfigVersionId` 가 필수다.
- 결선 round 문자열은 한글('12강','8강','4강','결승','3·4위전'), 조별 라운드로빈은 'league_r{n}'. fixtureNumber 는 대회 전체 연속.
- 라운드로빈 페어링 `generateRoundRobin`(`common/scheduling/round-robin.ts`)·`buildLeagueFixtureRows`
  (`tournaments/league-fixture-generator.service.ts:261`)는 순수 함수라 자리 id 를 그대로 넣을 수 있다.
- 12강 부전승: 빈 자리는 `V1TournamentByeSlot{groupId, sortOrder}`, 팀이 정해진 부전승은 `V1TournamentGroupTeam.isBye`.
  공개 그래프(`apps/v1_web/src/lib/tournament-bracket-graph.ts`)는 부전승 팀이 8강 칸에 배정돼 있으면 BYE 연결선을 그린다.
- 정규 리그(`kind=regular_league`) 참가팀 = 확정 `V1TournamentRegistration`. 리그 경기는 `createLeagueFixture`
  (`league-matches/league-fixture-creation.ts`)로 만들고 home/away 팀 non-null, `V1TournamentMatchDetails` 가 없다
  (games 쪽은 details 부재를 리그로 판정). 리그 공개 경로 여러 곳이 `hostTeamId === null` 을 500/409 로 던진다
  (`league-match-public.service.ts:43-66`, `tournaments-read.service.ts:46-68`, `public-tournament-records.service.ts:2252-2273`,
  `league-fixture-videos.service.ts:73-79`), 취소·재생성은 `requireLeagueHostTeamId`(`league-match-admin.service.ts:128`)로 409.
  알림·리마인더·명단 동기화·채팅은 이미 팀 null 을 건너뛴다.
- 결과: 대회 경기는 점수만으로 리비전을 만들 수 없다(`TOURNAMENT_RESULT_DERIVED_ONLY`). 확정(officialize) 내부 단계와 재사용
  함수는 `tournament-result-review.service.ts:403-577`·`withResultCommand`(:836, private, Serializable·감사·멱등). 상태 머신
  `assertRevisionTransition`(`games/core/revision-state-machine.ts:71`)은 DRAFT→OFFICIAL 을 CORRECTION 흐름에만 허용한다.
  어드민 전용 판정은 `TournamentStaffAccessService.assertAccess` 결과의 `role === 'platform_ops'`(owner·ops; support 제외).
- 확정 결과 고치기(corrections→officialize)·무효(void)·웹 훅(`hooks/use-tournament-result-review.ts`)은 이미 있다.
- 웹: 어드민 대진은 `app/admin/tournaments/[id]/bracket-tab.tsx`(카드·목록), 공개 그림은
  `components/tournaments/tournament-bracket.tsx`(조회 전용, 칸 컴포넌트 비공개). 드래그 라이브러리 없음.

## 설계

### S1. 자리(slot) — 팀이 들어갈 칸의 정본

새 모델 `V1TournamentSlot` (표 `v1_tournament_slots`). 대회·정규 리그 공통(둘 다 `V1Tournament`).

| 필드 | 의미 |
|---|---|
| `id`, `tournamentId` | 대회(리그) 소유. 대회 삭제 시 cascade |
| `kind` | enum `V1TournamentSlotKind { ENTRY, BYE, GROUP_RANK }` |
| `groupId?` | ENTRY: 소속 조/결선 그룹(정규 리그는 null) · BYE: 12강 그룹 · GROUP_RANK: 그 자리가 속한 결선 그룹 |
| `position` | 1부터. ENTRY·BYE: 그룹 안 순번 · GROUP_RANK: 순위(1위=1) |
| `sourceGroupId?` | GROUP_RANK 전용: 순위를 가져올 조 |
| `registrationId?` | 배정된 팀(확정 등록). null = 비어 있음. FK onDelete SetNull 은 안전망일 뿐 — 등록은 지우지 않고 상태만 바뀌므로, confirmed 를 벗어나는 전이에서 S3 헬퍼가 명시적으로 비운다 |
| `createdAt`, `updatedAt` | |

- 유일 제약: `@@unique([tournamentId, kind, registrationId])` — 같은 팀이 같은 종류 자리 두 곳에 못 들어간다(빈 자리는 null 이라 겹쳐도 됨).
  ENTRY 와 BYE 를 동시에 차지하는 것은 서비스에서 막는다. 여러 자리를 한 번에 바꾸는 배치(순위대로 채우기·무작위)는
  **바뀔 자리를 먼저 모두 null 로 비운 뒤** 새 값을 넣는다(맞바꾸기에서 유일 제약 위반 방지).
- 경기 연결: `V1TeamMatch` 에 nullable `homeSlotId`·`awaySlotId`(FK → slot, onDelete Restrict). 대회·리그 경기가 같은 컬럼을 쓴다
  (리그 경기엔 `V1TournamentMatchDetails` 가 없으므로 details 가 아니라 TeamMatch 에 둔다).
  **경기가 빠지는 모든 경로는 자리 연결을 같이 푼다** — 대회 `deleteFixture`(소프트 삭제), 리그 취소(`status='cancelled'`, 리그엔 소프트 삭제가 없다),
  템플릿 교체. 그래야 자리 삭제가 FK 로 막히지 않는다.
- **"자리를 쓰는 경기"** = `deletedAt IS NULL AND status <> 'cancelled'` 인 경기만. 반영(fan-out)·잠금 판정·공개 게이트 모두 이 정의를 쓴다.
- 라벨은 저장하지 않고 직렬화에서 계산: 조별 그룹 ENTRY "A조 1번" · 결선 그룹/리그 ENTRY "1번 자리" · BYE "부전승 1" · GROUP_RANK "A조 1위".
- 승자/패자 자리는 자리 행을 만들지 않는다 — 기존 연결선(edge)이 정본이다.
- 마이그레이션은 additive 만: 새 enum·새 표·새 nullable 컬럼 2개·새 FK·인덱스. 백필 없음. 기존 경기는 slot null 로 그대로 동작.

### S1-b. 16강 단계 (2026-10-09 사용자 확정)

- `V1TournamentGroupPhase` 에 `round16` 을 추가한다(자리 마이그레이션과 같은 스키마 변경 — `ALTER TYPE … ADD VALUE`, additive).
- 연결 인접표: `quarter ← round12 | round16`. 라벨 '16강'(round 문자열 '16강', 단계 라벨 표·공개 대진표 라운드 순서·진행 단계 표시·어드민 조 추가 템플릿 "+16강").
- 16강엔 부전승이 없다(부전승은 12강 전용 그대로).

### S2. 템플릿으로 뼈대 만들기

- 대회: `POST /admin/tournaments/:tournamentId/bracket/template`
  - `{ kind: 'knockout', size: 4 | 8 | 12 | 16, thirdPlace: boolean, replaceExisting?: boolean }`
  - `{ kind: 'group_knockout', groupCount: 2..8, teamsPerGroup: 3..6, advancePerGroup: 1 | 2, legs: 1 | 2, thirdPlace: boolean, replaceExisting? }`
    — 결선 크기 K = groupCount × advancePerGroup ∈ {2, 4, 8, 16} 만 허용(그 밖은 422 `BRACKET_TEMPLATE_UNSUPPORTED`).
  - `{ kind: 'league', teamCount: 3..20, legs: 1 | 2, replaceExisting? }` — 리그 방식 대회(`format='league'`).
  - `kind` 는 대회 `format` 과 맞아야 한다(knockout↔knockout, group_knockout↔group_knockout, league↔league), 아니면 422 `BRACKET_TEMPLATE_FORMAT_MISMATCH`.
- 정규 리그: `POST /admin/league-matches/:leagueId/fixtures/template`
  `{ teamCount: 3..20, legs: 1 | 2, schedule: <기존 리그 일괄 생성 schedule DTO 그대로>, replaceExisting? }`.
  리그는 시각·장소가 정본 계약(공개 가드가 요구)이므로 **일정 입력이 필수**다.
- **잠금은 레인마다 기존 관례를 따른다.**
  - 대회 레인(`regular_tournament`): advisory lock `league-fixture-generation:{tournamentId}` 를 먼저 잡는다(`createFixture`·`deleteFixture`·조별 생성과 같은 락).
  - 정규 리그 레인: 기존 리그 서비스와 같이 `SELECT id FROM v1_tournaments WHERE id = $1 FOR UPDATE`(`league-match-admin.service.ts:585`) 후
    `assertFixtureGenerationAllowedInTx`(보류·완료 등 불허 상태 거부)를 먼저 한다. advisory lock 은 리그 경로와 서로 직렬화되지 않으므로 쓰지 않는다.
  - 한 변경이 여러 경기를 갱신하면 대상 경기를 **id 순으로 정렬해** 잠근다(`updateBracketSources` 의 관례).
- 한 트랜잭션(timeout 45s, 생성 경기 상한 240)에서 만든다:
  - knockout 4/8/16: 첫 결선 그룹 ENTRY 자리 size 개 + 각 라운드 빈 경기 + WINNER 연결(+ 3·4위전 LOSER 연결). 16 은 그룹 16강(phase `round16`)·8강·4강·결승(·3위 결정전),
    16강 2i-1·2i 번 경기 승자 → 8강 i 번 경기 홈·어웨이.
  - knockout 12: 그룹 12강·8강·4강·결승(·3위 결정전) + 12강 ENTRY 8개(12강 4경기) + BYE 자리 4개(position 1~4 ↔ ByeSlot sortOrder 0,3,4,7)
    + 8강 i번 경기: 홈 = BYE 자리 i, 어웨이 = 12강 i번 경기 WINNER 연결. 이후 라운드는 WINNER 연결.
  - group_knockout: 조 A.. 각 ENTRY 자리 teamsPerGroup개 + 라운드로빈 빈 경기('league_r{n}', legs) + 조 advanceCount
    + 첫 결선 라운드 사이드 = GROUP_RANK 자리(교차 대진: 2조×2 → 4강 A1–B2, B1–A2 / 4조×2 → 8강 A1–B2, C1–D2, B1–A2, D1–C2 /
    4조×1 → 4강 A1–D1, B1–C1 / 8조×1 → 8강 A1–H1, D1–E1, B1–G1, C1–F1 / 8조×2 → 16강 A1–B2, C1–D2, E1–F2, G1–H2, B1–A2, D1–C2, F1–E2, H1–G2 /
    2조×1 → 결승 A1–B1) + 이후 WINNER 연결.
    K=2(결승만)에서 `thirdPlace=true` 는 422 `BRACKET_TEMPLATE_UNSUPPORTED`(3·4위전의 패자 원천은 4강뿐).
  - league(대회): 그룹 "리그" 1개(phase group) + ENTRY 자리 teamCount개 + 라운드로빈 빈 경기.
  - 정규 리그: ENTRY 자리 teamCount개(groupId null) + 라운드로빈 빈 경기(시각·장소는 schedule 로 계산, 팀 null).
- 그룹 이름은 기존 화면 규칙(`templateFor`: A조…, 12강/8강/4강/결승/3위 결정전), round 라벨·fixtureNumber 연속·
  `durableCommandId` 규칙은 `createFixture` 와 같다.
- 비어 있음 판정과 `replaceExisting`:
  - 대회: 비삭제 경기·조가 하나라도 있으면 409 `BRACKET_NOT_EMPTY`. `replaceExisting=true` 면 **모든 경기가 시작 전·결과 없음일 때만**
    같은 트랜잭션에서 ① 경기 소프트 삭제(기존 `deleteFixture` 와 같이 round 개명·연결 삭제·자리 연결 해제 — `…InTx` 추출 재사용)
    ② 자리 삭제 ③ GroupTeam·`V1TournamentStanding`·ByeSlot 삭제 ④ 조 삭제 순으로 지우고 새로 만든다. 새 경기의 멱등 키는
    `nextFixtureCreationCommandId`(소프트 삭제 이력 수 반영)를 쓴다. 하나라도 시작·결과가 있으면 409 `BRACKET_LOCKED`.
  - 정규 리그: 기존 일괄 생성과 같이 경기가 1건이라도 있으면(취소 포함) 409 `LEAGUE_FIXTURES_EXIST`. `replaceExisting=true` 면
    **취소 안 된 경기가 전부 시작 전·결과 없음일 때만** 기존 재생성처럼 `status='cancelled'` + `cascadeCancelFixtureInTx` 로 접고
    자리 연결을 푼 뒤 옛 자리를 지우고 새로 만든다(대회용 `deleteFixture` 는 details 가 필요해 리그에 쓰지 않는다).
  - 자리를 쓰는 리그에서 기존 「재생성」(`regenerateFixtures`)은 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` 로 막고 템플릿 교체로 단일화한다.
    기존 「경기 하나 추가」(팀 지정 수동 생성)는 자리 없이 그대로 허용한다.
- 정규 리그 상태: 템플릿은 리그 `status` 를 바꾸지 않는다(빈 경기만 있는 리그가 공개에 "진행 중"으로 보이지 않게). 자리 배정·경기 취소 뒤
  **자리를 쓰는 경기 중 팀이 빈 사이드가 하나도 없으면** 기존 일괄 생성과 같은 진행 상태로 바꾼다. 기존 코드엔 전이 함수가 없고
  `generateFixtures` 안의 인라인 `updateMany` 이므로, 조건부(`status in (draft, open, closed)` — 경기 시작 전 상태 전부)로만 바꾸는 헬퍼를 새로 두고 보류·완료 리그는 건드리지 않는다.
  팀 수가 자리 수보다 적으면 운영자가 남는 빈 경기를 취소해야 전이된다(그때까지 예정 상태 유지 — 의도된 동작).

### S3. 자리에 팀 넣기·빼기

- `PUT /admin/tournament-slots/:slotId/assignment` `{ registrationId: uuid | null }` (대회·리그 공통).
  - 등록은 같은 대회의 confirmed 여야 한다(422 `SLOT_REGISTRATION_INVALID`). 이미 다른 자리에 있으면 409 `SLOT_TEAM_ALREADY_PLACED`.
  - **자리를 쓰는 경기**(S1 정의: 비삭제·비취소)가 전부 시작 전(game SCHEDULED, 공식 결과 없음)이어야 한다, 아니면 409 `SLOT_LOCKED`.
  - 잠금: 레인별 S2 규칙(대회 advisory lock / 리그 대회 행 `FOR UPDATE` + `assertFixtureGenerationAllowedInTx`) 후 대상 경기를 id 순으로 잠근다.
  - 한 트랜잭션에서: 자리 갱신 → 자리를 쓰는 경기마다 사이드 배정 → 조 편성 → BYE 전환 → (리그) 상태 전이 판정 → 감사 로그.
    - 대회 사이드 배정: `updateFixture` 의 tx 안 로직(확정 등록·같은 팀·결과·부전승 가드 + `updateTournamentMatchInTx` + `enqueueRosterResync`)을
      `assignTournamentFixtureSideInTx` 로 추출해 `updateFixture` 와 자리 서비스가 함께 쓴다(동작 보존 리팩터).
    - **조 편성**: phase=`group` 조(조별리그·리그 방식 대회)의 ENTRY 자리에 팀을 넣으면 `ensureGroupPhaseTeams` 로 `V1TournamentGroupTeam` 을 만들고
      순위를 재계산한다. 교체·비우기 때는 그 조의 다른 비삭제 경기에 더 이상 나오지 않는 이전 팀의 GroupTeam 을 지우고 순위를 재계산한다
      (해제 로직은 지금 없으므로 새로 만든다). 순위표·순위대로 채우기가 GroupTeam 을 정본으로 읽기 때문이다.
    - BYE 자리: 12강 그룹의 해당 sortOrder ByeSlot ↔ GroupTeam(isBye) 전환(기존 `createBye` 의미 그대로).
    - 리그 사이드 배정 `assignLeagueFixtureSideInTx`(대회 `tournament-match-update.ts` 패턴 이식): 사이드 팀·표시 이름, 라인업·전술 무효화,
      교체된 팀의 명단 조정 회수(`revokeReplacedSideTeamAdjustments`), `enqueueRosterResync({scope:'game'})`.
      **팀 일정은 양 팀이 모두 정해진 순간에 두 팀 몫을 만들고**, 한쪽이 비면 두 팀 몫을 모두 취소한다(반쪽 경기는 공개 게이트로 숨겨져
      일정 링크가 404 가 되므로). 원정 승인 신청서는 `(teamMatchId, applicantTeamId)` 유일 제약 때문에 **upsert** —
      있으면 `approved` 로 되살리고 없으면 만든다. 원정이 바뀌거나 비면 이전 팀 행은 `withdrawn`.
- 자리에 연결된 사이드는 기존 `PATCH /admin/fixtures/:id` 로 직접 바꿀 수 없다(409 `SLOT_LINKED`, `BRACKET_SOURCE_SLOT_LINKED` 와 같은 원칙).
- `POST /admin/tournaments/:id/slots/random-fill`: 잠금 안에서 다시 읽은 빈 ENTRY·BYE 자리에, 아직 어느 ENTRY·BYE 자리에도 없는
  confirmed 등록을 서버에서 무작위로 배정(남는 쪽이 있으면 남은 만큼만). 같은 S3 규칙·트랜잭션. 응답에 배정 목록.
- **등록이 confirmed 를 벗어나는 모든 전이**(리그 `removeTeam`, 어드민 등록 취소, 참가 취소 요청 승인 등 — 구현 시 전이 지점을 전수 확인)는
  공통 헬퍼 `releaseSlotsForRegistrationInTx` 로 그 팀의 자리를 비운다: 자리를 쓰는 경기가 전부 시작 전이면 S3 비우기와 같고, 시작된 경기가
  있으면 자리를 그대로 둔다(기록 보존). 자리 없는 기존 경기의 취소 동작은 지금 그대로. 팀 해체는 진행 중 등록이 있으면 이미 차단되므로 대상이 아니다.
  팀의 **참가 취소 요청**(confirmed → cancel_requested)은 철회될 수 있으므로 자리를 비우지 않고, 운영자가 승인하는 순간 비운다.
  리그 방식 대회(`format='league'`)도 자리를 쓰면 기존 조별 생성기의 `replaceExisting` 재생성을 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE` 로 막는다.

### S4. 조 순위로 결선 채우기 (D3=a)

- `GET /admin/tournaments/:id/slots/standings-preview` → GROUP_RANK 자리마다 `{slotId, label, candidate: registration|null,
  state: 'ready' | 'tied' | 'group_incomplete', currentRegistrationId}`.
  조의 비취소 경기가 전부 OFFICIAL 이어야 `ready`/`tied`. 순위는 기존 `V1TournamentStanding`(공식 결과만),
  동률은 정본 §5 동점 처리(`league-tie-break.ts`) 5단계 뒤에도 갈리지 않는 **완전 동률 구간**에 그 순위 위치가 걸리면 `tied`
  (구간 크기·순위 무관 — 1위·2위 동률, 3팀 동률 포함). 정본 §5 의 "잔여 동률은 공동 순위"를 자동 배정이 임의로 깨지 않는다.
- `POST /admin/tournaments/:id/slots/fill-from-standings` `{ overrides?: [{slotId, registrationId}] }`(DTO 는 `@ArrayMaxSize` 상수 상한·uuid 검증, 서비스가 그 대회 GROUP_RANK 자리 소속·중복을 재검증) → `ready` 자리 + override 를 S3 규칙으로 한 번에 배정(바뀔 자리 먼저 비우기 — S1). `tied` 인데 override 가 없으면 그 자리는 건너뛴다.
  override 는 `tied` 자리면 그 동률 팀 중에서만, `ready` 자리면 그 자리의 원천 조 팀 중에서만 받는다(422 `SLOT_REGISTRATION_INVALID`).
  저장된 순위(`V1TournamentStanding.position`)와 §5 동점 처리 결과가 어긋나면 그 자리는 `tied` 로 돌려 운영자가 고르게 한다.
  결선 경기가 시작 전이면 다시 채우기 가능.
- 공개 대진표: 팀이 없는 사이드에 자리 라벨(예: "A조 1위")을 보여 준다 — 공개 경기 직렬화에 `homeSlotLabel`·`awaySlotLabel` 추가.

### S5. 빠른 결과 확정 (D5=a, D6=a)

- `POST /admin/games/:gameId/quick-result`, 헤더 `Idempotency-Key` = body `clientCommandId`.
  `{ clientCommandId: uuid, expectedVersion: int, score: { home: int≥0, away: int≥0, penalties?: { home: int≥0, away: int≥0 } } }`.
- 권한: `V1AuthGuard` + `staffAccess.assertAccess(result_officialize)` 결과가 `platform_ops` 일 때만(대회 디렉터·support 는 403).
- 대상: 대회 canonical 팀매치 경기와 정규 리그 팀매치 경기. 친선 등은 409 `QUICK_RESULT_UNSUPPORTED`.
- 입장 조건(409): 게임이 SCHEDULED 이거나 ENDED 이면서 **현재 리비전이 없거나 VOID**(무효 뒤 재입력) —
  아니면 `QUICK_RESULT_NOT_AVAILABLE`(진행 중·확정 전 결과가 있음·이미 확정이면 정정을 쓴다) ·
  팀매치 `status='matched'`(VOID 재입력이면 `completed` 도 허용 — 지금 무효 처리는 팀매치 상태를 되돌리지 않는다), 아니면
  `QUICK_RESULT_FIXTURE_CANCELLED`(리그 취소는 게임을 SCHEDULED 로 남기므로 게임 상태만으론 못 거른다) ·
  게임 이벤트 0건, 아니면 `QUICK_RESULT_HAS_LIVE_RECORDS` · 양 사이드 팀 확정, 아니면 `QUICK_RESULT_TEAMS_REQUIRED` ·
  양 사이드 `V1GameParticipant` 1명 이상이고 그 게임의 미처리 `COMPETITION_ROSTER_RESYNC` outbox 가 없을 것, 아니면 `QUICK_RESULT_ROSTER_SYNCING`
  (자리 배정 직후 명단은 비동기로 채워진다 — 그 사이 확정하면 출전자 0명인 불변 OFFICIAL 이 남는다; 화면은 잠시 뒤 다시 시도 안내) ·
  승부차기는 기존 검증 순서와 코드(`TOURNAMENT_PENALTY_REQUIRED`/`_NOT_ALLOWED`)를 따르되 **킥 수는 요구하지 않는다** —
  `assertPenaltyShootoutPersistable(…, { requireKickCounts: false })`(확정 승격 게이트와 같은 값). 정정 경로는 지금 base 와 다른 승부차기에
  킥 수를 요구하므로(`tournament-result-review.service.ts:1280`), **득점 기록 0건 경기의 정정은 킥 수를 요구하지 않도록** 같은 규칙을 정정에도 넣는다
  (기록할 승부차기 이벤트가 없는 경기에서 킥 수는 대조할 대상이 없다).
- 한 Serializable 트랜잭션(`withResultCommand` 확장, 같은 클래스에 메서드 추가): DRAFT 리비전(점수·`eventsHash=hash([])`·
  `goalEvents=[]`·reason 마커 `[quick-result]`, VOID 재입력이면 `supersedesId`=VOID 리비전) → 참가자 = 각 사이드의 **무효화되지 않은 최신 라인업 리비전**의 `V1GameParticipant`
  전원 `started=true`·기록 0(명단 동기화는 옛 리비전 행을 지우지 않으므로 게임의 참가자 행 전부를 쓰면 이전 명단이 섞인다) → OFFICIAL(`submittedAt=officialAt=now`; 상태 머신에 새 흐름 `ADMIN_QUICK` 을 추가해 DRAFT→OFFICIAL 을
  이 흐름에만 허용 — CORRECTION 으로 위장하지 않는다) → 게임 ENDED·version+1·`currentOfficialRevisionId` → 열린 피리어드 닫기 →
  `completeTeamMatchAtResultBoundary` → 대회면 `projectCanonicalAdvancement`(다음 경기 시작됐으면 409 `NEXT_FIXTURE_CONFLICT`) →
  outbox `GAME_RESULT_OFFICIAL`(순위·전적·개인 기록(출전)·리그 완료·알림은 기존 워커) → 운영 감사 `QUICK_RESULT`.
  `GAME_RESULT_SUBMITTED` 는 쓰지 않는다(검토 알림 없음).
- 확정 결과 고치기·무효·"확정 전" 확인은 **기존 API 재사용**: 점수 고치기 = `POST /games/:id/corrections` → 만든 DRAFT 를 같은 흐름에서
  officialize(2단계), 무효 = void, 확인 = officialize. 빠른 입력 경기 정정 payload: `baseRevisionId`=현재 OFFICIAL, `actualParticipants` 는
  base 리비전 참가자 그대로, `eventsHash`=`hash([])`, `goalEvents` 생략. 득점 기록이 있는 경기는 그림에서 고치지 않고 기존 「결과 정정」 화면으로 보낸다.
- 어드민 대진 응답(`GET /admin/tournaments/:id/bracket`, 리그 어드민 상세)에 경기별
  `game: { id, state, version, hasLiveRecords, latestRevision: { id, state, score, entryMethod: 'quick' | 'console' | 'correction' } | null }`
  와 `homeSlotId`·`awaySlotId`, 최상위 `slots[]`(라벨 포함)를 추가한다. 리그 어드민 참가팀 응답(`listTeams`·상세 `teams[]`)에는
  자리 배정 PUT 에 보낼 `registrationId`(confirmed 등록 id)를 추가하고 웹 `V1AdminLeagueTeam` 타입·테스트 데이터를 같은 변경에서 고친다.
  정정·무효에 필요한 리비전 상세(참가자·eventsHash·goalEvents·mvp)는 대진 응답에 싣지 않고, 패널이 열릴 때 기존 `useGameResultRevisions(gameId)` 로 읽는다.

### S6. 정규 리그 빈 경기 (D2=b)

- `createLeagueFixture` 가 팀 null + 자리 id 를 받는다(대회와 같은 규칙: 팀이 없으면 팀 일정·참가자·신청서를 만들지 않음, 사이드 이름 미정).
  상태는 대회 빈 경기와 같이 `matched`.
- **공개 노출 게이트**: 자리에 연결됐는데 팀이 비어 있는 리그 경기(`homeSlotId≠null ∧ hostTeamId=null` 또는
  `awaySlotId≠null ∧ approvedApplicantTeamId=null` — 반쪽만 찬 경기 포함)를 **술어 하나의 공통 헬퍼**(Prisma where 조각 + raw SQL 조각)로 만들어
  다음 경로 전부에서 제외한다: 공개 리그 일정·순위(`league-match-public.service.ts`), 통합 상세의 리그 경기·진행률(`tournaments-read.service.ts`),
  리그 기록 일정·경기 상세(`public-tournament-records.service.ts`), 공개 `/team-matches` 목록·상세와 그 sitemap 원천(`team-matches.service.ts`),
  공개 영상 경로(구현 시 전수 확인), 마이 팀매치 **전 범위**(created·applied·hosted·기본 all — 지금 `assertTeamMatchReadInvariant` 가 host null 에 409).
  팀이 다 들어가면 나타난다. 자리 없는 기존 경기의 동작은 바꾸지 않는다. 공개 가드(host null → 500)는 필터 뒤라 그대로 둔다.
  **주차(N주차) 계산의 형제 경기 집합은 게이트와 무관하게 비삭제 전체로 고정**한다 — 게이트는 표시 목록만 거른다(화면마다 주차가 갈리지 않게).
- 어드민 경로는 빈 경기를 보여 준다: 리그 어드민 상세 직렬화·웹 타입 `homeTeamId: string | null` 로 바꾸고 문구는 "미정".
  어드민 리그 영상 목록(`league-fixture-videos.service.ts`, 운영자용)도 host null 을 409 로 막지 않고 팀 이름 null 로 직렬화한다.
- 빈 경기 취소가 막히지 않게 `requireLeagueHostTeamId` 경로를 고친다(팀이 없으면 팀 알림만 건너뜀). 재생성은 S2 대로 자리 리그에선 막는다.
- 결과 미입력 리마인더는 팀이 비어 있으면 보내지 않는다.
- 리그 완료 판정은 그대로(빈 경기가 남으면 완료 안 됨 — 운영자가 팀을 넣거나 취소).

### S7. 웹 — 그림 편집기

- 대회: `app/admin/tournaments/[id]/bracket/page.tsx` 에 `SegmentedTabs` [그림 | 목록](기본 그림, `?view=list` 로 목록). 목록 = 기존 `BracketTab` 그대로.
- 정규 리그: `app/admin/league-matches/[leagueId]` 대진 영역에 [일정 보드 | 목록] 전환(기본 일정 보드).
- 새 컴포넌트(`components/admin/bracket-canvas/`): 캔버스(라운드 열 + 칸 + SVG 연결선 — 위치는 순수 함수
  `lib/bracket-canvas-layout.ts` 가 계산), 칸(선택·드롭 대상·상태 태그 예정/진행 중/확정 전/확정·"어드민 빠른 입력" 표시),
  참가팀 트레이(HTML5 끌어 놓기 + 누르고 고르기), 상세 패널(자리 배정·일정/장소·삭제·결과), 점수 입력(무승부 결선은 승부차기),
  템플릿 창, 순위대로 채우기 창, 리그 일정 보드(열 = 경기 날짜 = 주차. 리그 경기엔 round 값이 없고 템플릿은 날짜 하나에 한 라운드를 만든다;
  옛 일괄 생성 리그는 하루에 여러 라운드일 수 있다).
- 툴바: 템플릿으로 시작 · 경기 추가 · 연결(기존 bracket-sources) · 빈 자리 무작위 채우기 · 대진표 공개 상태(대회 — 기존
  `useV1PublishTournamentBracket`·`useV1UnpublishTournamentBracket` 훅 재사용).
  이미 공개된 대회를 편집하면 "바꾸는 즉시 참가팀에게 보여요" 안내.
- 상태: 로딩 = 스켈레톤, 에러 = 재시도 버튼이 있는 `ErrorState`(템플릿 버튼 숨김), 빈 대진 = `EmptyState` + 「템플릿으로 시작」 유도.
- 권한: `canWrite=false`(support 어드민)면 **읽기 전용 캔버스** — 툴바·끌어 놓기·패널 쓰기·점수 입력을 숨긴다(서버 403 에 기대지 않음). 리그 화면도 같은 판정.
- 결과 패널: 점수 고치기·결과 무효는 **필수 사유 입력 모달**(기존 어드민 사유 모달이 있으면 재사용)을 거치고, 열릴 때
  `useGameResultRevisions(gameId)` 로 현재 리비전을 읽어 정정 payload(S5)를 채운다. 409 `QUICK_RESULT_ROSTER_SYNCING` 은
  "명단을 맞추는 중이에요. 잠시 뒤 다시 눌러 주세요" 로 안내.
- 공개 대진표: 팀이 없는 사이드는 `homeSlotLabel`/`awaySlotLabel` 을 'TBD'·'미정'보다 우선해 보여 준다
  (`components/tournaments/tournament-bracket.tsx` 의 이름 치환 순서·`teamDisplayName`, 공개 일정 화면 — 적용 화면은 구현 시 전수 확인).
- 모바일(<768): 라운드 탭 + 칸 목록, 칸을 누르면 `BottomSheet` 에서 팀 넣기·점수·확인. 구조 편집 버튼은 숨기고 "큰 화면에서 편집해요" 안내.
- 디자인 시스템: 토큰만(하드코딩 색·`text-[Npx]` 금지), 44px 터치, 키보드로 전부 가능(끌어 놓기 대체 = 누르고 고르기),
  `aria-label`, 모달 a11y(`use-modal-a11y`), 다크 모드 4.5:1, `transition-colors`/`transform` 만. 재사용: `SegmentedTabs`·`BottomSheet`·
  `ConfirmModal`·`EmptyState`·`useAdminToast`.
- 캐시: 변경 후 `adminTournamentBracket`·`adminLeagueMatch`·공개 `tournament` 키와 결과 훅 키를 함께 invalidate.

## Original Conditions (must all be satisfied)

- [x] 어드민에서 대진을 **그림(그래픽)으로 먼저** 만든다 — 토너먼트·조별+결선·리그 방식 대회·정규 리그 전부.
- [x] **팀은 나중에** 자리에 넣는다(칸 누르기·끌어 놓기·빈 자리 무작위 채우기).
- [x] **결과 입력**을 그림에서 한다 — 점수만 넣고 바로 확정(무승부 결선은 승부차기).
- [x] **결과를 잘 수정**할 수 있다 — 점수 고치기·결과 무효는 그림에서, 득점 기록 있는 경기는 정정 화면으로.
- [x] 조별리그 결선 칸은 "A조 1위" 같은 자리로 미리 그리고, 「순위대로 채우기」로 채운다.
- [x] 정규 리그도 빈 경기를 실제로 만든다(편집 중 빈 경기는 공개 화면에 나가지 않는다).
- [x] 빠른 입력 결과도 일반 확정과 똑같이 알림·순위·전적에 반영된다.
- [x] 기존 카드 화면은 [그림 | 목록] 전환으로 남는다(기본 그림).
- [x] 모바일은 보기·팀 넣기·결과 입력, 구조 편집은 768px 이상.
- [x] 사용자는 플랫폼 어드민(owner·ops)만. 대회 운영 콘솔(스태프)은 바꾸지 않는다.
- [x] 목적: 대회 만들기·테스트가 쉬워진다 — 8강 대회를 새로 만들어 결승까지 클릭만으로 한 바퀴 돌 수 있다. — (E2E 6회: 새 8팀 대회를 템플릿·무작위 채우기·빠른 결과 클릭만으로 3·4위전·결승까지 확정)
- [x] 16강 템플릿도 포함한다(토너먼트 16팀, 조별 8조×2 → 16강) — 2026-10-09 사용자 확정.

## User Scenarios

### Scenario 1: 8강 토너먼트를 처음부터 끝까지 (테스트)
As a 플랫폼 어드민, I want to 8강 대회 뼈대를 만들고 팀을 채우고 결과를 넣어 결승까지 돌리기 so that 대회 기능을 빠르게 검증한다.
1. 대진 관리 → [그림] → 템플릿으로 시작 → 토너먼트·8팀·3·4위전 넣기 → 만들기 (경기 8·연결 8·자리 8).
2. 빈 자리 무작위 채우기 → 8강 4경기에 팀이 들어감.
3. 8강 칸마다 점수 → 결과 확정 → 승자가 4강 칸에 자동으로 들어감. 무승부면 승부차기를 넣어야 확정된다.
4. 4강·3·4위전·결승까지 같은 방식. 칸에 "어드민 빠른 입력" 표시.
Expected: 공개 대진표·팀 전적·순위가 같은 결과를 보여 주고 양 팀에 결과 알림이 간다.

### Scenario 2: 결과를 잘못 넣었다
1. 확정된 8강 칸 → 점수 고치기 → 새 점수 확정 → 4강 칸 팀이 바뀐다(4강 시작 전).
2. 또는 결과 무효 → 4강 칸이 비고, 그 경기는 다시 점수를 넣을 수 있다.
Expected: 4강이 이미 시작됐으면 "다음 경기가 이미 시작돼서 바꿀 수 없어요". 라이브로 득점이 기록된 경기는 「결과 정정」 화면으로 연결.

### Scenario 3: 조별리그 + 결선
1. 템플릿 조별+결선 · 2조 × 4팀 · 조 2팀 진출 → 조 자리 8 + 조별 12경기 + 4강(A1–B2, B1–A2) + 결승.
2. 조 자리에 팀을 넣으면 그 팀의 조별 3경기에 모두 들어간다.
3. 조별 결과를 다 넣으면 「순위대로 채우기」가 열리고, 미리보기에서 동률 자리는 직접 고른 뒤 채운다.
Expected: 공개 대진표에 조별 진행 중엔 "A조 1위", 채운 뒤엔 팀 이름.

### Scenario 4: 정규 리그 일정을 팀보다 먼저
1. 리그 어드민 → [일정 보드] → 템플릿 4팀 · 2회전 · 일정(첫 경기일·간격·시각·장소) → 빈 경기 12개.
2. 공개 리그 화면엔 아직 아무 경기도 안 보인다.
3. 자리 1~4에 참가팀을 넣으면 그 팀의 경기·팀 일정이 생기고 공개 일정에 나타난다. 마지막 자리가 채워지면 일괄 생성과 같은 상태가 된다.
4. 경기마다 점수 → 확정 → 순위 반영.

### Scenario 5: 모바일 현장 입력
1. 390 화면 대진 관리 → 라운드 탭 → 칸을 누르면 바텀시트 → 점수 → 확정. 구조 편집 버튼은 없고 안내 문구가 보인다.

## Test Scenarios

### Happy path
- [x] 템플릿 개수 계약: knockout 8+3위전 = 경기 8·연결 8·ENTRY 8 / knockout 4(3위전 없음) = 경기 3·연결 2·ENTRY 4 /
      knockout 12+3위전 = 경기 4+4+2+1+1=12·BYE 4·ENTRY 8·ByeSlot 4·연결(8강←12강 4, 4강←8강 4, 결승←4강 2, 3위←4강 2) /
      group_knockout 2×4·adv2·legs1 = 조별 12 + 4강 2 + 결승 1 (+3위 1)·ENTRY 8·GROUP_RANK 4 / league 대회 6팀 legs2 = 30경기 / 정규 리그 4팀 legs2 = 12경기(일정 계산 일치).
- [x] 자리 배정 fan-out: 조 자리 하나 → 그 자리를 쓰는 3경기의 사이드 팀·표시 이름·팀 일정·명단 재계산 이벤트가 바뀌고 **다른 경기는 그대로**(대조군).
- [x] 자리 비우기 → 그 자리를 쓰는 경기 전부 "미정"으로 돌아가고 팀 일정 취소.
- [x] BYE 자리 배정 → 12강 그룹 ByeSlot 이 GroupTeam(isBye)로 바뀌고 8강 홈에 팀이 들어감, 비우면 원복.
- [x] 무작위 채우기: 빈 자리 수 ≤ 미배치 팀 수면 전부, 반대면 팀 수만큼만 채우고 중복 없음.
- [x] 순위대로 채우기: 미리보기 ready/tied/group_incomplete 판정, override 반영, 다시 채우기.
- [x] 빠른 결과(대회): SCHEDULED → OFFICIAL 한 번에, 승자 다음 칸 진출, outbox `GAME_RESULT_OFFICIAL` 1건, `GAME_RESULT_SUBMITTED` 0건, 참가자 전원 started.
- [x] 빠른 결과(리그): OFFICIAL, 리그 완료 투영·순위 반영.
- [x] 무효 뒤 재입력: VOID → 빠른 결과 가능, `supersedesId`=VOID 리비전.
- [x] 정정(그림): corrections → officialize 로 점수 바뀌고 다음 칸 재투영.
- [x] 웹 레이아웃 순수 함수: 라운드 열 순서·칸 y 위치·연결선(WINNER/LOSER/BYE/GROUP_RANK 점선) 계산.
- [x] 교차 대진 표 전수: (2조×1)·(2조×2)·(4조×1)·(4조×2)·(8조×1)·(8조×2) 각각의 GROUP_RANK 자리 ↔ 결선 사이드 매핑.
- [x] knockout 16+3위전 = 경기 8+4+2+1+1=16·연결(8강←16강 8, 4강←8강 4, 결승←4강 2, 3위←4강 2)=16·ENTRY 16. 16강→8강 연결 인접 허용, 16강 부전승 거부.
- [x] 조 편성: 조 자리 배정 시 GroupTeam 생성·순위 행 생성, 교체·비우기 시 이전 팀 GroupTeam 제거(다른 경기에 남아 있으면 유지).
- [x] 공개 경기 직렬화 `homeSlotLabel`/`awaySlotLabel`: 팀이 없을 때만 라벨, 팀이 있으면 null. 공개 대진표는 라벨을 'TBD' 보다 우선.
- [x] 빠른 결과 → 워커 소비(통합): 순위·팀 전적·개인 기록(출전)·완료 알림 1회. 같은 경기 정정 후 알림 재발송 없음.
- [x] 리그 반쪽 경기: 한쪽만 찬 동안 팀 일정 0건, 양쪽 다 차면 2건, 다시 비우면 2건 취소.
- [x] 웹: 기본 view 는 그림, `?view=list` 면 목록 / <768 에서 구조 편집 버튼 숨김·안내 / `canWrite=false` 면 읽기 전용 /
      로딩·에러(템플릿 버튼 숨김)·빈 대진 상태 / 끌어 놓기 없이 키보드(팀 선택 → 칸 선택)로 배정.
### Edge cases
- [x] 결선 무승부 + 승부차기 없음 → 409 `TOURNAMENT_PENALTY_REQUIRED`; 조별 무승부 + 승부차기 → 409 `TOURNAMENT_PENALTY_NOT_ALLOWED`.
- [x] 같은 팀을 두 자리에 → 409 `SLOT_TEAM_ALREADY_PLACED`; ENTRY 와 BYE 동시 → 409.
- [x] 시작된 경기를 쓰는 자리 변경 → 409 `SLOT_LOCKED`; 자리 연결 사이드를 PATCH 로 직접 변경 → 409 `SLOT_LINKED`.
- [x] 비어 있지 않은 대진에 템플릿 → 409 `BRACKET_NOT_EMPTY`; replaceExisting + 결과 있는 경기 → 409 `BRACKET_LOCKED`.
- [x] 대회 format 과 다른 템플릿 → 422; 결선 크기가 지원 집합({2,4,8,16}) 밖(예: K=6 → `BRACKET_TEMPLATE_UNSUPPORTED`) → 422; 상한 240 경기 초과 → 422.
- [x] 정규 리그 공개 게이트(좁히는 변경 — 양쪽 대조군): fixture = {자리 빈 경기, 홈만 찬 경기, 원정만 찬 경기, 다 찬 경기, 자리 없는 기존 경기(원정 null 포함)}.
      S6 에 나열한 **모든** 경로(공개 일정·순위·통합 상세·진행률·기록 일정·경기 상세·공개 `/team-matches` 목록·상세·sitemap·마이 팀매치 전 범위)에서
      앞의 셋은 빠지고 뒤의 둘은 **그대로 포함**됨을 각각 단언. 주차 라벨은 게이트와 무관하게 같은 값.
- [x] 리그 빈 경기 취소 성공(팀 알림 0건), 결과 미입력 리마인더 0건, 어드민 영상 목록 200.
- [x] 리그 참가팀 제외·어드민 등록 취소 시 자리 연결 시작 전 경기는 취소되지 않고 자리만 비워짐; 자리 없는 경기는 기존대로 취소.
- [x] 자리 리그에서 기존 재생성 → 409 `LEAGUE_SLOT_FIXTURES_USE_TEMPLATE`; 리그 템플릿 + 경기 있음 → 409 `LEAGUE_FIXTURES_EXIST`; 보류·완료 리그 템플릿·자리 변경 거부.
- [x] 리그 상태 전이: 마지막 빈 사이드가 채워지면(또는 남은 빈 경기를 취소하면) 진행 상태, 보류 리그는 그대로.
- [x] 원정 신청서 upsert: 같은 팀 비웠다 다시 넣기, A→B→A 교체에서 P2002 없이 최종 팀만 approved.
- [x] 리그 취소 경기는 자리 반영·잠금 판정에서 제외되고 자리 연결이 풀린다; 취소 경기에 빠른 결과 → 409 `QUICK_RESULT_FIXTURE_CANCELLED`.
- [x] K=2 + 3·4위전 → 422. 순위대로 채우기 A1↔A2 맞바꾸기에서 유일 제약 위반 없음. 완전 동률(1·2위, 3팀) → `tied`.
- [x] 동시성(통합): 같은 리그에 템플릿과 기존 일괄 생성을 동시에 → 하나만 성공. 같은 대회 템플릿 두 번 동시에 → 하나만 성공.
- [x] 빠른 결과: 자리 배정 직후 명단 동기화 전 → 409 `QUICK_RESULT_ROSTER_SYNCING`, 동기화 뒤 성공. 결선 무승부 승부차기(킥 수 없음) 201.
- [x] 빠른 입력 경기의 그림 정정(승부차기 점수 변경 포함, 킥 수 없음) 성공 → 다음 칸 재투영.
### Error paths
- [x] 빠른 결과: support 어드민·대회 디렉터·일반 사용자 403 / 친선 409 `QUICK_RESULT_UNSUPPORTED` / 이벤트 있음 409 `QUICK_RESULT_HAS_LIVE_RECORDS` /
      팀 미정 409 `QUICK_RESULT_TEAMS_REQUIRED` / 진행 중·확정 전·이미 확정 409 `QUICK_RESULT_NOT_AVAILABLE` / version 불일치 409 / 다음 경기 시작 409 `NEXT_FIXTURE_CONFLICT` /
      Idempotency-Key ≠ clientCommandId 422 / 같은 키 재요청은 같은 응답(replay).
- [x] 템플릿·자리 API: support 403, 다른 대회 등록 422, 미확정 등록 422, 대회 설정 버전 없음 409 `COMPETITION_CONFIG_REQUIRED`.
- [x] 웹: 각 409/422 를 `extractErrorMessage` 해요체 토스트로, 입력 유지.
### Mock data updates needed
- [x] `apps/v1_api/test/fixtures/game-schema.fixture.ts` 스키마 해시, 대진·리그 서비스 spec 의 Prisma mock 에 `homeSlotId`/`awaySlotId`/`v1TournamentSlot`.
- [x] `apps/v1_web/src/types/api.ts`(`V1AdminTournamentBracket` 등)·`types/league-match.ts`(nullable 팀) 와 해당 테스트 고정 데이터,
      `bracket-tab.test.tsx` 의 `vi.mock` 데이터, 공개 대진 타입의 `homeSlotLabel`/`awaySlotLabel`.

## Parallel Work Breakdown

PR 은 순서대로 dev 에 머지하고 매번 alpha 에서 확인한다(dev 머지 = alpha 실배포).

공통: **PR 마다** `.changeset/*.md`(v1_api·v1_web 함께, 기능은 minor)와, 엔드포인트·응답 계약을 바꾸면 `docs/api/domains/tournaments.md`·
`league-matches.md` 를 같은 PR 에서 고친다.

### PR-1 Backend 기반 (Sequential 선행)
- [x] **첫 커밋: 정본 `docs/design/competition-canonical-flow.md` §6 결정 이력 행 추가**(정본 §8 — 구현보다 먼저):
      ① 대진 자리(slot)와 템플릿 ② 정규 리그 빈 경기(자리 미배정 경기는 공개 제외) ③ 어드민 빠른 결과(어드민 입력 = 어드민 확인, §4 확인 한 단계의 어드민 단축 경로,
      득점자 없음 → 개인 기록은 출전만) ④ 득점 기록 0건 경기의 승부차기 킥 수 면제.
- [x] 스키마·마이그레이션(S1 + S1-b 의 `round16` enum 값 — 스키마 변경은 이 PR 한 번) + 스키마 해시 5곳(`deploy/Dockerfile.v1-api`, `deploy/alpha-manifest-common.sh`(추가),
      `scripts/release/create-alpha-release-manifest.sh`, `scripts/release/prepare-task168-final-steady-inputs.sh`, `apps/v1_api/test/fixtures/game-schema.fixture.ts`).
- [x] `…InTx` 추출(동작 보존 리팩터): 그룹 생성, 빈 경기 생성, 사이드 배정(`assignTournamentFixtureSideInTx`), 경기·그룹 삭제(자리 연결 해제 포함).
- [x] 자리 서비스(S3): 배정·비우기·무작위 채우기, 조 편성·해제 + 순위 재계산, `SLOT_LINKED` 가드, BYE 전환, 대회 레인 잠금·id 순 잠금,
      `releaseSlotsForRegistrationInTx`(대회 등록 취소 경로 연결).
- [x] 대회 템플릿(S2): knockout 4/8/12 + league(대회).
- [x] 어드민 대진 응답 확장(S5 마지막 항목) + 공개 경기 직렬화 `home/awaySlotLabel`.
### PR-1c 16강 (PR-1b 뒤)
- [x] 단계 `round16` 의 서버 규칙(인접표·라벨·DTO 단계 목록·대진 정렬)·knockout 16 템플릿·웹 라벨/공개 라운드 순서/진행 단계/어드민 "+16강". enum 값 자체는 PR-1a 마이그레이션.

### PR-2 Backend 빠른 결과 (PR-1 과 병렬 가능, 머지는 PR-1 뒤)
- [x] 상태 머신 흐름 `ADMIN_QUICK` + `quickResult` 메서드(S5, 입장 조건 전부 — 취소·명단 동기화 포함) + 컨트롤러 `admin/games/:gameId/quick-result` + DTO.
- [x] 정정 경로의 승부차기 검증: 득점 기록 0건 경기면 킥 수 면제(S5).
### PR-3 Frontend 그림 편집기 — 토너먼트 (PR-1·2 머지 후)
- [x] 타입·훅(템플릿·자리·무작위·빠른 결과) + 레이아웃 순수 함수 + 캔버스·칸·트레이·패널·점수 입력·템플릿 창 + [그림|목록].
- [x] 정정·무효·확인(기존 훅) 연결, 공개 대진표 빈칸 자리 라벨.
### PR-4 조별+결선 (BE+FE)
- [x] group_knockout 템플릿 + GROUP_RANK 자리 + 순위 미리보기·채우기(S4) + 캔버스 조 표·점선 연결 + 채우기 창.
### PR-5 정규 리그 (BE+FE)
- [x] `createLeagueFixture` 팀 null + 자리 id, 리그 템플릿(행 잠금 + `assertFixtureGenerationAllowedInTx`, `LEAGUE_FIXTURES_EXIST`, 취소 기반 교체).
- [x] `assignLeagueFixtureSideInTx`(양 팀 찬 순간 팀 일정 2건, 신청서 upsert) + 조건부 상태 전이 헬퍼.
- [x] 공개 게이트 공통 헬퍼(S6 경로 전부, 주차 집합 분리) + 취소 경로 수정 + 자리 리그 재생성 409 + 리마인더 + 어드민 영상 목록.
- [x] `releaseSlotsForRegistrationInTx` 를 리그 `removeTeam`·등록 취소 전이에 연결.
- [x] 리그 어드민 응답(빈 경기 nullable, 참가팀 `registrationId`)·웹 타입 + 일정 보드.
### PR-6 모바일·마감
- [x] 390 라운드 탭 + 바텀시트, 구조 편집 숨김. changeset. 태스크 문서 Status 갱신.
### Sequential
- [ ] PR 마다 dev 머지 → alpha 배포 SHA 확인 → **새 테스트 대회로**(alpha 데이터 쓰기 — 사용자 승인 후) ego-browser E2E → 390/768/1440 갤러리를 그 PR 에 게시. — (부분 충족: PR별 E2E 대신 alpha E2E 6회로 통합. 1·2회는 2026-10-09 결정 B 범위, 3~6회는 별도 사용자 결정. #1705 16강 갤러리는 2026-10-10 사후 게시. #1753 은 계산값 코멘트만 있고 같은 화면의 3폭 갤러리는 후속 #1759 에 있다. #1765 는 화면 변경이 없다)

## Acceptance Criteria
- [x] Original conditions 전부 충족, User scenarios 1~5 alpha 에서 통과(ego-browser 스크린샷) — (시나리오 1의 8팀 한 바퀴·양 팀 알림, 시나리오 3의 동률 자리 직접 고르기, 시나리오 4의 2회전 빈 경기 12개는 E2E 6회, 나머지는 1~5회. 시나리오 3 에서 나온 공개 순위표 진출 표시 문제는 아래 남은 관찰)
- [x] Test scenarios 전부 green (단위 + CI 통합 스펙)
- [x] UI: A·B·C 3안 제시 → 사용자 선택 완료(2026-10-08 결정 페이지, D1~D8) — 구현은 선택안대로
- [x] 범위 내 tech debt 해결(새 부채 0), 자리·리그 빈 경기로 생긴 모든 null 경로 정리
- [x] Security 리뷰 통과(아래), Mock·schema sync, 마이그레이션 replay·drift·expand-contract 게이트 green — 근거: 권한 스펙·CI 게이트 green, 별도 보안 리뷰 문서는 없음
- [x] 디자인 시스템 준수(토큰·컴포넌트·44px·WCAG AA·다크 모드)
- [x] 리그 방식 대회 대진 그림: 라운드×조 격자 + 조별 순위표, 1440 가로 스크롤 없음, 순위 숫자 = 공개 순위 탭, 「경기 연결」 없음 (PR-7, 2026-10-09 B안) — (대체: 「경기 추가」는 결정 B·3 으로 조·라운드 선택, #1766)
- [ ] Code review Critical=0, Warning=0 / Copilot clean — 미완: Copilot 오류 응답 PR 6건은 clean 미확인, 자체 리뷰로 대체

## Tech Debt Resolved
- 대진 변경 서비스의 내장 트랜잭션을 `…InTx` 로 분리해 여러 변경을 한 트랜잭션에 묶을 수 있게 한다.
- 승자 연결을 매번 손으로 걸던 흐름을 템플릿이 대신한다(화면 자동 생성이 연결을 만들지 않던 문제).
- 리그 공개 경로의 host null 가드가 "빈 경기 한 건에 전체 500" 이 되지 않게 필터를 앞에 둔다.

## Security Notes
- 위협: 권한 없는 결과 확정·대진 조작, 다른 대회 등록 주입, 무작위 채우기 조작, 멱등 키 재사용.
- 완화: 모든 새 쓰기 엔드포인트 `V1AuthGuard` + `getMutationAdmin`(support 거부), 빠른 결과는 추가로 `platform_ops` 판정. 서비스 계층에서
  등록 소속·confirmed·자리 소속 대회 재검증(라우트 가드만 믿지 않음). DTO `whitelist + forbidNonWhitelisted` 범위 검증.
  무작위는 서버에서. 멱등 키 = clientCommandId 검증. 모든 변경 감사 로그. 프론트에 비밀 없음, `dangerouslySetInnerHTML` 없음.

## Risks & Dependencies
- 빠른 결과는 득점자가 없어 개인 기록엔 출전만 남는다 — 회신대로 실제 경기는 라이브 콘솔, 그림 입력은 테스트·비상용. 칸에 입력 방법 표시.
- 정본 §4 에 없는 새 경로(어드민 입력 = 어드민 확인)와 자리·리그 빈 경기 — **구현 PR 전에 정본 §6 결정 이력에 먼저 적는다**.
- 템플릿 트랜잭션 크기(최대 240 경기) — 45s timeout, 상한 초과 422.
- 정규 리그 빈 경기는 영향 범위가 넓다(PR-5). 공개 게이트 대조군 테스트와 alpha 실데이터 전후 응답 비교로 회귀를 막는다.
- alpha E2E 는 새 대회·결과를 만든다(결과 있는 경기는 지울 수 없음) — 실행 전 사용자 승인.
- 참가 취소 요청 중인 팀은 운영자가 승인할 때까지 자리를 차지한다 — 그 사이 그 팀 경기가 시작되면 승인 시점에 자리를 비울 수 없다(`SLOT_LOCKED` 규칙, 기록 보존). 통합 테스트로 고정.

## 완료 기록 (2026-10-10)

### 구현 PR (18개, 모두 base `dev`)

| PR | 내용 | dev 머지 SHA |
|----|------|--------------|
| #1700 | PR-1a 대진 자리 스키마·`…InTx` 함수·어드민 응답 확장 | `0dcb03c32` |
| #1701 | PR-1b 대진 템플릿, 자리 배정·무작위 채우기 | `496a1307e` |
| #1702 | PR-2 어드민 빠른 결과 확정 | `78ee72690` |
| #1705 | PR-1c 16강 단계(템플릿·연결 규칙·화면) | `adf995050` |
| #1712 | 리뷰 P2: 기존 부전승 API 와 템플릿 자리 동기화, 웹 타입 동기화 | `cde0128c5` |
| #1720 | PR-5a 정규 리그 빈 경기·리그 템플릿·공개 게이트 | `c8ac7d702` |
| #1723 | PR-3 대진 그림 편집기(토너먼트) | `a35c7bf37` |
| #1725 | 자리 없는 경기의 팀 표시·편집 바로잡기 | `d2694edd9` |
| #1727 | PR-4 조별+결선 템플릿, 순위대로 채우기 | `844fdb595` |
| #1734 | PR-5b 정규 리그 일정 보드 | `1e4b3e930` |
| #1745 | PR-6 모바일 목록·시트, 태블릿 시트, 화면 마감 | `2d21368f8` |
| #1746 | 팀 없이 취소된 리그 경기가 공개 상세·순위를 500 으로 만들지 않게 | `119569c28` |
| #1748 | PR-7 리그 방식 대회 라운드×조 격자 + 조별 순위표 | `164a80ccc` |
| #1749 | 어드민 하단 창이 화면 전체를 덮게 | `c70fa0a25` |
| #1753 | 리그 방식 격자가 1024 이상에서 잘리거나 사라지지 않게 | `afffa0267` |
| #1759 | 격자 옆 열은 1440 이상에서만(1280 조 열 잘림) | `259c161fa` |
| #1765 | 스펙 대조 결손 4건: 반쪽 경기 취소 공개·끝난 리그 가드·공개 캐시·워커 단언 | `984ae3124` |
| #1766 | 리그 방식 「경기 추가」 조·라운드 선택, 옛 리그 라운드 통일, 한 팀 한 조(409) | `da879b17a` |

### alpha E2E (ego-browser, 새 테스트 대회로 실행)

| 회차 | 확인한 것 | 결과 |
|------|-----------|------|
| 1 (10-09) | 4팀 토너먼트: 템플릿 → 수동·무작위 배치 → 빠른 결과 → 승부차기 정정 → 결과 무효·재확정 → 경기 추가, 390/768/1440 | 통과 |
| 2 (10-09) | 2조×3팀 조별+결선: 템플릿 → 무작위 → 순위대로 채우기(4자리) → 4강·결승, 3폭 | 통과(무작위 단언 1건은 스크립트 키 오기재로 수정 후 재확인) |
| 3 (10-09) | 정규 리그: 빈 경기 6개가 공개 0건 → 팀 넣는 대로 공개 → 무작위 → 빠른 결과 → 순위 반영, 390 | 통과 |
| 4 (10-10) | 전체 공개, 16강 템플릿·조별 라벨("A조 1위") 공개 화면 3폭, 390 시트 확정, 라이브 결승 진행. 결승 진행 중 **승자가 같은** 4강 정정은 막히지 않고 반영됐다(단계 C3 — 시나리오 2 는 다음 칸 팀이 바뀌는 정정만 막는다). 승자가 바뀌는 정정은 `NEXT_FIXTURE_CONFLICT` 로 거부 | 통과 — C3 은 #1771 통합 테스트(`tournament-quick-result.integration-spec.ts` 「정정 vs 이미 시작된 다음 경기」, 양쪽이 찬 LIVE 결승)로 고정. 정정 초안 1건 남음(아래 관찰) |
| 5 (10-10) | 리그 방식 대회 「경기 추가」: 옛 라운드에서 조·라운드 선택, 기존 경기와 같은 줄에 합침, 다른 조 팀 목록 제외, 한 팀 한 조 409(`TEAM_IN_OTHER_GROUP`) | 통과 |
| 6 (10-10) | 8팀 토너먼트 한 바퀴: 템플릿(8팀+3·4위전) → 무작위 → 8경기 빠른 결과(승부차기 1경기, 승부차기 없는 결선 무승부는 거부) → 공개 대진표·우승팀 전적 일치, 결승 양 팀 결과 알림. 조별+결선 2조×3팀 완전 동률: 「동률」 표시·고르기 전 채우기 꺼짐 → 직접 고른 팀이 4강에 들어감. 정규 리그 4팀 2회전: 빈 경기 12개 공개 0건 → 무작위 채우기 뒤 12건 공개·진행 중 → 빠른 결과가 순위에 반영 | 통과 — 동률 조의 공개 순위표 진출 표시가 어드민 선택과 다르다(아래 관찰) |

### 스펙 전수 대조(2026-10-10)

8영역 211개 요구 중 204개 충족(의심 8건은 재검증에서 충족), 결손 7건. 반쪽 경기 취소 공개·끝난 리그 가드·공개 캐시 무효화·워커 통합 단언은 #1765, 리그 방식 「경기 추가」 막다른 길은 #1766 에서 고쳤고, alpha 시나리오 공백은 위 E2E 4~6회가 메웠다.

### 남은 관찰

- 결과 무효 뒤 노드 칩은 예정으로 돌아가지만 `fixture.status` 는 `completed` 로 남는다(E2E 1회 6b 관찰, 원인 미조사).
- 409 `TEAM_IN_OTHER_GROUP` 의 `details.groupId` 는 겹친 팀이 이미 속한 조가 아니라 편성하려던 대상 조다(문서화된 계약).
- 노드 패널의 후보 팀 순서는 내림차순이다(기존 정렬 그대로).
- 1440 옆 패널은 Escape 로 닫히지 않는다(기존 동작, 닫기 버튼과 포커스 복귀는 정상).
- alpha 테스트 4강 한 경기에 정정 초안(DRAFT) 1건이 남아 있다. 차단 확인(회차 4)에서 생긴 것이며 공식 결과는 그대로다.
- **동률 조의 공개 순위표(회차 6, 2026-10-11 사용자 결정 A → `fix/bracket-tie-standings`, 아래 결정 표):** 완전 동률 조에서 어드민이 직접 고른 팀이 4강에 들어가도, 공개 「순위·대진표」 조별 순위표는 임의로 붙은 순위 숫자 기준으로 상위 팀을 진출로 칠한다(`bracket-page-client.tsx` `GroupStandingsSection`). 실측: A조 03·06 이 진출로 칠해졌지만 4강에는 04·06 이 들어갔다. 정본 §5 의 「남은 동률은 공동 순위」와도 다르다.
- 1440 어드민 그림에서 8팀 대진의 결승 열은 가로 스크롤해야 보인다. 공개 390 대진표는 긴 팀 이름을 말줄임한다(회차 6).

## Ambiguity Log

| Date | Raised by | Question | Resolution |
|------|-----------|----------|------------|
| 2026-10-08 | main | 16강 템플릿? 결정 페이지 C안 목업에 "16강"이 있었다 | **2026-10-09 사용자 확정: 포함.** phase `round16` 추가(S1-b), knockout 16 · 조별 8조×2 결선 16강, PR-1a 스키마 변경에 enum 값 포함 + PR-1c 에서 로직·템플릿·라벨 |
| 2026-10-08 | main | D2=b 의 "리그 공개 게이트"를 무엇으로? | 별도 공개 버튼 대신 "자리에 연결됐는데 팀이 빈 경기는 공개에서 제외"(S6). 팀이 다 차면 자동 공개. 자리 없는 기존 경기 동작 불변 |
| 2026-10-08 | main | 리그 빈 경기의 시각·장소 | 정규 리그 템플릿은 일정 입력 필수 — 공개 가드의 startAt·placeName 계약 유지 |
| 2026-10-08 | main | 리그 템플릿 후 status | 템플릿은 바꾸지 않고, 자리를 쓰는 경기에 빈 사이드가 없어지는 순간 조건부(draft·open 만) 전이. 기존 코드엔 전이 함수가 없어 헬퍼 신설 |
| 2026-10-08 | main | 원정 자리 배정 시 신청서 | 승인 신청서 upsert(유일 제약), 교체·비움 시 이전 것 `withdrawn` |
| 2026-10-08 | main | 빠른 결과의 승부차기 킥 수 | 요구하지 않음 — 확정 승격 게이트와 같은 `requireKickCounts:false`. 정정 경로는 지금 킥 수를 요구하므로 득점 기록 0건 경기에 한해 면제 규칙 추가(검증 워크플로가 첫 서술의 오류를 잡음) |
| 2026-10-08 | main | 빠른 결과의 리비전 흐름 | 상태 머신에 `ADMIN_QUICK` 흐름 추가(CORRECTION 위장 금지) |
| 2026-10-08 | main | 리그 참가팀 제외 시 자리 경기 | 시작 전 자리 경기는 취소 대신 자리 비우기(`releaseSlotsForRegistrationInTx`, confirmed 이탈 전이 전부). 팀 해체는 진행 중 등록이 있으면 이미 차단돼 대상 아님 |
| 2026-10-08 | main | 리그 잠금 | 리그 레인은 기존 대회 행 `FOR UPDATE` + `assertFixtureGenerationAllowedInTx`, 대회 레인만 advisory lock(검증 워크플로 지적) |
| 2026-10-08 | main | 자리 리그의 기존 재생성 | 409 로 막고 템플릿 교체로 단일화 |
| 2026-10-08 | main | 빠른 결과 직전 명단 | 자리 배정 직후 비동기 명단 동기화가 끝나기 전엔 409 `QUICK_RESULT_ROSTER_SYNCING` |
| 2026-10-08 | plan-writers | 리그 상태 전이 대상 | `draft·open` 만 적었던 것은 표현 오류 — 경기 시작 전 상태(`draft·open·closed`) 전부. 보류·완료는 제외 |
| 2026-10-08 | plan-writers | 빠른 결과 VOID 재입력의 팀매치 상태 | 무효 처리가 팀매치를 `completed` 에서 되돌리지 않으므로 VOID 재입력에 한해 `completed` 허용(최초 입력은 `matched` 만) |
| 2026-10-08 | plan-writers | 빠른 결과 참가자 원천 | 게임의 참가자 행 전부가 아니라 사이드별 무효화되지 않은 최신 라인업 리비전의 참가자(옛 리비전 행이 남아 있음) |
| 2026-10-08 | plan-writers | 참가 취소 요청 시 자리 | 요청(철회 가능) 단계에선 유지, 운영자 승인 시 비움 |
| 2026-10-08 | plan-writers | 리그 방식 대회의 재생성 | 자리를 쓰면 기존 조별 생성기 `replaceExisting` 도 409 — 템플릿 교체로 단일화(정규 리그와 같은 규칙) |
| 2026-10-08 | plan-writers | 순위 채우기 override 범위 | tied 자리는 동률 팀 중, ready 자리는 원천 조 팀 중에서만. 저장 순위와 §5 결과가 어긋나면 tied |
| 2026-10-08 | plan-writers | 리그 보드 열 | 리그 경기엔 round 가 없어 열 = 경기 날짜(주차). 템플릿 리그는 날짜당 한 라운드 |
| 2026-10-08 | spec-verify workflow | 검증 결과 | 6관점·38 에이전트, 확인된 지적 44건(중복 포함) 전부 위 S1~S7·Test·PR 분해에 반영, 반박 2건 |
| 2026-10-09 | 사용자 | 태블릿(768~1023) 칸 패널 위치 | **A** — 칸 패널을 BottomSheet 로, 참가팀 트레이는 한 줄 요약으로 접기. 1024 이상 옆 패널 그대로, D8(구조 편집 768+) 불변. 근거: alpha 768 에서 패널이 누른 칸보다 1,150px 아래 열림 |
| 2026-10-09 | main | 자리 없이 만든 경기(옛 대진·「경기 추가」) | 서버 계약 그대로 — 자리 연결 사이드는 자리 API, 자리 없는 사이드는 `PATCH /admin/fixtures/:id`. 그림·시트는 `classifyFixtureSide`(slot/feeder/direct)로 갈라 direct 를 그 경로로 편집(#1725) |
| 2026-10-09 | 사용자 | alpha 쓰기 E2E 범위 | **B** — 새 4팀 토너먼트 + 조별+결선(2조×3팀) 전체 흐름, QA 스쿼드 팀 사용. 두 단계 모두 PASS(#1723·#1727 코멘트) |
| 2026-10-09 | main | 리그 방식 대회(`format=league`)의 대진 그림은 토너먼트 캔버스에 라운드 열로 올리면 열이 라운드 수만큼 늘고 순위가 없다. 어떻게 보여 줄까? | **2026-10-09 사용자 확정: B안.** 라운드(행) × 조(열) 격자 + 조별 순위표(1024 이상 sticky 옆 열 · 패널 열리면 접힘 · 768~1023 시트). 「경기 연결」 숨김. 옛 데이터(라운드 번호 없음)는 경기 번호 순서로 조마다 `max(1, floor(팀수/2))` 경기씩 끊음. 서버 변경 없음, 토너먼트·조별+결선 캔버스·정규 리그 보드·공개 페이지 불변. 모바일 라운드 탭은 같은 모델 재사용(PR-7) |
| 2026-10-10 | spec-audit workflow | 스펙 전수 대조 | 8영역 211개 중 204개 충족(의심 8건은 재검증에서 충족), 결손 7건. 서버·웹 결손 4건은 `fix/bracket-canvas-audit-gaps` 에서 수정, 리그 방식 「경기 추가」·추가 alpha E2E 는 사용자 결정 |
| 2026-10-10 | main | 홈만 찬 리그 경기를 취소하면 자리 id 가 지워져 공개 게이트를 빠져나간다 | 공개 게이트(단일 출처)는 그대로 두고 **취소 헬퍼**가 원정 자리가 비어 있던 경기의 홈 팀도 비운다 — 게이트에 "취소 + 원정 없음" 을 더하면 자리 없는 옛 경기의 원정 null 취소 기록까지 숨겨 #1746 계약이 깨진다. 대가: 그 취소 경기는 어드민에서 홈 팀 이름이 남지 않는다(공개된 적 없는 경기) |
| 2026-10-10 | main | 완료·취소 리그의 대진·자리 변경 | 가드에 `409 LEAGUE_ENDED` 추가(보류는 `LEAGUE_ON_HOLD` 그대로). 등록 취소·참가팀 제외의 자리 풀기는 가드를 거치지 않아 계속 된다 |
| 2026-10-10 | 사용자 | 리그 방식 대회의 「경기 추가」 | **B** — 대화상자에서 **조 + 라운드**(기존 `league_r{n}` 또는 새 라운드 N+1)를 골라 `POST /admin/tournaments/:id/fixtures`(`{groupId, round: 'league_r{n}', fixtureNumber}`)로 대진 미정 경기를 만든다. 팀은 격자 카드를 눌러 기존 직접 지정 경로(`PATCH /admin/fixtures/:id`)로 넣고, 만든 경기가 순위에 바로 잡히는 것은 수용. 토너먼트·조별+결선 대화상자·모바일 구조 편집 숨김(D8) 불변, 이 기능 자체는 서버 무변경(조별 단계 한 팀 한 조 가드는 결정 4 행). 옛 대진 처리와 다른 조 팀 편성은 아래 결정 3·4 행을 따른다 |
| 2026-10-10 | 사용자 | 옛 리그(라운드 번호 없음)에서 라운드 고르기 — 결정 3 | **B** — 격자 규칙 통일: 옛 경기의 조별 k번째 끊음 묶음(`max(1, floor(팀수/2))` 경기씩, 경기 번호 순)을 k라운드로 읽고, 새로 넣는 경기는 `league_r{k}` 로 저장해 같은 줄에 합친다. 옛 리그도 「1~N라운드 / 새 라운드」를 고른다. 데이터 백필 없음. 근거: alpha 리그 방식 7개 중 5개가 옛 리그. 대가: 옛 경기를 지운 적 있는 대회는 추정 라운드가 실제와 어긋날 수 있다(지금 화면도 같은 추정). 결선 단계 코드(`final` 등)나 한국어 이름으로 쓴 round 도 번호가 아니면 예외 없이 옛 경기로 끊는다 — 사용자 문구(번호 없는 옛 경기는 끊는다)를 그대로 따른다. 리그 조에 그런 round 가 들어가는 것은 수동 입력뿐이고 그 경기는 k번째 묶음 라운드 칸에 합쳐진다(2026-10-10 계획 비평 반영). |
| 2026-10-10 | 사용자 | 한 팀이 두 조에 들어가는 문제 — 결정 4 | **A** — 조별 단계(`phase=group`) 경기에 **다른 조별 단계 조에 이미 있는** 팀을 넣으면 서버가 `409 TEAM_IN_OTHER_GROUP`, 어느 조에도 없는 팀은 지금처럼 그 조에 자동 편성. 칸 패널·탭/끌어놓기·모바일 선택창 후보에서 다른 조 팀을 뺀다. 리그 방식·조별+결선의 조별 경기 모두 적용. 근거: alpha 2개 대회에서 7팀이 이미 두 조에 동시 편성(순위표 중복). 이미 겹친 데이터는 그대로 |
| 2026-10-11 | 사용자 | 동률 조의 공개 순위표 진출 표시 | **A** — 공개 「순위·대진표」 조별 순위표의 진출 색·「진출」 배지는 결선 경기에 실제로 들어간 그 조 팀만 칠한다(아무도 안 들어갔으면 순위로 정해진 자리만, 동률로 안 정해진 자리는 칠하지 않고 「동률 — 운영자가 진출 팀을 정해요」). §5 로 끝까지 안 갈린 팀은 「공동 n위」(n = 그 묶음의 저장 순위 최솟값), 판정은 어드민 「순위대로 채우기」와 같은 `group-rank-preview.ts` 에서 나온다. 같은 조 표가 탭마다 달라 보이지 않게 「경기 일정」 탭 조별 순위에도 「공동」을 싣는다. 순위 계산·동점 규칙·어드민·`format=league`·정규 리그 불변, 스키마 무변경. 기각: B(고른 순서 저장 — §6 공동 순위와 충돌·스키마 변경), C(안내만) |
