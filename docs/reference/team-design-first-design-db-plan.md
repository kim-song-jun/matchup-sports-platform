# Team Design 1차 디자인 완성 DB 설계 초안

## 1. 설계 개요

이 문서는 `Team Design` 패널의 `1차 디자인 완료` 모드에 노출되는 화면만 기준으로
DB를 역산한 신규 설계 초안이다.

이번 단계에서는 API를 설계하지 않는다. 기존 프로젝트의 코드, DB, API 문서는
참고만 했고, 기존 schema를 그대로 복사하지 않았다.

```text
Design source:
docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html

Design mode:
SMNewViewerGuide > 1차 디자인 완료

Primary sections:
SM_FIRST_DESIGN_COMPLETE_SECTIONS
```

## 2. 기준 디자인 범위

`Teameet Design.html`의 `SM_FIRST_DESIGN_COMPLETE_SECTIONS` 기준.

| 순서 | Section id | 화면 묶음 |
|---:|---|---|
| 1 | `core-shell-sm-final` | 00 SM 최종 shell |
| 2 | `auth-onboarding-sm-final` | 01 인증/온보딩 최종 |
| 3 | `home-discovery-sm-final` | 02 홈 최종 |
| 4 | `home-notice-sm-final` | 02-1 공지 최종 |
| 5 | `matches-core-sm-final` | 03 개인 매치 최종 |
| 6 | `matches-core-sm-create-final` | 03-1 개인 매치 만들기/수정 최종 |
| 7 | `teams-team-matches-sm-revision-4` | 04 팀매치 조회/상세 최종 |
| 8 | `teams-team-matches-sm-create-final` | 04-1 팀매치 만들기/수정 최종 |
| 9 | `team-browse-sm-revision-5` | 05 팀 둘러보기 최종 |
| 10 | `community-sm-final` | 06 커뮤니티/채팅 최종 |
| 11 | `my-profile-trust-sm-revision` | 07 마이/프로필/평판 |
| 12 | `payments-support-sm-revision` | 08 결제/환불/분쟁 |
| 13 | `settings-states` | 09 설정/약관/상태 |
| 14 | `public-marketing-sm-revision` | 10 공개/마케팅 |
| 15 | `desktop-web` | 11 데스크탑 웹 |
| 16 | `admin-ops-sm-revision` | 12 관리자/운영 |
| 17 | `common-flows-motion` | 13 공통 플로우/인터랙션 |

주의: `core-final-00~02` 반복 섹션도 존재하지만, 패널의 `1차 디자인 완료`
모드는 위 section 배열을 실제 필터 기준으로 사용한다.

## 3. 참고한 기존 문서/코드 목록

참고만 했다. 신규 설계는 아래 파일의 구조를 그대로 사용하지 않는다.

| 구분 | 파일/경로 | 참고 목적 |
|---|---|---|
| 기준 디자인 | `docs/reference/handoff-sm-new-direction/sports-platform/project/Teameet Design.html` | `1차 디자인 완료` section 및 artboard 목록 확인 |
| 기준 디자인 컴포넌트 | `docs/reference/handoff-sm-new-direction/sports-platform/project/lib/screens-sm-revision.jsx` | 화면에 보이는 데이터, 입력, 버튼, 상태 역산 |
| mock 데이터 | `docs/reference/handoff-sm-new-direction/sports-platform/project/lib/data.jsx` | 화면 예시 데이터 shape 확인 |
| 기존 DB | `apps/api/prisma/schema.prisma` | 기존 도메인 존재 여부만 확인 |
| 기존 Web routes | `apps/web/src/app/(main)`, `apps/web/src/app/admin` | 현재 route family 존재 여부만 확인 |
| 기존 API 문서 | `docs/api/domains/*.md`, `docs/api/realtime-and-notifications.md` | 참고 가능 영역 분리 |

## 4. 화면 목록

| 화면 | 세부 화면 |
|---|---|
| 00 Shell | 상단바, 하단 5탭, 알림, 검색바 뒤로가기형, 검색바 필터형, shell action matrix |
| 01 Auth | 약관 동의, 회원가입 완료, 운동 설정 1/3 종목, 2/3 실력, 3/3 지역, 최종 환영, 소셜/계정 예외 |
| 02 Home | 홈 main, 홈 검색 결과, 미입력, empty, error toast, stale, 비로그인, 네트워크 이슈 |
| 02-1 Notice | 공지 전체 조회, 공지 상세 |
| 03 Match | 목록 카드형/콤팩트형, 필터 sheet, 검색 결과, empty/error, 상세, 참가 sheet, 결제 후 toast, 승인중/승인완료, 내 매치, 참가자 더보기 |
| 03-1 Match Create | 목록 FAB, 종목, 정보, 장소/시간, 확인, 생성 완료 공유, 수정 prefill |
| 04 Team Match | 목록 카드형/콤팩트형, 필터 sheet, 검색 결과, empty/error, 상세/신청, 승인중/승인완료, 내 팀매치 관리 |
| 04-1 Team Match Create | 목록 FAB, 팀 선택, 종목, 정보, 경기조건, 장소/시간, 확인, 생성 완료 공유, 수정 prefill |
| 05 Team Browse | 팀 목록, 검색, empty/error, 필터 sheet, 팀 상세, 가입/신청 상태 |
| 06 Community | 홈 채팅 floating entry, 채팅 목록, 카테고리, 고정/나가기 swipe, 나가기 확인 sheet |
| 07 My | 마이 홈, 내 활동, 내 매치, 만든 매치 관리, 내 팀매치, 내 팀, 팀 상세, 멤버 관리 |
| 08 Payments | 결제/환불/분쟁 상태, 테스트 결제 문구, 환불/분쟁 처리 주체 |
| 09 Settings | 계정/알림/약관/상태, 권한/탈퇴/약관 버전 |
| 10 Public | 랜딩/공개 화면, 공개 프로필/CTA |
| 11 Desktop | 데스크탑 랜딩, 홈, 매치 탐색, 사이드 패널, 키보드/포커스 |
| 12 Admin | 운영 큐, 모바일 운영, 관리자 대시보드/상세/처리 |
| 13 Common | 등록/수정 shell, bottom sheet, toast, skeleton, destructive confirm, 상태 atlas |

