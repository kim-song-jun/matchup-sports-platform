# Teameet v1 이벤트 허브·대회 사용자 시나리오 QA 보고서

대상 독자: 서비스 기획·디자인·운영  
검증 환경: local `dev` Web `3013` / API `8121` / 기존 local dev PostgreSQL  
상태: 브라우저 시나리오·22개 화면 증거·순차 코드 검증 완료, 최종 리뷰·main 통합 진행 중

## 1. 이번 검증에서 확인할 것

- production DB는 읽기 전용 snapshot으로만 가져오고 production에는 어떤 데이터도 쓰지 않는다.
- 복원된 local dev DB에 실제 대회 2건을 유지한 채 이벤트 캠페인 2건을 추가한다.
- 이벤트 허브에서 목록, 종목 필터, 캠페인 상세, 뒤로가기 필터 복원, 참가 신청 진입까지 실제 사용자 속도로 확인한다.
- 로딩, 눌림 반응, 화면 전환, 오류와 재시도, 버튼 비활성화, 같은 순간의 연속 클릭을 확인한다.
- 모바일 390×844, 태블릿 768×1024, 데스크톱 1440×900에서 결과를 캡처한다.
- production에서 복제된 비공개 사용자 정보는 조회·캡처·문서화하지 않는다.

## 2. 데이터 기준

| 항목 | 확인 결과 |
|---|---|
| production DB | 약 14.8MB, 2026-07-17 snapshot 기준 성공 migration 40개 |
| local DB 작업 전 | 약 15.6MB, 성공 migration 54개, campaign 0개; custom-format rollback backup 검증 완료 |
| local DB 복원 후 | production snapshot을 기존 local DB에 복원한 뒤 저장소 migration 17개 적용, 성공 migration 이름 57개 |
| production 공개 대상 대회 | 풋살 2건: 혼성부 1건, 남자부 1건 |
| 이벤트 캠페인 | local-only `dev-event-*` slug 2건 published; 2차 실행은 생성 0·갱신 2로 중복 없음 |
| 이벤트 이미지 | 저장소의 검증된 종목별 실사 mock을 local ignored `/uploads/dev-events/`에 복사 |
| local QA 사용자 | `윤하늘` (`event.qa@teameet.local`), production 사용자와 무관한 고정 ID |
| local QA 팀 | `청라 블루웨이브 FC`, 풋살·인천 서구·팀장 권한·sample 신뢰 상태 |
| 인증 방식 | local dev의 실제 header-auth 계약을 쓰는 브라우저 session storage; production에서는 비활성 |
| production 쓰기 | 없음 |

시드는 opt-in 없이 먼저 실행해 mutation 전에 거부되는 것을 확인했다. 이후 loopback local DB와 `V1_ALLOW_LOCAL_EVENT_SEED=true`를 함께 지정한 첫 실행은 campaign 2건을 만들었고, 두 번째 실행은 같은 2건을 갱신했다. SQL 집계는 managed campaign 2, distinct slug 2, QA user/team/owner membership 각 1을 반환했다. 추가 보안 검토에서 loopback SSH tunnel 가능성을 닫기 위해 compose/Makefile의 canonical local DB 이름 `teameet_v1_dev`까지 일치해야 실행되도록 강화했다. production 기본 DB `teameet_v1`은 mutation 전에 거부된다.

## 3. 사용자 시나리오

| ID | 사용자 행동 | 확인 기준 | 상태 |
|---|---|---|---|
| EVT-01 | 이벤트 허브 최초 진입 | skeleton 뒤 카드 2건, 깨진 이미지·가로 넘침·콘솔 오류 없음 | PASS |
| EVT-02 | 풋살 필터 선택 | 선택 상태가 명확하고 카드 수·내용이 일치 | PASS |
| EVT-03 | 혼성부 이벤트 카드 누름 | 눌림 반응 후 캠페인 상세로 1회 이동 | PASS |
| EVT-04 | 상세의 FAQ 열고 닫기 | native disclosure 열림, 포커스·텍스트 잘림 없음 | PASS |
| EVT-05 | 뒤로가기 | `/events?sport=futsal` 복귀, 풋살 필터 유지 | PASS |
| EVT-06 | 남자부 이벤트 상세 | 일정·장소·참가비·상금과 원본 대회 데이터 일치 | PASS |
| TOURN-01 | 참가 신청 CTA | local QA 팀 선택부터 결제 안내까지 dead end 없음 | PASS |
| TOURN-02 | 팀 선택 다음 버튼 연속 클릭 | 800ms 지연 환경에서 registration create 요청 1회 | PASS |
| TOURN-03 | 최종 신청 확인 연속 클릭 | submit 요청 1회, 모달·버튼 모두 `신청 중…` 비활성 | PASS |
| TOURN-04 | 참가 취소·철회 연속 클릭 | cancel 요청 1회, withdraw 요청 1회, 처리 중 비활성 | PASS |
| ERR-01 | 이벤트 최초 요청 실패 | 한국어 오류 설명과 재시도 노출, 재시도 후 카드 2건 | PASS |
| ERR-02 | 다음 페이지 요청 실패 | 현재 실제 데이터는 2건이라 다음 cursor 없음; 기존 목록 유지·부분 실패 UI를 focused test로 검증 | PASS (focused test) |

