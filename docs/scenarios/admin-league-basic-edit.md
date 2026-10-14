# 어드민 리그 기본 정보 수정

Task: [20261075](../../.github/tasks/20261075-admin-league-basic-edit.md)
Status: 로컬 검증 PASS, alpha 변경 후 화면 검증 대기

## 시나리오
1. owner/ops로 alpha 로그인 → 어드민 리그 상세 → **리그 수정**. URL의 리그명/설명/지역/한국 시간 기간/신청 마감이 실제 값인지 확인해요.
2. 이름·운영 안내 수정 후 저장 → 상세 복귀 → 공개 상세 운영 안내 확인 → 다시 수정 진입해 영속 값을 확인해요.
3. 두 창에서 동일 리그 열기 → 한 창 저장 → 다른 창 저장 시 409 및 초안 보존 → 최신 정보 다시 불러오기 확인창에서 취소/확인해요.
4. 기존 경기를 제외하는 기간 변경은 오류를 보여주고 초안과 실제 일정을 보존해요.
5. 신청 마감 삭제 후 저장 → 신규 신청이 닫히고 기존 신청은 보존돼요. 과거 마감으로 변경하면 오류예요.
6. support는 수정 버튼이 없고 직접 수정 URL에서도 읽기 전용이에요. PATCH 403을 확인해요.
7. 초기 조회 실패는 재시도, 저장/재조회 실패는 입력 보존. 390/768/1440에서 overflow/focus/console/network와 스크린샷을 기록해요.

## 검증 증거
- 실제 HTTP/격리 DB: `test/league-matches/league-settings.integration-spec.ts`.
- 실제 hook + MSW: `edit/league-settings-client.test.tsx`; 상세 수정 링크 회귀 테스트.
- before: 실제 ops 로그인, 리그 상세 390/768/1440에서 수정 entry 없음. overflow/pageerror/console error/관리 API 실패 0. `docs/screenshots/admin-league-basic-edit/before-*`에 증거 보존. 새 edit route 자체는 기존에 없어 baseline 없음.
- 변경 전 headed 브라우저 PID 33733 → chrome 33761, 종료 완료. 변경 후 저장·충돌·입력 보존·원복 및 3폭 검증은 배포 후 실행해요.

- 로컬 최종 결과: DTO 17, 실제 HTTP/DB 3, 상세 103, 수정 폼 6, 공개 상세 61 = 190 PASS. API/web tsc 및 surface/pattern PASS. 격리 DB 종료 완료.