## 5. 화면별 기능 분석

### 00 Shell

- 화면 목적: 전체 core 화면의 navigation, 검색, 알림, shell 상태를 고정한다.
- 표시 데이터: 현재 탭, 알림 unread/new 여부, 검색 query, 필터 개수.
- 입력 필드: 검색어.
- UI 액션: 뒤로가기, 검색 입력, 검색 실행, 검색어 지우기, 필터 열기, 하단 5탭 이동.
- 필요 데이터: user session, unread count, active route, search draft, filter count.
- DB 후보: `users`, `user_sessions`, `notifications`, `notification_reads`, `search_histories`.
- 로그인/권한: 로그인 전에도 일부 shell 가능. 알림/마이는 로그인 필요.
- 확인 필요: SM 5탭이 production bottom nav를 대체하는지.

### 01 인증/온보딩

- 화면 목적: 회원가입 전 약관 동의, 계정 생성 완료, 운동 설정을 완료한다.
- 표시 데이터: 약관 목록, 동의 여부, 회원가입 완료 상태, 선택 종목, 종목별 실력, 활동 지역, 위치 권한 상태.
- 입력 필드: 약관 checkbox, 종목 선택, 레벨 선택, 지역 선택, 위치 권한 요청.
- UI 액션: 필수 약관 전체 동의, 약관 상세 보기, 회원가입 진행, 운동 설정 시작/나중에, 종목 선택, 실력 입력, 현재 위치로 찾기, 수동 지역 선택, 홈 시작.
- 필요 데이터: user, auth provider, terms version, consent records, onboarding step, sport preferences, skill levels, preferred regions, permission state.
- DB 후보: `users`, `auth_identities`, `terms_documents`, `user_terms_consents`, `sports`, `user_sport_preferences`, `regions`, `user_regions`, `user_onboarding_progress`, `user_permission_states`.
- 상태값: `onboarding_status`, `auth_identity_status`, `account_status`, `permission_status`.
- 기존 참고: 기존 `User`, `UserSportProfile` 존재.
- 신규 필요: 약관 version 동의 이력, onboarding step resume, 위치 권한 상태를 별도 관리.

### 02 홈

- 화면 목적: 개인화된 추천, quick action, 검색 진입, 통계, 공지를 제공한다.
- 표시 데이터: 인사, 이번 달 활동, 매너 점수, 대표 추천 매치, quick actions, 날씨, 추천 매치 5개, 월간 통계, pinned 공지.
- 입력 필드: 검색어, 빠른 조건.
- UI 액션: 검색, 알림, 오늘의 추천 상세, 매치/팀매치/팀 이동, 나의 팀 disabled, 추천 전체보기, 추천 카드 상세, 공지 전체보기/상세, 다시 불러오기.
- 필요 데이터: user summary, recommendation source, match fill ratio, weather snapshot, monthly stats, pinned notices, search recent terms, quick filters.
- DB 후보: `user_activity_summaries`, `user_reputation_summaries`, `match_recommendations`, `search_histories`, `notices`, `notice_reads`.
- 상태값: 비로그인, 네트워크 이슈, stale search, empty search, error toast.
- 확인 필요: 날씨 데이터를 DB에 저장할지 외부/캐시로만 둘지.

### 02-1 공지

- 화면 목적: 홈 pinned notice를 전체 목록과 상세로 확장한다.
- 표시 데이터: 공지 제목, pin 여부, 게시 상태, 내용, 작성/게시일.
- UI 액션: 공지 row tap, 전체보기, 뒤로가기.
- 필요 데이터: notice, notice publish period, read state.
- DB 후보: `notices`, `notice_reads`.
- 상태값: `draft`, `scheduled`, `published`, `archived`.

### 03 개인 매치

- 화면 목적: 개인 매치 탐색, 검색/필터, 상세 판단, 참가 신청 상태를 관리한다.
- 표시 데이터: 카드/콤팩트 목록, 종목 count, 매치수/오늘매치수/마감임박, 정렬, 필터 수, 상세의 일시/장소/인원/참가비/호스트/소개/참가자.
- 입력 필드: 검색어, 정렬, 보기 방식, 종목, 필터, 참가 sheet 확인.
- UI 액션: 검색 실행, X 지우기, 필터 sheet 열기/닫기/초기화/적용, 정렬 선택, 보기 전환, 종목 chip 선택, 카드/row 상세 이동, 공유, 알림, 참가 CTA, 결제하고 참가, 내 매치 관리.
- 필요 데이터: match, match media, schedule, venue/manual place, participant count, capacity, fee, host profile, participant applications, payment attempt, approval state, notification subscription.
- DB 후보: `matches`, `match_media`, `match_participants`, `match_applications`, `payments`, `match_notification_subscriptions`, `search_histories`.
- 상태값: `recruiting`, `deadline_soon`, `full`, `closed`, `cancelled`, `completed`, 참가 `requested`, `pending_approval`, `approved`, `rejected`, `cancelled`.
- 기존 참고: 기존 `Match`, `MatchParticipant`, `Payment` 존재.
- 신규 필요: 보기/필터 draft는 API query로 처리하되 검색 이력은 저장 후보.

