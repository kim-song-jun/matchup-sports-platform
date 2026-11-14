# 1.20.3 선택적 main 승격 후보

Status: Preparing — main merge / production approval not executed.

기준은 main `900539b7c5c7a70fd9fb9e823a6d0cea9fdf7896`이다. 포함 기능은 #2392 빈 명단 익명 경기 운영과 #2393 퀸즈컵 예선 순위 보정 두 건뿐이다. dev 전체 승격용 #2394와 다르며 기존 #2394 브랜치는 변경하지 않는다.

- 선택 소스: `90479696b`, `6030b9afb`, `e652493bc`, `c53714726`. 모두 충돌 없이 main 위에 적용했다.
- API/Web manifest는 1.20.3, 두 앱의 CHANGELOG에는 이 두 항목만 추가한다. 두 Changeset은 같은 릴리스에서 소비한다. schema/migration/의존성/lockfile 변경 없음.
- 현재 resolver는 Changeset 0개일 때도 patch를 더하므로, 이 후보의 예상 운영 표시 버전은 1.20.4다. manifest 버전과 표시 버전을 구분한다.
- 알파 e3d79cd07 / 1.20.3-alpha.20261114.ge3d79cd07aee는 두 기능을 포함하지만 다른 dev 변경도 포함한다. 선택 후보 전체의 실배포 검증으로 주장하지 않는다. 퀸즈컵 보정 CLI는 알파에서 `absent`였고 운영 대회의 보정 완료를 의미하지 않는다.
- 사용자는 이 준비의 Copilot 리뷰 생략을 승인했다. main PR은 테스트·승격 게이트·CI를 확인해 머지 직전까지만 준비한다. main 머지와 production 승인은 사용자에게 남긴다.

로컬 검증: API unit 124/124, Web unit 117/117, API/Web typecheck, surface/pattern gate, main release policy, versioning contract 24/24, 배포 순서·실패 전파 4시나리오, 두 배포 스크립트 문법 모두 PASS. 브라우저 adapter는 unavailable이며 native 앱 접근도 approval timeout으로 끝나 실제 로그인 UI 조작·3폭 스크린샷은 미검증이다. 기존 Web fixture의 act/key 경고를 실제 브라우저 console 결과로 보지 않는다.

정확한 최종 head의 전체 CI(DB integration/build 포함)는 main 대상 PR에서 확인한다. main merge/production approval은 실행하지 않는다. 최종 CI·PR 증거는 해당 PR 코멘트와 `.github/tasks/20261114-two-feature-main-release.md`에서 추적한다.
