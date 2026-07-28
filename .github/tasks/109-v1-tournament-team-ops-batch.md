# Task 109 - V1 Tournament & Team Ops Batch

## Summary

사용자가 한 번에 요청한 8개 항목을 origin/dev 실제 코드 기준으로 정밀 감사한 뒤 확정한 배치 작업. 팀 나가기, 알림 문구 통일, 후원사 UX 보정, 팀초대/매치 UI 폴리쉬, 대진표 득점자 등록, 대진표 접수마감 후 공개 플로우, 성별 쿼터 브랜치 병합, 대회 전용 팝업 신규를 순서대로 진행한다. 감사 결과 상당수 기능(팀초대, 후원사 이벤트 허브, 팝업 인프라)이 이미 dev에 있었으나 사용자가 원한 정확한 형태와는 차이가 있어 신규가 아니라 "보정" 작업으로 재정의됐다.

원 요청 중 리뷰 익명화/지연적용은 사용자가 명시적으로 이번 스코프에서 제외했다(설계만 기록, 구현 안 함).

## Scope

Target: both (트랙별로 backend-only / frontend-only / both 상이, 각 트랙 섹션에 명시)

각 트랙은 독립 git worktree에서 origin/dev 기준으로 작업 후 PR을 dev에 올린다. main은 절대 건드리지 않는다(`CLAUDE.md` 브랜치 정책).

## Track 1 — 팀 나가기 (self-leave)

Backend: `apps/v1_api/src/teams/teams.controller.ts`, `teams.service.ts`, `teams/dto/`
Frontend: `apps/v1_web/src/components/teams/`, `hooks/use-v1-api.ts`

현재 `POST team-memberships/:membershipId/remove`는 owner/manager가 타인을 강제 추방하는 경로뿐이고, 본인이 스스로 나가는 self-service 경로가 없다(확인됨, 3곳 grep 0건).

신규:
- `POST /teams/:teamId/leave` — `V1AuthGuard`만 적용. 본인의 active membership을 조회해 처리(`getManagementActor` 우회).
- 엣지케이스: 마지막 owner는 나갈 수 없음 → 409 (다른 active owner가 없으면 차단, "소유권을 먼저 이전하세요" 안내). 본인이 유일한 active 멤버인 경우 처리 정책은 구현 중 확정(팀 archive 여부 등 — 모호하면 빌더가 BLOCKED 보고).
- `status: 'left'`로 전환(제거자의 강제추방과 구분), `memberCount` decrement, 채팅 참가자 정리.
- 프론트: 팀 상세/멤버 목록에 "팀 나가기" 버튼(본인 행에만), 확인 모달(`components/ui/modal.tsx`), owner는 조건부 비활성 + 툴팁.

## Track 2 — 알림 문구/양식 통일

Backend only: `apps/v1_api/src/notifications/notifications.service.ts`, `teams.service.ts`, `team-matches.service.ts`, `tournaments/{admin-registrations,tournament-registrations,tournament-announcements}.service.ts`

감사 결과: 22개 알림 이벤트의 제목(title)은 이미 해요체로 통일되어 있으나 본문(body) 유무·문체(평서 vs 청유)·변수삽입 패턴이 도메인별로 제각각이다(팀초대·개인매치=항상 title-only, 팀매치·대회운영=일부만 body, 문법 무드 불일치). `c810ee9a` 카피 audit은 프론트엔드만 건드리고 백엔드 알림 템플릿은 손대지 않았다.

작업: 22개 이벤트 전부에 title+body 구조를 통일 적용. body 문체는 "~됐어요/~해주세요" 중 상태통보=평서형, 행동요청=청유형으로 규칙화하고 그 규칙을 서비스 파일 상단 주석으로 명시. 변수 삽입이 의미 있는 이벤트(팀 초대자 닉네임, 팀매치 상대팀명, 대회명 등)에는 일관된 삽입 패턴(따옴표+변수) 적용.

## Track 3 — 후원사 UX 보정 (신규 아님, 기존 기능 보정)

Frontend only: `apps/v1_web/src/app/tournaments/campaigns/[slug]/tournament-campaign-template.tsx`(+ .module.css), `tournament-sponsor-section.tsx`, `apps/v1_web/src/app/tournaments/[id]/apply/tournament-apply-client.tsx`, `my-registration-client.tsx`

기존 캠페인/스폰서 인프라(`V1TournamentSponsor`, `V1TournamentCampaign`, `/tournaments/campaigns/[slug]`)는 이미 구현되어 있다(스키마·어드민 CRUD·배너 연결·로고 필드 전부 존재, 신규 스키마 작업 불필요). 사용자가 명시한 3개 UX 디테일만 미충족:

