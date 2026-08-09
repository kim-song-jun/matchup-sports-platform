---
"v1_api": patch
"v1_web": patch
---

매치·팀매치 생성 위저드의 장소·팀 선택 UX를 개선했다.

- **장소(#3 1단계)**: 새 Venue 테이블 없이, 장소 입력창에 포커스를 주면 내(개인 매치)·내 팀(팀매치, 호스트 팀 기준)이 과거에 실제로 입력했던 장소를 최근순으로 최대 5개 칩으로 보여주고 탭 한 번으로 채운다. 신규 API `GET /matches/me/recent-venues`, `GET /teams/:teamId/recent-venues`(팀 관리자만 조회 가능).
- **팀 선택(#5)**: 리그 개설(`/admin/team-match-series/new`)에서 종목을 먼저 고르지 않아도 팀 검색이 항상 열려 있다. 첫 팀을 고르면 그 팀의 종목으로 상단 종목 select가 자동 채워지고 잠기며("자동 설정됨 · 변경하려면 선택한 팀을 모두 지우세요"), 종목이 다른 팀은 목록에서 숨기지 않고 회색 처리 + "OO 리그라 XX 팀은 선택할 수 없어요" 이유를 병기한다. `EntityPicker`에 `disabled`/`disabledReason` 아이템 표시를 추가했다.
