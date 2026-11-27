# 대진 상단 초기화 버튼

Status: PR #2557/#2558 merged; Alpha verified (2026-11-27)
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
- 기존 #2553은 dev 머지와 Alpha5유형×3폭을 완료했다([갤러리](https://github.com/kim-song-jun/matchup-sports-platform/pull/2553#issuecomment-7210821954)). 아래 후속의 직접 입력·감사 상세 판정과 구분한다. 로컬 next 서버는 실행하지 않았다.
- 사용자 대회 초기화·DB seed/reset 실행 없음. 테스트 외 사용자 데이터 변경 없음.

## 2026-11-27 후속: 직접 입력 확인 및 감사 상세

- 최종 배포 `8208a35887f1e6e418e3e134f9054842c837f171`에 #2557/#2558 포함 확인. 배포45989080002/CI45989079714 성공, health200/db=true. 단일 플랫폼 관리자 persona, ego-browser 정상 로그인으로 상단·복수 결선 설정창 × 390/768/1440 = 6/6 PASS.
- 빈 값·오타·앞뒤 공백은 실행 불가, 정확 입력만 활성화, 취소 POST0·재진입 비움. 모달 focus 내부·가로 overflow0·입력50px/버튼44px. 잘못된 API 요청3건400과 대진/성공 감사 보존을 확인했다. 실제 UI 초기화3회(상단2회·설정창1회) 후 대진0, 마스터 감사3건·경기별 삭제 감사12건에서 처리자/시각/확인 문구/원본/결과를 실제 관리자 API로 확인했다. 최종 상단/설정창 감사에 TeamMatch 자리 연결·Game 공개 정책 및 일정 스냅샷 필드도 확인했다. 기능 흐름 console/uncaught/의도하지 않은 HTTP 오류0.
- 실DB226 suites/1722 tests(3 skip) 및 API580 suites/9695 tests, 최신 head42f2610bc의 CI45953663094 Gates/API/Web PASS. 비어 있지 않은 일정/게스트 모집의 CANCELLED/CLOSED 전이, 공개 정책 이전 원본과 STATUS_ONLY/lineupAt 해제, 최종 마스터 감사 실패 전체 rollback을 실제 PostgreSQL로 검증했다. Alpha는 신청/연결 일정0인 전용 대회이므로 해당 DB 검증과 구분한다.
- 전용 테스트 대회2개 모두 cancelled + private로 보관. 기존 사용자 대회 변경0, Game/감사 기록 물리 삭제0. 자격증명·쿠키·원본 감사 개인정보는 공개 증거에 저장하지 않았다. QA 스크립트 입력 locator 오류는 실제 CSS 입력 선택자로 바로잡아 검증했고 제품 실패로 집계하지 않았다.
- 사용자가 #2557/#2558 각각 Copilot 예외를 명시 승인했다. 리뷰 미생성을 clean으로 표시하지 않았다. 재진입 첫 프레임 경합은 key로 제거했고 별도 세션의 테스트 관측 대기 보정은 보존했다. 최종 이미지/판정 JSON은 `docs/visual-qa/pr2557`, `docs/visual-qa/pr2558` 및 같은 두 PR의 SHA 고정 갤러리에 보관한다.

- 상단 버튼 외 복수 결선 설정창에서도 빈 값/오타가 실행 불가하고 정확 입력만 기존 reset endpoint에 저장되는지 검증한다. 서버 문구 누락 거절 및 `tournament.multi_finals.reset`의 공통 전체 bracketState 감사 보존도 확인한다.

- 모달 빈 입력/오타/앞뒤 공백은 실행 비활성, 정확히 초기화한다 입력 후에만 실행. 취소는 POST0, 재진입 시 입력 비움.
- 서버 DTO와 service는 확인 문구 누락/오타를 거절한다. 실제 PostgreSQL에서 감사 처리자/시각/확인 문구/전체 before 상태 및 결과 ID를 확인한다.
- 최종 reset 감사만 강제로 실패시켜 앞선 경기별 삭제와 감사까지 모두 rollback되는지 확인한다.
- 직접 입력/감사 후속의 최종 판정은 위 증거를 따르며 기존 #2553 초기 구현 검증과 구분한다.
