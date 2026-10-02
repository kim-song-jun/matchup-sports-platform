Status: In progress — dev 배포 및 Alpha 재검증

# 마이페이지 전체 동작·복귀 플로우 감사 — 2026-09-30

## 요청 / 범위
- 마이페이지의 모든 박스·버튼과 하위 화면, 상단 복귀·브라우저 뒤로가기 확인 및 브리핑.
- 범위: frontend/backend 읽기 전용 리뷰 + 실제 alpha 테스트 계정 QA + docs. 구현·배포 변경 없음.
- 기준 배포: `3d4a65e7d23dbe90ba09d55b7328ca92adb7b9b8`, `1.1.0-alpha.20260930.g3d4a65e7d23d`.
- 공유 워킹트리 HEAD `992dba62f`는 배포보다 오래됨. 분석은 배포 커밋의 v1 파일을 `git show`로 확인.

## Acceptance Criteria / 진행판
- [x] 현재 배포 메뉴·조건부 박스를 전수 목록화하고 M/N 보고.
- [x] 각 진입 링크, 주요 내부 버튼, 상단 복귀, history back 확인. 미확정 거래/네이티브/조건부 항목은 아래에 분리.
- [x] 저장·실패·빈 목록·조건부 권한의 검증 수준과 미검증 사유를 구분.
- [x] 390/768/1440 viewport, screenshot, runtime exception/network 증거 기록. 3D 카드 합성 캡처 한계 별도 기록.
- [x] 항목별 판정과 우선순위 브리핑 정리.
- [x] 전용 브라우저 종료와 fixture 변경 복원.

## 실행 / 소유권
- 단일 에이전트. Owned: 본 문서, `scripts/qa/my-page-flow-audit.cjs`, `docs/scenarios/executions/my-flow-execution.md`의 이번 실행 append.
- Forbidden: 기존 WIP, 앱 소스 변경, 배포/DB/다른 세션 Android QA 탭.
- 전용 visible Chrome(9241), 별도 profile, 제공된 alpha fixture 계정 사용. credential/cookie/token은 출력·저장하지 않음.
- 원격 회원 탈퇴·실제 SMS·금전 거래는 확정하지 않고 진입/검증/취소와 코드 계약을 기록.

## Progress Snapshot / Ambiguity Log
- 사용자 환경 확정: `alpha.teameet.co.kr`.
- 기존 Android 디버깅 탭이 다른 세션에서 이동 중임을 확인. 읽기 전용 초기 관찰만 수행하고 전용 브라우저로 분리.
- Linux 부하 0.76/24 cores, available 14.4GB, swap 0. 로컬 Web/API 없음; alpha 응답 200.
- 서버/브라우저 정상 응답만으로 기능 PASS 처리하지 않음.

## 실제 실행 결과 — 2026-10-01 KST

- Persona A: 제공된 fixture CSV의 첫 선수 계정. 팀장 권한, 개인/팀/리그 경기·작성 대기 리뷰·가입 신청 데이터가 있는 계정. Persona B: 마지막 선수 fixture, 설정 저장/복원 전용.
- 모바일 390×844: 마이 홈의 고유 링크 19/19, 설정 링크 8/8, 약관 링크 3/3 진입·상단 복귀·history back. 추가 알림 진입·카드 뒤집기·로그아웃 및 비밀번호 버튼까지 관찰: 마이 홈 22/22, 설정 홈 10/10, 약관 3/3 entry action 처리. **처리 수는 정상 수가 아니다.**
- 태블릿 768×1024 / 데스크톱 1440×900: 마이 홈·계정 설정·프로필·운동 정보·참여 매치·내 팀·내 리그·내 일정·리뷰·문의 각 10/10 렌더/치수 측정. 이 측정에서 문서 가로 overflow 없음.
- 화면 검증 중 release가 `3d4a65e7d23d` → `67802868f249` → 최종 `3e38c75eff8b`로 변경. 최종 커밋에서 이번 프론트 메뉴/프로필/리뷰/카드/뒤로가기 및 리그 redirect 코드 변경 없음 확인. profile activity aggregation의 backend 변경은 이번 저장/복귀 findings와 별개이며 최신 집계 정확도를 통과로 단정하지 않음.
- raw evidence: `output/playwright/visual-audit/my-flow-20260930/` (git ignored). `navigation-index.json`, `mobile-root-*`, `mobile-settings-*`, `mobile-legal-*`, `mobile-actions-*`, `mobile-nested-*`, `mobile-recheck-*`, `settings-roundtrip-*`, `tablet-layout-*`, `desktop-layout-*`, `cleanup-auth-*`.
- 최초 1084px 탐색은 14/19 이후 screenshot timeout. 모바일 19/19 완주를 새 증거로 사용. 최초 동적 링크 재진입 누락으로 생긴 history mismatch는 링크 대기/실제 재클릭 확인으로 교정했으며 버그로 집계하지 않음.

