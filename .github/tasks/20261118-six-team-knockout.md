# Task 20261118: 6강 전용 토너먼트 진행 방식

## 2026-10-28 상세 화면 부전승 누락 후속

- 대상: a90df6d5-47e9-40f9-93ef-f679ce8da858, `1028 토너먼트 6 test`.
- 실제 API: sixTeamMode=true, 첫 3경기 모두 scheduled/result=null, bye=null. 선정 전 상태는 정상이다.
- 원인: `/bracket`은 SixTeamBracket을 쓰지만 대회 상세 BracketSection은 일반 TournamentBracket만 사용해 성적 기반 부전승 경로를 누락했다.
- 기존 승인된 6강 A안 전용 컴포넌트를 상세에도 재사용한다. 새 가상 경기나 결과/팀 배정을 만들지 않는다.
- Owned: 상세 client, 기존 six-team-bracket 안내, 상세 렌더 회귀 테스트, 이 task와 changeset.
- Forbidden: API/DB/결과 변경, 공유 WIP, main 승격.
- [x] 상세 화면의 전용 대진표 및 사용자 지정 단계 이름 연결.
- [x] 준결승 부전승 1팀임을 안내.
- [x] 상세 선정 전/후 포함 2 files / 42 tests, tsc --noEmit --incremental false, v1 패턴 검사 통과.
- [ ] PR 제출, 배포 후 alpha 390/768/1440 검증.
- Progress: origin/dev ec33d1609에서 격리 작업트리 fix/six-team-bye-display. 앞선 일정 필터 #2083의 배포 요청은 유지하며 Copilot 예외 승인 확인 대기 중.
- QA: alpha Before 390/768/1440에서 일반 대진표 및 직행 안내 누락 재현. 비로그인 auth/me 401은 기존 오류로 로그에 보존. 브라우저 PID 65220/parent 51764 종료 확인. After는 배포 후 실행. `git diff --check`, touched debt marker 0 확인. 원래 승인된 A안 재사용이며 새 디자인/가상 경기는 없음.

Status: Review
**Owner**: Main session (단독 진행)
**Created**: 2026-10-28
**Scope**: backend + frontend + DB migration. 사용자 진행 지시로 A안 구현.

## Context
사용자 합의: 기존 대회 기능 안에서 모집 정원 6팀 + 토너먼트일 때 선택 가능한 전용 방식.
6강 3경기 승리팀 중 기록 우선 1팀은 결승 직행, 나머지 2팀은 준결승, 이후 결승. 총 5경기.
관련 6강 전용 active task/scenario 검색 결과 없음. 현행 근거는 아래 v1 코드다.

- 설정: `apps/v1_web/src/app/admin/tournaments/new/tournament-create-model.ts` (정원 2~64), `new/page.tsx`, `[id]/info-section.tsx`.
- 운영: `apps/v1_web/src/app/admin/tournaments/[id]/bracket-tab.tsx`, `bracket-group-card.tsx`.
  현재 녹아웃 자동 생성은 조별 seed pairing이며 전체 6강 구조 자동 생성이 아니다.
- 사용자: `apps/v1_web/src/app/tournaments/[id]/bracket/bracket-page-client.tsx`, `apps/v1_web/src/components/tournaments/tournament-bracket.tsx`.
  라운드 해석은 semi/final/third_place 중심. 미인식 6강 라운드는 그룹 phase로 합쳐지거나 뒤로 정렬될 수 있다.
  현재 연결선은 경기 수 중심의 일반 트리다. 경기 카드 순서만으로 6강 진출 경로를 연결하면 오표시 위험.
- 저장/진출: `apps/v1_api/prisma/schema.prisma`의 V1TournamentMatchDetails / V1TournamentMatchAdvancementEdge,
  `apps/v1_api/src/game-operations/tournament-team-match-advancement.ts`, 결과 확인/정정 서비스.
  단일 경기 승패 연결과 달리 세 경기 승리팀 전체 비교가 필요하다.
