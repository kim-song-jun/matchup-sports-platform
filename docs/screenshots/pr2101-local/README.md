# PR #2101 로컬 리뷰 증거 — 2026-11-04

사용자 명시 요청으로 로컬 Next 화면을 headed Chromium에서 캡처했다. **테스트 API 데이터이며 실제 로그인·DB 저장·서버 권한 검증 또는 Alpha 배포 증거가 아니다.** 실제 사용자·대회·배정·세션을 사용하지 않았다.

- 최종 코드: `5030fd8f9df2ababed43d2e9e524c1801390fa77`(최신 dev 4a22824a5 통합).
- 설치된 로컬 Next는 16.2.10으로 manifest의 16.3.8과 차이가 있다. 의존성 버전 변경은 커밋하지 않았다.
- 변경 전 6장 + 변경 후 18장 = 24장. 390/768/1440 세 폭을 모두 확인했다. 변경 후 document 가로 overflow 0/18, pageerror 0.
- 로컬 사용자 여정: 담당 목록 → 관리 개요/정보 → 운영 화면·모바일 메뉴 → 같은 대회 관리 복귀. 공개 전환 버튼 활성 확인 → fixture 503 → 실제 오류 문구 표시, 성공 문구 없음.
- 관리 섹션 수동 렌더는 개요/대회 정보 2/10이다. 나머지 8개 섹션의 저장 성공을 이 캡처로 주장하지 않는다. Alpha 신규 관리 검증은 0/10·0/3 상태를 유지한다.
- API 9 suite/148 tests, API/Web tsc, API surface/Web pattern PASS. 웹 수정 5 files/65 tests PASS, dev 통합 후 셸 25 tests PASS. API 추가 회귀는 실제 AdminContextService를 통해 담당 조회 허용/타 대회 및 해제 배정 거부를 검사한다.

## Console / network 판정

`after-evidence.json`에 console/network와 API 요청을 남겼다. 실시간 API 미기동으로 `/socket.io/` 500이 발생한다. 비공개 대회의 공개 상세는 fixture 404이며, 셸 제목/종류는 자기 배정 데이터로 유지된다. 하위 운영 화면의 공개 상세 의존 자체는 이번 수정에서 제거하지 않았다. 공개 설정 클릭의 503은 실패 표시 확인용으로 의도한 응답이다. 이 오류들을 숨기거나 전체 런타임 PASS로 표시하지 않는다.

## 화면

| 장면 | 모바일 390 | 태블릿 768 | 데스크톱 1440 |
|---|---|---|---|
| 운영 셸 · 수정 전 | ![운영 셸 · 수정 전 390](./before-operations-390.png) | ![운영 셸 · 수정 전 768](./before-operations-768.png) | ![운영 셸 · 수정 전 1440](./before-operations-1440.png) |
| 공개 설정 · 수정 전 | ![공개 설정 · 수정 전 390](./before-visibility-overview-390.png) | ![공개 설정 · 수정 전 768](./before-visibility-overview-768.png) | ![공개 설정 · 수정 전 1440](./before-visibility-overview-1440.png) |
| 담당 목록 · 수정 후 | ![담당 목록 · 수정 후 390](./after-management-list-390.png) | ![담당 목록 · 수정 후 768](./after-management-list-768.png) | ![담당 목록 · 수정 후 1440](./after-management-list-1440.png) |
| 관리 개요 · 수정 후 | ![관리 개요 · 수정 후 390](./after-overview-390.png) | ![관리 개요 · 수정 후 768](./after-overview-768.png) | ![관리 개요 · 수정 후 1440](./after-overview-1440.png) |
| 대회 정보 · 수정 후 | ![대회 정보 · 수정 후 390](./after-info-390.png) | ![대회 정보 · 수정 후 768](./after-info-768.png) | ![대회 정보 · 수정 후 1440](./after-info-1440.png) |
| 운영 셸 · 수정 후 | ![운영 셸 · 수정 후 390](./after-operations-390.png) | ![운영 셸 · 수정 후 768](./after-operations-768.png) | ![운영 셸 · 수정 후 1440](./after-operations-1440.png) |
| 운영 메뉴 · 수정 후 | ![운영 메뉴 · 수정 후 390](./after-operations-menu-390.png) | ![운영 메뉴 · 수정 후 768](./after-operations-menu-768.png) | ![운영 메뉴 · 수정 후 1440](./after-operations-menu-1440.png) |
| 실제 저장 실패 안내 · fixture 503 | ![실제 저장 실패 안내 · fixture 503 390](./after-visibility-error-390.png) | ![실제 저장 실패 안내 · fixture 503 768](./after-visibility-error-768.png) | ![실제 저장 실패 안내 · fixture 503 1440](./after-visibility-error-1440.png) |

## 수명주기

최종 headed Chromium PID/부모 PID: 13658/13610. 최종 capture context/browser/server 종료 확인. 로컬 Next는 이번 작업 소유 프로세스만 종료한다. 원본 공유 작업트리와 그 서버/브라우저는 변경하지 않았다.

재현: 격리 소스에서 로컬 Next를 포트 3023에 실행한 뒤 `node scripts/qa/capture-pr2101-local.cjs after`. fixture 외 API는 501로 드러내고, 실제 저장을 성공으로 시뮬레이션하지 않는다. `before`와 `before-visibility`는 각각 해당 수정 전 소스에서만 재현한다.