### 03-1 개인 매치 만들기/수정

- 화면 목적: 개인 매치를 생성하고, 내 매치 상세에서 수정한다.
- 표시 데이터: 4단계 progress, 선택 종목, 제목/설명/이미지, 최대 인원, 참가비, 레벨 범위, 성별 제한, 추가 규칙, 시설/직접 장소, 날짜/시간, 확인 요약, 생성 완료 공유 옵션.
- 입력 필드: sport, title, description, image upload, max participants, fee, min/max level, gender restriction, rule text, venue/manual place, date, start/end time.
- UI 액션: FAB, 다음/이전/취소/닫기, 종목 선택, 이미지 업로드, 시설 선택, 직접 장소 입력, 확인 화면 수정, 매치 만들기, 팀 공유, 링크 복사, 관심 멤버 초대, 수정 저장, 변경 취소.
- 필요 데이터: match draft, uploaded file, venue reference or manual place, schedule validation, share target, creator ownership.
- DB 후보: `matches`, `match_media`, `venues`, `share_events`, `chat_messages`.
- 상태값: draft는 client/API 단계 후보. DB 저장 시 `draft`, `published`, `cancelled`.
- 확인 필요: 임시저장을 디자인 기능으로 확정할지.

### 04 팀매치

- 화면 목적: 팀 단위 매치 모집글을 탐색하고 신청/승인 상태를 확인한다.
- 표시 데이터: 팀매치 목록, 종목 count, 카드/콤팩트, 경기 방식, 등급, 비용, 유니폼, host team, 신청 상태.
- 입력 필드: 검색어, 종목, 정렬, 보기 방식, 필터.
- UI 액션: 검색/필터/정렬/보기 전환, 상세 이동, 채팅 및 신청, 결제하고 신청하기, 승인중/승인완료 확인, 내 팀매치 관리.
- 필요 데이터: team match, host team, sport, grade, format, cost, free invite, application, payment, chat room.
- DB 후보: `teams`, `team_memberships`, `team_matches`, `team_match_applications`, `payments`, `chat_rooms`.
- 상태값: team match `recruiting`, `matched`, `closed`, `cancelled`, `completed`; application `requested`, `pending`, `approved`, `rejected`, `withdrawn`.

### 04-1 팀매치 만들기/수정

- 화면 목적: 내 팀 권한으로 팀매치를 생성/수정한다.
- 표시 데이터: 6단계 progress, 내 팀 목록, 권한, 종목, 제목/설명/이미지, 경기조건, 장소/시간, 확인 요약, 팀 공유 완료.
- 입력 필드: team, sport, title, description, image, skill grade, pro player count, max members, match format, match type, play styles, uniform color, free invite, mercenary allowed, referee assigned, total cost, opponent cost, gender restriction, rules, venue/manual place, date/time, duration, quarter count.
- UI 액션: 팀 선택, 종목 선택, 경기조건 선택, 비용 입력, 무료초청 비용 lock, 시설/직접 입력, 작성 확인, 팀매치 만들기, 팀 채팅 공유, 링크 복사, 상대팀 후보 공유, 수정 저장.
- 필요 데이터: team ownership/role, team match conditions, cost allocation, venue/schedule, invitation/share events.
- DB 후보: `teams`, `team_memberships`, `team_matches`, `team_match_styles`, `team_match_invitations`, `chat_messages`.
- 확인 필요: 심판 배정/용병 허용이 1차 출시 기능인지.

### 05 팀 둘러보기

- 화면 목적: 전체 팀을 검색/필터하고 팀 상세를 본 뒤 가입/선택한다.
- 표시 데이터: 팀 목록, 팀명, 종목, 멤버 수, 등급, 매너/신뢰 상태, 활동 조건, 팀 소개, 멤버/전적/신뢰 신호, 가입 상태.
- 입력 필드: 검색어, 필터, 정렬 후보.
- UI 액션: 검색, 필터 sheet, team row/card tap, 가입/신청, 신청 대기/승인 상태 확인.
- 필요 데이터: team profile, sport, regions, trust score, membership policy, join application.
- DB 후보: `teams`, `team_profiles`, `team_memberships`, `team_join_applications`, `team_trust_scores`.
- 확인 필요: `나의 팀` quick action의 destination.

### 06 커뮤니티/채팅

- 화면 목적: 홈 floating 채팅 진입 후 채팅방 목록을 분류/관리한다.
- 표시 데이터: 채팅방 제목, 유형, 카테고리, last message, 시간, unread count, pinned 여부, avatar.
- 입력 필드: 없음. 카테고리 chip과 swipe action.
- UI 액션: 홈 floating button, 카테고리 선택, row tap, row swipe, 고정/고정 해제, 나가기, 나가기 확인 sheet.
- 필요 데이터: chat room, participant, category, last message, unread count, pinned state, leave state.
- DB 후보: `chat_rooms`, `chat_room_participants`, `chat_messages`.
- 상태값: room `active`, `archived`, `expired`; participant `active`, `left`, `blocked`.
- 기존 참고: 기존 chat/notification 문서의 late-connect/backfill 주의점.