- 결과 정본: `docs/design/competition-canonical-flow.md` §4. 운영팀 종료/제출 → 어드민 확인 → 공식 결과.
- 디자인: DESIGN.md, v1 공유 컴포넌트, Teameet Design.html의 대회 상세/대진표 참고.

## Goal
일반 대회를 유지하면서 6강 전용 대회에서 5경기 생성, 기록 기반 직행 선정, 수동 조정, 명확한 공개 대진표를 제공한다.

## Original Conditions (must all be satisfied)
- [x] 6팀 / 6강 3경기 / 준결승 1경기 / 결승 1경기 요구사항 기록.
- [x] 결승 직행 우선순위: 6강 승리팀의 최다 득점 → 최대 득실차 → 최소 실점.
- [x] 운영자는 모든 단계에서 선택 가능.
- [x] 모집 정원 6팀 + 토너먼트에서만 선택지 노출, 확정 참가팀 정확히 6팀일 때만 생성.
- [x] 사용자 대진표 구성안까지 기획.
- [x] 추천 A안으로 진행 (사용자 “진행해줘”, 2026-10-28).

## User Scenarios
### 1. 대회 설정과 생성
1. 기존 형식 knockout을 유지하고 하위 진행 방식으로 일반 / 6강 결승 직행 방식을 선택한다.
2. 신규 생성/기존 대회 수정 모두 지원. 기존 대회는 일반 방식이 기본, 자동 전환 금지.
3. 대진 생성 전 정원/형식을 바꾸면 비호환 방식 해제 안내 후 재선택한다.
4. 확정 참가팀 6팀을 슬롯 1~6에 배정: 슬롯 1-2, 3-4, 5-6 대결. 운영자 변경 가능.
5. 서버에서 단일 트랜잭션으로 5경기 생성. 준결승/결승은 의미 있는 대기 슬롯으로 생성.
6. 생성 후 정원/방식/참가팀 변경으로 구조가 깨지는 수정은 차단. 시작 전 재구성은 영향 미리보기와 명시적 확인 절차로 별도 설계.

### 2. 결승 직행과 다음 단계
- 6강 공식 결과 3건과 명확한 승리팀 3팀이 모두 있어야 자동 비교한다. 실시간/제출 점수로 확정하지 않는다.
- 기본 제안: 순위가 유일하면 자동 배정. 완전 동률이면 동률 후보만 제시하고 운영자 선택까지 대기.
- 준결승의 남은 두 팀은 원래 6강 경기 번호 순으로 배치. 운영자가 홈/어웨이를 바꿀 수 있다.
- 준결승 공식 승리팀을 결승 남은 슬롯에 배정. 결승 확정 후 기존 우승 표시/전적 흐름 재사용.
- 부전승은 별도 가상 경기를 만들지 않는다. 실제 경기/출전/승수/득점 통계에 추가하지 않는다.

### 3. 운영자 수동 선택과 정정
- 초기 6팀 대진, 6강 진출팀 3팀, 결승 직행팀, 준결승/결승 슬롯과 진출팀을 수동 선택 가능하게 한다.
- 기본 후보는 각 경기의 두 참가팀/이전 단계 진출팀으로 제한한다. 임의 외부 팀 삽입 및 중복 배정 금지.
- 실제 점수와 다른 수동 진출은 점수를 위조하지 않고 진출 결정 override로 저장한다. 사유 필수.
- 자동/수동 출처, 처리자, 사유, 시간, 이전/변경 값, 기준 결과 버전을 기록한다.
- 자동 재계산은 수동 결정을 덮어쓰지 않는다. 근거 결과가 바뀌면 재검토 필요 표시.
- 모든 단계에서 조정 진입점을 제공하되 후속 경기 시작/종료 후 참가팀을 조용히 교체하지 않는다.
  기존 NEXT_FIXTURE_CONFLICT 규칙 준수. 이미 시작된 경기는 관련 결과 정정/무효화 절차가 먼저 필요하다.
- 수동 해제/자동 복귀도 영향 확인 후 수행. 전체 승리팀 재평가와 준결승/결승 슬롯 변경을 원자적으로 처리.