## Findings — 수정 우선순위

| ID | 우선순위 | 실제 트리거와 관찰 | 근거 |
|---|---|---|---|
| MY-F01 | 높음 | 프로필 값을 수정하지 않고 저장 → 생년월일 오류, PATCH 요청 없음. 기존 `YYYY-MM-DD` 길이 10 값을 그대로 hydrate한 뒤 8자리 숫자로 검증해 저장 중단 | `mobile-actions-07`, `mobile-recheck-01/03`; 배포 `my-api-clients.tsx:345,540` |
| MY-F02 | 중간 | 마이 → 채팅 → 상단 ← → 홈. history back은 마이로 정상 | `mobile-root-07` |
| MY-F03 | 중간 | 마이 상단 알림 → 상단 ← → 홈 | `mobile-actions-04/05` |
| MY-F04 | 중간 | 마이 카드 설정 → 상단 ← → 계정 설정. 카드 설정 → 사진 올리기 → 프로필 ← → 마이. 바로 전 카드 설정을 잃음 | `mobile-root-04`, `mobile-recheck-13/14/15` |
| MY-F05 | 중간 | 참여 매치 → 리그 팀매치 상세 → 리그 fixture로 redirect하면서 `from` 소실 → ←는 리그 상세로 이동, 내 매치 필터로 복귀 안 됨 | `mobile-nested-08/09/10`; 배포 `app/team-matches/[id]/page.tsx:34` |
| MY-F06 | 중간 | 생성한 팀매치 → 팀매치 관리 → 상단 ← → 전체 팀매치 목록. 동일 상세 링크에는 `from`이 있으나 관리 링크에는 없음 | `mobile-recheck-07/08/09`; 마이 매치 view-model |
| MY-F07 | 중간 | 설정 → 약관 → 이용약관/개인정보/위치 약관 → 상단 ← href `/login` → 로그인된 계정은 홈으로 이동. history back은 약관 목록으로 정상 | `mobile-legal-01/02/03`; 배포 `my-page.tsx:498–501`의 링크에 출처 없음 |
| MY-F08 | 기능 제한 | 비밀번호 변경 → “비밀번호 변경은 문의로 요청해 주세요.” alert만 표시. 직접 변경 화면/문의 화면으로 연결되지 않음 | `mobile-actions-22`; 배포 `my-page.tsx:462` |

MY-F02~07은 실제 관찰된 출발 화면 상실이다. 부모 화면으로 돌아가는 정책을 의도했다면 각 항목의 UX 계약을 명시해야 한다. 모든 페이지가 고장 났다는 의미는 아니다.

## 박스 / 버튼별 판정