1. 이벤트 페이지 `.actions`(신청하기 버튼) 하단 고정(sticky) — 현재 일반 문서 흐름, `position: sticky`로 전환.
2. 대회 신청 페이지(`/tournaments/:id/apply`) 최하단에 후원사 로고 노출 — 현재 0건, `TournamentSponsorSection`을 로고 전용 축약 버전으로 신설해 추가.
3. 후원사 콘텐츠는 이미지 로고만 노출하고 클릭해도 페이지 이동 없음 — 현재 `target="_blank"` 외부링크(홈페이지/인스타그램)가 있어 요청과 정반대. 대회 상세 페이지의 기존 `TournamentSponsorSection`(설명·혜택·부스·외부링크 포함 버전)은 그대로 두되, 신청 페이지용 신규 컴포넌트는 로고 이미지만 렌더하고 클릭 핸들러/`<a>` 태그를 두지 않는다.

## Track 4 — 팀초대 · 팀매치 · 매치 UI/UX 폴리쉬

Frontend only.

**팀초대** (`apps/v1_web/src/components/teams/teams-page.tsx`, `components/my/my-page.tsx`, `teams.types.ts`, `my.types.ts`):
- "초대중" → "초대 중" (카피 클러스터 통일 패턴 적용)
- 보낸 초대 목록에 `listError` 상태 추가, 실패 시 `EmptyState`가 아닌 에러+재시도 표시(받은 초대 쪽과 대칭)
- 받은 초대의 `actionPending`을 전역 boolean → 아이템별 상태로 전환(보낸 초대의 `cancelPending` 패턴과 동일하게), "처리 중…" 텍스트 피드백 추가

**팀매치/매치** (`apps/v1_web/src/components/matches/matches-page.tsx`, `components/team-matches/team-matches-page.tsx`):
- [HIGH] `matches-page.tsx:649` 가짜 "추천" 배지 제거 또는 실제 추천 로직과 연결(실제 로직 없이 항상 1번 카드에 붙는 현재 동작은 신뢰도 저하 + 종목 배지 유실 버그)
- [HIGH] `team-matches-page.tsx`의 `CreateField` date/time 입력에 매치 생성 위저드와 동일한 `lang="ko"` + `isDateLike` 처리 추가(현재 매치 쪽만 적용되어 있음)
- [MEDIUM] 중복 정의된 `StateCard`/`ImageUploadField`/`GenderRuleSelector`/`DraggableFilterSheet`/`CreateField`를 `components/v1-ui/` 공유 위치로 추출(향후 drift 재발 방지)
- [MEDIUM] 매치 상세의 데스크톱/모바일 완전 이중 렌더링(L282-322 vs L354-392)을 팀매치 상세 패턴(단일 body + 컬럼 분리)으로 통합

## Track 5 — 대진표 득점자 등록

Backend + Frontend (admin). Prisma 스키마 변경 포함 → migration 필수.

현재 `V1TournamentFixtureResult`는 팀 스코어만 기록하고 선수별 득점 기록 경로가 전혀 없다(스키마/DTO/관리자 UI 3층 모두 확인됨, `note` 자유텍스트로는 구조화 불가).

신규:
- `V1TournamentFixtureGoal`(또는 JSON 배열) — `fixtureResultId`, `playerId` 또는 `playerName`(비회원 대타 등 고려), `team`(home/away), `minute?`
- `RecordResultDto`에 `goals?: FixtureGoalDto[]` 추가
- 관리자 결과등록 폼(`tournament-detail-client.tsx` `handleRecordResult` 주변)에 선수 선택/이름 입력 UI 추가(팀 명단 `V1TournamentPlayer`에서 드롭다운으로 선택 가능하게)
- 공개 대회 상세 페이지에 득점자 표시(경기결과 카드)

## Track 6 — 대진표 접수마감 후 일괄 공개

Backend + Frontend (admin + public). Prisma 스키마 변경 포함 → migration 필수.

현재 admin이 조/픽스처를 만드는 즉시 공개 페이지에 부분 노출되는 구조(`fixtures.length > 0` 기준). PR #66(스텝 위저드)은 작성 단계 UX만 다루고 공개 시점 제어와 무관함이 확인됐다.

신규:
- Tournament(또는 그룹/픽스처 상위) 단위 공개 게이트 필드(예: `bracketPublishedAt: DateTime?`)
- 공개 조회 쿼리를 이 필드로 필터링(널이면 전체 비공개)
- Admin에 명시적 "대진표 전체 공개" 액션(버튼 + 확인 모달) — 접수마감(`registrationDeadlineAt`) 이후에만 활성화하되 강제하지는 않음(운영자 재량)
- 공개 전 공개 페이지 문구는 기존 `FixturesPlaceholder`("대회 시작 전에 대진표가 공개돼요") 유지

## Track 7 — 성별 쿼터(최소 여성 인원) 브랜치 병합 — **완료 확인됨, 작업 불필요**

**2026-07-18 재확인**: 이 기능은 이미 origin/dev에 커밋 `bcb14734`(오늘 병합, 다른 경로)로 들어가 있다. 격리 worktree에서 `feat/v1-tournament-gender-quota` → origin/dev rebase를 시도한 결과, migration 파일이 byte-identical하고 dev 쪽이 오히려 더 강화되어 있음을 확인(DB CHECK 제약 4종 추가, `gender` 컬럼을 `gender_snapshot`으로 교체하는 backfill migration 추가, 공개 대회 상세 페이지의 "혼성 명단 조건" 안내까지 이미 존재). rebase는 `--abort`로 되돌리고 push/PR 없이 종료, 새로 만든 격리 worktree/브랜치는 삭제 완료. 원본 `feat/v1-tournament-gender-quota` 브랜치(다른 세션 소유)는 건드리지 않았다 — 내용이 dev에 흡수됐으므로 그 세션에 정리 여부를 맡긴다.