## 사용자 대진표 기획
기존 `/tournaments/[id]/bracket` 안에서 방식에 따라 렌더링. 별도 공개 route는 만들지 않는다.

### 화면 A/B/C (A안 선택)
| 안 | 원칙 | 장점 | 단점 | 규모 / 재사용 |
|---|---|---|---|---|
| A 추천 | 진행 흐름 + 직행 선정 영역 | 세 승리팀을 비교한 뒤 경로가 갈리는 이유가 명확 | 전용 선정 영역과 연결 표현 필요 | 중~대 / 기존 팀 아바타·경기 카드·결과 링크·Modal 재사용, 일반 트리 연결선 교체 |
| B | 기록 비교 우선 | 승리팀 비교표를 먼저 보여줘 선정 근거 파악이 빠름 | 경기 전체 흐름보다 순위표처럼 보일 수 있음 | 중 / 기존 표·경기 리스트·상태 컴포넌트 재사용 |
| C | 기존 브래킷 우선 | 기존 사용자 대진표에 가장 가까움 | 3승자→2경로 분기를 가로 트리에 읽히게 하기 어렵고 모바일 스크롤 큼 | 중~대 / TournamentBracket 확장, 진출 관계 기반 전용 연결선 필수 |

### A안 정보 구성 (구현)
- 상단: ‘6강 토너먼트 · 총 5경기’ + 규칙 보기.
- 데스크톱: 6강 3경기 → 승리팀 3팀/직행 선정 → 준결승 1경기와 결승 직행팀 → 결승 → 우승.
- 세 승리팀은 선정 영역에서 모은 뒤 경로 분기. 특정 6강 경기 승리팀을 미리 직행으로 연결하지 않는다.
- 모바일: 6강 / 준결승 / 결승 순서의 세로 섹션. 직행팀 요약은 준결승 앞, 결승에는 직행 경로 명시.
  태블릿도 카드 너비 확보가 안 되면 세로 사용. 390 / 768 / 1440에서 검증.
- 직행 선정 표시: ‘결승 직행 · A팀’, 자동이면 ‘6강 5득점 · 득실차 +4 · 실점 1’, 수동이면 ‘운영자 지정’.
- 규칙 펼침: 3팀 비교표(팀/득점/득실차/실점/진출 경로). ‘직행’과 ‘준결승 진출’ 표시, 최종 순위표와 구분.
- 상태: ‘6강 결과 대기’ → ‘공식 결과 확인 대기’ → ‘직행팀 선정 대기’ → ‘진출 확정’.
  공식 결과가 미완성일 때 예상팀을 확정팀처럼 표시하지 않는다.
- 미정 슬롯은 ‘6강 승리팀 중 선정’, ‘준결승 승리팀’으로 표시. null(비공개)과 미정 구분 유지.
- 대진표 미공개/참가팀 비공개/점수 공개 정책은 기존과 동일. 비교표가 숨긴 점수를 유출하면 안 된다.
- 부전승은 경기 카드가 아닌 직행 요약이다. 가상 0:0, 가상 승리, 가상 일정/경기 링크 금지.
- 실제 경기 카드는 기존 실제 기록 상세 경로로 연결. 공개 화면에는 편집 권한 추가하지 않는다.
- 색만으로 승리/직행 구분 금지, 텍스트 배지 제공. solid 표면/토큰/다크모드/44px 조작 준수.
- 정밀 목업은 선택안 기준 후속 제작. 이번에는 시각 구현이나 alpha 화면 QA를 수행하지 않음.

