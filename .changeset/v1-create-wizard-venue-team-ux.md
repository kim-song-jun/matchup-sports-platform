---
"v1_api": minor
"v1_web": minor
---

매치·팀매치 생성 위저드에 최근 사용한 장소 제안을 추가하고, 리그 대진 일괄생성 폼(관리자)의
동일한 칩 UI와 하나의 컴포넌트로 합쳤다.

- **장소 제안(#3 1단계)**: 새 Venue 테이블 없이, 장소 입력창에 포커스를 주면 내(개인 매치)·내 팀
  (팀매치, 호스트 팀 기준)이 과거에 실제로 입력했던 장소를 최근순으로 최대 5개 칩으로 보여주고
  탭 한 번으로 채운다. 신규 API `GET /matches/me/recent-venues`, `GET /teams/:teamId/recent-venues`
  (팀 관리자만 조회 가능).
- **칩 컴포넌트 통합**: 위저드의 `RecentVenueChips`(`components/v1-ui/create-form-fields.tsx`)를
  관리자 리그 대진 일괄생성 폼(`team-match-series-fixtures-client.tsx`)도 그대로 쓰도록 했다.
  관리자 쪽은 그동안 raw Tailwind로 직접 그려서 선택 상태(`aria-pressed`)는 있었지만
  `tm-chip` 디자인 토큰을 안 썼고, 위저드 쪽은 토큰은 쓰지만 어떤 칩을 선택했는지 표시가 없었다 —
  이제 두 화면 모두 `tm-chip`/`tm-chip-active` 토큰과 `aria-pressed` + 시각적 강조(테두리·채움색,
  색상 단독 아님)를 동일하게 갖는다.

리그 개설(`/admin/team-match-series/new`)의 팀 선택 UX(종목 선행 요구 완화, 서버 검색,
`disabled`/`disabledReason`)는 이미 `v1-series-team-venue-picking` changeset으로 별도 출하됐다 —
이 changeset에는 포함하지 않는다.