## 4. 발견·개선 기록

### 중복 제출 방지

React Query의 `isPending`은 클릭 이벤트 직후 같은 tick 안에서는 아직 바뀌지 않을 수 있다. 대회 신청 시작, 최종 제출, 참가 취소, 취소 철회에 동기 `useRef` 잠금을 추가해 첫 요청이 끝나기 전 후속 호출을 차단했다.

실화면 검증에서는 버튼을 빠르게 두 번 누르고 해당 API request count가 정확히 1인지 확인한다. 검증용 local QA row는 정확한 ID로 기록하고 시나리오 종료 후 정리하거나, 보고서에서 유지 이유를 명시한다.

실제 800ms 지연 네트워크에서 팀 선택 create, 최종 submit, 취소 요청은 각각 한 번만 기록됐다. 철회도 한 번만 기록됐다. 두 차례 생성된 QA registration, 연관 payment, 접수 notification은 각 ID를 기록한 뒤 exact transaction으로 삭제했고, 종료 집계는 registration 0·notification 0이다.

### 종목명 한국어 조사

첫 남자부 캠페인 실화면에서 소개 문구가 `풋살를 좋아하는`으로 노출됐다. seed 문구가 모든 종목명 뒤에 `를`을 붙이던 원인이므로, 마지막 한글 음절의 받침 유무를 계산해 `풋살을`·`축구를`처럼 `을/를`을 선택하도록 수정했다. 시드 재실행과 같은 상세 페이지 재검증으로 닫는다.

### 접근성 단계 안내와 취소 상태 문구

참가 신청 2단계의 시각 배지는 `2/3`으로 맞았지만 스크린리더 status가 `2단계 중 3단계`로 역순이었다. `3단계 중 2단계`로 수정하고 HMR 이후 실제 접근성 snapshot에서 확인했다. 또한 결제 상태가 `결제 대기`인 취소 요청 화면이 `입금이 확인됐어요`라고 상충되게 안내하던 문제를 고쳐, 취소 검토 중에는 결과 안내 전 추가 입금을 하지 말라고 명확히 표시한다.

### 네트워크 오류 문구

캠페인 최초 요청을 브라우저에서 차단했을 때 저수준 영문 `Failed to fetch`가 그대로 노출됐다. 이벤트 화면에서 transport 오류만 한국어 안내로 정규화하되 API가 보낸 의미 있는 도메인 오류는 유지하도록 수정했다. 차단 해제 후 `다시 시도하기` 한 번으로 카드 2건이 복구됐다.

### 순차 코드 검증과 빌드

모든 자동 테스트는 서로 겹치지 않게 실행했다. API 변경 unit 범위는 첫 실행에서 19 suite·329 test가 통과하고 2 suite의 fixture/metadata 계약 오류 3건을 발견했으며, 계약을 현재 구현에 맞춘 뒤 해당 2 suite 36/36과 추가 controller 3/3이 통과했다. 공개 대회 상세의 `coverImageUrl` 전달 회귀 테스트도 별도로 15/15 통과했다.

Web 변경 범위는 37 test file·237 test가 단일 worker, file parallelism 비활성으로 모두 통과했다. 타입 오류 정리 뒤 Web `tsc --noEmit`, API `tsc`와 Nest build, Web Next production build가 모두 성공했다. Next build의 첫 시도는 Turbopack 하위 프로세스가 PATH에서 `node`를 찾지 못해 코드 컴파일 전 `ENOENT`로 중단됐고, 같은 설치 Node 경로를 PATH에 넣은 재실행은 compile·TypeScript·79개 static page 생성을 완료했다. 빌드 뒤 Web을 webpack dev mode 3013에 다시 올렸고 `/events`와 캠페인 API는 각각 HTTP 200이다.

타입체크가 추가로 드러낸 실제 계약 누락 두 건도 같은 변경에서 닫았다. 관리자 생성 4단계의 홍보 우선순위 오류 상태를 `PresentationStep`에 전달했고, 공개 대회 상세 presenter가 DB의 `coverImageUrl`을 응답에서 빠뜨리던 문제를 API 응답·Web 타입·회귀 테스트까지 동기화했다.

### 라우팅·SEO·폰트 런타임 재확인

최종 dev runtime에서 `/home`은 200, 제거 대상 브라우저 alias `/v1/home`은 404, API `/api/v1/health`는 200을 반환했다. `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`도 각각 200이다. Web source에는 `/v1/*` browser route push/replace/redirect나 `basePath`가 남아 있지 않으며 backend의 `/api/v1` prefix만 유지한다.