## Test Scenarios
### Happy path
- [ ] 유효 정원/형식에서만 선택 가능, 6확정팀에서 정확히 5경기 생성.
- [ ] 6강 3결과 확정 → 다득점 우선 직행/준결승 배정 → 준결승 승리팀 결승 → 우승.
- [ ] 수동 직행 변경 시 남은 두 팀 및 결승 슬롯이 함께 바뀌고 중복 없음.
### Edge cases
- [ ] 득점 동률에서 득실차로 선정, 완전 동률에서 수동 선택 대기.
- [ ] 수동 진출과 경기 점수의 불일치가 명시적으로 표시되고 공식 기록은 변조되지 않음.
- [ ] PK/몰수/취소/미확정 결과 처리. 비교할 공식 점수 불충분이면 자동 선정 금지.
- [ ] 결과 정정, 수동 고정 후 재확정, 자동 복귀, 동시에 두 운영자 수정, 중복 생성 요청.
- [ ] 라운드 순서 6강→준결승→결승 및 동적 직행 연결, 비공개 이름/점수 누출 방지.
### Error paths
- [ ] 5팀/7팀, 다른 형식, 중복 팀/탈락팀/외부팀 배정 거절.
- [ ] 권한 없는 변경 거절, 후속 경기 시작 후 변경 충돌, 부분 생성 롤백.
### Mock data updates needed
- [ ] backend fixture/seed 및 frontend types/hooks/MSW를 새 방식과 진출 메타데이터에 맞춰 동기화.
- [ ] 일반 토너먼트 및 조별리그 후 토너먼트 회귀 확인.

## Parallel Work Breakdown
실행은 사용자 병렬 지시 없이 단독 순차. 아래는 의존성 분해다.
1. [ ] 규칙 예외 확정 + A/B/C 사용자 선택 → 선택안 정밀 목업.
2. [x] 서버: 하위 방식/선정 결정 모델, migration, 5경기 원자 생성, 자동 비교/수동 조정/동시성/권한.
3. [x] 공유 계약: DTO, public/admin 응답, types/hooks/MSW, docs/api 정본 동기화.
4. [x] 프론트: 설정/운영 관리/사용자 대진표/상세 요약 동기화.
5. [ ] 좁은 계약 테스트, 일반 방식 회귀, 리뷰, dev 반영 후 alpha 수동 QA.
Owned: 위 v1 관련 파일과 이 task. Forbidden: legacy, env 파일, main 승격, 다른 세션 WIP.

## Acceptance Criteria
- [ ] 6팀 조건, 정확히 5경기, 자동 비교 및 모든 단계 수동 선택 충족.
- [ ] UI 3안 제시 → 사용자 선택 후 구현.
- [ ] 정정/충돌이 기록을 손상시키지 않고 수동 출처/이력 추적 가능.
- [ ] 사용자 화면이 직행 경로와 선정 근거/대기 상태를 정확히 표시.
- [ ] DB migration + API 문서 + fixture/MSW 동기화.
- [ ] 좁은 테스트 및 리뷰 통과, alpha 390/768/1440 화면/console/network 증거.

## Tech Debt Resolved
기획 단계 식별: 라운드 문자열/phase 추정과 경기 수 기반 연결선을 6강에 그대로 적용하면 오표시.
후속 구현에서 6강 범위에 명시적 단계/진출 메타데이터를 사용한다. 일반 대진 전체 재작성은 범위 밖.

## Security Notes
기존 관리자 권한을 따르고 일반 팀장/참가자에 편집 권한을 주지 않는다.
서버에서 형식/정원/참가 상태/중복/후속 경기 상태 검증. 감사 이력과 결과 버전 검증, 원자적 배정.
공개 응답은 숨김 이름/점수 및 내부 수동 지정 사유/처리자 개인정보를 노출하지 않는다.

## Risks & Dependencies
- 기존 결과 정정/진출 투영 서비스와 연동 필수. 프론트 전용 추천 계산으로 대체 불가.
- 새 DB 필드/관계의 정확한 형태는 구현 설계에서 확정. 범용 workflow 엔진 도입은 범위 밖.
- 정책 확정 후 competition-canonical-flow.md 결정 이력에 기록. 구현에서 competition-canonical-flow.md의 결정 이력을 함께 갱신했다.