### 07 마이/프로필/평판

- 화면 목적: 내 활동, 참가/생성 매치, 팀, 멤버 관리, 평판/리뷰 신호를 조회한다.
- 표시 데이터: 프로필, 활동 요약, 참가한 매치, 만든 매치, 내 팀매치, 내 팀, 팀 멤버, 관리 CTA, 리뷰/평판.
- 입력 필드: 관리/수정 진입. 상세 입력은 03-1/04-1 폼을 재사용.
- UI 액션: 카테고리 전환, 상세 이동, 만든 매치 관리, 매치 수정, 팀매치 수정, 팀 상세, 멤버 관리.
- 필요 데이터: user profile, activity history, created/joined matches, teams, memberships, reviews, reputation summary.
- DB 후보: `users`, `user_profiles`, `match_participants`, `team_match_applications`, `teams`, `team_memberships`, `reviews`, `user_reputation_summaries`.

### 08 결제/환불/분쟁

- 화면 목적: 참가/신청 결제와 환불/분쟁 상태를 정직하게 보여준다.
- 표시 데이터: 결제 금액, 테스트 결제/실청구 없음 문구, 결제 상태, 환불 사유/주체, 분쟁 상태.
- 입력 필드: 환불 요청 사유, 분쟁 사유 후보.
- UI 액션: 결제 시도, 재시도, 닫기, 환불 요청, 분쟁 제기, 상태 확인.
- 필요 데이터: payment, payment attempt, refund request, dispute, target entity.
- DB 후보: `payments`, `payment_attempts`, `refund_requests`, `disputes`, `dispute_events`.
- 상태값: payment `prepared`, `pending`, `paid`, `failed`, `cancelled`, `refunded`, `test_only`; refund `requested`, `reviewing`, `approved`, `rejected`, `processed`; dispute `opened`, `admin_reviewing`, `resolved`, `rejected`.

### 09 설정/약관/상태

- 화면 목적: 계정, 알림, 개인정보, 약관, 상태/오류 페이지를 관리한다.
- 표시 데이터: 계정 정보, 알림 preference, 약관 버전, 권한 상태, 탈퇴 상태.
- 입력 필드: 알림 toggle, privacy setting, account deletion confirm.
- UI 액션: 설정 변경, 약관 상세, 알림 권한 연결, 탈퇴 확인.
- 필요 데이터: user settings, notification preferences, terms docs, consent history, account deletion request.
- DB 후보: `user_settings`, `notification_preferences`, `terms_documents`, `user_terms_consents`, `account_deletion_requests`.

### 10 공개/마케팅

- 화면 목적: 비로그인 사용자가 서비스와 core flow를 이해하고 가입/로그인으로 이동한다.
- 표시 데이터: 랜딩 CTA, 공개 프로필/팀/매치 미리보기, 가격/FAQ/가이드 후보.
- 입력 필드: 없음 또는 공개 검색 후보.
- UI 액션: 시작하기, 로그인, 공개 상세 이동.
- 필요 데이터: published public content, public profile visibility, marketing content blocks.
- DB 후보: `marketing_pages`, `marketing_sections`, `public_profile_settings`.
- 확인 필요: 마케팅 CMS를 DB로 둘지 정적 문서로 둘지.

### 11 데스크탑 웹

- 화면 목적: 데스크탑에서 랜딩, 홈, 매치 탐색을 workspace layout으로 제공한다.
- 표시 데이터: mobile core와 동일 데이터의 desktop projection, side panel, filters, keyboard focus state.
- 입력 필드: search/filter/sort.
- UI 액션: keyboard navigation, row selection, side panel open/close, table overflow handling.
- 필요 데이터: 별도 도메인 테이블보다 user preference와 saved filter가 필요하다.
- DB 후보: `user_search_preferences`, `saved_filters`.

### 12 관리자/운영

- 화면 목적: 운영 큐, 사용자/매치/팀/결제/분쟁 상태를 추적 가능하게 처리한다.
- 표시 데이터: 운영 큐, KPI, 처리 대상, 담당자, 사유, audit, partial failure.
- 입력 필드: 처리 사유, 상태 변경, 담당자 배정, 메모.
- UI 액션: 큐 필터, 상세 열기, 상태 변경, 일괄 처리, 담당자 배정, 실패 재시도.
- 필요 데이터: admin user, moderation queue, audit logs, operation tasks, status transition history.
- DB 후보: `admin_users`, `admin_operation_tasks`, `admin_action_logs`, `moderation_reports`, `status_change_logs`.
- 상태값: task `open`, `assigned`, `in_review`, `blocked`, `resolved`, `failed`.

### 13 공통 플로우/인터랙션

- 화면 목적: 등록/수정 shell, bottom sheet, toast, skeleton, destructive confirm, pending state를 공통 계약으로 둔다.
- 표시 데이터: 공통 상태와 UI event.
- 입력 필드: confirmation reason, destructive confirm text 후보.
- UI 액션: sheet open/close, confirm/cancel, toast display, retry, pending lock.
- 필요 데이터: 모든 도메인에 공통으로 필요한 audit/event/status history.
- DB 후보: 별도 UI 테이블보다는 `operation_events`, `status_change_logs`, `user_drafts` 후보.

## 6. 화면별 UI 액션 분석