전역 `@font-face`는 local `/fonts/PretendardVariable.woff2`를 로드하고 `--font`, `--font-sans`, `--font-mono`의 첫 폰트를 모두 Pretendard로 통일한다. 22개 실제 브라우저 캡처의 computed body font도 Pretendard stack으로 확인했다. 뒤의 시스템 폰트 목록은 다운로드 실패 시 글자가 사라지지 않게 하는 렌더링 안전망일 뿐 기본 선택은 아니다.

## 5. 스크린샷 인덱스

최종 증거 경로:

`output/playwright/visual-audit/session-handoff-2026-07-14/event-hub-prod-clone-2026-07-16/`

아래 22개 상태를 빠짐없이 fresh capture한다. 실제 transition이 있는 pressable 요소는 `rest → mid(약 100ms) → settled` 프레임을 확인하고, native `<details>` FAQ처럼 transition이 없는 요소는 닫힘/열림의 두 settled 상태만 확인한다.

| # | 예정 파일 | 화면·상태 | 뷰포트 | 판정 |
|---:|---|---|---|---|
| 01 | `01-events-list-390x844.png` | 이벤트 허브 전체 목록 | 390×844 | PASS |
| 02 | `02-events-list-768x1024.png` | 이벤트 허브 전체 목록 | 768×1024 | PASS |
| 03 | `03-events-list-1440x900.png` | 이벤트 허브 전체 목록 | 1440×900 | PASS |
| 04 | `04-events-futsal-390x844.png` | 풋살 필터 선택 | 390×844 | PASS |
| 05 | `05-events-futsal-768x1024.png` | 풋살 필터 선택 | 768×1024 | PASS |
| 06 | `06-events-futsal-1440x900.png` | 풋살 필터 선택 | 1440×900 | PASS |
| 07 | `07-mixed-campaign-390x844.png` | 혼성부 캠페인 상세 | 390×844 | PASS |
| 08 | `08-mixed-campaign-768x1024.png` | 혼성부 캠페인 상세 | 768×1024 | PASS |
| 09 | `09-mixed-campaign-1440x900.png` | 혼성부 캠페인 상세 | 1440×900 | PASS |
| 10 | `10-male-campaign-390x844.png` | 남자부 캠페인 상세 | 390×844 | PASS |
| 11 | `11-male-campaign-768x1024.png` | 남자부 캠페인 상세 | 768×1024 | PASS |
| 12 | `12-male-campaign-1440x900.png` | 남자부 캠페인 상세 | 1440×900 | PASS |
| 13 | `13-event-card-rest-390x844.png` | 이벤트 카드 누르기 전 | 390×844 | PASS |
| 14 | `14-event-card-press-mid-390x844.png` | 실제 pressable 전환 중 | 390×844 | PASS (transition-only) |
| 15 | `15-faq-open-settled-390x844.png` | FAQ 열림·포커스 | 390×844 | PASS |
| 16 | `16-filtered-back-390x844.png` | 상세 뒤로가기 후 풋살 필터 복원 | 390×844 | PASS |
| 17 | `17-apply-team-rest-390x844.png` | 참가 신청 팀 선택 | 390×844 | PASS |
| 18 | `18-apply-team-pending-390x844.png` | 빠른 연속 클릭 직후 처리 중 | 390×844 | PASS |
| 19 | `19-apply-submit-pending-390x844.png` | 최종 제출 연속 클릭·처리 중 | 390×844 | PASS |
| 20 | `20-registration-cancel-pending-390x844.png` | 참가 취소/철회 처리 중 | 390×844 | PASS |
| 21 | `21-events-error-390x844.png` | 최초 요청 실패·재시도 CTA | 390×844 | PASS |
| 22 | `22-events-retry-settled-390x844.png` | 재시도 후 정상 목록 | 390×844 | PASS |

각 PNG는 signature, 치수, black/partial compositing 여부를 확인하고, 같은 화면의 콘솔·네트워크·가로 overflow·computed Pretendard 결과를 함께 기록한다.

검사 결과 22/22가 실제 PNG signature와 표의 정확한 치수를 가졌다. 5% near-black connected-component 검사에서 가장 큰 연결 영역은 전체 픽셀의 0.7% 미만으로, 과거 증거에 나타났던 큰 검정 합성 사각형이 없었다. 모든 settled 화면의 가로 overflow는 0이며 body computed font는 Pretendard stack이다. 14번은 실제 mouse press와 release 사이의 전환 프레임이므로 settled 레이아웃 판정에는 사용하지 않는다.

## 6. 최종 판정

DB 복원, local event seed, 22개 실제 브라우저 상태, 실제 registration lifecycle과 exact cleanup, 변경 범위 API/Web 테스트, 양쪽 typecheck/build는 PASS다. 사용자는 2026-07-17에 호스트 부하를 중단 조건에서 제외하되 모든 테스트를 순차 실행하라고 명시했고 모든 자동 테스트 명령을 겹치지 않게 실행했다. 남은 최종 판정 게이트는 보안·코드·시각 리뷰, 최신 main 통합, 최종 schema diff와 임시 dump cleanup이다.
