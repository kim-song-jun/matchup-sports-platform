# Teameet v1 — 2026-06-23 배포 준비 Ledger

> **이 문서의 역할**: 6/23 배포를 향한 작업의 **영속 메모리/컨텍스트 앵커**. 메인 세션 컨텍스트가 꽉 차거나 compaction이 일어나도, 다음 세션·서브에이전트가 이 문서만 읽으면 목표·범위·결정·진행 상태를 그대로 이어받을 수 있다. **모든 의미있는 결정·진행은 여기에 누적**한다. (수기 ledger — 자동 메모리가 아니다.)

- **세션 브랜치**: `feat/v1-consumer-tournament-ia` (PR #21, repo `kim-song-jun/matchup-sports-platform`)
- **시작 커밋**: `b109986b` (admin 라벨 한글화)
- **최종 갱신**: 2026-06-18 (Discovery 종합 완료 시점)

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

> 아래 4개 메커니즘은 **모든 workstream에 강제 적용**한다. 서브에이전트·다음 세션도 이 문서를 읽고 그대로 따른다. 생략은 규칙 위반.

### D1 — 모든 구현에 적대적 검증 (Refute-panel)
- 코드 변경 workstream이 끝나면, 변경을 **반증(refute)하려 시도하는 opus 판정단**을 띄운다(단순 confirm 금지). 관점 분리: 정확성 / 회귀·부작용 / 목표·요구 충족 / 디자인·토큰 정합. **다수가 반증 못 한 finding만 통과**.
- worker(구현·탐색·기계변환)=sonnet/haiku, 판정·종합·설계=opus/fable (글로벌 규칙 11). 비싼 추론은 결정에만.
- "tsc 통과 + 테스트 green"만으로 완료 선언 금지 — **라이브 화면/실행 증거 + refute-panel 통과**까지가 완료.

### D2 — 메모리/컨텍스트 키퍼 (Context-keeper checkpoint)
- **이 ledger가 단일 메모리 소스.** 매 의미있는 workstream 종료 시: (a) §5b 로드맵 상태·(b) §6 진행 로그·(c) §7 열린 결정 갱신 → (d) **PR 브랜치에 커밋·푸시**(pathspec, Co-Authored-By trailer).
- 사용자 "main에 푸쉬" 의도 = "원격에 중앙 보관해 컨텍스트 유실 방지". git 안전 규칙(규칙 6~10)상 **직접 `main` push 불가 → PR 브랜치가 그 원격 보관소**. (배포 시 PR 머지로 main 반영.)
- 컨텍스트가 차오르면 이 문서만으로 새 세션이 100% 이어받을 수 있게 **결정의 "왜"까지** 적는다.

### D3 — 목표 대비 적대적 자기검증 (Goal-alignment gate)
- **새 workstream 착수 전**, opus 서브에이전트가 목표(§1)+ledger+관련 이전 결정을 재독하고 "이 작업이 목표에 복무하는가 / scope-drift·오독 아닌가"를 적대 점검. 애매하면 **중단·에스컬레이트**(추측 진행 금지 — CLAUDE.md 규칙 5·6).

### D4 — 결정 게이트
- Decision Matrix는 **사용자 게이트**(규칙 14) — auto-approve 금지. 표(overview) → `AskUserQuestion`(대화형) 순(규칙 15).
- 단, **명백·저위험·되돌리기 쉬운** 작업(데드코드 제거·카피 수정·토큰 정합)은 D1 적대 검증과 함께 자율 진행. **제품/범위/삭제·롤백** 결정은 반드시 게이트.

## 3. 범위 (SCOPE)

- **IN**: `apps/v1_web` (Next 16, ~110 라우트, 포트 3013) + `apps/v1_api` (NestJS, 포트 8121). consumer 앱 + admin(10 라우트) 모두.
- **OUT**: 레거시 `apps/web` / `apps/api` / `e2e/` (배포 대상 아님 — 단, v1 e2e 작성 시 패턴 참고는 가능).
- v1_web: hand-authored Tailwind v4 `.tm-*` CSS, **light-mode only**(no `dark:`), Toss-clean. 토큰은 `apps/v1_web/src/app/globals.css` @theme. UI/에러 카피 **해요체**.
- 헤더 dev-auth: localStorage `teameet.v1.userId`/`userEmail` → `x-v1-user-*`. 테스트 유저: icon.tester `8e368103-5222-43e4-9efc-6eec0ec2019e`. owner admin: `d554f25e-06f4-4d04-b744-a44124230228` / `admin@teameet.v1`.

## 4. 정찰 결과 (2026-06-18 baseline)

- v1_web 라우트 ≈ **110개** (consumer + admin 10).
- 테스트: v1_web **6** *.test, v1_api **27** *.spec, **v1_api e2e 0**, 레거시 e2e/ 19(범위 외 추정).
- 표면 기술부채 신호: TODO/FIXME **0**, `as any` web 0 / api 1, eslint-disable **9**, empty catch 0. → 표면은 깨끗, 심층(데드코드·디자인·테스트품질)은 Discovery 워크플로로 분석.

## 5. 페르소나 · User Flow 맵 (17명 — 비주얼 감사 마스터 테스트 플랜)

> Discovery 워크플로 산출. **각 페르소나 flow를 mobile 390 / tablet 768 / desktop 1440 × (app+admin)으로 전수 감사**한다. 모든 라우트가 최소 1개 페르소나에 커버됨.

| ID | 페르소나 | 핵심 flow (라우트 체인) |
|----|----------|------------------------|
| P01 | 첫 방문자(이메일 가입) | `/`→landing→login→signup→terms→signup/complete→onboarding/{sport,level,region,confirm}→home |
| P02 | 소셜 로그인(카카오) | login→callback/kakao→[성공:signup/social→onboarding…→home]\|[auth/{account-conflict,missing-email,provider-denied,blocked}] |
| P03 | 개인매치 참가자 | home→matches→filter→matches\|empty\|error→matches/[id](신청)→joined→my/matches/joined |
| P04 | 개인매치 호스트 | matches/new→sport→place-time→confirm→complete→[id]→[id]/applications→[id]/edit→my/matches/created |
| P05 | 팀 창립자 | home→teams→search\|filter→search/empty\|error→teams/new→teams/[id]→my/teams |
| P06 | 팀 owner/manager | my/teams→[id]→[id]/members(초대·역할·퇴출)→teams/[id]/members→teams/[id]/edit→my/teams/members |
| P07 | 팀 일반 멤버 | home→teams→search→teams/[id](가입신청)→my→my/teams→my/teams/[id]→teams/[id]/members |
| P08 | 팀매치 주최자 | team-matches/new→team→sport→place-time→info→condition→confirm→complete→[id]→[id]/edit→filter\|empty\|error |
| P09 | 검색우선 탐색자 | home→search/new→search\|stale\|empty\|error→team-matches→filter→team-matches/[id](신청) |
| P10 | 대회 참가자 | home→tournaments→tournaments/[id](대진표·규정)→[id]/apply→[id]/my |
| P11 | 대회 팀주장(로스터) | tournaments/[id]→apply→my→registrations/[rid]→registrations/[rid]/roster(명단 제출) |
| P12 | 경기후 리뷰어 | my→my/reviews?tab=pending→my/reviews/[sourceType]/[sourceId](작성)→?tab=written→received |
| P13 | 채팅·알림 | home→notifications→notifications/read→chat→chat/[id]→home(badge) |
| P14 | 설정·계정(탈퇴) | my→profile/edit→settings→{sports,location,notifications,legal}→auth/password-reset→settings/withdrawal |
| P15 | 재방문(재개+이메일) | `/`(미완→resume)→onboarding/resume→…→home \| login→login/email→home→matches/[id]→matches/participants |
| P16 | 플랫폼 Admin | admin(KPI)→users(상태변경+reason)→matches→team-matches→teams→audit(2탭·필터) |
| P17 | 대회 Admin | admin→tournaments→tournaments/new→tournaments/[id](대진표·라운드·상태)→admins(권한) |

## 5b. 로드맵 (Discovery opus 종합 결과)

> 종합 노드 529로 1차 실패 → resume 재실행 중. **감사 raw 카운트**: 목표 애매점 9 · 데드코드 web 15·api 10 · 테스트 12 · 디자인 13 · **카피 33**.

_(opus 종합 완료 시 우선순위 workstream·blocker·테스트전략으로 갱신)_

## 6. 진행 로그 (Progress Log)

| 일자 | 작업 | 커밋 | 비고 |
|------|------|------|------|
| 2026-06-18 | admin 감사로그·대시보드 라벨 한글화 | `b109986b` | Phase B 완료, 푸시됨 |
| 2026-06-18 | Discovery & 적대적 목표검증 워크플로 | — | run `wf_e9cd25df-889`, 7축 감사 완료, 17 페르소나 확보, opus 종합 resume 중 |

## 7. 열린 결정 (Open Decisions — 사용자 게이트)

_(Discovery 종합 후 채움)_
