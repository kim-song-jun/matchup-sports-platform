# Next Session Plan — Tasks 72 onward

Owners: project-director + tech-planner
Drafted: 2026-04-19
Status: Roadmap — pending user confirmation per task

---

## Context

Task 69 (미구현 기능 보완), Task 70 (마켓플레이스 결제 라이프사이클 — **현재 진행 중**), Task 71 (AI 팀 밸런싱 — **완료, main 배포됨 2026-04-18**)이 직전 사이클에서 처리되었다. 이 문서는 **Task 70/71이 끝난 직후 진입할 다음 사이클의 3개 task(72·73·74)**와 그 뒤를 이을 장기 로드맵(75·76)을 정의한다.

입력 소스:
- `.github/tasks/71-completion-report.md` Known Minor Issues + Deferred items
- `.github/tasks/69-completion-report.md` Known minor issues
- `CLAUDE.md` Known Blockers 섹션
- Task 71 리뷰/QA 피드백 (3 라운드 종합)

## Prioritization framework

| Priority | 의미 | 예시 |
|----------|------|------|
| **P0** | 프로덕션 신뢰성·기능 불완전성 해소. 사용자에게 약속한 기능이 실제 동작해야 함 | 푸시 알림 실제 발송, idempotency 누락 |
| **P1** | 사용자 경험 결함, 리뷰/QA에서 확인된 개선 요구사항 | 재추첨 비교, rate limiting, 대체 경고 |
| **P2** | 장기 가치·분석·관측성. 통계적 샘플·외부 계정 등 전제 조건 필요 | ELO v2 알고리즘, fairness dashboard |

---

## Roadmap

### Task 72 — Team Balancing v2 UX + Consistency Hardening (P1)
**목표**: Task 71 출시 직후 확인된 UX/일관성 결함 일괄 해소.
- preview↔confirm 간 참가자 목록 드리프트 방지 (`participantHash`)
- preview endpoint rate limiting
- 재추첨 이력 비교 UI (직전 2개 preview 보존)
- 확정 재호출 시 교체 경고 모달
- 3-4팀 모달 desktop 반응형 `sm:grid-cols-2`
- 누락된 integration test 6건 추가 (3-team/4-team snake, in_progress 상태 409, 동시성)

**예상 규모**: Medium (1.5~2일, ~1,200 LOC)
**의존**: Task 71 main merged (✅ 2026-04-18 완료)

### Task 73 — Idempotency + Retry Semantics Sweep (P0)
**목표**: 재호출(retry/network replay) 시 500/400이 아니라 안전한 응답을 반환하도록 API 계약 정비.
- `POST /mercenary/:id/close`·`cancel` — 이미 close 상태면 200 + `{alreadyClosed: true}` (현재 400)
- `POST /teams/:id/apply` — 중복 신청 409 응답 일관성 재검토
- `POST /matches/:id/complete` — idempotent 보장
- `POST /reviews` — (matchId, authorId, targetId) 유니크 인덱스 + 재호출 시 200 반환
- `POST /notifications/push-subscribe` — endpoint 중복 시 upsert (race 방지 재확인)
- E2E idempotency 계약 테스트 스위트 신규

**예상 규모**: Medium (1~1.5일, ~800 LOC)
**의존**: 없음. Task 72와 병렬 가능 (파일 overlap 적음)

### Task 74 — Production Push Notifications Activation (P0)
**목표**: CLAUDE.md Known Blockers 중 VAPID 미생성 이슈 해소. 실제 사용자 디바이스까지 푸시가 닿는 경로를 완성. **Firebase/FCM 미사용 — `web-push`+VAPID 직접 발송 스택**.
- VAPID 키 생성 + `.env.example` 업데이트 + deploy secret 주입 절차 문서화
- 알림 유형별 수신 여부 설정 UI (`/settings/notifications` 또는 `/my/settings`)
- 푸시 발송 실패 메트릭 수집 (구독 만료 자동 삭제 + 알람 로그)
- Capacitor 분기:
  - **iOS 네이티브**: APNs `.p8` 키 직접 연동(`node-apn` 류) — Firebase 경유 없음. Apple Developer 계정 존재 시만 포함
  - **Android**: Chrome WebView 의 Web Push API 재사용(별도 FCM 설정 불필요)
  - 웹 PWA: VAPID 공유 경로

**예상 규모**: Medium (웹+Android 공유 경로) → Large (iOS APNs 포함)
**의존**: Apple Developer + APNs `.p8` 키 가용성 (iOS scope 만 해당). Android/웹 은 계정 필요 없음

### Task 75 — Team Balancing Algorithm v2 (P2, 지연 가능)
**목표**: Task 71의 알고리즘 한계 확장. 통계 표본 100+ 경기 도달 후 진입.
- `mannerScore` 가중 (0.8 × elo + 0.2 × manner*spread)
- 포지션 밸런스 (GK/DF/FW, 스포츠별 position map)
- 이전 동일 팀 배정 회피 (history-aware)
- fairness audit dashboard (variance 분포, 경기 결과 correlation)

