# Teameet 페이지별 기능 명세서

> 최종 업데이트: 2026-04-11
> 현재 구현 surface 기준 명세. 검증 상태는 `docs/scenarios/index.md`를 source of truth로 사용한다.
> `apps/web/src/app/**/page.tsx` 기준 현재 route snapshot은 91개다.

---

## 목차

1. [인증](#1-인증)
2. [홈/탐색](#2-홈탐색)
3. [매치 (개인)](#3-매치-개인)
4. [팀 매칭 (팀 간)](#4-팀-매칭)
5. [팀/클럽](#5-팀클럽)
6. [강좌/레슨](#6-강좌레슨)
7. [장터 (마켓플레이스)](#7-장터)
8. [시설](#8-시설)
9. [채팅](#9-채팅)
10. [용병](#10-용병)
11. [뱃지](#11-뱃지)
12. [결제](#12-결제)
13. [리뷰/평가](#13-리뷰평가)
14. [내 콘텐츠 관리](#14-내-콘텐츠-관리)
15. [프로필/설정](#15-프로필설정)
16. [Admin](#16-admin)

---

## 1. 인증

### `/login` — 로그인

| 항목 | 내용 |
|------|------|
| **데이터** | `useDevLogin()` mutation |
| **소셜 로그인** | 카카오/네이버/Apple 버튼 (현재 비활성화, opacity-40) |
| **개발 로그인** | 닉네임 입력 → 즉시 가입/로그인 → `/home` 이동 |
| **프리셋** | 축구왕민수, 농구러버지영, 하키마스터준호, 배드민턴소희 |
| **API** | `POST /auth/dev-login` |

---

## 2. 홈/탐색

### `/home` — 홈

| 항목 | 내용 |
|------|------|
| **데이터** | RSC 단계에서 matches/teams/lessons/listings/team-matches 사전 prefetch → HydrationBoundary. 클라이언트는 `useMatches()` 등 React Query 훅으로 캐시 재사용 |
| **종목 캐러셀** | 풋살, 농구, 배드민턴, 하키, 피겨, 쇼트트랙 → `/matches?sport={type}` |
| **매치 카드** | 종목 아이콘, 제목, 날짜, 장소, 인원, 참가비, 레벨, 모집 진행률 바 |
| **마감임박** | 70% 이상 차면 빨간 배지 + 빨간 progress bar |
| **로그인 버튼** | 비인증 시 헤더에 표시 → `/login` |
| **데스크탑** | 사이드바 네비게이션 (13개 메뉴 + Admin) |

---

## 3. 매치 (개인)

### `/matches` — 매치 찾기

| 항목 | 내용 |
|------|------|
| **데이터** | `useMatches(params)` — 종목별 필터링 |
| **검색** | 제목/시설명 로컬 필터링 |
| **이미지 접근성** | 매치 카드 `SafeImage` alt=`` `${sportLabel[match.sportType]} 매치 이미지` `` — 종목명 포함 의미 있는 설명 |
| **종목 필터** | 전체/풋살/농구/배드민턴/아이스하키 칩 |
| **날짜 필터** | date input (상세 필터 패널) |
| **정렬** | 최신순 / 마감임박 토글 |
| **카드 클릭** | → `/matches/[id]` |
| **데스크탑** | 2열 그리드, hover 시 shadow + lift |

### `/matches/new` — 매치 만들기

| 항목 | 내용 |
|------|------|
| **인증** | 필수 (미인증 시 로그인 안내) |
| **4단계 폼** | 종목 → 정보 → 장소·일시 → 확인 |
| **Step 0** | 종목 선택 (풋살/농구/배드민턴/아이스하키) |
| **Step 1** | 제목, 설명, 레벨 범위, 성별 제한 |
| **Step 2** | 시설 선택 (`useVenues` API), 날짜, 시간, 인원, 참가비 |
| **Step 3** | 전체 확인 + 제출 |
| **API** | `POST /matches` → `/matches` 이동 |

### `/matches/[id]` — 매치 상세

| 항목 | 내용 |
|------|------|
| **데이터** | `useMatch(id)` |
| **정보 표시** | 종목, 날짜, 시간, 장소, 인원(현재/최대), 참가비, 레벨, 설명 |
| **참가하기** | `POST /matches/{id}/join` + 결제 모달 (참가비 있을 때) |
| **참가 취소** | `DELETE /matches/{id}/leave` (참가자 본인만) |
| **캘린더 추가** | Google Calendar 링크 생성 |
| **공유** | Web Share API + 클립보드 폴백 |
| **참가자 목록** | 프로필 아바타, 닉네임, 레벨 |
| **호스트 전용** | 수정 버튼 → `/matches/[id]/edit` |
| **2컬럼** | 왼쪽 정보 + 오른쪽 CTA (sticky sidebar) |

### `/matches/[id]/edit` — 매치 수정

| 항목 | 내용 |
|------|------|
| **데이터** | `useMatch(id)` |
| **폼** | 생성과 동일한 필드, 기존 데이터 pre-fill |
| **저장** | `PATCH /matches/{id}` → 상세 페이지 이동 |
| **취소** | `router.back()` |

---

## 4. 팀 매칭

### `/team-matches` — 팀 매칭 모집글 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useTeamMatches(params)` |
| **종목 필터** | 전체/축구/풋살 |
| **날짜 필터** | date input |
| **레벨 필터** | 전체 / Lv.1-2 / Lv.3-4 / Lv.5 칩 |
| **카드 표시** | 실력등급(S~D) 배지, 경기방식(11:11 등), 무료초청 태그 |
| **모집글 작성** | → `/team-matches/new` |

### `/team-matches/new` — 모집글 작성

| 항목 | 내용 |
|------|------|
| **5단계 폼** | 종목 → 구장/일시 → 경기조건 → 비용 → 확인 |
| **Step 0** | 축구/풋살 선택 + 제목 |
| **Step 1** | 구장명, 주소, 날짜, 시간, 총 시간, 쿼터 수(2/4/6/8/10) |
| **Step 2** | 실력등급(S~D), 선출선수 수(0~10), 경기방식(11:11/8:8/6:6/5:5), 매치유형(초청/교환/원정), 유니폼 색상, 무료초청 토글, 용병 허용, 심판 유무 |
| **Step 3** | 총 구장비, 상대팀 부담비용, 경기 스타일(친선/실전/매너), 특이사항 |
| **Step 4** | 전체 확인 |
| **API** | `POST /team-matches` |

### `/team-matches/[id]` — 모집글 상세

| 항목 | 내용 |
|------|------|
| **데이터** | `useTeamMatch(id)`, `useTeamMatchRefereeSchedule(id)` |
| **정보** | 실력등급 배지, 선출선수 수, 경기방식, 매치유형, 유니폼 색상, 비용, 쿼터 수 |
| **심판 배정표** | 쿼터별 담당 팀 테이블 |
| **호스트 팀 카드** | 팀명, 레벨, 매너점수 |
| **신청하기** | 모달: 상호확인 체크박스 + 메시지 → `POST /team-matches/{id}/apply` |
| **승인/거절** | 호스트만: `PATCH /team-matches/{id}/applications/{appId}/approve|reject` |
| **도착 인증** | 경기 당일: → `/team-matches/[id]/arrival` |
| **경기 평가** | 완료 후: → `/team-matches/[id]/evaluate` |

### `/team-matches/[id]/arrival` — 도착 인증

| 항목 | 내용 |
|------|------|
| **GPS 상태** | 시뮬레이션 (2.5초 후 "구장 반경 500m 이내") |
| **카운트다운** | 경기 시작까지 남은 시간 (매초 업데이트) |
| **도착 완료** | GPS 범위 내일 때만 활성화 → `POST /team-matches/{id}/check-in` |
| **사진 촬영** | 현장 사진 업로드 (UI만, 실제 업로드 미연동) |
| **상대팀 확인** | 정상도착/지각/미도착 라디오 + 비고 입력 |
| **타임라인** | 양 팀 도착 상태 시각화 |

### `/team-matches/[id]/score` — 쿼터별 스코어

| 항목 | 내용 |
|------|------|
| **스코어 입력** | 쿼터별 홈/어웨이 점수 (숫자 입력) |
| **합계 표시** | 실시간 총 스코어 |
| **심판 배정** | 쿼터별 심판 담당 팀 표시 |
| **제출** | 모든 쿼터 입력 시 활성화 → `POST /team-matches/{id}/result` |

### `/team-matches/[id]/evaluate` — 경기 후 평가

| 항목 | 내용 |
|------|------|
| **6항목 평가** | 각 1~5점 별점 |
| 1 | 수준 사전설명 일치 (levelAccuracy) |
| 2 | 선출/용병 고지 일치 (infoAccuracy) |
| 3 | 매너 (mannerRating) |
| 4 | 시간 약속 (punctuality) |
| 5 | 비용 정산 (paymentClarity) |
| 6 | 경기 운영 협조 (cooperation) |
| **평균 점수** | 자동 계산 표시 |
| **코멘트** | 선택 텍스트 |
| **API** | `POST /team-matches/{id}/evaluate` |

---

## 5. 팀/클럽

### `/teams` — 팀 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useTeams()` |
| **카드** | 팀 아바타, 이름, 종목, 실력등급(S~D), 모집중 배지, 멤버 수, 지역 |
| **팀 등록** | → `/teams/new` |

### `/teams/new` — 팀 등록

| 항목 | 내용 |
|------|------|
| **필드** | 팀명, 종목, 설명, 지역(시/구), 실력등급(S~D), 선출선수 수, 유니폼 색상, 모집 여부, 연락처, SNS(인스타/유튜브/카카오톡), 쇼츠 URL |
| **API** | `POST /teams` |

### `/teams/[id]` — 팀 허브

| 항목 | 내용 |
|------|------|
| **데이터** | `useTeam(id)`, `useTeamHub(id)` |
| **섹션 구조** | `overview / goods / passes / events` segmented tabs |
| **허브 카운트** | section별 goods/passes/events count |
| **overview** | 팀 소개, 지역, 오너 정보, 기존 팀 identity |
| **goods** | team affiliation이 붙은 장터 listing preview |
| **passes** | team affiliation이 붙은 lesson/ticket preview |
| **events** | team affiliation이 붙은 tournament preview |
| **팀 참여 신청** | 인증 분기: 로그인 후 신청/바로 신청 |
| **관리 CTA** | capability가 있을 때만 수정 버튼 노출 |
| **하위 플로우** | `/teams/[id]/matches`, `/teams/[id]/mercenary`, `/teams/[id]/members` 유지 |

### `/teams/[id]/edit` — 팀 수정

| 항목 | 내용 |
|------|------|
| **데이터** | `useTeam(id)` prefill |
| **저장** | `PATCH /teams/{id}` |
| **삭제** | `DELETE /teams/{id}` (확인 모달) |

### `/teams/[id]/members` — 멤버 관리

| 항목 | 내용 |
|------|------|
| **멤버 목록** | 아바타, 닉네임, 역할(팀장/운영자/멤버), 가입일 |
| **역할 변경** | 드롭다운 (팀장만 가능) |
| **추방** | 확인 모달 → 목록에서 제거 |
| **초대** | 모달: 닉네임 입력 → 초대 발송 |

---

## 6. 강좌/레슨

### `/lessons` — 강좌 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useLessons(params)` |
| **타입 필터** | 전체/그룹 레슨/연습 경기/자유 연습 |
| **검색** | 제목, 코치명, 장소명 필터링 |
| **소속 컨텍스트** | team/venue affiliation이 있으면 카드에서 publisher badge 노출 |
| **강좌 등록** | → `/lessons/new` |

### `/lessons/new` — 강좌 등록

| 항목 | 내용 |
|------|------|
| **4단계 폼** | 종목·유형 → 강좌 정보 → 일시·상세 → 확인 |
| **유형** | 그룹 레슨 / 연습 경기 / 자유 연습 / 클리닉 |
| **필드** | 제목, 설명, 코치명, 코치 소개, 장소, 날짜, 시간, 인원, 수강료, 레벨 범위 |
| **API** | `POST /lessons` |

### `/lessons/[id]` — 강좌 상세

| 항목 | 내용 |
|------|------|
| **데이터** | `useLesson(id)` |
| **커버** | 업로드 이미지 우선 + 실사형 로컬 fallback cover/gallery |
| **코치 소개** | 프로필 사진, 이름, 코치 소개 + sample stats 텍스트 |
| **커리큘럼** | 현재는 sample curriculum 4개 섹션 |
| **추천 대상** | "이런 분께 추천합니다" 4개 항목 |
| **수강 신청** | 무료는 즉시 신청, 유료 수강권은 `준비 중` 배너와 disabled CTA |
| **일정 예약** | `LessonCalendar` 노출, 실제 예약 저장은 아직 준비 중 토스트 |
| **캘린더 추가** | Google Calendar 연동 |
| **2컬럼** | 왼쪽 정보 + 오른쪽 CTA (sticky sidebar) |

---

## 7. 장터

### `/marketplace` — 매물 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useListings()` |
| **검색** | 상품명, 종목 필터링 |
| **카테고리** | 전체/풋살화/하키장비/농구화/라켓/유니폼/보호장비 |
| **카드** | 썸네일, 제목, 지역, 가격(굵게), 상태 배지, 대여 배지, 조회수, 좋아요 수 |
| **소속 컨텍스트** | team/venue affiliation이 있으면 허브 맥락 배지 노출 |
| **글쓰기** | → `/marketplace/new` |

### `/marketplace/new` — 매물 등록

| 항목 | 내용 |
|------|------|
| **필드** | 제목, 설명, 종목, 카테고리, 상태(새것~하자), 가격, 판매/대여 구분, 이미지 |
| **대여 시** | 일 대여료, 보증금 추가 입력 |
| **API** | `POST /marketplace/listings` |

### `/marketplace/[id]` — 매물 상세

| 항목 | 내용 |
|------|------|
| **데이터** | `useListing(id)` |
| **좋아요** | 하트 토글 (빨간 fill) |
| **공유** | Web Share API |
| **거래 계약** | 안전결제는 아직 미지원, 현재는 채팅 기반 거래만 지원 |
| **채팅하기** | → `/chat` (판매자와 대화) |
| **신고** | 토스트 "신고가 접수되었습니다" |
| **판매자 정보** | 닉네임, 매너점수 |

### `/marketplace/[id]/edit` — 매물 수정

| 항목 | 내용 |
|------|------|
| **상태 변경** | 판매중 → 예약중 → 판매완료 드롭다운 |
| **저장** | `PATCH /marketplace/listings/{id}` |
| **삭제** | `DELETE /marketplace/listings/{id}` (확인 모달) |

---

## 8. 시설

### `/venues` — 시설 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useVenues(params)` |
| **검색** | 시설명, 지역 필터링 |
| **종목 필터** | 전체/풋살/농구/배드민턴/아이스하키 |
| **지역 필터** | 전체/서울/경기/인천/부산/대구/대전/광주 |

### `/venues/[id]` — 시설 허브

| 항목 | 내용 |
|------|------|
| **데이터** | `useVenue(id)`, `useVenueHub(id)` + 로컬 이미지 fallback |
| **섹션 구조** | `overview / goods / passes / events` tabs |
| **overview** | 시설 소개, 운영시간, 편의시설, 기존 review/schedule count |
| **goods** | venue affiliation이 붙은 listing preview |
| **passes** | `venueId` 기반 lesson/ticket preview |
| **events** | venue affiliation이 붙은 tournament preview |
| **관리 CTA** | capability가 있을 때만 수정 버튼 노출 |

### `/venues/[id]/edit` — 시설 수정

| 항목 | 내용 |
|------|------|
| **데이터** | `useVenue(id)` prefill + `useVenueHub(id)` capability |
| **권한 가드** | `canEditProfile`이 없으면 권한 없음 메시지 |
| **저장** | `PATCH /venues/{id}` |

---

## 8-1. 대회

### `/tournaments` — 대회 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useTournaments()` |
| **카드** | 제목, 일정, 상태, 참가비, team/venue affiliation context |
| **등록** | → `/tournaments/new` |

### `/tournaments/new` — 대회 등록

| 항목 | 내용 |
|------|------|
| **필드** | 제목, 종목, 일정, 참가비, 설명 |
| **허브 컨텍스트** | `teamId` 또는 `venueId` query가 있으면 연결 안내 배너 노출 |
| **저장 계약** | `eventDate`를 실제 API의 `startDate/endDate`로 변환 |
| **API** | `POST /tournaments` |

### `/tournaments/[id]` — 대회 상세

| 항목 | 내용 |
|------|------|
| **데이터** | `useTournament(id)` |
| **정보** | 종목, 일정, venue/team affiliation, 참가비, 설명 |

---

## 9. 채팅

### `/chat` — 채팅 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useChatStore()` (Zustand) |
| **채팅방 목록** | 상대팀명, 매치 제목, 마지막 메시지, 시간, 미읽음 배지 |
| **데스크탑** | 2컬럼 (380px 목록 + 채팅방 임베드) |
| **모바일** | 전체 화면 목록 → 클릭 시 `/chat/[id]` |

### `/chat/[id]` — 채팅방

| 항목 | 내용 |
|------|------|
| **메시지** | 내 메시지(파란 버블 우측) / 상대(회색 좌측) / 시스템(중앙) |
| **빠른 액션** | "입금 완료", "유니폼 색상 조율", "위치 공유" 버튼 |
| **매치 정보** | 접을 수 있는 매치 정보 카드 |
| **입력** | 텍스트 + 전송 버튼 (Enter키 지원) |
| **타임스탬프** | 모바일: 항상 표시, 데스크탑: hover 시 표시 |

---

## 10. 용병

### `/mercenary` — 용병 모집 목록

| 항목 | 내용 |
|------|------|
| **데이터** | `useMercenaryPosts()` |
| **종목 필터** | 전체 + 서비스 지원 종목 전체 |
| **카드** | 팀명, 포지션, 레벨, 날짜, 장소, 비용(무료 태그), 매너점수 |
| **신청** | `POST /mercenary/{id}/apply` + 토스트 |
| **내 모집/신청** | → `/my/mercenary` 바로가기 |

### `/mercenary/new` — 용병 모집 작성

| 항목 | 내용 |
|------|------|
| **필드** | 팀 선택, 날짜, 시간, 장소, 포지션(GK/DF/MF/FW/ALL), 인원(1~5), 레벨, 비용, 비고 |
| **API** | `POST /mercenary` |

### `/mercenary/[id]` — 용병 모집 상세

| 항목 | 내용 |
|------|------|
| **데이터** | `useMercenaryPost(id)` |
| **정보 표시** | 팀명, 포지션, 레벨, 날짜, 장소, 비용, 모집 인원, 작성자 |
| **비로그인 신청** | `/login?redirect=/mercenary/{id}` |
| **로그인 신청** | `POST /mercenary/{id}/apply` |
| **작성자 전용** | 수정(`/mercenary/[id]/edit`), 삭제(`DELETE /mercenary/{id}`) |

---

## 11. 뱃지

### `/badges` — 뱃지 시스템

| 항목 | 내용 |
|------|------|
| **데이터** | `useAllBadgeTypes()` + local visual config |
| **8종 뱃지** | |
| 1 | 매너 플레이어 — 매너 점수 4.5 이상 |
| 2 | 시간 약속왕 — 지각률 0% |
| 3 | 심판 영웅 — 심판 5회 이상 |
| 4 | 정직한 팀 — 정보 일치도 95% 이상 |
| 5 | 신규 팀 — 팀 등록 완료 |
| 6 | 베테란 — 50경기 이상 |
| 7 | 연승 행진 — 5연승 이상 |
| 8 | 페어플레이 — 무분쟁 20경기 |
| **탭** | 내 뱃지 / 전체 뱃지 |
| **신뢰 신호** | badge catalog는 API, earned/progress는 mixed/sample banner로 구분 |
| **진행도** | 미달성 뱃지에 progress bar 표시 (현재 일부 로컬 추정값 포함) |

---

## 12. 결제

### `/payments` — 결제 내역

| 항목 | 내용 |
|------|------|
| **데이터** | `usePayments()` real-data 우선, empty/error 분기 |
| **필터** | 전체/매치/강좌/장터 탭 |
| **기간** | 시작일 ~ 종료일 date range |
| **카드** | 상태 배지(완료/환불/대기/실패), 결제수단 아이콘, 금액, 날짜 |
| **클릭** | → `/payments/[id]` |

### `/payments/checkout` — 결제 체크아웃

| 항목 | 내용 |
|------|------|
| **주문 요약** | route context가 있는 주문만 렌더 |
| **지원 범위** | 현재 `source=match` + `participantId`가 있는 매치 참가 결제만 처리 |
| **결제수단** | 신용카드/토스페이/네이버페이/카카오페이 라디오 |
| **약관 동의** | 체크박스 필수 |
| **결제하기** | 지원된 context에서 `prepare -> confirm` 흐름, lesson/marketplace paid commerce는 미지원 |

### `/payments/[id]` — 결제 상세

| 항목 | 내용 |
|------|------|
| **데이터** | owner-bound payment detail |
| **상태 배너** | 완료(초록)/환불(빨강)/대기(주황) |
| **상세** | 금액, 결제수단, 카드번호(마스킹), 영수증 번호, 타임라인 |
| **환불** | 시간 기반: 24시간 전 전액, 1~24시간 50%, 1시간 이내 불가 |

### `/payments/[id]/refund` — 환불 요청

| 항목 | 내용 |
|------|------|
| **데이터** | route payment 기준 환불 요청 |
| **환불 정책** | 시간 기반 자동 계산 (전액/50%/불가) |
| **환불 사유** | 일정 변경/개인 사정/매치 취소/기타 |
| **확인 모달** | 환불 금액 + 경고 → `POST /payments/{id}/refund` |

---

## 13. 리뷰/평가

### `/reviews` — 평가 작성

| 항목 | 내용 |
|------|------|
| **데이터** | `usePendingReviews()` |
| **대기 목록** | 아직 평가하지 않은 참가자 목록 |
| **평가 폼** | 스킬 별점(1~5), 매너 별점(1~5), 코멘트 |
| **API** | `POST /reviews` |

### `/my/reviews-received` — 내가 받은 평가

| 항목 | 내용 |
|------|------|
| **데이터** | sample-labelled trust signal banner (real API pending) |
| **평균 점수** | 큰 숫자 표시 |
| **별점 분포** | 5점~1점 가로 바 차트 |
| **리뷰 목록** | 평가자명, 별점, 코멘트, 매치명, 날짜 |

---

## 14. 내 콘텐츠 관리

### `/my/matches` — 내가 만든 매치

| 항목 | 내용 |
|------|------|
| **생성 탭** | 내가 호스트인 매치 실데이터 |
| **참가 탭** | 전용 집계 API 정리 전까지 honest empty/follow-up banner 표시 |
| **수정** | → `/matches/[id]/edit` |
| **취소** | `POST /matches/{id}/cancel` (확인 모달) |

### `/my/team-matches` — 내 팀 매칭 모집글

| 항목 | 내용 |
|------|------|
| **목록** | 내가 올린 모집글 + 신청 현황 배지 |
| **모집글 작성** | → `/team-matches/new` (FAB 버튼) |
| **취소** | `PATCH /team-matches/{id}` status:cancelled |

### `/my/teams` — 내 팀

| 항목 | 내용 |
|------|------|
| **수정** | → `/teams/[id]/edit` |
| **멤버관리** | → `/teams/[id]/members` |
| **삭제** | `DELETE /teams/{id}` (확인 모달) |

### `/my/lessons` — 내가 등록한 강좌

| 항목 | 내용 |
|------|------|
| **수강생 목록** | 링크 |
| **취소** | `PATCH /lessons/{id}` status:cancelled |

### `/my/listings` — 내 장터 매물

| 항목 | 내용 |
|------|------|
| **상태 변경** | 판매중 → 예약중 → 판매완료 (드롭다운, API 연동) |
| **수정** | → `/marketplace/[id]/edit` |
| **삭제** | `DELETE /marketplace/listings/{id}` |

### `/my/mercenary` — 내 용병 모집

| 항목 | 내용 |
|------|------|
| **목록** | 내가 올린 용병 모집글 |
| **취소** | `DELETE /mercenary/{id}` |

---

## 15. 프로필/설정

### `/profile` — 마이페이지

| 항목 | 내용 |
|------|------|
| **프로필 카드** | 아바타, 닉네임, 바이오, 매너 점수, 총 경기 수 |
| **종목 프로필** | 종목별 레벨, ELO, 전적, 포지션 |
| **활동 통계** | 총 경기, 매너 점수, 뱃지 수 (3열 그리드) |
| **다가오는 일정** | `useMyMatches()` — 최근 3개 |
| **메뉴** | 10개 항목 (매치/팀/강좌/장터/용병/결제/평가/설정 등) |
| **프로필 수정** | EditProfileModal (닉네임, 바이오 등) |

### `/settings` — 설정

| 항목 | 내용 |
|------|------|
| **테마** | 라이트/다크/시스템 토글 |
| **링크** | 프로필, 개인정보, 알림, 이용약관, 개인정보처리방침 |
| **로그아웃** | `useAuthStore().logout()` |

### `/settings/account` — 개인정보 관리

| 항목 | 내용 |
|------|------|
| **인증** | `useRequireAuth()` — 비인증 접근 시 `/login`으로 리디렉트 |
| **수정** | 닉네임, 이메일, 전화번호 → `PATCH /users/me` |
| **소셜 계정** | 카카오(연결됨), 네이버/Apple(연결하기) |
| **회원 탈퇴** | "탈퇴합니다" 입력 확인 후 버튼 활성화 → 탈퇴 |
| **DeleteModal 접근성** | `role="dialog"`, `aria-modal="true"`, `aria-labelledby="delete-modal-title"`, ESC 핸들러, focus trap (Tab/Shift+Tab 순환), 탈퇴하기 `disabled:pointer-events-none` |
| **다크모드** | 경고 아이콘 컨테이너 `dark:bg-red-900/30`, 입력 필드 `dark:bg-gray-700` |

### `/settings/notifications` — 알림 설정

| 항목 | 내용 |
|------|------|
| **현재 상태** | `match/team/chat/payment` 4개 category는 서버 동기화, 브라우저 권한/DND는 device-local, email/marketing/master는 미지원 범위로 분리 |
| **서버 동기화** | 매치, 팀, 채팅, 결제 토글을 `/notifications/preferences`로 조회/저장 |
| **디바이스 로컬** | 브라우저 Push 권한 상태 표시, 방해금지 시간(DND) 토글 |
| **미지원** | 이메일 알림, 마케팅 수신, 전체 마스터 토글은 서버 저장 계약이 없어 안내 섹션으로만 노출 |
| **검증 메모** | `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web test` 통과. live protected-route browser smoke는 stale API process와 web restart instability 때문에 follow-up |

### `/settings/terms` — 이용약관
### `/settings/privacy` — 개인정보처리방침

---

## 16. Admin

### `/admin/dashboard` — 대시보드

| 항목 | 내용 |
|------|------|
| **데이터** | `useAdminStats()` |
| **통계 카드** | 총 사용자, 총 매치, 총 강좌, 등록 팀, 시설, 매물 (6개) |
| **빠른 액션** | 매치/사용자/강좌/시설 관리 링크 |

### 관리 페이지 (테이블 형태)

| 페이지 | 주요 기능 |
|--------|----------|
| `/admin/matches` | 매치 목록, 검색, 상태 필터 |
| `/admin/matches/[id]` | 상세 + 상태 변경 |
| `/admin/users` | 사용자 목록, 검색 |
| `/admin/users/[id]` | 상세 + 경고/정지 |
| `/admin/lessons` | 강좌 목록 + 등록 링크 |
| `/admin/lessons/[id]` | 상세 + 상태 변경 |
| `/admin/teams` | 팀 목록 + 등록 링크 |
| `/admin/teams/[id]` | 상세 + 뱃지 관리 + 정지 |
| `/admin/team-matches` | 팀 매칭 목록, 검색, 상태 |
| `/admin/mercenary` | 용병 모집 목록, 삭제 |
| `/admin/reviews` | 현재 mock 기반 평가 데이터/평균 통계 |
| `/admin/venues` | 시설 목록 |
| `/admin/venues/new` | 시설 등록 폼 |
| `/admin/venues/[id]` | 시설 수정/삭제 |
| `/admin/payments` | API 우선, 비어 있으면 mock fallback 잔존 |
| `/admin/disputes` | 신고/분쟁 (대기/조사/해결/기각) |
| `/admin/disputes/[id]` | 분쟁 상세 + 해결/기각/경고/정지 |
| `/admin/statistics` | 통계 차트 (CSS 바 차트) |
| `/admin/settlements` | 정산 관리 (대기/완료/환불) |

---

## 공통 컴포넌트

| 컴포넌트 | 용도 |
|---------|------|
| `BottomNav` | 모바일 하단 탭 (5개) + 채팅 FAB |
| `Sidebar` | 데스크탑 좌측 네비 (13개 메뉴) |
| `ProgressBar` | 페이지 전환 상단 파란 바 |
| `Toast` | 성공/에러/정보 하단 토스트 |
| `Modal` | 확인/취소 다이얼로그 |
| `Skeleton` | 로딩 시 뼈대 UI (25개 라우트) |
| `CheckoutModal` | 결제 모달 |
| `ChatRoomEmbed` | 채팅방 임베드 (데스크탑) |
| `ReviewForm` | 시설 리뷰 폼 (별점 4항목) |
| `MapPlaceholder` | CSS 지도 + 네이버 지도 링크 |
| `RefereeIncentive` | 심판 인센티브 카드 |
| `BadgeDisplay` | 뱃지 아이콘 + 툴팁 |
| `SportIcons` | 종목별 SVG 아이콘 6개 |
| `EditProfileModal` | 프로필 수정 모달 |

---

## 데이터 흐름 패턴

```
[사용자] → [UI 컴포넌트] → [React Query Hook] → [Axios API Client] → [NestJS Backend] → [Prisma] → [PostgreSQL]
                                    ↑
                              [Zustand Store] (채팅, 인증, 테마 — 클라이언트 상태)
```

| 패턴 | 사용 |
|------|------|
| `useQuery` | 데이터 조회 (자동 캐싱, staleTime 60초) |
| `useMutation` | 데이터 변경 (생성/수정/삭제) + invalidateQueries |
| `useAuthStore` | 인증 상태 (JWT 토큰, 사용자 정보) |
| `useChatStore` | 채팅 메시지 (Zustand, mock → Socket.IO 전환 예정) |
| `useThemeStore` | 다크/라이트/시스템 테마 |
