# Tournament Campaign Scenarios

동적 대회 캠페인의 API·DB·권한 계약과 이후 UI 시각 검증을 함께 추적한다.

## API / DB

- [x] `TOURN-026-A` public slug route는 `published` 캠페인과 public/non-deleted 대회 조합만 반환한다.
- [x] `TOURN-026-B` draft/archived 캠페인은 동일한 `404 TOURNAMENT_CAMPAIGN_NOT_FOUND`를 반환한다.
- [x] `TOURN-026-C` public payload는 규정·환불·active sponsors·공개 참가팀을 포함하고 bank/연락처/admin identity를 제외한다.
- [x] `TOURN-026-D` active admin의 dedicated preview는 draft/published/archived의 실제 status와 public과 동일한 safe tournament projection을 반환하며 support도 읽을 수 있다.
- [x] `TOURN-026-E` preview 추가 후에도 public slug read는 published-only를 유지하고 draft/archived를 404로 차단한다.
- [x] `TOURN-027-A` owner/ops는 create/update/status, support는 read-only이며 일반 사용자는 차단된다.
- [x] `TOURN-027-B` missing content/hero/intro, null PATCH, whitespace/CSS/JS marker, unsafe URL은 HTTP 400이다.
- [x] `TOURN-027-E` `highlightsSectionTitle`과 `faqSectionTitle`은 필수 editable plain text이며 DTO·JSON 직렬화·저장 JSON read-time parsing에서 같은 계약을 적용한다.
- [x] `TOURN-027-C` empty/identical PATCH는 400, 최초 publish 이후 slug 변경은 409다.
- [x] `TOURN-027-D` 상태 변경 reason은 필수이며 admin action/status log와 같은 transaction에 저장된다.
- [x] `TOURN-028-A` archive는 row/content/slug를 보존하고 `archivedAt`을 설정하며 draft 복귀 시 이를 지운다.
- [x] `TOURN-028-B` 감사 로그 실패 시 campaign mutation도 실제 PostgreSQL에서 rollback된다.
- [x] `TOURN-028-C` 상태·slug 경쟁은 serializable compare-and-swap으로 stale write를 거절한다.
- [x] `TOURN-028-D` 신규 migration은 historical empty/production-clone replay에서 기존 대회 row count를 보존했고, 현재 기존 dev DB에서는 history 47개에서 누락된 canonical SQL 5개를 한 transaction으로 적용했다. reset/seed/db push 없이 history 52개(older extra 포함), tournament 2개를 유지했다.

## UI / Visual QA

- [x] public `/tournaments/campaigns/[slug]`가 Teameet 대회 전용 페이지 템플릿으로 렌더된다.
- [x] admin 대회 상세에서 campaign create/edit/preview/publish/archive가 실제 API에 연결된다.
- [x] upstream campaign 404만 server boundary에서 Next `notFound()`로 변환한다. archive 후 public API와 browser proxy의 `GET`/`HEAD`는 실제 HTTP 404이며, 5xx는 soft-404나 빈 화면으로 숨기지 않는다.
- [x] campaign canonical/OG/sitemap URL의 환경변수 미설정 fallback은 production nginx host와 같은 `https://teameet.co.kr`이며 회귀 테스트로 고정한다.
- [x] public campaign 신청 CTA는 단순 `status=open`이 아니라 시작 시각, 접수 마감, 확정 팀과 입금 대기 팀이 차지한 정원을 반영한 서버 `registrationAvailability` 계약을 따른다. 신청 불가 상태는 상세 링크만 남기고 이유를 제목으로 표시한다.
- [x] 기존 dev runtime에서 draft create → preview → edit/reload persistence → publish → public API/page/CTA → archive retention/404 → republish를 검증했다.
- [x] 390×844, 768×1024, 1440×900에서 public/admin/archive final capture와 CTA·hero bleed·CJK wrapping·404 CTA를 재검토했다. 증거는 `output/playwright/visual-audit/session-handoff-2026-07-14/campaign-live-qa/final-*`이다.
- [ ] final capture 기준 layout·CTA·empty/error state는 재검토 완료. 기존 `3013`/`8121`이 다시 안전하게 올라온 뒤 focus order·scroll interaction·console/network를 한 번씩 재확인한다.

Lazyweb campaign report는 https://www.lazyweb.com/report/lazyweb/51a09311-a5d3-4fd2-bead-89dcc6ab6b38/?source=create 에서 `degraded=false`, `failures=[]`로 완료됐다. 검증에는 기존 Web `3013`, API `8121`, 기존 dev PostgreSQL만 사용했다. 별도 DB/seed/reset/db push는 사용하지 않았다.

Live lifecycle row는 campaign id `cc6a970d-b25d-4ebd-99de-a21024efab1b`, slug `ulw-qa-campaign-20260715-0436`이었다. owner는 기존 `admin@teameet.v1`을 사용했고, 기존 dev DB에 support persona가 없어 support live browser 검증은 생략했다. support read-only와 owner/ops mutation 경계는 focused permission tests가 담당한다.

검증 후 exact cleanup transaction으로 status log 5개, action log 8개, campaign 1개만 삭제했다. 사후 상태는 campaign 0, QA action log 0, QA status log 0, tournament 2다. Initial capture는 `output/playwright/visual-audit/session-handoff-2026-07-14/campaign-live-qa/clean-*`에 있으며, final visual revision 완료 전에는 이 캡처를 최종 PASS 증거로 승격하지 않는다.
