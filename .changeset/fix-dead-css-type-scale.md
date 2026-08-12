---
"v1_web": patch
---

죽은 CSS 규칙을 정리하고 대진표 페이지(`/tournaments/[id]/bracket`)의 타입 위계를 4단계로
정리했다.

- **죽은 CSS 제거**: `globals.css`의 참조되지 않는 클래스 셀렉터 222개를 삭제(`v1-*`
  옛 셸 잔여, `tm-wc-*`(월드컵 대진 구버전), `tm-podium-*`(시상대 구버전),
  `tm-match-result-*`, `tm-bk-*`(브래킷 구버전), `.tm-card.tm-interactive`/
  `.tm-list-row.tm-interactive` 등). 쉼표 목록에 죽은 셀렉터가 살아있는 셀렉터와 섞여
  있던 11개 규칙은 죽은 조각만 잘라내고 나머지는 그대로 뒀다. 동적으로 생성되는
  클래스(`tm-weather-icon-*`, `tm-auth-notice-*`, `tm-chat-*-{me,other}` 등)와
  `global-error.tsx`가 유일하게 쓰는 `v1-root`/`v1-card` 등 8개는 확인 후 남겼다.
- **대진표 페이지 타입 위계**: 15여 종의 크기·굵기 조합을 4단계(20/17/15/12px)로
  정리했다. `.tm-hub-section-title`(15px, 굵기 850)은 8개 다른 화면과 공유하는
  토큰이라 전역 정의 대신 이 페이지 전용 override로 17px/700에 맞췄다.
  `tm-bk2-score`/`tm-bk2-champ-name`의 굵기 900은 히어로 숫자 기준(30px+)에
  못 미쳐 700으로 낮췄다. 대회 종류(리그/토너먼트/조별리그+토너먼트)별 타입 분기는
  코드에 없어 손대지 않았다.
