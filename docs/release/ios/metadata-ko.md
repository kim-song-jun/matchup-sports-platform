# App Store 메타데이터 초안

> 입력 위치: App Store Connect > 팀밋 > iOS 앱 1.0 (버전 정보) / 앱 정보(이름·부제·개인정보 URL).
> 글자 수는 이 파일의 코드 블록을 그대로 세어 확인했다(아래 표). 키워드는 **바이트** 제한(UTF-8, 한글 1자 = 3바이트)이다.
> 기능 서술은 `apps/v1_web/src/app` 에 실제 라우트가 있는 것만 적었다 — 근거는 맨 아래 표.
> 쓰지 않은 것: "AI 매칭"(랜딩 문구에는 있으나 심사자가 확인할 수 있는 AI 기능이 화면에 없다),
> 장터·강좌(웹에 라우트 없음), 준비 중 종목. 2.3.1(정확한 메타데이터) 거절을 피하기 위해서다.

## 한국어 (기본 언어)

### 앱 이름 (≤30자)

```
팀밋 - 풋살·축구 팀 매칭
```

대안: `팀밋` (현재 ASC 값). 검색 노출을 위해 종목어를 이름에 넣는 안을 권한다. 이름에 넣은 단어는 키워드에서 뺐다.

### 부제 (≤30자)

```
매치 찾기부터 팀 운영, 대회 기록까지
```

### 프로모션 텍스트 (≤170자, 심사 없이 수시 변경 가능)

```
이번 주말 같이 뛸 사람, 아직 못 찾았나요? 팀밋에서 가까운 매치를 찾고 바로 신청하세요. 팀 매치 상대 찾기, 용병 모집, 대회 신청과 실시간 경기 결과까지 한 앱에서 확인할 수 있어요.
```

### 설명 (≤4000자)

```
팀밋은 풋살·축구를 비롯한 생활체육 동호인을 위한 매칭 앱이에요. 같이 뛸 사람을 찾고, 팀을 꾸리고, 대회에 나가 기록을 남기는 과정을 한곳에서 해결할 수 있어요.

■ 개인 매치
· 종목·지역·날짜로 열려 있는 매치를 찾아 바로 신청할 수 있어요.
· 직접 매치를 만들고 참가 신청을 받아 승인할 수 있어요.

■ 팀 매치
· 우리 팀과 겨룰 상대 팀을 찾아 경기를 잡을 수 있어요.
· 경기 명단을 정하고, 경기가 끝나면 결과를 기록해요.

■ 팀 운영
· 팀을 만들고 멤버를 초대하거나 가입 신청을 받아 관리해요.
· 팀 일정을 등록하고, 인원이 모자라면 용병을 모집할 수 있어요.
· 다른 팀에 연락(팀 컨택)을 보내 경기를 제안할 수 있어요.

■ 대회·리그
· 진행 중인 대회와 리그를 둘러보고 팀으로 참가 신청을 할 수 있어요.
· 대진표, 경기 일정, 순위표, 수상 결과를 확인할 수 있어요.
· 경기 중에는 LIVE 스코어로 실시간 진행 상황을 볼 수 있어요.

■ 선수 카드와 기록
· 내 경기 기록이 쌓인 선수 카드를 만들고 공유할 수 있어요.
· 팀 전적과 개인 기록을 한눈에 볼 수 있어요.

■ 경기 후기
· 경기가 끝나면 함께 뛴 사람과 팀을 매너·실력 등 항목으로 평가해요.
· 받은 후기가 모여 신뢰할 수 있는 상대를 고르는 기준이 돼요.

■ 채팅과 알림
· 매치 참가자, 팀과 채팅으로 약속을 조율해요.
· 불쾌한 메시지는 바로 신고하고, 원하지 않는 사용자는 차단할 수 있어요.
· 신청 결과, 경기 일정, 채팅 메시지를 푸시 알림으로 받아요.

■ 이런 분께 추천해요
· 퇴근 후나 주말에 풋살·축구를 하고 싶은데 같이 할 사람이 없는 분
· 팀원 모집과 경기 일정 관리가 번거로운 팀장·운영진
· 동호인 대회에 나가 기록을 남기고 싶은 선수

회원가입에는 휴대폰 본인인증이 필요해요. 만 14세 이상만 이용할 수 있어요.

문의: 앱의 설정 > 고객센터 또는 https://teameet.co.kr/terms?document=support
```

### 키워드 (≤100바이트, 쉼표 구분·공백 없음)

```
풋살,축구,조기축구,팀매치,용병,동호회,리그,대회,매칭,생활체육,경기
```

앱 이름에 있는 `팀밋`·`팀 매칭` 은 넣지 않았다(Apple: 이름·회사명은 이미 검색된다). 타사 앱 이름 금지.