| 액션 그룹 | 대표 액션 | 필요한 데이터 | DB 반영 후보 |
|---|---|---|---|
| Navigation | 뒤로가기, 탭 이동, 상세 이동 | route target, source context | 저장 불필요. analytics 후보 |
| Search | query 입력, 실행, 지우기, 최근 검색 | user, query, result type, timestamp | `search_histories` |
| Filter/Sort/View | 종목 chip, 정렬, 보기 방식, filter sheet | filter draft, applied filters | 저장 불필요. 저장 필터는 `saved_filters` |
| Match Join | 참가 sheet, 결제하고 참가, 승인중/승인완료 | match, participant, payment, approval | `match_applications`, `payments` |
| Create/Edit | 생성 wizard, 수정 prefill, 저장/취소 guard | draft, uploaded media, owner | domain table + `user_drafts` 후보 |
| Share | 팀 채팅 공유, 링크 복사, 관심 멤버 초대 | target, link, message, sent state | `share_events`, `chat_messages` |
| Chat | room tap, pin, leave, unread | participant room state | `chat_room_participants`, `chat_messages` |
| Admin | assign, status change, partial failure | admin, reason, before/after state | `admin_action_logs`, `status_change_logs` |

## 7. 화면별 필요 데이터 정리

| 도메인 | 핵심 데이터 |
|---|---|
| 사용자 | 계정, 프로필, 상태, 권한, provider identity, onboarding progress |
| 약관 | 약관 문서, 버전, 필수/선택, 사용자 동의 이력 |
| 종목/지역 | sport master, level, region, user preference |
| 홈 | 사용자 활동 요약, 매너 요약, 추천 매치, 날씨/공지/검색 이력 |
| 매치 | match, schedule, venue/manual place, media, capacity, fee, host, participants, applications |
| 팀 | team profile, membership, roles, trust score, join application |
| 팀매치 | team match, conditions, cost split, applications, invitations |
| 채팅/알림 | rooms, participants, messages, read state, pin/leave, notifications |
| 결제/분쟁 | payment, attempts, refund, dispute, events |
| 관리자 | admin users, operation tasks, reports, action logs, status history |

## 8. DB 설계 초안

공통 컬럼 후보:

```text
id uuid pk
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
deleted_at timestamptz null
created_by uuid null
updated_by uuid null
```

### Identity / User

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `users` | 서비스 사용자 | `id`, `email`, `nickname`, `phone`, `profile_image_url`, `account_status`, `onboarding_status`, `last_login_at` | `email unique`, `account_status` | 01, 02, 07 |
| `auth_identities` | 소셜/이메일 인증 연결 | `id`, `user_id fk`, `provider`, `provider_user_key`, `email`, `status`, `linked_at` | `(provider, provider_user_key) unique`, `user_id` | 01 |
| `user_profiles` | 공개/마이 프로필 | `user_id pk/fk`, `bio`, `manner_score`, `activity_count`, `visibility_status` | `visibility_status` | 07, 10 |
| `user_onboarding_progress` | 온보딩 resume | `user_id pk/fk`, `current_step`, `completed_steps jsonb`, `deferred_at`, `completed_at` | `current_step` | 01 |
| `user_permission_states` | 위치/알림 권한 상태 | `id`, `user_id fk`, `permission_type`, `status`, `last_checked_at` | `(user_id, permission_type)` | 01, 02, 03 |

상태값 후보:

- `account_status`: `active`, `blocked`, `suspended`, `withdrawal_pending`, `deleted`
- `onboarding_status`: `not_started`, `terms_done`, `signup_done`, `sport_done`, `level_done`, `region_done`, `completed`, `deferred`
- `permission_status`: `unknown`, `granted`, `denied`, `blocked`, `manual`

### Terms / Consent

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `terms_documents` | 약관 문서 버전 | `id`, `terms_type`, `title`, `version`, `required`, `content`, `published_at`, `status` | `(terms_type, version) unique`, `status` | 01, 09 |
| `user_terms_consents` | 사용자 약관 동의 이력 | `id`, `user_id fk`, `terms_document_id fk`, `consented`, `consented_at`, `revoked_at` | `(user_id, terms_document_id) unique` | 01, 09 |

### Master Data

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `sports` | 종목 master | `id`, `code`, `name`, `display_order`, `is_active`, `icon_key` | `code unique`, `is_active` | 01, 02, 03, 04, 05 |
| `sport_levels` | 종목별 실력 코드 | `id`, `sport_id fk null`, `code`, `label`, `rank_order`, `description` | `(sport_id, code)` | 01, 03, 04 |
| `regions` | 활동 지역 master | `id`, `parent_id fk`, `name`, `region_type`, `is_active` | `parent_id`, `name` | 01, 02, 03, 05 |
| `venues` | 시설 선택 후보 | `id`, `name`, `address`, `region_id fk`, `venue_type`, `geo_lat`, `geo_lng`, `is_active` | `region_id`, `venue_type` | 03-1, 04-1 |

### User Preference / Search

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `user_sport_preferences` | 관심 종목과 실력 | `id`, `user_id fk`, `sport_id fk`, `level_code`, `is_primary` | `(user_id, sport_id) unique` | 01, 02 |
| `user_regions` | 활동 지역 | `id`, `user_id fk`, `region_id fk`, `source`, `is_primary` | `(user_id, region_id)` | 01, 02 |
| `search_histories` | 최근 검색 | `id`, `user_id fk null`, `query`, `search_scope`, `filters jsonb`, `searched_at` | `(user_id, searched_at desc)`, `query` | 02, 03, 04, 05 |
| `saved_filters` | 저장/복원 필터 후보 | `id`, `user_id fk`, `scope`, `name`, `filters jsonb`, `is_default` | `(user_id, scope)` | 03, 04, 11 |