| 박스·화면 | 실제 확인 | 판정 / 한계 |
|---|---|---|
| 선수 카드 | 뒤집기 후 “앞면 보기”로 변경, 앞면 복원; 공개 프로필·공유 화면 진입/복귀; 사진 추가→프로필 | 기본 컨트롤 동작. 카드 설정/사진 복귀 MY-F04. OS 공유 시트·실제 외부 공유 미실행 |
| 활동 | 전체 활동/팀 수/매너/이번 달 숫자 표시 | 읽기 전용 숫자, 클릭 버튼 없음. 최신 backend 집계 변경의 정확성 별도 |
| 남은 후기 | 경기 후기/대회 후기 CTA 각각 진입 및 복귀 | 진입 정상. 실제 리뷰 전송 미실행 |
| 받은 소식 | 채팅, 받은 초대, 리뷰, 보낸 가입 신청 | 채팅 복귀 MY-F02. 초대 없음 안내/팀 둘러보기 링크 확인. 수락/거절은 fixture가 없어 미확정 |
| 참여한 매치 | 전체/개인/팀 필터, 개인/일반 팀 상세, 리그 상세 | 일반 개인/팀 상세 복귀 정상, 리그 MY-F05 |
| 내가 만든 매치 | 생성 목록, 팀매치 관리 진입 | 관리 복귀 MY-F06. 참가 관리에서 실제 참가 상태 변경 미실행 |
| 내 활동 기록 | 본인 기록 상세 표시·상단 복귀 | 진입/복귀 정상 |
| 내 팀 | 소속·권한·팀 상세→내 팀 목록 복귀 | 기본 플로우 정상. 팀 설정/삭제/다른 사용자의 역할 변경은 범위 밖 |
| 내 리그 | 소속 리그·순위 준비 상태·상세→내 리그 복귀 | 기본 플로우 정상 |
| 내 일정 | 전체/예정/취소됨/완료 필터, 일정 상세→내 일정 | 기본 플로우 정상. 참가 응답/경기 완료 변경 미실행 |
| 리뷰 | 작성할/작성된/받은 탭, 리뷰 작성→목록, 미입력 전송 disabled | 기본 플로우 정상. 실제 별점/평가 저장은 타인 평가를 남기므로 미실행 |
| 프로필 수정 | 원본 hydrate, 저장, 짧은 닉네임 차단, 비이미지 파일 차단 | MY-F01 저장 차단. 이미지 실제 업로드·사진 저장·휴대폰 변경/SMS 미확정 |
| 운동 정보 | 종목 선택→난이도·포지션 노출, 난이도 미선택 저장 시 명시 오류 | 선택/검증 정상. 저장 후 재조회 미실행 |
| 계정 설정 | 계정 정보와 8개 하위 링크, 비밀번호, 로그아웃 | 진입/복귀 정상. 비밀번호는 MY-F08 |
| 위치 | 목록과 저장 비활성 상태, 현재 위치 찾기 | 권한 거부를 설정한 시험에서 10초 후에도 “확인 중” 관찰. 브라우저/OS 권한 완료 증거 부족으로 성공 판정하지 않음. 좌표 조회·지역 저장 미확정 |
| 알림 | 경기·대회/팀 활동/채팅/서비스 공지 ON↔OFF, reload, 원복 | 4/4 영속성/원복 확인. 푸시 토큰 등록·실제 앱 push 수신 미실행 |
| 테마 | 라이트→다크→reload→원래 라이트 복원 | 서버 저장/원복 정상 |
| 경기 기록 공개 | 현재 ON과 공개 내용·시점 표시 | 읽기/복귀 정상. 공개 동의 변경 미실행 |
| 대회 기록 실명 | 현재 ON 표시 | 읽기/복귀 정상. 공개 설정 변경 미실행 |
| 선수 카드 설정 | 숨기기 ON/OFF reload·복원, 네모 선택 상태·방패 잠김 disabled, 사진 링크 | 숨김 영속성 정상. 잠긴 모양 구매/해제 없음, 사진 플로우 MY-F04 |
| 약관 및 정책 | 3개 실제 본문·history 복귀 | 상단 복귀 MY-F07 |
| 회원 탈퇴 | 처리 안내 펼침/접힘, 확인 모달·취소, 탈퇴 API 요청 없음 | 진입/취소 정상. 실제 탈퇴 요청/삭제 미실행 |
| 문의 | 빈 목록→작성, 빈 입력 오류, 취소→목록 | 기본 플로우 정상. 운영팀에 실제 문의를 보내거나 답변받는 과정 미실행 |
| 로그아웃 | 마이/설정 두 위치에서 실행, `/my` 재진입은 로그인으로 차단 | 2/2 정상, logout 201·후속 auth/me 401은 기대 결과 |
| 조건부 본인인증/대회 운영 | 확인 계정은 인증 완료, staff 배정 없음 | 해당 조건부 박스는 현 계정에 미노출. 코드 계약과 미실행을 구분 |

