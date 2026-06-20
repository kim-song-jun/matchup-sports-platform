# Teameet v1 — 2026-06-23 배포 준비 Ledger

> **이 문서의 역할**: 6/23 배포를 향한 작업의 **영속 메모리/컨텍스트 앵커**. 메인 세션 컨텍스트가 꽉 차거나 compaction이 일어나도, 다음 세션·서브에이전트가 이 문서만 읽으면 목표·범위·결정·진행 상태를 그대로 이어받을 수 있다. **모든 의미있는 결정·진행은 여기에 누적**한다. (수기 ledger — 자동 메모리가 아니다.)

- **세션 브랜치**: `feat/v1-consumer-tournament-ia` (PR #21, repo `kim-song-jun/matchup-sports-platform`)
- **시작 커밋**: `b109986b` (admin 라벨 한글화)
- **최종 갱신**: 2026-06-18 (Discovery 워크플로 착수 시점)

---

## 1. 목표 (GOAL — `/goal`로 설정, 세션 Stop hook 활성)

**6/23 서비스 배포 예정.** 기준:
1. **데드코드 0** — clean up 완료
2. **코드 디자인 패턴 준수** + 명확한 코드 수정 + **가이드라인 주석이 기본 개발방식에 녹아 있어야** 함
3. **기술부채 최대한 해결/제거**
4. **의미없는·통과용 테스트 제거** + **유닛 + e2e 테스트** 포함 개발 (진짜 테스트만)
5. **모든 기능 × 모든 사용자 페르소나(10~20명)별 user flow 수립** → 그대로 테스트 및 개선
6. 특히: **사용성** OK / **문구** 안 이상한지 / **디자인이 토스와 다르지 않은지**(미니멀·깔끔·직관)
7. **claude-in-chrome(또는 Playwright)으로 페이지 하나하나** mobile/tablet/desktop × **app + admin** 전수 파악
8. 작업은 **ultracode / Workflow / agent-all + 서브에이전트** 적극 사용, 디자인은 **impeccable / frontend-design 스킬**, **모든 구현에 적대적 검증**

## 2. 프로세스 모델 (사용자 지정 작업 방식 — 구속력 있는 doctrine)

> 아래 3개 메커니즘은 **모든 workstream에 강제 적용**한다. 서브에이전트·다음 세션도 이 문서를 읽고 그대로 따른다. 생략은 규칙 위반.

### D1 — 모든 구현에 적대적 검증 (Refute-panel)
- 코드 변경 workstream이 끝나면, 변경을 **반증(refute)하려 시도하는 opus 판정단**을 띄운다(단순 confirm 금지). 관점 분리: 정확성 / 회귀·부작용 / 목표·요구 충족 / 디자인·토큰 정합. **다수가 반증 못 한 finding만 통과**.
- worker(구현·탐색·기계변환)=sonnet/haiku, 판정·종합·설계=opus/fable (글로벌 규칙 11). 비싼 추론은 결정에만.
- "tsc 통과 + 테스트 green"만으로 완료 선언 금지 — **라이브 화면/실행 증거 + refute-panel 통과**까지가 완료.

### D2 — 메모리/컨텍스트 키퍼 (Context-keeper checkpoint)
- **이 ledger(`docs/ops/deploy-2026-06-23-readiness.md`)가 단일 메모리 소스.** 매 의미있는 workstream 종료 시 체크포인트로: (a) §5 로드맵 상태·(b) §6 진행 로그·(c) §7 열린 결정 갱신 → (d) **PR 브랜치에 커밋·푸시**(pathspec, Co-Authored-By trailer).
- 사용자 "main에 푸쉬" 의도 = "원격에 중앙 보관해 컨텍스트 유실 방지". git 안전 규칙(규칙 6~10: stash/branch/main 직접조작 금지)상 **직접 `main` push 불가 → PR 브랜치(`feat/v1-consumer-tournament-ia`)가 그 원격 보관소**. (배포 시 PR 머지로 main 반영.)
- 컨텍스트가 차오르면 이 문서만으로 새 세션이 100% 이어받을 수 있게 **결정의 "왜"까지** 적는다.

### D3 — 목표 대비 적대적 자기검증 (Goal-alignment gate)
- **새 workstream 착수 전**, opus 서브에이전트가 목표(§1)+ledger+관련 이전 결정을 재독하고 "이 작업이 목표에 복무하는가 / scope-drift·오독 아닌가"를 적대 점검. 애매하면 **중단·에스컬레이트**(추측 진행 금지 — CLAUDE.md 규칙 5·6).
- 이 세션이 왜 생성됐는지(= 6/23 배포 준비)를 매번 기준으로 삼는다.

### D4 — 결정 게이트
- Decision Matrix는 **사용자 게이트**(규칙 14) — auto-approve 금지. 표(overview) → `AskUserQuestion`(대화형) 순(규칙 15).
- 단, **명백·저위험·되돌리기 쉬운** 작업(데드코드 제거·카피 수정·토큰 정합)은 D1 적대 검증과 함께 자율 진행. **제품/범위/삭제·롤백** 결정은 반드시 게이트.

## 3. 범위 (SCOPE)

- **IN**: `apps/v1_web` (Next 16, ~110 라우트, 포트 3013) + `apps/v1_api` (NestJS, 포트 8121). consumer 앱 + admin(10 라우트) 모두.
- **OUT**: 레거시 `apps/web` / `apps/api` / `e2e/` (배포 대상 아님 — 단, v1 e2e 작성 시 패턴 참고는 가능).
- v1_web: hand-authored Tailwind v4 `.tm-*` CSS, **light-mode only**(no `dark:`), Toss-clean. 토큰은 `apps/v1_web/src/app/globals.css` @theme. UI/에러 카피 **해요체**.
- 헤더 dev-auth: localStorage `teameet.v1.userId`/`userEmail` → `x-v1-user-*`. 현재 테스트 유저: icon.tester `8e368103-5222-43e4-9efc-6eec0ec2019e`. owner admin: `d554f25e-06f4-4d04-b744-a44124230228` / `admin@teameet.v1`.

## 4. 정찰 결과 (2026-06-18 baseline)

- v1_web 라우트 ≈ **110개** (consumer + admin 10).
- 테스트: v1_web **6** *.test, v1_api **27** *.spec, **v1_api e2e 0**, 레거시 e2e/ 19(범위 외 추정).
- 표면 기술부채 신호: TODO/FIXME **0**, `as any` web 0 / api 1, eslint-disable **9**, empty catch 0. → 표면은 깨끗, 심층(데드코드·디자인·테스트품질)은 Discovery 워크플로로 분석 중.

## 5. 로드맵 (Discovery 종합 완료 — run `wf_e9cd25df-889`, sonnet synthesize)

**Exec summary**: v1은 4개 축에서 미흡 → 데드코드 ~600 LOC, undefined CSS 토큰(런타임 시각 실패), admin surface 토큰 미사용(265 raw Tailwind), 핵심 서비스 계층 테스트 0, v1 e2e 인프라 0. 카피 31건.

### ⚠️ CI 결합 함정 (goalInterpretation)
`deploy.yml`의 deploy job이 `needs: test`로 **레거시 스택 lint/tsc/unit/integration에 결합**. 즉 "레거시 무시"는 **제품 범위일 뿐 CI 범위 아님** — 레거시 테스트가 깨지면 v1 배포도 막힘. (열린 결정 #1 참조)

### 🔴 Critical Blockers (3)
1. `globals.css`: undefined CSS var 4개(`--sh-1`,`--line`,`--red-alpha-08`,`--blue700`) → auth/chat/error 카드 shadow·border·색 깨짐
2. `desktop/tournaments.css`: undefined `--font-size-*` 토큰 6개 → 대진표 타이포 전부 fallback
3. status label 함수 5곳 `default: return status` → 영문 enum(`withdrawal_pending` 등) UI 노출

### 우선순위 Workstream (12)
| P | Workstream | 분류 | effort | risk | 게이트 |
|---|-----------|------|--------|------|--------|
| 1 | CSS 토큰 수정(undefined 4 var + 6 font-size) | Design Token | trivial | low | 없음(즉시) |
| 2 | 데드코드 삭제 — Web(~600 LOC, design-source/·app-shell·16 unreachable route) | Dead Code | small | low | **결정#3** |
| 3 | 데드 API 모듈 삭제(verification) | Dead Code | small | low | 없음 |
| 4 | 카피 수정 — 해요체 + 영문 enum(31건) | Copy | small | low | 없음 |
| 5 | WCAG a11y(터치타깃 + focus ring) | A11y | small | low | 없음 |
| 6 | 하드코딩 색/`dark:` 정리(consumer) | Design Token | small | low | 없음 |
| 7 | API 기술부채(as any·silent catch·Record<unknown>·noti pref gap) | Tech Debt | small | low | 일부 **결정#2·#5** |
| 8 | API 유닛 테스트 — 서비스 계층 | Test | large | med | 없음 |
| 9 | 프론트 유닛 테스트 — view/hook | Test | medium | med | 없음 |
| 10 | Admin 토큰 정합(265 raw Tailwind) | Design Token | large | med | 없음 |
| 11 | 페르소나 비주얼 감사(17 페르소나×3 BP, ~112샷) | Visual QA | large | med | WS1~5 선행 |
| 12 | v1 e2e 하네스(6/23은 Supertest integration만) | Test | medium | high | **결정#4** |

### 테스트 전략
- 프레임워크 유지: web=Vitest+TL+MSW, api=Jest+ts-jest. **신규 프레임워크 도입 금지**(배포 2일 전 CI 위험).
- **제거·교체**: `home/page.test.tsx`(3-static-string smoke→데이터 기반), `reviews.view-model.test.ts`(tag subset→round-trip 누락검증).
- **추가(api Jest, PrismaService mock — tournament spec 패턴 참조)**: auth/matches/teams/team-matches/chat/notifications service.spec.
- **추가(api Supertest integration)**: auth·matches·health e2e-spec.
- **추가(web Vitest+MSW)**: login/email·matches/new·tournaments/apply page.test.
- Playwright v1 하네스는 **6/23 이후로 descope**(결정#4).

### 페르소나 비주얼 감사 (WS11, WS1~5 적용 후)
3티어 ~112샷, 헤더 dev-auth + 스택 기동(:5432/:8121/:3013).
- **Tier 1**(mobile 390+desktop 1440): P01 신규방문(10), P03 매치참가(4), P04 매치호스트(7), P10 대회참가(5), P16 admin(9) — ~70샷
- **Tier 2**(mobile 390): P05~P09·P12·P13·P17 — ~31샷
- **Tier 3**(mobile 390): P02 OAuth분기·P11 로스터·P14 설정·P15 복귀 — ~11샷
- Tablet 768은 stretch(시간 되면 Tier 1 3차 패스)

## 6. 진행 로그 (Progress Log)

| 일자 | 작업 | 커밋 | 비고 |
|------|------|------|------|
| 2026-06-18 | admin 감사로그·대시보드 라벨 한글화 | `b109986b` | Phase B 완료, 푸시됨 |
| 2026-06-18 | Discovery & 적대적 목표검증 워크플로 착수 | — | run `wf_e9cd25df-889`, 7-axis 감사. synthesize는 529로 실패 → 재실행 예정 |
| 2026-06-21 | **iCloud eviction 장애 → 복구** | — | macOS TCC 차단(Documents)으로 repo 전체 접근 불가 수 시간. 사용자가 iCloud 동기화 제거. 복구: `.git/HEAD`+워크트리 HEAD 2개(reflog 확정 분기) 재생성 → tracked 436개 `git restore`(b109986b, 무손실) → `pnpm install --force`로 node_modules 복구 → v1_web tsc green. 작업물 무손실 |

## 7. 열린 결정 (Open Decisions — 사용자 게이트, D4)

> 2026-06-21 사용자에게 AskUserQuestion으로 제시. 답변 전엔 해당 게이트 workstream 보류.

1. **deploy.yml v1↔레거시 결합 분리?** — (a) 공유 `test` job 유지(레거시 green 필수) / (b) v1 전용 job 분리. **권고**: 레거시에 알려진 flake(Postgres 40P01 deadlock) 있으면 분리, 안정적이면 2일 전 파이프라인 손대지 말고 유지. → 게이트: WS(deploy.yml)
2. **noti pref `chatEnabled`/`noticeEnabled` 필드** — wire-up / 제거 / as-is. **권고**: as-is + 주석(2일 전 Prisma migration 회피). → 게이트: WS7 일부
3. **`design-source/` + design-frame 프로토타입** — 삭제 / build 제외 / 유지. **권고**: 삭제(live consumer 0 grep 확인). → 게이트: WS2
4. **Playwright v1 e2e를 6/23에 구축?** — 지금 구축 / Supertest만(Playwright 연기) / e2e 생략. **권고**: Supertest만, Playwright 연기. → 게이트: WS12
5. **`PATCH /notification-preferences` 데드 엔드포인트** — wire / 제거 / as-is. **권고**: as-is + 주석. → 게이트: WS7 일부

**비게이트(즉시 착수 가능, 명백·저위험)**: WS1(CSS 토큰), WS3(verification 모듈 — 단 grep 재확인), WS4(카피), WS5(a11y), WS6(색 정리), WS8·9(테스트 추가), WS10(admin 토큰). 각각 D1 적대 검증 후 커밋.