### Settings / Account

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `user_settings` | 계정/개인정보 설정 | `user_id pk/fk`, `profile_visibility`, `search_visibility`, `marketing_opt_in`, `updated_at` | `user_id` | 09 |
| `account_deletion_requests` | 탈퇴 요청/대기 | `id`, `user_id fk`, `status`, `reason_code`, `requested_at`, `scheduled_delete_at`, `cancelled_at` | `(user_id, status)`, `scheduled_delete_at` | 09 |

### Home / Notice / Summary

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `user_activity_summaries` | 홈 월간 활동 요약 | `id`, `user_id fk`, `period_month`, `match_count`, `mvp_count`, `payment_amount`, `previous_delta jsonb` | `(user_id, period_month) unique` | 02 |
| `user_reputation_summaries` | 매너/평판 요약 | `user_id pk/fk`, `manner_score`, `percentile`, `review_count`, `updated_at` | `manner_score` | 02, 07 |
| `match_recommendations` | 홈 추천 결과 캐시 후보 | `id`, `user_id fk null`, `match_id fk`, `reason_code`, `rank`, `snapshot_at` | `(user_id, snapshot_at, rank)` | 02 |
| `notices` | 공지 | `id`, `title`, `body`, `notice_type`, `pinned`, `status`, `publish_start_at`, `publish_end_at` | `(status, pinned, publish_start_at)` | 02, 02-1 |
| `notice_reads` | 공지 읽음 | `id`, `notice_id fk`, `user_id fk`, `read_at` | `(notice_id, user_id) unique` | 02-1 |

### Match

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `matches` | 개인 매치 | `id`, `host_user_id fk`, `sport_id fk`, `title`, `description`, `venue_id fk null`, `manual_place_name`, `manual_address`, `starts_at`, `ends_at`, `capacity`, `fee_amount`, `min_level_code`, `max_level_code`, `gender_rule`, `status`, `deadline_at` | `sport_id`, `starts_at`, `status`, `host_user_id` | 02, 03, 03-1 |
| `match_media` | 매치 이미지 | `id`, `match_id fk`, `file_url`, `media_role`, `sort_order`, `uploaded_by` | `match_id` | 03, 03-1 |
| `match_rules` | 추가 규칙 | `id`, `match_id fk`, `rule_text`, `sort_order` | `match_id` | 03-1 |
| `match_applications` | 참가 신청/승인 | `id`, `match_id fk`, `user_id fk`, `status`, `requested_at`, `approved_at`, `rejected_at`, `decided_by fk null`, `decision_reason` | `(match_id, user_id) unique`, `status` | 03 |
| `match_participants` | 확정 참가자 | `id`, `match_id fk`, `user_id fk`, `joined_at`, `status`, `payment_id fk null` | `(match_id, user_id) unique` | 03 |
| `match_notification_subscriptions` | 매치 알림 설정 | `id`, `match_id fk`, `user_id fk`, `enabled`, `created_at` | `(match_id, user_id) unique` | 03 |

### Team / Team Match

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `teams` | 팀 기본 정보 | `id`, `owner_user_id fk`, `name`, `sport_id fk`, `logo_url`, `intro`, `member_count_cache`, `level_code`, `manner_score`, `status`, `visibility` | `sport_id`, `status`, `visibility` | 04, 05, 07 |
| `team_profiles` | 팀 상세 소개 | `team_id pk/fk`, `activity_regions jsonb`, `activity_rule`, `trust_label`, `join_policy`, `uniform_text` | `team_id` | 05 |
| `team_memberships` | 팀 멤버/권한 | `id`, `team_id fk`, `user_id fk`, `role`, `status`, `joined_at` | `(team_id, user_id) unique`, `role` | 04-1, 07 |
| `team_join_applications` | 팀 가입 신청 | `id`, `team_id fk`, `user_id fk`, `status`, `message`, `decided_by`, `decided_at` | `(team_id, user_id, status)` | 05 |
| `team_trust_scores` | 팀 신뢰/평판 요약 | `team_id pk/fk`, `manner_score`, `activity_count`, `verified_state`, `sample_state`, `updated_at` | `verified_state` | 05 |
| `team_matches` | 팀매치 모집 | `id`, `host_team_id fk`, `sport_id fk`, `title`, `description`, `venue_id fk null`, `manual_place_name`, `starts_at`, `ends_at`, `format_code`, `grade_code`, `pro_player_count`, `max_players`, `match_type`, `total_cost`, `opponent_cost`, `free_invite`, `mercenary_allowed`, `referee_assigned`, `gender_rule`, `uniform_text`, `status` | `host_team_id`, `sport_id`, `starts_at`, `status` | 04, 04-1 |
| `team_match_styles` | 팀매치 스타일 태그 | `id`, `team_match_id fk`, `style_code` | `(team_match_id, style_code)` | 04-1 |
| `team_match_applications` | 상대팀 신청/승인 | `id`, `team_match_id fk`, `applicant_team_id fk`, `status`, `message`, `payment_id fk null`, `decided_by`, `decided_at` | `(team_match_id, applicant_team_id) unique`, `status` | 04 |
| `team_match_invitations` | 상대팀 후보/링크 초대 | `id`, `team_match_id fk`, `target_team_id fk null`, `invite_token`, `status`, `sent_channel`, `sent_at` | `invite_token unique`, `team_match_id` | 04-1 |

