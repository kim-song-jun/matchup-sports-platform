# 12강 대진표 Alpha 검증 — 2026-10-05

- 배포 PR: [#1618](https://github.com/kim-song-jun/matchup-sports-platform/pull/1618)
- Alpha 실제 커밋: `ed0a4e85a1e5ef068000b6b81584138efd552f81`
- [동일 SHA CI SUCCESS](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37301483730), [Alpha SUCCESS](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/37301483732).
- Persona: 로그아웃 공개 방문자. Headed Windows Chromium, 1440/768/390 × 1000.
- 전체 페이지 가로 넘침0, 같은 라운드 카드 겹침0, 진출선15개. 공통 캔버스936px, 8강 카드 사이 최소113px.
- 실제 클릭: 순위·대진표 탭 → 12강 버튼 → 결승 버튼 → 결승 카드로 세로 스크롤. 모바일/태블릿 고정 header/nav와 수평 대진 영역 확인.
- JS pageerror0. 로그아웃 `my-fixtures`401 및 대응 console1은 before와 동일하며 성공으로 숨기지 않음.
- 최종 브라우저 PID18956 / parent6288 종료 완료. 추가 캡처 시도 PID17108/31252/29992/20240도 자체 finally로 종료.

## 증거 해석

초기 before는 `bracketSources=[]`이며 부전승4선+우승1선만 있었다. Alpha 재조회 시 운영 설정에 진출 관계12개가 등록됐고 12강 한 경기 결과도 확정됐다. 에이전트의 원격 데이터 변경은0회다. 따라서 before/after를 동일한 데이터에서 코드만 바꾼 비교로 주장하지 않는다. 부분 연결의 배치 회귀는 실제 구성과 같은 RED→GREEN 단위 테스트로 증명하고, after는 현재 실제 대회 설정을 검사했다.

`before.png`의 1440 화면은 8강 카드 겹침 및 4강/결승 하단 밀림을 보여준다. 모바일·태블릿 초기 before는 내부 스크롤의 상단을 캡처했으므로 해당 이미지만으로 대진표 시각 판정을 주장하지 않는다. after는 내부 스크롤로 대진표를 보이게 한 화면이고, `after-final.png`는 결승 버튼 클릭과 결승 카드 스크롤 이후 화면이다.

처음 두 추가 캡처에서 SSR 숨김 패널을 너무 일찍 클릭해 탭 선택이 유실됐다. 페이지 하이드레이션 뒤 숨김 패널이 해제되는 실제 DOM 상태를 기다린 다음 클릭하도록 QA 도구를 수정해 완료했다. 제품에 대기/재시도 fallback을 추가하지 않았다.

관리자 자동 생성 저장/삭제는 인증 세션이 없어 실제 Alpha에서 실행하지 않았다. 관리자 컴포넌트22개와 그래프/렌더러22개, 총44개 계약 테스트 및 frontend typecheck/pattern은 PASS다. Copilot 요청에 리뷰는 생성되지 않았으며, 독립 정적 리뷰는9/9에서 actionable finding0이다. 별도 `github-advanced-security` check는 FAILURE로 표시됐고 제공된 annotation은 exit code1뿐이므로 보안 검사까지 PASS로 보고하지 않는다.
