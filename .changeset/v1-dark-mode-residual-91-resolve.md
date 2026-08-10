---
"v1_web": patch
---

직전 다크모드 전수검수(a063a195)가 남긴 잔여 91건(34개 파일)을 ultracode
다중 에이전트로 1건씩 판단·처리했다. 매 항목을 "안전(수정 불필요)" 또는
"실제 결함(치환)"으로 명시적으로 분류했고, 적대적 재검증 단계에서 자체보고를
신뢰하지 않고 직접 재확인했다.

## 처리 결과

- 대부분(약 70건)은 실제로 **안전**했다 — 모달 백드롭 스크림(`bg-gray-900/40`
  류, 테마 무관하게 항상 어두워야 함), Tailwind `dark:` 접두사로 이미 짝이
  있는 항목(이 프로젝트는 `.dark` 클래스 기반 커스텀 variant를 쓰므로
  `dark:bg-gray-800` 같은 표기가 실제로 작동함), `disabled:`에만 걸린 저대비
  (WCAG가 인정하는 예외), 항상 어두운 톤이 의도된 토스트/스낵바(흰 텍스트
  대비가 이미 충분).
- **실제 결함으로 치환한 것**: `amber-*`(Tailwind 기본 팔레트, 브랜드 주황과
  다른 색상군) → `--orange500`/`--orange700` 계열 통일, `admin-empty.tsx`의
  장식 아이콘이 동일 컴포넌트 계열의 다른 파일들과 달리 `dark:` 짝이 빠져있던
  것, `tournament-detail-client.tsx`의 disabled 입력창 배경이 형제 파일들과
  다른 톤(`bg-gray-50`)을 써서 시각적으로 튀던 것(`--surface-soft`로 통일).
- **적대적 재검증에서 추가로 잡은 오분류 1건**: `error-log-detail-modal.tsx`의
  `<dt>` 라벨이 `text-gray-400 dark:text-gray-500`였는데, 실측 시 이 모달의
  다크 배경(`dark:bg-gray-800`) 대비 3.04:1로 AA 미달이었다 — "`dark:` 짝이
  있으니 안전"이라는 얕은 판단이 실제 계산 없이 통과됐던 사례. `dark:text-gray-400`
  로 교체해 5.78:1로 통과시켰다. 같은 패턴이 `tournament-ops-shell.tsx`에도
  있었지만 그쪽은 `disabled` 버튼 안이라 WCAG 예외에 해당해 그대로 뒀다.

## 검증

`pnpm lint`(tsc + CSS 토큰 존재검증) clean, `pnpm test` 206 suites/1315 tests
전부 통과.