### Chat / Notification

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `chat_rooms` | 채팅방 | `id`, `room_type`, `title`, `linked_entity_type`, `linked_entity_id`, `status`, `last_message_id fk null`, `last_message_at` | `(room_type, status)`, `last_message_at` | 06 |
| `chat_room_participants` | 채팅방 참여자 상태 | `id`, `room_id fk`, `user_id fk`, `role`, `status`, `pinned`, `left_at`, `last_read_message_id fk null` | `(room_id, user_id) unique`, `(user_id, pinned)` | 06 |
| `chat_messages` | 메시지 | `id`, `room_id fk`, `sender_user_id fk null`, `message_type`, `body`, `metadata jsonb`, `status`, `sent_at`, `deleted_at` | `(room_id, sent_at)`, `sender_user_id` | 06 |
| `notifications` | 알림 | `id`, `user_id fk`, `notification_type`, `title`, `body`, `linked_entity_type`, `linked_entity_id`, `status`, `created_at` | `(user_id, status, created_at desc)` | 00, 02 |
| `notification_reads` | 읽음 상태 | `id`, `notification_id fk`, `user_id fk`, `read_at` | `(notification_id, user_id) unique` | 00, 06 |
| `notification_preferences` | 알림 설정 | `user_id pk/fk`, `match_enabled`, `team_enabled`, `chat_enabled`, `payment_enabled`, `marketing_enabled` | `user_id` | 09 |

### Payment / Refund / Dispute

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `payments` | 결제 대표 레코드 | `id`, `payer_user_id fk`, `target_type`, `target_id`, `amount`, `currency`, `payment_mode`, `status`, `approved_at`, `failed_reason` | `(payer_user_id, created_at desc)`, `(target_type, target_id)` | 03, 04, 08 |
| `payment_attempts` | 결제 시도/실패 이력 | `id`, `payment_id fk`, `provider`, `provider_request_id`, `status`, `requested_at`, `responded_at`, `error_code`, `error_message` | `payment_id`, `provider_request_id` | 08 |
| `refund_requests` | 환불 요청 | `id`, `payment_id fk`, `requester_user_id fk`, `reason_code`, `reason_text`, `status`, `reviewed_by`, `reviewed_at` | `payment_id`, `status` | 08 |
| `disputes` | 분쟁 | `id`, `target_type`, `target_id`, `opened_by fk`, `assigned_admin_id fk null`, `status`, `reason_code`, `summary` | `status`, `assigned_admin_id` | 08, 12 |
| `dispute_events` | 분쟁 이력 | `id`, `dispute_id fk`, `actor_type`, `actor_id`, `event_type`, `body`, `created_at` | `(dispute_id, created_at)` | 08, 12 |

### Admin / Audit / Common

| 테이블명 | 목적 | 주요 컬럼 | 인덱스 후보 | 관련 화면 |
|---|---|---|---|---|
| `admin_users` | 관리자 계정/권한 | `user_id pk/fk`, `admin_role`, `status`, `last_active_at` | `admin_role`, `status` | 12 |
| `admin_operation_tasks` | 운영 큐 | `id`, `task_type`, `target_type`, `target_id`, `priority`, `status`, `assigned_admin_id`, `due_at`, `summary` | `status`, `priority`, `assigned_admin_id` | 12 |
| `admin_action_logs` | 관리자 조치 audit | `id`, `admin_user_id fk`, `action_type`, `target_type`, `target_id`, `reason`, `before_state jsonb`, `after_state jsonb`, `created_at` | `(target_type, target_id)`, `admin_user_id` | 12 |
| `moderation_reports` | 신고/검수 | `id`, `reporter_user_id fk`, `target_type`, `target_id`, `reason_code`, `body`, `status`, `assigned_admin_id` | `status`, `(target_type, target_id)` | 12 |
| `status_change_logs` | 상태 변경 이력 | `id`, `target_type`, `target_id`, `from_status`, `to_status`, `changed_by_type`, `changed_by_id`, `reason`, `created_at` | `(target_type, target_id, created_at)` | 공통 |
| `share_events` | 공유/초대 이벤트 | `id`, `actor_user_id fk`, `target_type`, `target_id`, `share_channel`, `recipient_type`, `recipient_id`, `status`, `created_at` | `(target_type, target_id)`, `actor_user_id` | 03-1, 04-1 |
| `user_drafts` | 작성 중 draft 후보 | `id`, `user_id fk`, `draft_type`, `payload jsonb`, `expires_at`, `status` | `(user_id, draft_type)`, `expires_at` | 03-1, 04-1 |

## 9. 테이블 관계 구조

```text
users
  ├─ auth_identities
  ├─ user_profiles
  ├─ user_terms_consents ─ terms_documents
  ├─ user_sport_preferences ─ sports ─ sport_levels
  ├─ user_regions ─ regions
  ├─ matches(host_user_id)
  │   ├─ match_media
  │   ├─ match_rules
  │   ├─ match_applications(user_id)
  │   └─ match_participants(user_id) ─ payments
  ├─ teams(owner_user_id)
  │   ├─ team_profiles
  │   ├─ team_memberships(user_id)
  │   ├─ team_join_applications(user_id)
  │   └─ team_matches(host_team_id)
  │       ├─ team_match_styles
  │       ├─ team_match_applications(applicant_team_id)
  │       └─ team_match_invitations
  ├─ chat_room_participants ─ chat_rooms ─ chat_messages
  ├─ notifications ─ notification_reads
  └─ payments ─ refund_requests

disputes
  └─ dispute_events

admin_users
  ├─ admin_operation_tasks
  └─ admin_action_logs
```