## 제한 / cleanup
- **30/30 링크 처리, 진입 정상 ≠ 모든 버튼의 저장·거래 정상.** 미실행 항목은 PASS로 올리지 않음.
- 별도 fixture B 알림 4개·테마·카드 숨김 6/6 변경→reload→원래 값 복원. 양 계정 모두 전용 브라우저에서 logout. 다른 세션/Android 탭 변경 없음.
- 초기 API 실패 차단 시험은 6.5초 관찰 중 loading 상태, retry 버튼 없음. 해당 시간의 loading만으로 오류 처리 결함을 단정하지 않으며 장애 복구는 미확정.
- 3D 선수 카드가 compositor 외 캡처에서 누락될 수 있어 해당 캡처를 카드 실화면 실패 증거로 쓰지 않음. 실기기 screenshot/OS 공유·push까지 통과로 단정하지 않음. 유효하지 않은 OS foreground 캡처는 폐기.
- 전용 Chrome 실제 PID 15720 / PPID 3104. `Browser.close` 완료, port 9241 listener 0 확인. task-owned browser profile 삭제.
- 앱 코드·DB·배포 변경 없음. 전체 unit/build/typecheck 미실행: 이번 작업은 런타임 QA/보고서이며 고부하 반복 검증 불필요.

## 후속 확인 — 2026-10-01 alpha 상단 선수 카드 저장·조회

- 사용자 확인 범위: `alpha.teameet.co.kr` 마이페이지 상단 선수 카드. 구현 변경 없이 v1 배포 코드/API를 확인했다.
- 현재 응답 헤더의 배포 커밋: `d2f1cfcb583c2e0e9de066f441eeb288871be469`, release `1.1.0-alpha.20261001.gd2f1cfcb583c`. 로컬 HEAD의 오래된 마이페이지 대신 `git show d2f1cfcb583c:<v1 path>`를 분석 기준으로 사용했다.
- Preflight: load 0.83, available memory 약 14GB, swap 사용 0. 로컬 API 없음. alpha `/api/v1/health`의 `checks.db=true`. 고부하 unit/build/typecheck는 실행하지 않았다.
- CLI persona: 기존 alpha 선수 fixture 1/24번 계정. 각 계정 로그인 후 profile/public-profile/records/card-hidden/card-shape/record-consent를 조회하고, 독립 비로그인 요청의 public-profile 결과와 대조했다. 토큰·쿠키·계정 자격증명은 메모리에만 두고 기록하지 않았다. API 검증이므로 viewport/새 screenshot은 해당 없음.
- 원본 증거: `output/playwright/visual-audit/player-card-storage-20261001/api-read-check.json`. 이번 확인은 DB 직접 SQL 조회가 아닌 실제 API 재조회 + 배포 Prisma 코드 교차검증이다.

| 항목 | 확인 결과 | 검증 수준 |
|---|---|---|
| 카드 경기 기반 데이터 | fixture 1: 카드 17경기 = 공개 기록 17경기, 원본 집계 10골·0도움. 산식으로 계산한 SHO 62 / PAS 30 / APP 87이 API와 일치. 독립 요청에서도 동일 카드 | 실제 API 대조 PASS |
| 기록 공개 잠금 | fixture 24: 공개 동의 false, 공개 후보 기록 1경기. 카드 기록 능력치가 consent 잠금이며 공개 기록 집계 0. 숫자 없음이 기록 유실을 의미하지 않음 | 실제 API 대조 PASS |
| 카드 숨김 저장 | fixture 24: false→true PATCH 200, 후속 GET에서 true, 독립 공개 프로필에서 playerCard=null. false로 복원 PATCH 200, GET 원복 및 원래 카드와 일치 | 실제 저장/재조회/원복 PASS |
| 닉네임·사진 연결 | 두 계정에서 me/profile과 public-profile의 닉네임/사진 값 일치. 두 계정 모두 사진 없음 | 조회 연결 PASS; 실제 사진 업로드/저장 미검증 |
| 카드 모양 | 두 계정 모두 rect, 후기 0건, shield 잠금. 저장 코드가 V1UserProfile.playerCardShape를 update하는 것은 확인 | 조회/코드 확인; 다른 모양 저장 미검증 |
| 프로필 저장 제한 | 두 계정의 기존 birthDate 길이 10. 현재 배포 my-api-clients.tsx:348은 값 그대로 hydrate, :543은 8자리만 허용. 이전 MY-F01 브라우저 실패와 같은 조건이 남음 | 이전 실제 실패 + 현재 배포 코드/데이터 확인; 이번 UI 저장 재실행 없음 |
| 후기 능력치 최신성 | buildPlayerCardFor는 V1UserReputationSummary.metric* 캐시를 읽음. 배포 코드 주석에 후속 리뷰 이벤트 없이 72시간이 지나 공개되는 경우 캐시 갱신 공백 명시 | 코드상 잔여 리스크; 이번 두 계정에서 실제 stale 수치를 입증한 것은 아님 |

