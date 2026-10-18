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

## 최종 검증 — 2026-10-18

[#1960](https://github.com/kim-song-jun/matchup-sports-platform/pull/1960) 및 alpha에서 발견한 후보 결함의 [#1971](https://github.com/kim-song-jun/matchup-sports-platform/pull/1971)을 dev에 머지했다. 최종 alpha SHA `e60c8576c41f6e149c014c6caed2489986a15f42`. [dev CI](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39116929627) / [배포](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39116929623) SUCCESS, served header 및 DB health 확인. main 승격 없음.

| 흐름 | 1440 | 768 | 390 | 증거 |
|---|---|---|---|---|
| 목록↔그림 번호·문구·시각·등록 필드 / 자동 복원·비우기·새로고침 | PASS | PASS | PASS | [metadata](../screenshots/bracket-display-edit-20261018/metadata-evidence.json) |
| 빈 BYE 문구·팀 / 연결8강 목록 공유 / 원복 | PASS | PASS | PASS | [BYE](../screenshots/bracket-display-edit-20261018/bye-evidence.json) |
| 기존 저장 경기장 표시·가로 넘침/카드 겹침 없음 | 42경기 PASS | 42경기 PASS | 12강4+BYE4 PASS | [기존 대회](../screenshots/bracket-display-edit-20261018/existing-evidence.json) |
| 새 배포 후 팀 이름 우선·metadata null·진출 유지 | PASS | PASS | PASS | [재배포 유지](../screenshots/bracket-display-edit-20261018/persistence-evidence.json) |

실제 점수 확정으로 승자→결승·패자→3위전, 12강→8강 진출을 확인했다. 출처99번 변경 후 직접 입력 문구 유지, 자동 문구 최신화, ID/edge 보존, 의도적 저장503의 입력 유지/재시도 PASS. [결과 증거](../screenshots/bracket-display-edit-20261018/result-evidence.json). BYE는 슬롯 팀 저장 성공 뒤 경기 PATCH503을 의도적으로 주입해 부분 실패 안내와 입력 유지·재시도까지 확인했다. 두 의도적503 외 예상치 못한 제품 JS/network 오류는 없었다. 마지막 추가 확인 중 CloudFront HTML403이 발생했으나 요청 휴식 후 공개200으로 회복했다. BYE 자동 복원 버튼도3폭 PASS: 공유 문구null·팀 유지. 모바일 진입 ERR_ABORTED는 새 headed 세션에서 PASS했다. [복원 버튼 증거](../screenshots/bracket-display-edit-20261018/bye-restore-evidence.json).

main/dev 모두 `serializeTournamentTeamMatchBracket`의 TeamMatch.startAt/placeName/fieldId를 조회한다. 원인은 그림 카드 일정 footer 누락과 빈 시각 PATCH 누락이었다. 별도 canvas 저장소 없이 canonical 값을 표시하고 null을 명시 저장한다. 기존 대상은 field42/42·시각0/42이므로 저장 시각 무입력 표시는 별도 QA 대회에 배포 전 저장된 시각으로 검증했다.

후속 결함: 조별 ENTRY의20팀을 모든 자리 후보에서 전역 제외해 빈 BYE 후보가0개였다. 서버 `assertPlaceable` 기준 공용 계산으로 목록·패널·mobile·BYE를 맞췄다. 실제 후보 선택 회귀2건 RED→관련170 tests GREEN, tsc/pattern PASS. PR1971 CI에서 DB169 suites/1,249 PASS(3 skip), API427 suites/6,520 PASS, Web805 files/9,427 tests 및 build PASS. 기존 auth/잠금은 변경하지 않았고 권한 회귀는 자동 테스트로 확인했다(별도 support 계정 수동 로그인은 실행하지 않음).

Copilot은 두 PR 모두 GitHub 모델 사용 불가로 분석 전에 실패했다. 사용자가 #1960과 #1971 각각 예외를 승인했다. clean 리뷰로 표기하지 않는다.

## Cleanup / 재현 메모

- 기존 대회42경기와 전체 슬롯의 번호·시각·필드·팀·문구·진출 연결은 최초 snapshot과 동일하다. BYE 임시 변경은 각 실행 finally에서 원복했다.
- 신규 비공개 QA 대회 `1705ff18-f181-4c6c-96d9-d448d6d2b546`에만 결과를 확정했다. 이력 보존을 위해 삭제/seed/reset 없이 비공개로 유지한다.
- headed Chromium PID/PPID 기록, 각 finally에서 브라우저 종료. 인증정보는 저장소/PR에 기록하지 않았다.
- 768 sheet의 중복 aria label, EntityPicker 검색 메뉴가 열린 상태의 버튼 가림은 QA 선택자/동작을 수정한 뒤 실제 클릭으로 검증을 완료했다. 실패를 강제 클릭으로 숨기지 않았다.
- before/after PNG 및 JSON은 [증거 폴더](../screenshots/bracket-display-edit-20261018/)에 있다. 갤러리는 원 PR에 SHA 고정 raw URL의200 확인 후 게시한다.