## 10. 공통 코드/상태값 설계 방향

공통 코드 테이블은 필요하다. 단, 모든 상태를 하나의 code table로 뭉치기보다
아래처럼 master와 enum 성격을 분리한다.

- master table 권장: `sports`, `sport_levels`, `regions`, `terms_documents`.
- DB enum 또는 check 후보: `account_status`, `match_status`, `application_status`,
  `payment_status`, `refund_status`, `dispute_status`, `admin_task_status`.
- 화면 copy와 색상은 DB 상태값에 직접 묶지 않는다. presentation layer에서 매핑한다.
- `is_active`, `visibility`, `status`는 분리한다.
  - `is_active`: master 사용 가능 여부.
  - `visibility`: 사용자 노출 범위.
  - `status`: 업무 lifecycle.

## 11. 기존 프로젝트 참고 영역

기존 프로젝트는 아래 영역이 참고 가능하다.

- 도메인 경계: matches, teams, team-matches, chat, notifications, payments, admin.
- route family: `/home`, `/matches`, `/matches/new`, `/team-matches`, `/teams`,
  `/chat`, `/notifications`, `/payments`, `/settings`, `/admin`.
- 기존 schema에는 User, Match, Team, TeamMatch, ChatRoom, Notification, Payment,
  Review, Venue 계열 모델이 있다.
- 기존 API 문서에는 cursor pagination, realtime/chat, notification backfill,
  admin audit 관련 주의점이 있다.

하지만 이번 DB 설계에서는 기존 컬럼명/관계/상태값을 그대로 채택하지 않는다.

## 12. 신규 설계 필요 영역

- 0502/SM 기준 약관 선행 gate와 약관 version consent 이력.
- onboarding 3단계 resume과 선택값 보존.
- 홈 추천 캐시 또는 추천 reason 저장 전략.
- 홈 통합 검색의 match/teamMatch/team grouped result를 위한 검색 이력과 scope.
- 개인 매치 참가 신청과 승인 상태를 결제와 분리하는 구조.
- 팀매치 조건, 비용 배분, 무료초청 lock, 상대팀 신청/초대 구조.
- 팀 둘러보기의 trust label, verified/sample/estimated 구분.
- 채팅 pin/leave/read 상태를 participant 단위로 관리하는 구조.
- 테스트 결제/실청구 없음 표시를 위한 payment mode.
- 관리자 운영 task와 action audit의 독립 테이블.

## 13. API 설계 시 고려사항

API 설계는 다음 단계에서 별도 진행한다. DB 설계 관점에서 미리 남길 고려사항:

- 목록 API는 cursor 기반이 적합하다. 검색/필터/정렬/view mode는 query contract와
  client draft state를 분리해야 한다.
- 홈 검색은 match/teamMatch/team을 한 번에 묶는 grouped response가 필요하다.
- 검색 실패/stale query는 마지막 query 기준 응답만 반영해야 한다.
- create/edit wizard는 API payload와 UI draft를 분리해야 한다.
- 결제는 신청/승인 상태와 payment 상태를 분리해야 한다.
- 채팅 unread는 websocket만 믿지 말고 focus/backfill API를 둬야 한다.
- admin mutation은 reason, actor, before/after state를 필수로 남겨야 한다.
- soft delete된 match/team/chat은 목록에서 숨기되 audit/admin에서는 조회 가능해야 한다.

## 14. 확인 필요 사항

- `my team` quick action의 실제 destination.
- SM 5탭 shell을 production navigation으로 확정할지.
- 날씨 정보를 저장할지, 외부 API cache로만 둘지.
- 임시저장(`user_drafts`)을 1차 기능으로 둘지.
- 개인 매치 참가가 결제 후 승인인지, 승인 후 결제인지 최종 정책.
- 팀매치 `심판 배정`, `용병 허용`, `무료초청`이 1차 출시 기능인지.
- 팀 신뢰 신호의 `verified`, `estimated`, `sample` 산정 기준.
- 공개/마케팅을 DB CMS로 관리할지 정적 페이지로 유지할지.
- 관리자 모바일 운영 큐가 실제 운영 범위인지, 데스크탑 보조 화면인지.
- 기존 `0502 문서화.md`가 현재 worktree에서 삭제 상태로 보이는데, 의도된 삭제인지 확인 필요.

## 15. 다음 작업 제안

1. 이 문서의 테이블 후보를 기준으로 core MVP 범위를 확정한다.
2. `01~06` 사용자 핵심 플로우부터 ERD 수준으로 정규화한다.
3. 상태값 enum과 status transition matrix를 먼저 고정한다.
4. 그 다음 API 설계 문서에서 endpoint, request/response, pagination, permission,
   realtime/backfill 계약을 설계한다.
5. 마지막으로 기존 Prisma schema와의 마이그레이션/대체 전략을 별도 문서로 분리한다.

## 변경 파일 목록

작업 전:

- `docs/reference/team-design-first-design-db-plan.md`는 존재하지 않았다.
- `docs/reference` 전체에는 기존 변경사항이 다수 있었다. 이번 작업에서는 해당 기존 변경을 되돌리거나 수정하지 않았다.

작업 후:

- 추가: `docs/reference/team-design-first-design-db-plan.md`
