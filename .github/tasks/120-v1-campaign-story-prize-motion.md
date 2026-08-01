# Task 120 — v1 캠페인 소개·상금·모션 재구성

## Request

- 알파 캠페인 소개 페이지의 어색한 상금 영역과 하이라이트 카드를 재구성한다.
- 소개 페이지다운 기대감은 높이되 TeamMeet의 절제된 정보 구조와 접근성을 유지한다.

## Scope

- `apps/v1_web/src/components/tournaments/tournament-campaign-template.tsx`
- `apps/v1_web/src/components/tournaments/tournament-campaign-template.module.css`
- `apps/v1_web/src/components/tournaments/tournament-sponsor-section.tsx`
- `apps/v1_web/src/components/tournaments/tournament-sponsor-section.module.css`
- 관련 좁은 컴포넌트 테스트와 `DESIGN.md` 모션 계약
- API, 캠페인 데이터 구조, 신청·대진·결과 라우팅은 변경하지 않는다.

## Acceptance Criteria

- 단일 하이라이트가 반쪽 카드로 남지 않고 와이드 편집형 스토리로 읽힌다.
- 이미지가 없는 여러 하이라이트에 같은 fallback 사진이 반복되지 않는다.
- 상금은 중첩 카드 대신 순위·항목·금액을 빠르게 비교할 수 있는 행으로 표시한다.
- 전체 페이지 캡처와 빠른 스크롤에서도 본문이 공백으로 사라지지 않는다.
- 모션은 `transform`과 `opacity`만 사용하며 reduced-motion에서 즉시 최종 상태를 표시한다.
- 375px, 768px, 1280px 알파 화면에서 overflow, CTA, FAQ, 상금 행을 확인한다.

## Reference

- Lazyweb: https://www.lazyweb.com/report/lazyweb/fd205fe5-3e99-4004-aa6f-f660378839a1/?source=create
- 방향: poster-simple hero, concise fact strip, editorial story rhythm

## Progress Snapshot

- [x] 알파 전체 화면·상금 구간 캡처
- [x] 코드·디자인 병렬 감사
- [x] Lazyweb 리포트 생성
- [x] 구현 및 좁은 테스트
- [x] dev 배포
- [x] 알파 반응형 시각 QA

## Completion Evidence

- 구현 경계: `a93ac9242`(스토리·상금 재구성) 이후 모바일/태블릿 CTA·본문 가시성 보정과 `8c588487b`(CTA overlay 제거)까지 반영했다.
- 현재 알파 identity: release `0.1.0-alpha.20260719.g6d9d4dec1f9e`, commit `6d9d4dec1f9e50570789c92115c60b3d37edf778`.
- CI: [CI / Deploy #29656131450](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/29656131450) 성공.
- Alpha deploy: [Deploy Alpha #29656131436](https://github.com/kim-song-jun/matchup-sports-platform/actions/runs/29656131436) 성공; 공개 release/commit header 일치, `/api/v1/health`의 `checks.db=true` 확인.
- 최종 상금 구간:
  - `output/playwright/visual-audit/task-120/campaign-375-prize-overlay-final.png`
  - `output/playwright/visual-audit/task-120/campaign-768-prize-overlay-final.png`
  - `output/playwright/visual-audit/task-120/campaign-1280-prize-overlay-final.png`
- 최종 상단·CTA·FAQ 캡처도 같은 `output/playwright/visual-audit/task-120/` 아래 `*-overlay-final.png`로 남겼다. 중간 `*-final-sha.png`에서 발견된 sticky CTA 가림은 `8c588487b`에서 제거했고, 후속 clone-fidelity 재검토 결과 blocking finding 0 / APPROVE였다.
- 사용자 코멘트에 첨부된 중첩 카드형 상금 그리드는 위 배포보다 이전 화면이다. 현재 알파는 요약과 행 기반 breakdown으로 교체되어 동일 문제를 다시 구현하지 않는다.

## Ambiguity Log

- 사용자 요청은 소개 페이지의 polish이므로 공개 캠페인 UI에 한정하고 대회 상세 데이터 계약은 유지한다.

## Round 2 — C · 신청 결정을 앞당김 (local dev)

- 선택: hero 바로 아래에 신청 가능 상태·마감 시간·primary action을 모은 decision panel을 두고, 상금과 후원사는 하나의 rewards 흐름으로 통합했다.
- 비영향: API, 대회 상태, 신청·결제·대진·결과 라우팅과 데이터 계약은 바꾸지 않았다.
- 실행 범위: 로컬 `dev` 코드와 read-only alpha API 기반 화면 검증만 수행했다. AWS, push, alpha 배포, main 병합, production 변경은 실행하지 않았다.
- 구조 정리: hero/facts, decision, story, rewards CSS 책임을 각각 189/76/126/127줄 모듈로 분리했고, raw CSS 문자열을 그대로 검사하던 implementation-mirroring 테스트를 제거했다.
- 스크롤 계약: 본문은 항상 `opacity: 1`이며 지원 브라우저에서 `translateY(8px → 0)`만 적용한다. reduced-motion은 hero/story/rewards를 즉시 최종 상태로 표시한다.
- CJK polish: hero 제목은 쉼표 기준의 두 의미 단위로 표시하고, 모바일 sponsor 빈 상태의 `공식 후원사를 준비하고 있어요`는 한 문장으로 유지한다.

### Local validation

- `v1_web` TypeScript: `tsc --noEmit --pretty false` PASS.
- focused Vitest: template 17 + primary action 3 + countdown 1 = 21 tests PASS, single worker.
- `git diff --check` PASS; touched path의 `TODO/FIXME/HACK/XXX`와 raw color 추가 없음.
- 375×812, 768×1024, 1280×900 모두 horizontal overflow 0, console error 0, 400+ response 0, loading failure 0.
- CTA와 bottom navigation 간격: 375px `4.21px`, 768px `0.61px`; 겹침 없음.
- 동일 DOM motion evidence: hero scale `1.025 → 1.0125 → 1`, rewards reveal은 고정 `scrollY: 1000`에서 translateY `8px → 4px → 0`, 모든 프레임 opacity 1.
- 독립 visual QA 2회 최종 판정: `APPROVE`, blocker 0.

### Evidence

- fresh responsive screenshots: `output/playwright/visual-audit/task-120-campaign-round2/*-final.jpg` (18 files)
- runtime receipt: `output/playwright/visual-audit/task-120-campaign-round2/responsive-runtime-receipt-final.json`
- hero motion receipt: `output/playwright/visual-audit/task-120-campaign-round2/hero-motion-state-receipt-final.json`
- reveal receipt: `output/playwright/visual-audit/task-120-campaign-round2/reveal-motion-state-receipt-final.json`