## Ambiguity Log
| Date | Raised by | Question | Resolution |
|---|---|---|---|
| 2026-10-28 | User | 정원/형식 노출 조건 | 정원 6 + 토너먼트, 생성은 확정 6팀으로 합의 |
| 2026-10-28 | Main | UI 구성 | A/B/C 제시 후 사용자 진행 지시로 추천 A안 적용 |
| 2026-10-28 | Main | 최소 실점 우선순위 | 요청 순서 유지. 득점과 득실차가 같으면 실점도 같아 추가 구분 효과 없음 |
| 2026-10-28 | Main | 자동 확정 시점 | 공식 결과 3건 후 유일 1위 자동 배정 제안. 완전 동률은 운영자 선택 |
| 2026-10-28 | Main | 승부차기/연장 득점 | 제안: PK 승패 판정에는 사용, 비교 득점에는 제외. 공식 경기 점수(연장 포함) 비교. 사용자 확인 필요 |
| 2026-10-28 | Main | 몰수/기권/취소 | 제안: 유효 공식 판정 점수면 비교, 점수 또는 승리팀 없으면 수동 판단 대기. 사용자 확인 필요 |
| 2026-10-28 | Main | 모든 단계 선택 범위 | 해당 단계의 적격 팀 내 수동 변경. 시작된 후속 경기는 정정 절차 우선; 자유 교체 금지 제안 |

## Progress Snapshot
- [x] 현행 v1 설정/운영/공개 대진표/진출 관계와 결과 정본 확인.
- [x] 기획 문서와 화면 3안 준비.
- [x] 사용자 진행 지시로 추천 A안 및 제안 예외 정책 적용.
- [x] 코드 구현, migration, 로컬 계약 검증.
- [ ] dev 머지 후 alpha 화면 검증.


## Implementation Snapshot — 2026-10-28
- Branch: feat/six-team-knockout, isolated worktree `/tmp/teameet-six-team`, base origin/dev 8c9d77a3a.
- 원본 작업트리는 f58fe862a 기반의 다른 작업 WIP가 있어 코드 변경을 복사하거나 덮어쓰지 않음.
- 최신 dev에는 짝수 팀 schemaVersion 2 템플릿/자리 관리가 있음. 초기 기획의 로컬 코드 근거는 이 기반으로 갱신됨.
- 신규 진행 방식은 기존 v2와 구분되는 sixTeamMode; rollout flag와 무관하게 정원 6/확정 6 조건으로 검증.
- V1Tournament.sixTeamMode 및 sixTeamBracket JSON 저장, 일반 대회 기본값 false/null.
- 공식 결과 투영/정정/무효화 경로와 연결. 수동 선택은 별도 감사 로그, 출전/득점 기록을 위조하지 않음.
- 경쟁 잠금은 결과 트랜잭션의 source Game 잠금과 역순 교착을 피하도록 try advisory lock 사용, 경합은 재시도 가능한 SIX_TEAM_BUSY.
- 첫 마이그레이션 전체 replay 통과. 일회용 PostgreSQL 실제 DB 통합 4건 통과(생성/선정/수동/결승배정/동률/시작충돌/정정).
- Alpha 배포 및 390/768/1440 수동 스크린샷 검증은 아직 미수행(미배포). 로컬 Web 서버는 검증 목적으로 실행하지 않음.
- 구현은 미커밋 상태. 커밋/PR/배포 완료로 보고하지 않음.

- Task 번호 정정: 최신 dev의 20261107은 기존 early-end-warning 작업이 사용 중이므로, 6강 작업의 정본을 20261118로 변경. 기존 문서와 작업은 수정하지 않음.


## Final Local Validation
- API 관련 단위 7 suites / 212 tests PASS. surface helper 정리 후 영향 3 suites / 24 tests 재확인 PASS.
- Web 관련 6 files / 116 tests PASS: 공개6강/기존템플릿/생성payload/진행단계/기존경기카드/시상.
- 실제 PostgreSQL DB 통합4 PASS: canonical advancement 진입점으로 자동 배정, 수동 배정, GameSide 동기화,
  준결승 승자 결승 배정, 동률, 시작충돌 원자 롤백, 정정/재검토, 구조 보호, 결승 홈·원정 교체.