<details><summary>원래 계획(참고용, 실행 안 함)</summary>

`feat/v1-tournament-gender-quota`(커밋 76ee0dfa 백엔드, 12319075 프론트엔드, 다른 세션 작업물)를 **새 격리 worktree**에서 origin/dev 기준으로 rebase한다. 원본 worktree/브랜치는 건드리지 않는다.

기능은 감사 결과 이미 정확히 요구사항(숫자 기반 `genderMinFemale` 등, `rosterLock` 시점 실제 강제, 테스트 4종, 멱등 마이그레이션)을 충족하며 설계 품질도 양호하다고 판정됨 — **로직 재작성 불필요, 순수 rebase/충돌해결 작업**.

충돌 파일 13개(schema.prisma 포함, `git merge-tree` 기준): `admin-registrations.service.ts`(+spec), `admin-tournament.dto.ts`, `tournament-players.service.ts`(+spec), `tournaments-admin.service.ts`(+spec), `tournaments-read.service.ts`, admin `tournament-detail-client.tsx`, admin `new/page.tsx`, `signup-client.tsx`, `types/api.ts`. 서비스/DTO 충돌은 로직 병합이 필요해 자동 해결이 어려우므로 각 파일을 origin/dev 최신 버전과 대조하며 수동 병합한다.

추가 보정(감사에서 발견된 사소한 갭): 공개 대회 상세 페이지에 참가 신청 전 단계에서 성별 min/max 숫자 자체가 노출되지 않음 — `genderCategory` 뱃지 옆에 "여성 최소 N명" 같은 안내 추가.

</details>

## Track 8 — 대회 전용 팝업 (신규)

Backend + Frontend. Prisma 스키마 변경 포함 → migration 필수.

기존 `V1Popup`은 홈 화면 전역 공지 팝업(대회 연결 불가, `audience: public/users/admins` 전역 타겟팅만)이며 대회 상세 페이지 코드에 팝업 관련 로직이 0건 확인됨. 사용자가 최종 확정한 방향: **특정 대회 상세 페이지에 뜨는 대회 전용 공지/홍보 팝업 신규 구현**(기존 `V1Popup`을 재활용하지 않고 별도 신설 — Q&A에서 "특정 대회 상세페이지에 뜨는 대회전용 공지/홍보 팝업을 새로 만든다"로 확정).

신규:
- `V1TournamentPopup`(또는 `V1Popup`에 `tournamentId: String?` nullable 컬럼 추가 — 구현 중 스키마 설계 판단, 기존 `V1Popup` 재사용 시 `audience` enum과의 의미 충돌 여부 확인 필요) — `title`, `body`, `imageUrl?`, `status`(draft/published/archived), `displayStartAt/EndAt`
- Admin CRUD: 대회 편집 화면에서 팝업 생성/수정, 특정 `tournamentId`에 연결
- 대회 상세 페이지(`tournaments/[id]/tournament-detail-client.tsx`) 진입 시 조회·렌더, localStorage 기반 재노출 방지(기존 홈 팝업의 `teameet:v1:home-popup:hidden-until:{id}` 패턴 재사용해 `teameet:v1:tournament-popup:hidden-until:{id}`로 네이밍)

## Ambiguity Log

- Track 1: 팀의 마지막 active 멤버(본인)가 나갈 때 팀을 어떻게 처리할지(archive/delete/그냥 0명 팀으로 유지) — 사용자 확인 없이 임의 결정 금지, 빌더가 막히면 BLOCKED 보고.
- Track 8: `V1Popup` 확장이냐 신규 모델이냐는 구현 착수 시 스키마 설계로 확정(기존 `audience` enum 의미와 `tournamentId`가 충돌하지 않는지 검토 후 진행, 막히면 BLOCKED 보고).

## Out of Scope

- 리뷰 익명화/지연적용/종목별 수치 표시: 사용자가 명시적으로 이번 스코프에서 제외. 설계 메모만 이 문서에 기록 — 일정시간 뒤 적용, 익명 적용, 종목별(전체/월별) 항목 수치만 표시. 후속 task로 별도 기획 필요.
- 이메일(실제 SMTP/SES 발송) 인프라 구축: 사용자가 "이메일 통일"의 실제 의미를 in-app 알림 문구 통일로 확정(Track 2로 대체).

## Deploy

각 트랙은 독립 PR로 dev에 머지한다. dev push 시 CI 통과 후 `deploy-alpha.yml`이 자동으로 `https://alpha.teameet.co.kr`에 배포한다(기존 인프라, `docs/ops/v1-alpha-environment.md` 참조). main 병합은 이번 스코프에 포함하지 않는다.