**전제 조건**: 완료 매치 ≥ 100 달성 (현재 샘플 부족) — **pending trigger**

### Task 76 — Operational Observability + Admin Polish (P2)
**목표**: 관리자 도구와 관측성 확장.
- 실시간 매치 현황 대시보드 (`/admin/ops` 신규)
- 분쟁(disputes) 해결 워크플로우 UI
- 알림 전송 실패 실시간 알람
- 정산(settlements) 대시보드 보강

**의존**: Task 73 (idempotency 없으면 admin 재처리가 위험)

### Task 77 — Test Infra Upgrade (P2, tech-debt chore)
**목표**: Vitest 1.6 → 3.x + jsdom 24 → 26 + @swc/cli 0.7 → 0.9 일괄 업그레이드. 문서: `.github/tasks/77-test-infra-upgrade.md`
- **트리거**: 2026-04-19 감사에서 test infra 2 major 버전 지연 확인
- **규모**: Medium (~1일, chore)
- **의존**: Task 72/73/74 merge 후 착수 권장 (flake 소스 격리)

### Task 78 — Next.js → React 마이그레이션 **제안서** (Proposal, not committed)
**목표**: Next.js 16 App Router 를 Vite + TanStack Router 기반 순수 React 로 전환할지 의사결정. 문서: `.github/tasks/78-next-to-react-migration-proposal.md`
- **상태**: Proposal (의사결정 대기) — 현재 5개 open question 미해결
- **핵심 사실** (2026-04-19 감사): 이미 177개 `'use client'` + Capacitor 빌드 `output: 'export'` → 사실상 SPA. SSR/RSC 의존도 낮음
- **4 옵션 제시**: A(Vite+React Router) / B(Vite+TanStack Router, 권장) / C(Next client-only, 최소 변경) / D(SSG 하이브리드)
- **Default 권장**: Option C 먼저 → 재평가. Option B 는 Next 제거가 명시적 목표일 때만
- **규모 (Option B 선택 시)**: Large (2~3주, 4-phase cutover)

---

## Execution order recommendation

```
(현재) Task 70 진행 중
        ↓
        ├─ Task 72 ┐
        └─ Task 73 ┘ (병렬 가능, throttler/matches.service.ts 충돌 주의)
                ↓
        Task 74 (P0 블로커 해소, 웹 푸시 활성)
                ↓
        Task 77 (Test infra 업그레이드 — flake 격리 위해 74 이후)
                ↓
    (Task 75는 통계 트리거 대기)
                ↓
        Task 76 (Task 73 선행 필요)

  Task 78 (Next→React 마이그레이션 제안서) — 별도 의사결정 트랙
           open question 5개 답 확정 후 별도 사이클에서 착수
```

---

## Task 문서 공통 검증 템플릿

각 task 문서에는 다음 섹션이 **반드시 포함**된다:

### Verification & Validation (V&V)
- **Pre-merge checks** (CI 통과 기준):
  - `cd apps/api && pnpm lint && pnpm build && npx tsc --noEmit && pnpm test`
  - `cd apps/api && pnpm test:integration -- <domain>` (DB 필요 — `docker compose up -d`)
  - `cd apps/web && npx tsc --noEmit && pnpm lint && pnpm test`
  - PR 라벨에 `needs-qa` 추가 → 4 페르소나 QA 리뷰 수행
- **Manual smoke (pre-deploy)**: 실제 dev 서버 기동 후 시나리오별 브라우저 워크스루 (스크린샷 증거 남기기)
- **Post-deploy validation**: 배포 후 프로덕션 URL에서 주요 경로 smoke test + 로그/메트릭 수 분간 모니터링
- **Rollback plan**: 문제 발생 시 revert PR 절차 + DB 마이그레이션 롤백 여부
- **Regression surface**: 이번 변경이 영향을 줄 수 있는 기존 기능 목록과 회귀 확인 체크리스트

이 템플릿은 각 task 문서에 구체적인 명령어·URL·체크포인트로 구현된다.

---

## Open questions (사용자 확인 대기)

1. Task 74 iOS 네이티브 푸시 scope — Apple Developer 계정 + APNs `.p8` 키 현재 상태? (Android 는 VAPID 재사용으로 계정 불필요. Firebase 는 프로젝트 정책상 미사용)
2. Task 75 통계 트리거(100+ 완료 매치) — 자동 감지 스크립트 구축 여부?
3. Task 72·73 병렬 진행 OK? 아니면 72 먼저 단독 진행?

---

## References

- Task 69 완료 리포트: `.github/tasks/69-completion-report.md`
- Task 71 완료 리포트: `.github/tasks/71-completion-report.md`
- Task 71 설계 문서: `docs/design/task-71-team-balancing.md`
- 프로젝트 지침: `CLAUDE.md`
