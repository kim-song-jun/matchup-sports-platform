# Teameet v1 — 17 페르소나 user flow 테스트 플랜

> "모든 기능 × 모든 사용자, 하나도 빠짐없이"의 마스터 테스트 플랜. 각 페르소나마다 라이브 플로우를
> 헤더 dev-auth(localStorage `teameet.v1.userId`/`userEmail`)로 walk-through하며 **사용성·문구·디자인(토스급)**을
> 점검·개선한다. 스택: pg:5432 + v1_api:8121 + v1_web:3013(preview). 감사 상태는 이 표로 추적한다.

| # | 페르소나 | 역할/맥락 | 플로우 경로 | 라이브 감사 |
|---|----------|-----------|-------------|-------------|
| P01 | 신규 방문자(이메일 가입) | 첫 방문, 가입→온보딩 황금경로 | `/`→landing→login→signup→terms→signup/complete→onboarding/{sport,level,region,confirm}→home | landing✅·home✅ / 온보딩·signup ⏳ |
| P02 | 소셜 로그인(카카오) | OAuth + 에러분기 | login→callback/kakao→[signup/social→onboarding→home] \| [account-conflict/missing-email/provider-denied/blocked] | ⏳ |
| P03 | 캐주얼 매치 참가자 | 개인 매치 탐색·신청 | home→matches→(?filter)→matches/[id]→matches/joined→my/matches/joined | matches✅ / 상세·joined ⏳ |
| P04 | 매치 호스트 | 매치 생성·신청자 관리 | matches/new/{sport,place-time,confirm,complete}→matches/[id]/applications→edit→my/matches/created | applications✅(Rank4) / wizard ⏳ |
| P05 | 팀 창단자 | 팀 생성·탐색 | home→teams→teams/search→teams/new→teams/[id]→my/teams | teams✅ / new·detail ⏳ |
| P06 | 팀 owner/manager | 멤버 관리·역할·팀설정 | my→my/teams→my/teams/[id]→my/teams/[id]/members→teams/[id]/edit | my✅ / members·edit ⏳ |
| P07 | 팀 멤버 | 소속팀 조회·가입신청 | home→teams→teams/[id]→my→my/teams→my/teams/[id] | teams✅·my✅ ⏳ |
| P08 | 팀매치 주최자 | 8단계 wizard·신청팀 관리 | team-matches/new/{team,sport,place-time,info,condition,confirm,complete}→team-matches/[id]→edit | ⏳ |
| P09 | 오픈매치/검색 사용자 | 통합 검색·팀매치 도전 | home→search/new→search→team-matches→team-matches/[id] | tournaments✅(인접) / search ⏳ |
| P10 | 대회 참가자 | 대회 신청·현황 | home→tournaments→tournaments/[id]→tournaments/[id]/apply→tournaments/[id]/my | tournaments✅ / apply·my ⏳ |
| P11 | 대회 팀 주장(로스터) | 로스터 구성·제출 | tournaments/[id]/my→tournaments/[id]/registrations/[rid]/roster | ⏳ |
| P12 | 경기 후 리뷰어 | 리뷰 작성·수신 | my/reviews(pending)→my/reviews/[type]/[id]→my/reviews/received | ⏳ |
| P13 | 채팅·알림 사용자 | 소통·알림 확인 | notifications→chat→chat/[id] | notifications✅(Rank4) / chat ⏳ |
| P14 | 설정·탈퇴 사용자 | 알림/지역/종목/탈퇴 | my/settings→{notifications,location,sports,legal,withdrawal} | ⏳ |
| P15 | 복귀 사용자 | 온보딩 재개·로그인 | onboarding/resume→login/email→matches/participants | ⏳ |
| P16 | 플랫폼 admin(owner) | 운영 대시보드·관리 | admin→{users,matches,team-matches,teams,tournaments,audit,admins} | admin 라이브✅(이전 세션, 라벨 한글화) |
| P17 | 대회 admin | 대진/조/공지 관리 | admin/tournaments/[id](대진관리·공지) | admin 라이브✅(이전 세션) |

## 점검 기준(페르소나 렌즈)
- **사용성**: 그 페르소나가 막힘 없이 목표 달성? dead-end·혼란 없음?
- **문구**: 해요체·자연스러움·raw 영문 없음? (lint 강제 중)
- **디자인**: 토스급 미니멀·깔끔·직관? 토큰 일관·a11y 44px/focus/aria?
- **상태**: loading/error/empty 적절? (Rank4로 notices/notifications 처리됨)

## 진행
- 라이브 감사 완료: landing·home·matches·tournaments·teams·my(6) + admin 표면(이전 세션).
- 종합 코드 감사(8도메인 ~91 findings)로 **전 화면 빠짐없이** 커버 → 발견 이슈 순차 수정 중(`ws11-audit-findings.md`).
- P04 매치생성 wizard 1단계(/matches/new/sport) 라이브 감사: 깔끔(1/4단계 진행바·종목카드·CTA 양호).
  **발견(콘텐츠 — 🔴 OPEN DECISION, 사용자 게이트)**: API 확인 결과 v1_api master sports = **4종목**(축구/풋살/러닝/수영,
  각 4레벨)이 실제 seed. 그러나 `landing/page.tsx`는 **"11개 종목"** + 11개 이름(아이스하키🏒/클라이밍🧗 등, L43/167/174-182)을
  **하드코딩** 광고. → 사용자가 landing의 11종목 보고 가입해도 매치생성/필터엔 4종목뿐 = 과장·오해.
  **배포 전 제품 결정 필요**: (a) 11종목 DB seed 추가(백엔드) / (b) landing 카피를 실제 4종목 또는 'aspirational(준비중)'로 조정(프론트).
  코드 단독 결정 불가 — 제품 의도 확인 후 처리.
- ⏳ 라이브 페르소나 walk 잔여: 온보딩 wizard(P01)·매치 wizard 2~4단계·팀매치 wizard(P08)·대회 신청·로스터(P10/P11)·설정(P14)·채팅(P13) 등 — 화면별 진행. (종합 코드감사로 전 화면 이미 커버됨.)
