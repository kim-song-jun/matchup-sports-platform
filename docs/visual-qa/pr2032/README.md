# PR #2032 alpha 배포 검증

- PR: https://github.com/kim-song-jun/matchup-sports-platform/pull/2032
- 머지/배포 SHA: `c184cff233af2f77a4c2f6842e1d9905fbe10278`
- PR CI 39709551247 및 dev CI 39715119478: Gates/API/Web SUCCESS.
- Alpha 배포: https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/39715119491
- 최신 Copilot 작업39709553504는 검토 시작 전 모델 claude-opus-5 unavailable로 실패했다. 사용자가 외부 리뷰 오류 예외를 명시 승인했다(comment6330899608). clean 리뷰로 표시하지 않는다.
- 최초 CI의 이전 응답 assertion(listImageUrl 부재)은 실제 2장 계약 검증으로 동기화했고 읽기 suite52 PASS 및 최종 CI 전체 PASS를 확인했다.

## 저장된 대표 이미지가 있는 공개 화면 (3/3 viewport)

비로그인 방문자로 `/tournaments/aa100000-0000-4000-8000-000000000004` 방문. alpha release identity 확인 후 headed Chromium으로 촬영했다. 데이터 쓰기·네트워크 모킹·로컬 Next 서버 없이 실제 공개 API와 화면을 검사했다.

| 폭 | 가로 넘침 | 미디어 | 기본 그래픽 수 | pageerror 수 |
|---|---|---|---|---|
| 390 | 없음 | 표시 | 0 | 0 |
| 768 | 없음 | 표시 | 0 | 0 |
| 1440 | 없음 | 표시 | 0 | 0 |

공개 응답의 원본 사진과 표시 설정:

```json
{
  "coverImageUrl": "/mock/generated/futsal-rooftop.webp",
  "listImageUrl": null,
  "showDetailImage": true
}
```

before/after의 콘솔·네트워크 상세는 각 evidence.json에 기록했다. 변경 전에는 각 폭에서 React hydration #418이 관찰됐으나 이번 after 대표 이미지/기본 그래픽 6개 화면에서는 pageerror 0이었다. 비로그인 auth/me 401은 별도로 기록했다. 새 이미지가 표시되고 가로 넘침이 없는 레이아웃 관찰과 콘솔이 완전히 정상이라는 판정은 구분한다.

## 미검증 범위

관리자 로그인 세션/비공개 인증 파일을 확보하지 못해 이미지 2장 업로드·숨김 저장·재표시의 alpha 관리자 UI 실측은 수행하지 않았다. 이 계약은 PR의 실제 DB integration2 및 frontend/API 테스트로 검증했다. 공개 default 상태의 3폭 캡처를 관리자 저장 시나리오 PASS로 대체하지 않는다.

## Cleanup

소유 Node/Chromium PID 및 PPID는 after/evidence.json에 있다. browser.close/server.close 후 해당 PID 부재를 CLI로 확인했다. 임시 캡처 스크립트는 제거했다. before/evidence.json의 소유 브라우저도 이전 작업에서 종료 확인했다. 원본 공유 작업트리 WIP와 main은 변경하지 않았다.

## 사진 없는 대회의 기본 그래픽 (추가 3/3, 총 6/6)

`/tournaments/7f9517de-394a-433f-9525-f8639b830523`의 실제 공개 응답은 coverImageUrl=null, listImageUrl=null, showDetailImage=true다. 390/768/1440 모두 기본 종목 그래픽1개, 미디어 표시, overflow false, pageerror0을 확인했다. 이 경로는 배포 후 추가 선정했으므로 변경 전 캡처가 없고 대표 이미지 경로의 before/after와 구분한다.

최초 기본 그래픽 경로 탐색은 page.goto ERR_ABORTED로 중단됐고 소유 PID49443/49465 종료 및 같은 URL HTTP200을 확인한 뒤 동일 주소 재확인에서 3폭 모두 통과했다. 첫 실패를 성공으로 바꾸지 않고 기록한다. 최종 대표 이미지390 캡처에는 보조 /tournaments 요청 ERR_ABORTED 1건이 기록되어 네트워크 완전 무오류로 판정하지 않는다. 세션 없는 auth/me401 및 이에 대한 console resource error는 두 경로/세 폭 모두 기록했다.

첫 대표 이미지1440 캡처의 문의 CTA에 인증 확인 로딩 문구가 남아 있어 실제 비로그인 상태 hydrate 후 대표 이미지3폭을 재캡처했다. before/after 상태 차이와 원래 기본 이미지 표시 검증은 구분한다.

Health 실측: 2026-10-22T03:33:03Z `/landing` HTTP200, x-teameet-commit=c184cff233af2f77a4c2f6842e1d9905fbe10278, release1.11.5-alpha.20261022.gc184cff233af. `/api/v1/health` success, checks.db=true.

호스트 preflight: CPU28코어, load0.77/1.11/0.83, available 약11GB, swap0, 기존 Node3개. WSL Docker 연동은 없으며 로컬 서버/DB를 띄우지 않고 alpha만 검증했다. 소유 브라우저는 모두 종료 확인했다.