- 저장 구조: 이름/사진/숨김/모양은 `V1UserProfile`(`v1_user_profiles`); 공개 동의는 `V1UserRecordConsent`; 공식 경기 기록은 `V1GameResultParticipant` 및 current official revision/신원 연결; 후기 능력치는 `V1UserReputationSummary`의 metric cache. 카드 총점/등급은 위 입력으로 계산하며 별도 카드 row에 저장하지 않는다.
- 후속 실행에서 테스트 fixture 24의 카드 숨김만 일시 변경했고 원복을 확인했다. 두 계정 logout 201, 메모리 cookie jar 정리. 프로필·공개 동의·경기·후기 데이터 변경 없음. 위 본 감사의 “DB 변경 없음”은 본 감사 시점을 설명하며 이 후속 fixture 원복 시험과 구분한다.
- 사용자 본인 계정을 직접 확인한 것은 아니다. 두 테스트 계정의 조회 일관성과 카드 숨김 저장을 전체 필드 저장 성공으로 확대하지 않는다. 앱 코드·schema 변경 및 migration 없음.


## Follow-up — 2026-10-01 제공된 24명 재검증 / main 승격 영향

### 요청·범위·진행판
- 요청: 제공된 선수 24명 로그인으로 Alpha에서 기존 마이페이지 findings 재검증 및 main 배포 영향 판단.
- 범위: v1 frontend/backend/infra 읽기 전용 분석, 실제 Alpha fixture QA, 본 task의 증거 갱신. 앱 구현·원격 DB 직접 수정·PR/배포 변경 없음.
- [x] 24명 로그인·인증·필수 약관 상태·할당 팀 접근을 순차 확인.
- [x] 기존 MY-F01~08 재현과 정확한 기대/실제 목적지 기록.
- [x] 운동·난이도 및 직접 선택 지역 저장→재조회→reload→원복.
- [x] 390×844 / 768×1024 / 1440×900에서 프로필·마이·설정 치수와 screenshot 확인.
- [x] main 승격 PR/CI와 prod 전환 계약 대조.
- [x] 비밀번호 복구 화면의 실제 진입·수단 선택 확인. OTP·새 비밀번호 확정은 미실행.
- [x] fixture 설정 복원·브라우저 logout·guest auth wall 확인. 전용 Chrome 종료 결과는 아래 cleanup 참조.

### 기준 / 재현 방식
- Alpha 공개 헤더: `d2f1cfcb583c2e0e9de066f441eeb288871be469`, `1.1.0-alpha.20261001.gd2f1cfcb583c`.
- 비교 후보 dev: `16a8c301fd8b9e08c7b3c959c2c974480b6d431d`. 이번 저장/복귀 관련 my frontend에는 후보 diff 없음 확인. Alpha 후속 배포는 상태 조회 시 진행 중이므로 이 실행을 후속 버전 전체의 PASS로 간주하지 않는다.
- 현재 production 공개 헤더: `f49742f4522d99eb6c0f25791904ba04278666f3`, `0.5.0`; 공개 health DB true. production 로그인/쓰기·원장/전환 영수증 조회 없음.
- 로컬 HEAD `992dba62f`와 공유 dirty tree를 배포본으로 간주하지 않음. `git show <Alpha SHA>:apps/v1_*` 및 `origin/dev` 계약 대조.
- Fixture credential CSV는 memory-only로 소비. 정상 `/auth/login` + httpOnly session cookie 사용. 인증 헤더 우회·동의 POST·password 변경·SMS 발송 없음.
- 24명 API 조회는 로그인 rate limit(10/min)을 고려해 7.5초 간격으로 직렬 실행. 브라우저는 강현우 fixture 1의 전용 visible Chrome / 9242 사용.
- Host preflight: 24 cores, load 1.21, available 14.4GB, swap 0. 로컬 app/build/test 추가 실행 없음. Docker CLI는 WSL interop 제한으로 상태 조회 실패했으나 로컬 서비스 미기동이며 실제 대상은 Alpha 공개 health 200/DB true로 확인.

