---
"v1_web": patch
---

공개 화면(홈·대진표/브래킷·순위·대회 결과·시상/후기·매치 라인업 피치 등)에 남아 있던
12px 미만 `font-size`를 R-T2(`docs/design/toss-reference-rubric.md`) 기준으로 정리했다.
직전 PR #396은 운영/관리자 화면만 다루고 공개 화면은 범위 밖으로 남겼는데, 이번에 그
나머지를 마무리한다.

- **전수 검색 결과**: `globals.css`의 하드코딩 `font-size: 9|10|11px` 30곳(선언 기준)과
  TSX 인라인 `fontSize` 41곳, 총 71곳을 찾았다. 사용자가 준 초기 추정(29곳)은 `globals.css`
  범위만 센 것이었고 TSX 인라인 스타일은 별도 전수검색으로 추가 확인했다.
- **토큰으로 상향**: 대부분을 PR #396과 동일한 방식(`var(--font-size-caption)`, 12px)으로
  올렸다. 고정폭/고정높이 배지·칩은 실제 콘텐츠(숫자·라벨)가 들어갈 여유가 있는지 개별
  확인한 뒤 올렸다 — border-box 계산까지 반영(`.tm-floating-count` 20px 박스는 border 2px
  감안 실질 16px 등).
- **9px→12px(33% 증가) 케이스**: 홈 화면의 "명"/"팀" 단위 표기(알파 실측에서 가장 심했던
  자리)는 부모가 `flexWrap:wrap`이거나 폭 제약이 없어 폰트만 올려도 레이아웃이 안전했다.
  피치 라인업 편집기의 GK 코너 배지(8px)도 44px 토큰 안에서 여유가 있어 올렸다.
- **죽은 CSS 함께 정리**: 위반 셀렉터를 하나씩 확인하다 TSX 어디서도 참조되지 않는 죽은
  규칙을 다수 발견해 같은 변경에서 삭제했다 — `.tm-text-micro`(11px→토큰, 공개 화면 전역
  50곳 넘게 쓰여 콜사이트 대신 정의 자체를 올림) 외에 `.tm-team-thumb*`, `.v1-tab`/
  `.v1-tab-active`, `.tm-team-avatar`, `.tm-bk-round-label`/`-status`/`-third-label`,
  `.tm-wc-team-avatar`, `.tm-podium-name`/`-stat`/`-platform-label`,
  `.tm-match-result-round`/`-date`/`-note`/`-winner-badge`, `.tm-review-card-team`,
  `.tm-tourn-hero-full .tm-res-hero-stats .tm-res-hero-stat-label`, Tailwind `text-2xs`
  유틸리티. 각각의 접두사 계열 중 폰트 크기 위반이 아닌 나머지 죽은 규칙(예: `.tm-wc-*`
  나머지 40여 개, `.tm-podium-*`/`.tm-match-result-*` 나머지)은 이번 작업 범위 밖이라
  남겨뒀다 — 별도 죽은 코드 정리가 필요하다.
- **예외로 남긴 곳**: `.tm-unread-badge`(알림 벨 위 숫자 배지, 16px 박스에서 border
  제외 실질 12px라 12px 토큰조차 못 들어감)와 `.tm-bk2-avatar`(대진표 22px 원 안 이니셜,
  옆 팀명이 이미 12px 이상이라 원 안 텍스트는 장식성 — PR #396 시절부터 있던 기존 예외)
  두 곳만 근거 주석과 함께 11px로 유지했다.
