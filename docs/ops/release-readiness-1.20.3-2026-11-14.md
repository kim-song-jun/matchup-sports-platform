# 2026-11-14 — main 승격 준비 (manifest 1.20.3)

Status: Prepared PR — dev 버전 PR 검증/반영 및 새 Alpha 확인 대기. main PR·머지·운영 승인 미실행.

## 고정 범위

- 기능 기준: dev `ac0382c89cf81d7aab1b87f2ae051981bb52e706`, Alpha `1.20.3-alpha.20261114.gac0382c89cf8`.
- main 기준: `900539b7c5c7a70fd9fb9e823a6d0cea9fdf7896`, manifest API/Web `1.20.1`. main-only 미반영 커밋 0개.
- 공식 준비 workflow [43579716865](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43579716865) SUCCESS → dev 버전 PR [#2394](https://github.com/kim-song-jun/matchup-sports-platform/pull/2394).
- 공식 버전 커밋 `b9fd88c47738d57814bce2b3b929eed0c254c39f`: Changeset `rosterless-tournament-operations.md` 1개 소비, API/Web `1.20.2 → 1.20.3`, 양쪽 CHANGELOG 동기화. 나머지 수정은 이 준비 문서와 기존 task의 진행 기록이다.
- 기존 dev의 로그인 임시 프로필 정리, 개인정보 로그 마스킹, SEO/공개 주소/미리보기 이미지/검색 크롤링/약관 HTML, 대회 진출·시상·명단·쉘 링크 수정과 #2392의 빈 명단 익명 운영이 포함된다. 이번 요청을 #2392만의 선택적 hotfix로 해석하지 않는다.
- 아직 열려 있는 다른 기능 PR은 포함하지 않는다. dev가 이후 바뀌면 최종 SHA와 범위를 다시 고정한다.

## 버전과 DB 영향

- 후보 manifest: API/Web **1.20.3**. 미소비 Changeset **0개**.
- 현재 resolver는 미소비 Changeset이 없어도 patch를 더하므로 이 후보의 예상 배포 표시는 **운영 1.20.4 / Alpha 1.20.4-alpha.20261114.g<최종SHA앞12자리>**다. manifest와 배포 버전을 혼동하지 않는다.
- main 및 실제 운영 SHA `17ae2d713db40a2b50dfa1266941a4ddc3afd950` 대비 Prisma schema/migration 변경 **0개**. DB reset/seed·수동 데이터 변경·Task168 전환 재실행을 요구하지 않는다.
- 이번 버전 PR은 앱 동작·의존성·잠금 파일·배포 워크플로를 바꾸지 않는다. 기능 기준 ac0382c89와 런타임 파일이 동일해야 한다.

## 검증 증거와 한계

- 기능 dev CI [43573354566](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43573354566): Gates/API/Web SUCCESS.
- 기능 Alpha 배포 [43573354547](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43573354547): SUCCESS, 공개 landing HTTP200·SHA일치, health HTTP200·DB true 확인.
- #2392: API 서비스 114개 + 프론트 관련 117개 통과, 타입/표면/패턴 검사 통과. DB 통합의 빈 홈/원정/양쪽 명단 시작→익명 득점→종료·가상 선수 비생성 회귀는 CI에서 통과했다.
- 실제 로그인한 익명 경기 운영, ego-browser 390/768/1440 스크린샷은 미검증이다. 자동 검사·배포 성공을 브라우저 검증 완료로 표시하지 않는다.
- 사용자 Copilot 리뷰 예외는 **#2392 한정**이며 #2394의 최신 리뷰 clean을 대신하지 않는다. #2394는 별도 CI/리뷰 판정이 필요하다.

## 운영 대기 실행

공개 운영 landing은 HTTP200, SHA `17ae2d713db40a2b50dfa1266941a4ddc3afd950`, release `1.20.1`이다. main 최신의 이전 핫픽스 [배포 43483693991](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/43483693991)는 승인 대기 중이다. 이번 준비에서 이 실행을 승인·취소하지 않았다. 운영자는 최종 승격 시 기존 대기 실행과 새 배포의 처리 순서를 확인해야 한다.

## 남은 사용자 단계

1. #2394 최신 CI/리뷰를 확인해 dev 반영하고, 해당 새 dev SHA의 CI/Alpha 성공·헤더/health를 다시 검증한다.
2. 미소비 Changeset 0, main 승격 게이트 PASS, 런타임 동일성·최종 dev 범위를 재확인한다.
3. 사용자가 [main...dev 비교](https://github.com/kim-song-jun/matchup-sports-platform/compare/main...dev?expand=1)에서 main 대상 승격 PR을 직접 만들고 검토·머지한다.
4. 기존 production 승인 대기와 최종 배포를 사용자 전용 운영 절차로 처리한다. 이 준비는 main PR 생성·머지·production 승인 권한을 대신하지 않는다.