### 이번 버전의 새로운 기능 (1.0)

첫 버전은 입력란이 나타나지 않을 수 있다. 나타나면:

```
팀밋 iOS 앱을 처음 선보여요. 매치 찾기, 팀 운영, 대회 참가와 LIVE 스코어를 앱에서 이용하고 푸시 알림을 받아 보세요.
```

### URL

| 항목 | 값 | 프로덕션 상태 (2026-09-25 실측) |
|---|---|---|
| 지원 URL (필수) | `https://teameet.co.kr/terms?document=support` | 200 — 운영사·이메일·문의 항목이 적힌 고객센터 문서 |
| 마케팅 URL (선택) | `https://teameet.co.kr/landing` | 200 |
| 개인정보처리방침 URL (필수, 앱 정보) | `https://teameet.co.kr/terms?document=privacy` | 200 — 단 **iOS 절이 없다** (README 1절) |
| 계정 삭제 안내 (심사 메모용) | `https://teameet.co.kr/account-deletion` | **404** — `dev → main` 승격 후 200 |

`/privacy`·`/support` 같은 짧은 경로는 **없다**(404). 쿼리 문자열 URL 은 ASC 가 받아들이지만, 짧은 경로를
원하면 웹에 리다이렉트 라우트를 추가해야 한다(웹 변경 — 이 문서 범위 밖).

### 저작권

```
© 2026 아이위(IWI)
```

(운영사명은 개인정보처리방침·고객센터 문서에 이미 공개된 표기를 따랐다. 사용자 확인 필요.)

## English (보조 언어, 선택)

한국 전용 배포라면 영어 현지화는 생략해도 된다. 넣는다면:

```
Name:      Teameet: Futsal & Soccer Teams
Subtitle:  Find games, run teams, compete
Keywords:  futsal,soccer,football,pickup,team,league,tournament,match,sports,club,amateur
Promo:     Find a pickup game near you this weekend, challenge another team, recruit guest players, and follow tournament scores live — all in one app.
```

Description (English):

```
Teameet helps amateur futsal and soccer players find games, build teams and compete in local tournaments.

- Pickup matches: browse open matches by sport, area and date, and apply in one tap. Host your own and approve players.
- Team matches: find an opponent team, set your lineup and record the result after the game.
- Team management: create a team, invite members or review join requests, schedule games and recruit guest players.
- Tournaments and leagues: apply as a team, check brackets, schedules and standings, and follow LIVE scores.
- Player card: your match records in one shareable card.
- Post-game reviews: rate the people and teams you played with on manners and skill.
- Chat and notifications: coordinate with players and teams, report or block users, and get push notifications.

The service is operated in Korean and requires Korean mobile phone verification to sign up. Users must be 14 or older.
```

## 기능 서술의 근거 (라우트)

| 서술 | 근거 (`apps/v1_web/src/app/…`) |
|---|---|
| 개인 매치 찾기·만들기·신청 승인 | `matches`, `matches/new`, `matches/[id]/applications` |
| 팀 매치·명단·결과 기록 | `team-matches`, `team-matches/[id]/lineup`, `team-matches/[id]/result` |
| 팀 운영·멤버·일정·팀 컨택 | `teams/new`, `teams/[id]/members`, `teams/[id]/schedules`, `teams/[id]/contact/new` |
| 용병 모집 | `teams/[id]/schedules/…` 의 용병 모집 흐름(API `team-schedules/guest-recruitment.service.ts`) |
| 대회·리그, 대진·일정·순위·수상 | `tournaments/[id]/bracket`, `…/schedule`, `…/results`, `…/awards`, `league-matches` |
| LIVE 스코어 | `tournaments/[id]/matches/[fixtureId]` (LIVE 표시 72곳) |
| 선수 카드·기록 | `users/[id]/card`, `users/[id]/records`, `teams/[id]/records` |
| 경기 후기 | `my/reviews`, `my/reviews/received` (평점 + 정해진 태그, 자유 서술 없음) |
| 채팅·신고·차단 | `chat/[id]` + `components/community/chat-safety-dialog.tsx` |
| 알림 | `notifications`, `my/settings/notifications`, iOS APNs |
| 본인인증·만 14세 | `my/phone-verify`, 개인정보처리방침 4항 |

## 글자 수 실측

| 필드 | 제한 | 실측 |
|---|---|---|
| 앱 이름 | 30자 | 15자 (영문 30자) |
| 부제 | 30자 | 21자 (영문 30자) |
| 프로모션 텍스트 | 170자 | 106자 (영문 140자) |
| 설명 | 4000자 | 996자 (영문 918자) |
| 키워드 | 100바이트 | 94바이트 (영문 78바이트) |
