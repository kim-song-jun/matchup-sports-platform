---
"v1_web": patch
---

대진표 페이지가 알파 배포 후 실측에서 여전히 타입 조합 15종을 냈던 문제 3건을 고쳤다.
PR #409는 이 페이지의 첫 파티 코드(`bracket-page-client.tsx` + `tournament-bracket.tsx`)만
4단계 위계에 맞췄고, 이 두 파일이 직접 하드코딩한 인라인 스타일은 범위 밖에 남아 있었다.

- **세그먼트 탭 굵기 통일**: `.tm-seg-tab[data-active='true']`의 `font-weight: 800`을 제거했다
  (R-T3는 800 이상을 히어로 숫자·로고 전용으로 규정 — 세그먼트 탭은 해당 없음). 선택 상태는
  배경(트랙 위로 떠오르는 pill) + 텍스트 색(muted → strong)으로만 구분한다. 이 클래스는
  대진표 페이지 전용(다른 화면 미사용, 전수 확인 완료)이라 영향 범위는 이 페이지로 닫혀 있다.
  같은 편집에서, 배경만으로 구분이 성립하려면 다크모드에서 트랙(`--grey100`)과 활성
  pill(`--surface`)이 동일 색(#1c1e24)이라 배경이 사라지는 잠재 버그도 함께 고쳤다 —
  `.tm-review-tab[data-active]`에 이미 쓰인 동일 패턴(`--grey150` 오버라이드)을 적용했다.
- **"순위·브래킷" 중복은 실제 중복이 아니었다**: `tm-topbar-heading`(17px, 모바일 상단바)과
  `tm-text-heading`(24px, `AppChrome desktopHead` 데스크톱 페이지 헤더)은 반응형 브레이크포인트
  (1024px)로 서로 배타적으로 표시되는 의도된 구조다(`tm-topbar`는 ≥1024px에서 `display:none`,
  `tm-desktop-page-head`는 `.tm-show-desktop`으로 <1024px에서 `display:none`). 900px 실측이
  DOM에 둘 다 존재하는 걸 잡아낸 것이지 화면에 동시에 렌더된 게 아니다 — 코드 변경 없음.
- **12px 인라인 굵기 수렴**: 대진표 페이지 두 첫 파티 파일에 흩어져 있던
  `fontSize:12` 인라인 스타일을 기존 `.tm-text-caption`(400, 안내 문구)과 신규
  `.tm-text-caption-strong`(700, 조 이름·"대진표 준비 중" 같은 짧은 강조 라벨) 두 토큰으로
  수렴했다. 두 토큰만 남긴 이유는 실제로 의미가 다른 두 종류(설명 캡션 vs 강조 라벨)만
  존재했기 때문이다 — 억지로 하나로 합치지 않았다.

의도적으로 손대지 않은 것: 하단 탭바(12px/500, 앱 전역 네비게이션), 알림 배지(11px/700,
PR #398 예외), 순위표 숫자(13px 계열), 스크립트 텍스트(16px/400 측정 노이즈).
`TeamFixturesDetail` 확장 행의 라벨(400)/팀명(600)/스코어(700) 혼재는 정보 위계가 이미
정당해 그대로 뒀다. `tournament-standings-table.tsx`/`schedule-content.tsx`/
`tournament-flow-nav.tsx`/`tournament-progress-stepper.tsx`도 12px 인라인 굵기가 섞여
있지만, 전부 결과·수상·대회운영보드·공개 일정 등 다른 화면과 공유하는 컴포넌트라 이번
스코프(정확히 이 3건)에서는 건드리지 않았다 — 손대려면 그 화면들까지 별도 검증이 필요하다.