- 마이그레이션220개 전체 재생 + 방식 선택 migration1개 추가 적용 PASS. Prisma schema diff: no difference (exit0).
- API/Web tsc 통과, API surface gate 및 Web pattern gate 통과. git diff --check PASS.
- touched 신규6강 소스 debt marker 0. 신규 import 대상은 같은 작업트리의 신규 파일로 모두 존재.
- 현재 diff는 미커밋, untracked 신규 파일 포함. committed-tree/PR 검증은 수행하지 않았으므로 PR-ready로 표시하지 않음.
- 실제 화면 alpha 검증0/3, console/network 확인 미실행. 코드/DB 검증과 시각 완료를 구분.
- 테스트 전 host load<1 (28 cores), 가용 메모리8GB 이상, swap0. 직렬 테스트/min worker.
- 테스트용 Docker 컨테이너 teameet-six-team-test만 생성. 종료 시 그 컨테이너만 제거하며 alpha/prod 데이터 변경0.

## Current Resume Cursor
1. 이 task와 브랜치 feat/six-team-knockout, `/tmp/teameet-six-team`의 미커밋 diff를 읽는다.
2. 원본 공유 작업트리로 코드/스키마를 덮어쓰지 않는다(다른 WIP와 겹침).
3. 다음 단계는 명시적 커밋/PR 요청 후 exact pathspec 커밋과 dev 대상 PR, 배포 후 alpha3폭 QA다.
4. 초기 기획의 체크박스 중 화면·기능 항목은 위 구현 증거를 따르며, alpha/committed-tree gate는 미완이다.

- Cleanup 확인: task 전용 PostgreSQL 컨테이너 제거 완료. 새 로컬 Web/브라우저 서버 실행0.

## PR 준비 — 2026-10-28
- 사용자 PR 생성 요청. origin/dev aff3e49cb까지 안전 FF(변경 경로 겹침0).
- 기존 검증 이후 기능 소스 변경 없음. API212/Web116/DB4 및 양쪽 타입·패턴·schema drift0 기록 유지.
- 이번 커밋은 아래 구현 범위만 포함하며, PR base는 dev. alpha3폭 갤러리는 저장소 절차에 따라 머지/배포 후 추가한다.


## PR #2076 Monitoring — 2026-10-28
- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2076, base dev, initial head8c18ba2de.
- CI run40616474485 Gates FAIL: Task168 final schema binding pins were not synchronized with additive six-team fields.
  Runtime image pin, source binder, manifest writer and historical manifest allowlist must bind the current schema; previous approved hashes and M11 stay intact.
- Copilot run40616477767 failed before producing a review: `Model "claude-opus-5" is not available` during session.create.
  This is an external review blocker, not a clean review. No model/account/plan changes and no immediate retry for that failed session.

- 추가 Web CI 실패3건: info-section의 sixTeamMode를 변경 유무와 무관하게 전송해 기존 부분수정 계약을 깨뜨림.
  실제로 바뀐 경우에만 payload에 포함하도록 수정. 기존 회귀22 + 신규6강2 = 24 PASS.
- Task168 스키마 바인딩 실제 게이트9 PASS: 현행 hash 반영, 이전 manifest hash 및 변조 거절 유지. shell syntax/diff-check PASS.

- head3eb94ee7d CI run40617756281: Gates/Web PASS. API integration found stale gameSchemaSourceManifest.schema pin.
  Source snapshot unit reproduced RED (3 failed/2 passed). Rebind only current schema; historical game migration stays unchanged.
- The same API run ended with Node heap OOM (~4GB) while serial integration suites accumulated in --runInBand.
  Keep maxWorkers=1 and the exact suite discovery, use workerIdleMemoryLimit=1024MB so Jest recycles the single child between suites.
  Update the discovery contract to execute actual package-script arguments, check serial worker bound, recycling threshold and all canonical suites.
- Latest Copilot run40617758203 also failed before review generation with the same unavailable-model error. Review remains blocked.

- Source snapshot GREEN: 5/5 PASS including canonical LF, repeated CRLF, schema mutation and historical migration mutation rejection.
- Actual single-worker recycling contract PASS: both scratch tests executed and PID changed between suites; actual package-script discovery still contains every canonical integration suite.
- Narrow runner-contract2 PASS (other DB recovery contracts intentionally not run locally; CI retains them). No integration test exclusions or worker parallelism added.
