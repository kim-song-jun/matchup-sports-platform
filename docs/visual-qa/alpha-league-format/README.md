# 리그전 alpha 시각 검증

캡처 스크립트: `scripts/capture_alpha_league_format.js`

```bash
ALPHA_SESSION_TOKEN=... LEAGUE_TOURNAMENT_ID=... node scripts/capture_alpha_league_format.js
```

캡처된 PNG 는 트리에 커밋하지 않는다 — Copilot 리뷰의 300 파일 한도를 밀어내기 때문이다.
갤러리는 PR 코멘트에 SHA 고정 raw URL 로 게시한다(커밋 `c305cb4d` 참고).

## 스크립트가 검증하는 것

육안 대조가 아니라 `page.evaluate` 계산값으로 판정한다:

- 통합 순위 섹션 존재 여부와 순위 행 수
- 진행률의 숫자 병기(`N / M`)와 퍼센트 — 색만으로 정보를 전달하지 않는지
- 매직넘버 또는 우승 확정 배지
- `document.documentElement.scrollWidth > window.innerWidth` — 가로 스크롤 발생 여부

## 주의

- 회전 수 모달은 **group phase 조**에서만 열린다. knockout 조의 자동 생성 버튼을 누르면
  기존 "경기 일정 추가" 확인창이 뜬다 — `.first()` 로 잡으면 그쪽이 걸린다.
- alpha 는 실시간 소켓이 계속 붙어 있어 `networkidle` 에 도달하지 않는다. 고정 대기를 쓴다.