### 결과

| 계약 | 처리 / 결과 | 증거 / 한계 |
|---|---|---|
| 24명 인증·팀 접근 | 24/24 PASS | 로그인 201, auth/me·profile·me/teams 200; phoneVerified/termsCompliant true, 4개 할당 팀 각각 6명 확인. 다른 QA 팀에 추가 소속된 fixture도 있음 |
| 프로필 생년월일 cohort | 24/24 값에 구분자 포함, 길이 10 | 24명 모두 같은 오류 조건. **24명 각각 저장 클릭을 완료한 것은 아님** |
| 프로필 저장 MY-F01 | FAIL, fixture 1에서 3폭 재현 | 변경 없이 `프로필 저장` → 생년월일 오류, PATCH 없음. hydrate `birthDate`가 그대로이고 검증은 8자리. 코드 + 실제 UI 증거 |
| 채팅 MY-F02 | FAIL | `/my`→`/chat`→상단 back→`/home` |
| 알림 MY-F03 | FAIL | `/my`→`/notifications`→상단 back→`/home` |
| 카드/사진 MY-F04 | FAIL | 마이 카드 설정→back `/my/settings`; 카드 사진 올리기→프로필→back `/my` |
| 리그 경기 MY-F05 | FAIL | `/my/matches/joined?type=team`→팀매치 상세 redirect→리그 fixture; from 소실, back은 리그 상세 |
| 생성 팀매치 관리 MY-F06 | FAIL | `/my/matches/created?type=team`→관리→back `/team-matches`; 상세에는 from 존재, 관리에는 없음 |
| 약관 3종 MY-F07 | FAIL 3/3 | terms/privacy/location 문서 back `/login`→로그인된 사용자 `/home` |
| 마이 비밀번호 변경 MY-F08 | FAIL | 문의 요청 alert만 뜸. `/auth/find-account`의 실제 비밀번호 재설정 UI(휴대폰·이메일)와 `/auth/recovery/*` API는 이미 존재하며 마이와 연결되지 않음 |
| 운동 정보 저장 | PASS (풋살/초보 1조합) | UI PATCH `/me/preferences` 200 → 재진입·reload → 프로필에 동일 sportName/levelName. 모든 종목·포지션 조합을 검증한 것은 아님 |
| 직접 선택 활동 지역 | PASS (서울 마포구) | UI PATCH `/me/regions` 200 → reload → UI 현재 지역과 프로필 primary 동일. GPS 권한/외부 좌표조회는 미실행 |
| 원복 | PASS | 원래 sports 0 / regions 0를 정상 `/me/preferences` API로 복원; reload 재조회 0/0 |
| logout/auth wall | PASS | logout 201; `/my` 재진입 `/login`, auth/me 401은 기대 결과 |
| 화면 치수 | PASS (마이/프로필/설정 3폭) | scrollWidth=390/768/1440 각 viewport 일치. 보이는 headed Chrome screenshot 확인. 3D 선수 카드의 compositor 캡처 제한은 이전 실행과 동일 |

추가로 실제 초대 수락/거절, 리뷰 전송, 문의 접수/답변, 공개 동의 변경, 실제 탈퇴, 실제 SMS/이메일 OTP/푸시/외부 공유는 미실행이다. Android 기기/네이티브 앱·하드웨어 back은 이번 실행에서 조작하지 않았으며, 모바일 웹 viewport 결과로 native PASS를 대신하지 않는다.

### main 배포 판단

