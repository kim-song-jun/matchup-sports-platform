---
"v1_web": patch
---

이번 세션 다크모드 두 라운드(a063a195, 1e9fd4f0)를 5축(대비 재계산·배경충돌·
미탐지 색상군·아이콘/그래픽·회귀 일관성) 독립 감사 + 2인 스켑틱 반박 라운드로
적대적 재검증했다. 17건 발견 중 14건이 반박을 뚫고 생존해 확정됐다.

## 확정 결함 (14건)

- **entity-picker.tsx**: 선택된 엔티티 칩 라벨이 `text-blue-800`(dark: 없음)
  이라 `--blue50` 다크 배경 블렌드 위에서 1.61:1까지 떨어짐 → `--blue700`로 교체.
- **admin/page.tsx**: "주의 항목 없음" 배너가 `text-green-700`(dark: 없음)이라
  2.70~3.07:1 미달 → `--text-strong`로 대체(admin-status-pill.tsx 선례와 동일 패턴).
- **`text-red-500`(Tailwind 고정값, 4.43:1) 반복 결함**: admin-data-table.tsx·
  admin-card-list.tsx(공유 컴포넌트, 여러 화면에 영향)와 grant/revoke-staff-modal,
  admin-reason-modal, operation-flag-gate-confirm-modal, tournament-campaign-editor
  (.tsx/-collections.tsx), staff-client.tsx, queue-status-panel.tsx,
  error-log-detail-modal.tsx, tournament-detail-client.tsx 등 12개 파일에 복붙돼
  있던 동일 패턴을 전부 `--red700`(이미 검증된 6.04:1)로 통일.
- **tournament-detail-client.tsx**: '운영 콘솔 열기' CTA가 `text-green-600`(4.11:1
  미달, blue700/red700과 짝이 없던 유일한 색상)이라 **신규 토큰 `--green700`**
  (라이트 #037a4a, 다크 #2fe0a0)을 blue700/red700과 동일한 설계로 추가해 교체.
  '팀 배정하기'는 `text-blue-500`이 배경에 따라 결과가 갈리는 불안정한 색이라
  이미 앞선 라운드에서 통과값(`--blue700`)으로 대체돼 있었음을 재확인.
- **error-logs-client.tsx**: `sourceTone()`의 client 배지만 `bg-purple-50
  text-purple-700`에 dark: 짝이 없어(server 분기는 이미 토큰화) 다크 대응 추가
  (tournament-ops-shell.tsx의 기존 purple 컨벤션 재사용).
- **pitch-formation-editor.tsx**: PlayerToken 원형 배경/GK 배지가 `--blue700`/
  `--orange700`를 썼는데, 이 두 토큰은 이번 세션 다크 오버라이드로 "카드 위
  텍스트"용 밝은 값으로 바뀌어 원형 배경 + 흰 텍스트 조합에선 오히려 대비가
  무너짐(≈2.4:1). 테마 무관 고정 chip 색 신규 토큰 `--player-marker-blue`/
  `--player-marker-orange`(라이트 700 hex 그대로 고정, kakao-yellow 패턴)로 분리.

## 운영 메모 — 워크트리 경로 혼선

이번 워크플로의 일부 백그라운드 에이전트가 대상 워크트리 경로를 찾지 못해
공유 메인 체크아웃(`dev` 브랜치)에 잘못 적용한 사례가 있었다. 발견 즉시
diff를 전수 대조해 워크트리로 정확히 이식하고, 메인 체크아웃의 스트레이
변경은 `git restore`로 되돌려 원래 상태(95→79건, 무관한 기존 변경 그대로)로
복구했다.

## 검증

`pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 210 suites/1333 tests
전부 통과.