**현 시점 승격 준비 완료로 판정할 수 없음.**

1. 사용자 우선순위대로 프로필 날짜 hydrate 정상화 → 링크/redirect의 안전한 `from` 전달 → 마이의 비밀번호 변경 연결을 해결하고 Alpha에서 재검증해야 한다. 정상 Calendar 검증은 유지하고 DB 값을 일괄 바꿔 UI 문제를 덮지 않는다. 공통 `AppBackLink`는 이미 `from`을 읽으므로 caller 링크와 리그 server redirect에서 출처·필터를 유지하는 것이 핵심이다.
2. [승격 PR #1325](https://github.com/kim-song-jun/matchup-sports-platform/pull/1325)의 후보 `16a8c301f`는 API/Web SUCCESS이나 Gates FAIL, mergeStateStatus UNSTABLE. [CI run](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874366476), `Verify release changeset`의 정확한 오류: `dev -> main promotion must not contain unreleased Changesets`. 릴리스 version/changelog 반영을 완료하고 승격 게이트를 재통과해야 한다. 단순 flaky rerun이나 changeset 삭제로 처리하지 않는다. 동일 dev push CI는 SUCCESS: [dev CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36874358056).
3. Task175 / `docs/ops/prod-task168-transition-runbook.md`와 실제 `origin/dev` 배포 스크립트는 Task168 Stage A→B 전환 및 백업·전환 영수증을 요구한다. 일반 main push는 `task168_stage=none`; production 원장에 pinned M11 적용 기록이 없으면 migrate 이전 가드에서 거부한다. Stage A/B 사이 API·워커 중단, 같은 SHA로 연속 실행·승인, M11 이후 이전 이미지로 롤백 불가가 배포 계약이다. **이번에는 production 원장/영수증을 직접 확인하지 않았으므로 현재 미적용이라고 확정하지 않는다.** 전환 완료 여부와 리허설·백업 증거를 확인해야 일반 배포 가능 여부를 결정할 수 있다.
4. Alpha fixture의 phoneVerified와 로그인 PASS는 실제 production SMS·이메일·push 서비스 검증을 의미하지 않는다.

### 증거 / QA 도구 보정 / cleanup
- Raw: `output/playwright/visual-audit/my-release-recheck-20261001/` (git ignored). `accounts-24.json`, `release-readiness-summary.json`, `priority-*`, `save-match-*`, `nested-*`, `preferences-*`, `preference-cleanup-*`, `tablet-*`, `desktop-*`, `cleanup-*`.
- 첫 profile direct navigation은 hydrate 경쟁으로 홈에 도착했고 save selector도 불일치해 테스트 무효. `/my` hydrate → 실제 profile 링크 → `프로필 저장`으로 재실행한 `save-match-04`를 유효 증거로 사용.
- 지역 저장 후 QA helper가 `regionName`을 `name`으로 읽어 1회 중단했다. 앱 저장 실패가 아니다. helper 필드명을 보정해 저장값을 확인하고 fixture owner 가드로 원복한 `preference-cleanup-01~04`를 근거로 사용.
- 로그인 전후 인증 실패를 제외한 유효 시나리오 수집에서 unexpected API 4xx/5xx, Runtime exception, 문서 가로 overflow 미관찰. console 전체 로그/장시간 socket 장애 복구는 검사하지 않았으므로 무오류 전체 인증으로 확대하지 않음.
- 전용 headed Chrome 실제 PID 15616 / PPID 13960. `/my/settings`에서 logout, guest wall 확인. 24개 API cookie jar는 계정마다 memory-only 폐기.
- 앱 소스·공유 WIP·PR·원격 배포 변경 없음. `docs/scenarios/index.md`는 다른 작업의 dirty file이므로 이번에 수정하지 않음. 본 task append를 최신 실행 허브로 사용.

- 최종 cleanup: `Browser.close` 완료, OS에서 owned PID 없음 / 9242 listen 0 확인, task profile 삭제. 이번 임시 QA runner는 위 ignored evidence 폴더로 이동해 앱/버전 관리 대상 스크립트 변경을 남기지 않음.


### 종료 직전 배포/PR 변경 재대조
- 최종 공개 Alpha는 `16a8c301fd8b9e08c7b3c959c2c974480b6d431d`, `1.1.0-alpha.20261001.g16a8c301fd8b`로 변경됨. 위 실제 브라우저/24명 API 실행은 주로 `d2f1cfcb583c` 배포에서 수행했다. 변경된 배포 및 최신 PR 후보와 이전 배포의 마이·프로필·팀매치 redirect·인증 UI·공통 back 컴포넌트 경로 diff 없음 확인. **새 배포 전 기능을 다시 브라우저 검증했다고 주장하지 않는다.**
- PR #1325 최종 조회 후보는 `f8b63fe7d58ddb30dee3338631e96c78dd619fe1`, mergeStateStatus UNSTABLE. 최신 [CI run 36876964312](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/36876964312)의 Gates job `110418955345`도 `Verify release changeset` FAIL, 오류는 동일한 `dev -> main promotion must not contain unreleased Changesets`. 최신 API/Web은 진행 중이므로 이전 후보의 성공을 최신 후보 성공으로 올리지 않는다.
- 최신 후보는 대회 round-label seed/backfill 및 prod 전환 런북 변경을 포함한다. 이 작업의 마이 저장/복귀 수정은 포함하지 않는다. 배포 일정 확정 전 최신 런북과 CI를 다시 고정해야 한다.


## 2026-10-01 수정·dev 배포·재검증

범위: v1 frontend, 회귀 테스트, changeset, QA 문서. 기존 API 재사용; DB 변경 없음.
기준: origin/dev f8b63fe7d, 격리 브랜치 fix/my-profile-return-password.

### Acceptance Criteria
- [x] 구분자가 있는 생년월일도 정상 표시·8자리 저장; 잘못된 날짜는 거절.
- [x] 채팅·알림·선수 카드·사진 수정은 출발 화면으로 복귀.
- [x] 참여 리그 경기·생성 매치 관리는 내 목록과 type 필터로 복귀.
- [x] 약관 3종은 약관 목록으로 복귀.
- [x] 비밀번호 변경은 기존 본인인증 재설정 화면에 진입하고 설정으로 복귀.
- [ ] 좁은 회귀 테스트·타입·패턴 검사 및 Copilot 리뷰 통과.
- [ ] dev PR 머지·Alpha 배포 SHA 확인 후 실제 계정 브라우저 재검증.

### Owned / Forbidden
Owned: 관련 apps/v1_web 컴포넌트·라우트·테스트, 이 task, docs/scenarios, .changeset.
Forbidden: 공유 작업트리 WIP, main 승격, API/DB/fixture reset, 실제 탈퇴·SMS/푸시 발송.

### Progress Snapshot
구현 완료, 로컬 회귀 12파일 148테스트 통과(기존 서버 route 테스트 3개 포함).
생년월일 RED: 기존 구분자 값이 이중 구분자로 표시되어 실패 → 수정 후 정상 표시·PATCH payload 통과.
TypeScript tsc --noEmit 오류 0, v1 패턴 검사 통과. 관련 TODO/FIXME/HACK/XXX 없음.
격리 의존성 설치 과정은 lockfile을 변경하지 않았다. 공유 작업트리 변경은 포함하지 않는다.
공개 약관·설정발 비밀번호 화면도 AppBackLink history/replace 계약으로 복귀한다.
리뷰에서 확인된 계정 맥락 오해를 해소: 설정발 재설정은 로그인한 계정의 휴대폰/이메일과 일치해야 새 비밀번호를 입력·저장한다.
기존 재설정 API와 세션 정책은 변경하지 않는다.
첫 Web CI는 공통 셸 테스트의 nullable searchParams에서 실패했다. 알림 링크에서 nullable 경로를 처리하고 셸 15개 회귀를 통과시켰다.
PR 재리뷰 및 배포·재검증 대기.

### Security / Ambiguity
복귀 경로는 sanitizeRedirectPath/withFromPath 기존 보호를 재사용한다.
비밀번호 변경은 본인 확인 후 서버 reset API를 사용하는 기존 흐름을 연결한다.
Android 네이티브 및 실제 인증번호·비밀번호 변경은 웹 진입/취소 검증과 구분해 기록한다.
